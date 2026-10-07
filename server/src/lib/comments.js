// Task comments (/api/comments/:id) and requirement feedback (/api/requirement-comments/:id) work alike:
// anyone who can see what they hang on posts them, only the author edits (people newly mentioned are notified),
// the author or comments.delete_any deletes. context() checks the user can see what a comment hangs on (else sends
// 404) and says who may be mentioned, what a mention notification points at and which live change to push.
import { db, transaction } from '../db.js';
import { findProject, loadTask } from './access.js';
import { logEvent } from './history.js';
import { badRequest, notFound } from './http.js';
import { pushChange, pushNotifications } from './live.js';
import { plainExcerpt, projectViewers, resolveMentions, taskViewers } from './mentions.js';
import { notifyMentions } from './notifications.js';
import { loadRequirement } from './requirements.js';
import { withCommentFiles } from './uploads.js';

export const COMMENT_KINDS = {
  comments: {
    table: 'comments',
    ownerColumn: 'task_id',
    fileColumn: 'comment_id',
    context(req, res, taskId) {
      const task = loadTask(req, res, taskId, 'view');
      if (!task) return null;
      return {
        ownerId: task.id,
        task, // for the task history
        viewers: taskViewers(task),
        target: { taskId: task.id },
        change: [{ project_id: task.project_id, task_id: task.id }, task],
      };
    },
  },
  'requirement-comments': {
    table: 'requirement_comments',
    ownerColumn: 'requirement_id',
    fileColumn: 'requirement_comment_id',
    context(req, res, requirementId) {
      const requirement = loadRequirement(req, res, requirementId);
      if (!requirement) return null;
      return {
        ownerId: requirement.id,
        viewers: projectViewers(findProject(requirement.project_id)),
        target: { requirementId: requirement.id },
        change: [{ project_id: requirement.project_id, requirement_id: requirement.id }],
      };
    },
  },
};

const selectOf = (kind) => `SELECT c.*, u.name AS user_name FROM ${kind.table} c LEFT JOIN users u ON u.id = c.user_id`;
// The comments on one task or requirement, oldest first, each with its files.
export const commentsOf = (kind, ownerId) =>
  withCommentFiles(
    db.prepare(`${selectOf(kind)} WHERE c.${kind.ownerColumn} = ? ORDER BY c.created_at, c.id`).all(ownerId),
    kind.fileColumn
  );
export const commentById = (kind, id) => withCommentFiles([db.prepare(`${selectOf(kind)} WHERE c.id = ?`).get(id)], kind.fileColumn)[0];

// Loads the comment :id of a kind with what it hangs on (see context()), or sends 404.
export function loadComment(kind, req, res) {
  const comment = db.prepare(`SELECT * FROM ${kind.table} WHERE id = ?`).get(req.params.id);
  if (!comment) {
    notFound(res);
    return null;
  }
  const context = kind.context(req, res, comment[kind.ownerColumn]);
  return context && { comment, ...context };
}

// Posts a comment on what `context` describes. The text may be left out when files follow (with_files), uploaded
// to /api/<kind>/:id/attachments. Mentioned people who can see it are notified.
export function postComment(kind, req, res, { ownerId, task, viewers, target, change }) {
  const raw = req.body?.body?.trim() ?? '';
  if (!raw && !req.body?.with_files) return badRequest(res, 'Comment không được để trống');
  const { body, mentioned, excerpt } = resolveMentions(raw, viewers, req.user);
  const id = transaction(() => {
    const { lastInsertRowid } = db
      .prepare(`INSERT INTO ${kind.table} (${kind.ownerColumn}, user_id, body) VALUES (?, ?, ?)`)
      .run(ownerId, req.user.id, body);
    notifyMentions(mentioned, req.user, { ...target, excerpt });
    if (task) logEvent(task, req.user, 'comment_added', { excerpt: plainExcerpt(body) });
    return lastInsertRowid;
  });
  pushNotifications(mentioned);
  pushChange(req, ...change);
  res.status(201).json(commentById(kind, id));
}
