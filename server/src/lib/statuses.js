// Statuses are the board columns (`sections`). The built-in ones carry a kind, kept when renamed.
import { db } from '../db.js';

export const DEFAULT_STATUSES = [
  ['todo', 'Cần làm'],
  ['doing', 'Đang làm'],
  ['done', 'Hoàn thành'],
];
const doneStatusOf = (projectId) => db.prepare("SELECT * FROM sections WHERE project_id = ? AND kind = 'done'").get(projectId);
export const endOfStatus = (sectionId) =>
  db.prepare('SELECT COALESCE(MAX(position), 0) AS max FROM tasks WHERE section_id = ?').get(sectionId).max + 1;

// In a project that has a done status, a top-level task's status and its done tick move together: ticking
// moves it to the end of the done status, unticking moves a task out of it to "Đang làm" (else the first
// other status); moving it into the done status ticks it, moving it to any other status unticks it.
// Returns the extra fields a PATCH body implies.
export function statusSync(task, body) {
  if (task.parent_id) return {};
  const done = doneStatusOf(task.project_id);
  if (!done) return {};
  if (body.section_id != null) return { completed: Number(body.section_id) === done.id ? 1 : 0 };
  if (body.completed === undefined || Boolean(body.completed) === Boolean(task.completed)) return {};
  const target = body.completed
    ? done
    : task.section_id === done.id &&
      db
        .prepare(
          `SELECT * FROM sections WHERE project_id = ? AND (kind IS NULL OR kind != 'done')
           ORDER BY kind = 'doing' DESC, position LIMIT 1`
        )
        .get(task.project_id);
  if (!target || target.id === task.section_id) return {};
  return { section_id: target.id, position: endOfStatus(target.id) };
}
