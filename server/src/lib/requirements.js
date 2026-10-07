import { db } from '../db.js';
import { loadProject } from './access.js';
import { forbidden, notFound } from './http.js';
import { coversTeams, scopeOf } from './permissions.js';

// A project's requirements with progress (top-level tasks done / total) and feedback counts.
export const requirementsOf = (projectId) =>
  db
    .prepare(
      `SELECT r.*,
         (SELECT COUNT(*) FROM tasks t WHERE t.requirement_id = r.id AND t.parent_id IS NULL) AS task_count,
         (SELECT COUNT(*) FROM tasks t WHERE t.requirement_id = r.id AND t.parent_id IS NULL AND t.completed = 1) AS done_count,
         (SELECT COUNT(*) FROM requirement_comments c WHERE c.requirement_id = r.id) AS comment_count
       FROM requirements r WHERE r.project_id = ? ORDER BY r.position, r.id`
    )
    .all(projectId);

// node:sqlite cannot bind undefined, and a missing id simply means "no such requirement".
export const findRequirement = (id) => (id == null ? undefined : db.prepare('SELECT * FROM requirements WHERE id = ?').get(id));

export const titleOfRequirement = (id) =>
  id == null ? null : db.prepare('SELECT title FROM requirements WHERE id = ?').get(id)?.title ?? null;

// Requirements are written by whoever manages the project and by requirements.manage covering it.
export const canEditRequirements = (user, project) =>
  project.access === 'manage' || coversTeams(user, scopeOf(user, 'requirements.manage'), project.teams.map((t) => t.id));
export const REQUIREMENT_EDITORS = 'Chỉ owner, Leader của team phụ trách hoặc Manager mới quản lý được requirement';

// Loads a requirement whose project the user can at least view; `edit` also demands requirement rights.
export function loadRequirement(req, res, requirementId, { edit = false } = {}) {
  const requirement = findRequirement(requirementId);
  if (!requirement) {
    notFound(res);
    return null;
  }
  const project = loadProject(req, res, requirement.project_id);
  if (!project) return null;
  if (edit && !canEditRequirements(req.user, project)) {
    forbidden(res, REQUIREMENT_EDITORS);
    return null;
  }
  return requirement;
}
