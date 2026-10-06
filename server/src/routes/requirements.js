// Requirements, their comments (feedback) and their files.
import express from 'express';
import { db, transaction } from '../db.js';
import { findProject, loadProject } from '../lib/access.js';
import { REQUIREMENT_COMMENT_SELECT } from '../lib/comments.js';
import { badRequest, forbidden } from '../lib/http.js';
import { pushChange, pushNotifications } from '../lib/live.js';
import { mentionList, projectViewers, resolveMentions } from '../lib/mentions.js';
import { notifyMentions } from '../lib/notifications.js';
import { REQUIREMENT_EDITORS, canEditRequirements, loadRequirement, requirementsOf } from '../lib/requirements.js';
import { attachmentsOf, rawUpload, saveAttachment, sweepUploads, withCommentFiles } from '../lib/uploads.js';

const router = express.Router();

router.post('/projects/:id/requirements', (req, res) => {
  const project = loadProject(req, res, req.params.id);
  if (!project) return;
  if (!canEditRequirements(req.user, project)) return forbidden(res, REQUIREMENT_EDITORS);
  const title = req.body?.title?.trim();
  if (!title) return badRequest(res, 'Cần nhập tiêu đề requirement');
  const description = req.body.description?.trim() || null;
  const { max } = db.prepare('SELECT COALESCE(MAX(position), 0) AS max FROM requirements WHERE project_id = ?').get(project.id);
  const { lastInsertRowid } = db
    .prepare('INSERT INTO requirements (project_id, title, description, position, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(project.id, title, description, max + 1, req.user.id);
  pushChange(req, { project_id: project.id, requirement_id: Number(lastInsertRowid) });
  res.status(201).json(requirementsOf(project.id).find((r) => r.id === Number(lastInsertRowid)));
});

router.patch('/requirements/:id', (req, res) => {
  const requirement = loadRequirement(req, res, req.params.id, { edit: true });
  if (!requirement) return;
  const body = req.body ?? {};
  const title = body.title !== undefined ? String(body.title).trim() : requirement.title;
  if (!title) return badRequest(res, 'Tiêu đề requirement không được để trống');
  const description = body.description !== undefined ? String(body.description ?? '').trim() || null : requirement.description;
  db.prepare('UPDATE requirements SET title = ?, description = ? WHERE id = ?').run(title, description, requirement.id);
  pushChange(req, { project_id: requirement.project_id, requirement_id: requirement.id });
  res.json(requirementsOf(requirement.project_id).find((r) => r.id === requirement.id));
});

// Refused while tasks still belong to the requirement, so work is never deleted by accident.
router.delete('/requirements/:id', (req, res) => {
  const requirement = loadRequirement(req, res, req.params.id, { edit: true });
  if (!requirement) return;
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE requirement_id = ?').get(requirement.id);
  if (n > 0) return badRequest(res, `Requirement còn ${n} task. Hãy chuyển các task sang requirement khác hoặc xoá chúng trước.`);
  db.prepare('DELETE FROM requirements WHERE id = ?').run(requirement.id);
  sweepUploads();
  pushChange(req, { project_id: requirement.project_id, requirement_id: requirement.id });
  res.status(204).end();
});

// ---------- Comments (feedback) ----------
// Editing and deleting them is in routes/comments.js.

router.get('/requirements/:id/mentionable', (req, res) => {
  const requirement = loadRequirement(req, res, req.params.id);
  if (!requirement) return;
  res.json(mentionList(projectViewers(findProject(requirement.project_id)), req.user));
});

router.get('/requirements/:id/comments', (req, res) => {
  const requirement = loadRequirement(req, res, req.params.id);
  if (!requirement) return;
  res.json(
    withCommentFiles(
      db.prepare(`${REQUIREMENT_COMMENT_SELECT} WHERE c.requirement_id = ? ORDER BY c.created_at, c.id`).all(requirement.id),
      'requirement_comment_id'
    )
  );
});

// Anyone who can open the project may give feedback, including Managers in read-only view.
// Mentioned people who can open the project are notified.
router.post('/requirements/:id/comments', (req, res) => {
  const requirement = loadRequirement(req, res, req.params.id);
  if (!requirement) return;
  // Text may be left out when files follow (with_files), uploaded to /api/requirement-comments/:id/attachments.
  const raw = req.body?.body?.trim() ?? '';
  if (!raw && !req.body?.with_files) return badRequest(res, 'Comment không được để trống');
  const { body, mentioned, excerpt } = resolveMentions(raw, projectViewers(findProject(requirement.project_id)), req.user);
  const id = transaction(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO requirement_comments (requirement_id, user_id, body) VALUES (?, ?, ?)')
      .run(requirement.id, req.user.id, body);
    notifyMentions(mentioned, req.user, { requirementId: requirement.id, excerpt });
    return lastInsertRowid;
  });
  pushNotifications(mentioned);
  pushChange(req, { project_id: requirement.project_id, requirement_id: requirement.id });
  res.status(201).json(withCommentFiles([db.prepare(`${REQUIREMENT_COMMENT_SELECT} WHERE c.id = ?`).get(id)], 'requirement_comment_id')[0]);
});

// ---------- Files ----------

router.get('/requirements/:id/attachments', (req, res) => {
  const requirement = loadRequirement(req, res, req.params.id);
  if (!requirement) return;
  res.json(attachmentsOf('requirement_id', requirement.id));
});

// Anyone who can comment on a requirement can attach files to it.
router.post('/requirements/:id/attachments', rawUpload, (req, res) => {
  const requirement = loadRequirement(req, res, req.params.id);
  if (!requirement) return;
  saveAttachment(req, res, { requirementId: requirement.id }, [
    { project_id: requirement.project_id, requirement_id: requirement.id },
  ]);
});

export default router;
