// task_events keeps 30 days of who changed what on a task. Values are stored as people read them (names,
// titles), as they were at that moment. A subtask's changes are kept on its parent, tagged with its title.
import { db } from '../db.js';
import { titleOfRequirement } from './requirements.js';
import { nameOfUser } from './users.js';

export const HISTORY_DAYS = 30;

export function logEvent(task, actor, type, data = {}) {
  const taskId = task.parent_id ?? task.id;
  const tagged = task.parent_id ? { ...data, subtask: task.title } : data;
  db.prepare('INSERT INTO task_events (task_id, user_id, type, data) VALUES (?, ?, ?, ?)').run(
    taskId,
    actor.id,
    type,
    JSON.stringify(tagged)
  );
}

const nameOfSection = (id) => (id == null ? null : db.prepare('SELECT name FROM sections WHERE id = ?').get(id)?.name ?? null);

// The task fields the history follows, with how each value is shown. Position (order in a column) is left out.
const HISTORY_FIELDS = {
  title: (v) => v,
  description: (v) => v,
  assignee_id: nameOfUser,
  due_date: (v) => v,
  start_date: (v) => v,
  priority: (v) => v,
  section_id: nameOfSection,
  completed: (v) => Boolean(v),
  requirement_id: titleOfRequirement,
  recurrence: (v) => v, // the rule's JSON; the client words it in the reader's language
};

// One 'field' event per field that changed between two versions of a task.
export function logTaskChanges(before, after, actor) {
  for (const [field, show] of Object.entries(HISTORY_FIELDS)) {
    const from = before[field] ?? null;
    const to = after[field] ?? null;
    if (from === to || (field === 'completed' && Boolean(from) === Boolean(to))) continue;
    logEvent(after, actor, 'field', { field, from: show(from), to: show(to) });
  }
}

export function purgeTaskEvents() {
  db.prepare(`DELETE FROM task_events WHERE created_at < datetime('now', '-${HISTORY_DAYS} days')`).run();
}
