// Weekly reports (v41, decided 2026-10-09): at 8:00 on Monday the week before (Monday to Sunday) is written down as it
// stands then, for the whole department and for each team: top-level tasks done that week (and how many late), open
// tasks overdue and due in the next 7 days, and who is overloaded (thresholds in app_state, set on the Administration
// screen). Whoever watches people (people.watch) gets a notification and reads the report on its page, within their
// watch scope: their teams, or the department too with 'all'. Reports are kept, so past weeks read as they were.
import { db, transaction } from '../db.js';
import { pushNotifications } from './live.js';
import { scopeOf } from './permissions.js';
import { AT_WORK, findUser } from './users.js';
import { localDate } from './util.js';

const REPORT_HOUR = 8;
const CHECK_EVERY_MS = 5 * 60 * 1000;
const SOON_DAYS = 7;
export const DEFAULT_THRESHOLDS = { overdue: 3, due_soon: 8 };

const shift = (day, n) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDate(d);
};

// Overloaded: at least `overdue` overdue tasks, or at least `due_soon` open tasks due in the next 7 days.
export function getThresholds() {
  const read = (key) => Number(db.prepare('SELECT value FROM app_state WHERE key = ?').get(`overload_${key}`)?.value);
  return {
    overdue: read('overdue') || DEFAULT_THRESHOLDS.overdue,
    due_soon: read('due_soon') || DEFAULT_THRESHOLDS.due_soon,
  };
}
export function setThresholds({ overdue, due_soon }) {
  const write = db.prepare('INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value');
  write.run('overload_overdue', String(overdue));
  write.run('overload_due_soon', String(due_soon));
}

const sum = (rows, key) => rows.reduce((n, r) => n + r[key], 0);
const totalsOf = (people) => ({
  people: people.length,
  done: sum(people, 'done'),
  done_late: sum(people, 'done_late'),
  open: sum(people, 'open'),
  overdue: sum(people, 'overdue'),
  due_soon: sum(people, 'due_soon'),
  overloaded: people.filter((p) => p.overloaded).length,
});

// The report of the week starting on `weekStart` (a Monday), taken on `today`.
export function buildReport(weekStart, today) {
  const weekEnd = shift(weekStart, 6);
  const soonEnd = shift(today, SOON_DAYS);
  const thresholds = getThresholds();
  const people = db.prepare(`SELECT u.id, u.name FROM users u WHERE ${AT_WORK} ORDER BY u.name`).all();
  const stats = new Map(people.map((p) => [p.id, { id: p.id, name: p.name, done: 0, done_late: 0, open: 0, overdue: 0, due_soon: 0 }]));
  const tasks = db
    .prepare('SELECT assignee_id, completed, completed_at, due_date FROM tasks WHERE parent_id IS NULL AND assignee_id IS NOT NULL')
    .all();
  for (const t of tasks) {
    const s = stats.get(t.assignee_id);
    if (!s) continue;
    if (t.completed) {
      const doneOn = t.completed_at && localDate(new Date(`${t.completed_at.replace(' ', 'T')}Z`));
      if (doneOn && doneOn >= weekStart && doneOn <= weekEnd) {
        s.done++;
        if (t.due_date && doneOn > t.due_date) s.done_late++;
      }
    } else {
      s.open++;
      if (t.due_date && t.due_date < today) s.overdue++;
      else if (t.due_date && t.due_date <= soonEnd) s.due_soon++;
    }
  }
  for (const s of stats.values()) s.overloaded = s.overdue >= thresholds.overdue || s.due_soon >= thresholds.due_soon;

  const all = [...stats.values()];
  const members = db.prepare('SELECT user_id FROM user_teams WHERE team_id = ?');
  const teams = db
    .prepare('SELECT id, name FROM teams ORDER BY name')
    .all()
    .map((team) => {
      const ids = members.all(team.id).map((r) => r.user_id).filter((id) => stats.has(id));
      return { id: team.id, name: team.name, people: ids, totals: totalsOf(ids.map((id) => stats.get(id))) };
    });
  return {
    week_start: weekStart,
    week_end: weekEnd,
    taken_on: today,
    thresholds,
    all: { people: all.map((p) => p.id), totals: totalsOf(all) },
    teams,
    people: Object.fromEntries(all.map((p) => [p.id, p])),
  };
}

// What `user` may read of a report: the department with people.watch 'all', else their own teams only.
export function reportFor(user, report) {
  const scope = scopeOf(user, 'people.watch');
  if (scope === 'none') return null;
  const all = scope === 'all';
  const teams = report.teams.filter((t) => all || user.team_ids.includes(t.id));
  const ids = new Set([...(all ? report.all.people : []), ...teams.flatMap((t) => t.people)]);
  return {
    ...report,
    all: all ? report.all : null,
    teams,
    people: Object.fromEntries(Object.entries(report.people).filter(([id]) => ids.has(Number(id)))),
  };
}

// Who is told a report is ready: people at work who watch people and have something to read in it.
function readers() {
  return db
    .prepare(`SELECT u.id FROM users u WHERE ${AT_WORK}`)
    .all()
    .map((r) => findUser(r.id))
    .filter((u) => {
      const scope = scopeOf(u, 'people.watch');
      return scope === 'all' || (scope === 'team' && u.team_ids.length > 0);
    })
    .map((u) => u.id);
}

// From 8:00 on Monday, writes last week's report once and tells its readers. Returns who was told.
export function runWeeklyReport(now = new Date()) {
  if (now.getDay() !== 1 || now.getHours() < REPORT_HOUR) return [];
  const today = localDate(now);
  const weekStart = shift(today, -7);
  return transaction(() => {
    if (db.prepare('SELECT 1 FROM weekly_reports WHERE week_start = ?').get(weekStart)) return [];
    db.prepare('INSERT INTO weekly_reports (week_start, data) VALUES (?, ?)').run(weekStart, JSON.stringify(buildReport(weekStart, today)));
    const ids = readers();
    const insert = db.prepare("INSERT INTO notifications (user_id, type, excerpt) VALUES (?, 'weekly_report', ?)");
    ids.forEach((id) => insert.run(id, weekStart));
    return ids;
  });
}

export function scheduleWeeklyReports() {
  const run = () => pushNotifications(runWeeklyReport());
  run();
  setInterval(run, CHECK_EVERY_MS).unref();
}
