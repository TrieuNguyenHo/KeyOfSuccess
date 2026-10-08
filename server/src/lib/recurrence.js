// tasks.recurrence holds the rule as JSON: { freq: 'daily' } (Monday to Friday), { freq: 'weekly' | 'biweekly',
// days: [1..7] } (ISO weekdays, 1 = Monday) or { freq: 'monthly', day: 1..31 } (a shorter month uses its last day).
// Completing an occurrence creates the next one (spawnNextOccurrence), which takes the rule over.
import { db } from '../db.js';
import { canBeAssigned, findProject } from './access.js';
import { logEvent } from './history.js';
import { follow, notifyAssigned } from './notifications.js';
import { endOfStatus } from './statuses.js';
import { localDate } from './util.js';

const FREQS = ['daily', 'weekly', 'biweekly', 'monthly'];

// The rule in canonical form, so equal rules are equal JSON; undefined when invalid.
export function parseRecurrence(value) {
  if (!value || typeof value !== 'object' || !FREQS.includes(value.freq)) return undefined;
  if (value.freq === 'daily') return { freq: 'daily' };
  if (value.freq === 'monthly') {
    const day = Number(value.day);
    return Number.isInteger(day) && day >= 1 && day <= 31 ? { freq: 'monthly', day } : undefined;
  }
  const days = Array.isArray(value.days) ? [...new Set(value.days.map(Number))].sort((a, b) => a - b) : [];
  return days.length && days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) ? { freq: value.freq, days } : undefined;
}

// Calendar dates (YYYY-MM-DD) as UTC midnights, so no timezone shifts a day.
const DAY_MS = 86400000;
const parseDay = (s) => new Date(`${s}T00:00:00Z`);
const formatDay = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * DAY_MS);
const isoWeekday = (d) => ((d.getUTCDay() + 6) % 7) + 1;

// Whether the rule falls on day `d`. For 'biweekly', the weeks that count are those an even number of weeks
// away from the week of `anchor`.
function occursOn(rule, d, anchor) {
  const weekday = isoWeekday(d);
  switch (rule.freq) {
    case 'daily':
      return weekday <= 5;
    case 'weekly':
      return rule.days.includes(weekday);
    case 'biweekly': {
      const weeks = Math.round((addDays(d, 1 - weekday) - addDays(anchor, 1 - isoWeekday(anchor))) / (7 * DAY_MS));
      return weeks % 2 === 0 && rule.days.includes(weekday);
    }
    case 'monthly': {
      const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      return d.getUTCDate() === Math.min(rule.day, lastDay);
    }
  }
}

// The first day of the rule after `from` (or on it, with `inclusive`) that is not before `notBefore`.
export function nextOccurrence(rule, from, { notBefore = from, inclusive = false } = {}) {
  const anchor = parseDay(from);
  for (let d = inclusive ? anchor : addDays(anchor, 1); ; d = addDays(d, 1)) {
    if (occursOn(rule, d, anchor) && formatDay(d) >= notBefore) return formatDay(d);
  }
}

// Called in the transaction that completes a recurring top-level task: creates the next occurrence in the first
// to-do status with the same title, description, requirement, priority, channels and subtasks (unticked), due on
// the rule's next day after this one's due date (never in the past), and moves the rule to it. The assignee
// carries over while they may still be given the project's tasks, and so do the followers (v38), who keep following
// it. Returns who to notify.
export function spawnNextOccurrence(task, actor) {
  const section = db
    .prepare(
      `SELECT id FROM sections WHERE project_id = ?
       ORDER BY COALESCE(kind = 'todo', 0) DESC, COALESCE(kind = 'done', 0), position LIMIT 1`
    )
    .get(task.project_id);
  if (!section) return [];
  const today = localDate(new Date());
  const due = nextOccurrence(JSON.parse(task.recurrence), task.due_date ?? today, { notBefore: today });
  const active = task.assignee_id && db.prepare("SELECT 1 FROM users WHERE id = ? AND status = 'active'").get(task.assignee_id);
  const assignee = active && canBeAssigned(task.assignee_id, findProject(task.project_id)) ? task.assignee_id : null;
  const { lastInsertRowid: id } = db
    .prepare(
      `INSERT INTO tasks (project_id, section_id, requirement_id, title, description, assignee_id, due_date, priority,
         position, created_by, recurrence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      task.project_id,
      section.id,
      task.requirement_id,
      task.title,
      task.description ?? null,
      assignee,
      due,
      task.priority ?? null,
      endOfStatus(section.id),
      actor.id,
      task.recurrence
    );
  db.prepare('INSERT INTO task_channels (task_id, channel_id) SELECT ?, channel_id FROM task_channels WHERE task_id = ?').run(
    id,
    task.id
  );
  db.prepare(
    `INSERT INTO tasks (project_id, parent_id, title, description, priority, position, created_by)
     SELECT project_id, ?, title, description, priority, position, ? FROM tasks WHERE parent_id = ? ORDER BY position`
  ).run(id, actor.id, task.id);
  db.prepare(
    'INSERT INTO task_followers (task_id, user_id, following) SELECT ?, user_id, following FROM task_followers WHERE task_id = ?'
  ).run(id, task.id);
  follow(id, assignee);
  db.prepare('UPDATE tasks SET recurrence = NULL, next_task_id = ? WHERE id = ?').run(id, task.id);
  logEvent(task, actor, 'recurred', { due, next_id: id });
  logEvent({ id, parent_id: null }, actor, 'created', { title: task.title, recurring_from: task.id });
  return assignee ? notifyAssigned({ id }, assignee, actor) : [];
}
