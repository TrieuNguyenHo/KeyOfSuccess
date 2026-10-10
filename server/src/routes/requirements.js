// Requirements, their comments (feedback) and their files.
import express from 'express';
import { db } from '../db.js';
import { findProject, loadProject } from '../lib/access.js';
import { COMMENT_KINDS, commentsOf, postComment } from '../lib/comments.js';
import { badRequest, forbidden } from '../lib/http.js';
import { pushChange } from '../lib/live.js';
import { mentionList, projectViewers } from '../lib/mentions.js';
import { REQUIREMENT_EDITORS, canEditRequirements, loadRequirement, requirementsOf } from '../lib/requirements.js';
import { nextPosition } from '../lib/util.js';
import { attachmentsOf, rawUpload, saveAttachment, sweepUploads } from '../lib/uploads.js';

const router = express.Router();

router.post('/projects/:id/requirements', (req, res) => {
  const project = loadProject(req, res, req.params.id);
  if (!project) return;
  if (!canEditRequirements(req.user, project)) return forbidden(res, REQUIREMENT_EDITORS);
  const title = req.body?.title?.trim();
  if (!title) return badRequest(res, 'Cần nhập tiêu đề project');
  const description = req.body.description?.trim() || null;
  const { lastInsertRowid } = db
    .prepare('INSERT INTO requirements (project_id, title, description, position, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(project.id, title, description, nextPosition('requirements', 'project_id', project.id), req.user.id);
  pushChange(req, { project_id: project.id, requirement_id: Number(lastInsertRowid) });
  res.status(201).json(requirementsOf(project.id).find((r) => r.id === Number(lastInsertRowid)));
});

router.patch('/requirements/:id', (req, res) => {
  const requirement = loadRequirement(req, res, req.params.id, { edit: true });
  if (!requirement) return;
  const body = req.body ?? {};
  const title = body.title !== undefined ? String(body.title).trim() : requirement.title;
  if (!title) return badRequest(res, 'Tiêu đề project không được để trống');
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
  if (n > 0) return badRequest(res, `Project còn ${n} task. Hãy chuyển các task sang project khác hoặc xoá chúng trước.`);
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
  res.json(commentsOf(COMMENT_KINDS['requirement-comments'], requirement.id));
});

// Anyone who can open the project may comment, including Managers in read-only view (see postComment()).
router.post('/requirements/:id/comments', (req, res) => {
  const kind = COMMENT_KINDS['requirement-comments'];
  const context = kind.context(req, res, req.params.id);
  if (context) postComment(kind, req, res, context);
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
