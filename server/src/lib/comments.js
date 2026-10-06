// Task comments (/api/comments/:id) and requirement feedback (/api/requirement-comments/:id) work alike:
// only the author edits (people newly mentioned are notified), the author or any Manager deletes.
// open() checks the user can see what the comment hangs on (else sends 404) and says who may be mentioned,
// what a mention notification points at and which live change to push.
import { db } from '../db.js';
import { findProject, loadTask } from './access.js';
import { notFound } from './http.js';
import { projectViewers, taskViewers } from './mentions.js';
import { loadRequirement } from './requirements.js';

export const COMMENT_SELECT = 'SELECT c.*, u.name AS user_name FROM comments c LEFT JOIN users u ON u.id = c.user_id';
export const REQUIREMENT_COMMENT_SELECT = `SELECT c.*, u.name AS user_name FROM requirement_comments c LEFT JOIN users u ON u.id = c.user_id`;

export const COMMENT_KINDS = {
  comments: {
    table: 'comments',
    fileColumn: 'comment_id',
    select: COMMENT_SELECT,
    open(req, res, comment) {
      const task = loadTask(req, res, comment.task_id, 'view');
      if (!task) return null;
      return {
        task, // for the task history
        viewers: taskViewers(task),
        target: { taskId: task.id },
        change: [{ project_id: task.project_id, task_id: task.id }, task],
      };
    },
  },
  'requirement-comments': {
    table: 'requirement_comments',
    fileColumn: 'requirement_comment_id',
    select: REQUIREMENT_COMMENT_SELECT,
    open(req, res, comment) {
      const requirement = loadRequirement(req, res, comment.requirement_id);
      if (!requirement) return null;
      return {
        viewers: projectViewers(findProject(requirement.project_id)),
        target: { requirementId: requirement.id },
        change: [{ project_id: requirement.project_id, requirement_id: requirement.id }],
      };
    },
  },
};

// Loads the comment :id of a kind with what it hangs on (see open()), or sends 404.
export function loadComment(kind, req, res) {
  const comment = db.prepare(`SELECT * FROM ${kind.table} WHERE id = ?`).get(req.params.id);
  if (!comment) {
    notFound(res);
    return null;
  }
  const context = kind.open(req, res, comment);
  return context && { comment, ...context };
}
