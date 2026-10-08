// The morning reminder of due dates (v38, decided 2026-10-08): at 8:00 on Monday to Friday everyone at work gets one
// notification in the bell counting their open top-level tasks that are overdue, due today and due by the next work
// day (on a Friday: through Monday), like My tasks shows them. Nothing is sent to someone with none of those.
import { db, transaction } from '../db.js';
import { taskAccess } from './access.js';
import { pushNotifications } from './live.js';
import { AT_WORK, findUser } from './users.js';
import { localDate } from './util.js';

export const DIGEST_HOUR = 8;
const STATE_KEY = 'due_digest_day';
const CHECK_EVERY_MS = 5 * 60 * 1000;

const addDays = (day, n) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDate(d);
};

// Sends the reminder for the day of `now` (whatever the hour or weekday) and returns who got one.
export function sendDueDigests(now = new Date()) {
  const today = localDate(now);
  const until = addDays(today, now.getDay() === 5 ? 3 : 1);
  const insert = db.prepare("INSERT INTO notifications (user_id, type, excerpt) VALUES (?, 'due_digest', ?)");
  const notified = [];
  for (const { id } of db.prepare(`SELECT u.id FROM users u WHERE ${AT_WORK}`).all()) {
    const user = findUser(id);
    const tasks = db
      .prepare(
        `SELECT * FROM tasks WHERE assignee_id = ? AND parent_id IS NULL AND completed = 0
           AND due_date IS NOT NULL AND due_date <= ?`
      )
      .all(id, until)
      .filter((t) => taskAccess(user, t));
    const counts = {
      overdue: tasks.filter((t) => t.due_date < today).length,
      today: tasks.filter((t) => t.due_date === today).length,
      soon: tasks.filter((t) => t.due_date > today).length,
    };
    if (!counts.overdue && !counts.today && !counts.soon) continue;
    insert.run(id, JSON.stringify({ day: today, until, ...counts }));
    notified.push(id);
  }
  return notified;
}

// Sends the day's reminder once, from 8:00 on a work day; a server that was down at 8:00 sends it when it comes back
// the same day. Returns who got one ([] when it was not time, or already sent).
export function runDueDigests(now = new Date()) {
  const day = localDate(now);
  const weekday = now.getDay();
  if (weekday === 0 || weekday === 6 || now.getHours() < DIGEST_HOUR) return [];
  return transaction(() => {
    if (db.prepare('SELECT value FROM app_state WHERE key = ?').get(STATE_KEY)?.value === day) return [];
    db.prepare('INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(
      STATE_KEY,
      day
    );
    return sendDueDigests(now);
  });
}

export function scheduleDueDigests() {
  const run = () => pushNotifications(runDueDigests());
  run();
  setInterval(run, CHECK_EVERY_MS).unref();
}
