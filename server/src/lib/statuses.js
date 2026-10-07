// Statuses are the board columns (`sections`). The four built-in ones carry a kind and fixed names, the same
// in every language, and can be neither renamed nor deleted.
import { db } from '../db.js';
import { nextPosition } from './util.js';

export const DEFAULT_STATUSES = [
  ['todo', 'Planned'],
  ['doing', 'In-Progress'],
  ['done', 'Completed'],
  ['pending', 'Pending'],
];
const doneStatusOf = (projectId) => db.prepare("SELECT * FROM sections WHERE project_id = ? AND kind = 'done'").get(projectId);
export const endOfStatus = (sectionId) => nextPosition('tasks', 'section_id', sectionId);

// In a project that has a done status, a top-level task's status and its done tick move together: ticking
// moves it to the end of the done status, unticking moves a task out of it to "In-Progress" (else the first
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
