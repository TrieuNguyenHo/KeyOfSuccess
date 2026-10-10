// Weekly reports (v41, decided 2026-10-09): at 8:00 on Monday the week before (Monday to Sunday) is written down as it
// stands then, for the whole department and for each team: top-level tasks done that week (and how many late), open
// tasks overdue and due in the next 7 days, and who is overloaded (thresholds in app_state, set on the Administration
// screen). Whoever watches people (people.watch) gets a notification and reads the report on its page, within their
// watch scope: their teams, or the department too with 'all'. Reports are kept, so past weeks read as they were.
// Since 2026-10-10 a report is also worked out when it is opened, for a week, a month or any range of days
// (liveReport()): tasks done in the range, and what was open, overdue and due in the next 7 days on its last day (or
// today while it runs). People and teams are today's, and a task counts for its assignee of today.
import { db, transaction } from '../db.js';
import { pushNotifications } from './live.js';
import { scopeOf } from './permissions.js';
import { AT_WORK, findUser } from './users.js';
import { localDate } from './util.js';

const REPORT_HOUR = 8;
const CHECK_EVERY_MS = 5 * 60 * 1000;
const SOON_DAYS = 7;
const MAX_DAYS = 366;
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

const dayOf = (stamp) => stamp && localDate(new Date(`${stamp.replace(' ', 'T')}Z`)); // SQLite datetime() is UTC

// Tasks done from `from` to `to`, and what was open on `asOf`: created by then, and not done or done after it.
function figures(from, to, asOf) {
  const soonEnd = shift(asOf, SOON_DAYS);
  const thresholds = getThresholds();
  const people = db.prepare(`SELECT u.id, u.name FROM users u WHERE ${AT_WORK} ORDER BY u.name`).all();
  const stats = new Map(people.map((p) => [p.id, { id: p.id, name: p.name, done: 0, done_late: 0, open: 0, overdue: 0, due_soon: 0 }]));
  const tasks = db
    .prepare('SELECT assignee_id, completed, completed_at, due_date, created_at FROM tasks WHERE parent_id IS NULL AND assignee_id IS NOT NULL')
    .all();
  for (const t of tasks) {
    const s = stats.get(t.assignee_id);
    if (!s) continue;
    const doneOn = t.completed ? dayOf(t.completed_at) : null;
    if (doneOn && doneOn >= from && doneOn <= to) {
      s.done++;
      if (t.due_date && doneOn > t.due_date) s.done_late++;
    }
    // A done task without its day (done before completed_at existed) was done long ago.
    const openThen = dayOf(t.created_at) <= asOf && (!t.completed || (doneOn !== null && doneOn > asOf));
    if (openThen) {
      s.open++;
      if (t.due_date && t.due_date < asOf) s.overdue++;
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
    thresholds,
    all: { people: all.map((p) => p.id), totals: totalsOf(all) },
    teams,
    people: Object.fromEntries(all.map((p) => [p.id, p])),
  };
}

// The report of the week starting on `weekStart` (a Monday), taken on `today`.
export function buildReport(weekStart, today) {
  const weekEnd = shift(weekStart, 6);
  return { week_start: weekStart, week_end: weekEnd, taken_on: today, ...figures(weekStart, weekEnd, today) };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (day) => DAY_RE.test(day ?? '') && localDate(new Date(`${day}T12:00:00`)) === day;
const daysFrom = (from, to) => Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000);
const isMonth = (from, to) => from.endsWith('-01') && to.slice(0, 7) === from.slice(0, 7) && shift(to, 1).endsWith('-01');

// The range before `from`–`to` it is compared with: the month before a whole month, else as many days just before.
export function previousRange(from, to) {
  const prevTo = shift(from, -1);
  if (isMonth(from, to)) return { from: `${prevTo.slice(0, 7)}-01`, to: prevTo };
  return { from: shift(prevTo, -daysFrom(from, to)), to: prevTo };
}

// Why a range cannot be reported, or null.
export function checkRange(from, to) {
  if (!isDay(from) || !isDay(to)) return 'Ngày không hợp lệ';
  if (from > to) return 'Ngày bắt đầu phải trước ngày kết thúc';
  if (daysFrom(from, to) >= MAX_DAYS) return `Mỗi báo cáo tối đa ${MAX_DAYS} ngày`;
  return null;
}

// A report worked out now for any range (checked with checkRange()), with the done totals of the range before it.
export function liveReport(from, to, today = localDate(new Date())) {
  const asOf = to < today ? to : today;
  const before = previousRange(from, to);
  const previous = figures(before.from, before.to, before.to);
  return {
    from,
    to,
    as_of: asOf,
    ...figures(from, to, asOf),
    previous: {
      from: before.from,
      to: before.to,
      all: previous.all.totals.done,
      teams: Object.fromEntries(previous.teams.map((t) => [t.id, t.totals.done])),
    },
  };
}

// The three pie charts at the top of a report (decided 2026-10-10): the top-level tasks worked on from `from` to `to`
// (created by `to` and not done before `from`) by activity (a project in the code), by project (a requirement), by
// priority and by status on `asOf` (Completed when done by then; else the task's status today, or In-Progress when it
// is in Completed today but was done after `asOf`). Within the reader's people.watch scope, like the rest of the
// report: the department, unassigned tasks included, with 'all'; else tasks of the people at work in their teams.
export function breakdownFor(user, from, to, asOf) {
  const scope = scopeOf(user, 'people.watch');
  if (scope === 'none') return null;
  const people =
    scope === 'all'
      ? null
      : new Set(
          db
            .prepare(`SELECT DISTINCT ut.user_id FROM user_teams ut JOIN users u ON u.id = ut.user_id WHERE ${AT_WORK}
              AND ut.team_id IN (SELECT team_id FROM user_teams WHERE user_id = ?)`)
            .all(user.id)
            .map((r) => r.user_id)
        );
  const rows = db
    .prepare(
      `SELECT t.assignee_id, t.completed, t.completed_at, t.created_at, t.priority, p.id AS activity_id, p.name AS activity,
         r.id AS project_id, r.title AS project, s.kind, s.name AS status
       FROM tasks t JOIN projects p ON p.id = t.project_id JOIN requirements r ON r.id = t.requirement_id
       LEFT JOIN sections s ON s.id = t.section_id
       WHERE t.parent_id IS NULL`
    )
    .all();
  const activities = new Map();
  const projects = new Map();
  const statuses = new Map();
  const priorities = { high: 0, medium: 0, low: 0, none: 0 };
  const count = (map, key, item) => {
    const entry = map.get(key) ?? map.set(key, { ...item, count: 0 }).get(key);
    entry.count++;
  };
  for (const t of rows) {
    if (people && !people.has(t.assignee_id)) continue;
    const doneOn = t.completed ? dayOf(t.completed_at) : null;
    if (dayOf(t.created_at) > to || (t.completed && (doneOn === null || doneOn < from))) continue;
    count(activities, t.activity_id, { id: t.activity_id, name: t.activity });
    count(projects, t.project_id, { id: t.project_id, name: t.project, activity: t.activity });
    priorities[t.priority ?? 'none']++;
    const doneThen = doneOn !== null && doneOn <= asOf;
    const kind = doneThen ? 'done' : t.kind === 'done' ? 'doing' : t.kind;
    // The four fixed statuses carry the same name everywhere; added ones are counted by their name.
    if (kind) count(statuses, kind, { key: kind, name: { todo: 'Planned', doing: 'In-Progress', done: 'Completed', pending: 'Pending' }[kind] });
    else count(statuses, `s:${t.status}`, { key: `s:${t.status}`, name: t.status });
  }
  const sorted = (map) => [...map.values()].sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name)));
  const ORDER = ['todo', 'doing', 'done', 'pending'];
  const rank = (st) => (ORDER.includes(st.key) ? ORDER.indexOf(st.key) : ORDER.length);
  return {
    activities: sorted(activities),
    projects: sorted(projects),
    priorities,
    statuses: sorted(statuses).sort((a, b) => rank(a) - rank(b)), // the fixed four first, in board order
  };
}

// What `user` may read of a report: the department with people.watch 'all', else their own teams only.
export function reportFor(user, report) {
  const scope = scopeOf(user, 'people.watch');
  if (scope === 'none') return null;
  const all = scope === 'all';
  const teams = report.teams.filter((t) => all || user.team_ids.includes(t.id));
  const previous = report.previous && {
    ...report.previous,
    all: all ? report.previous.all : null,
    teams: Object.fromEntries(Object.entries(report.previous.teams).filter(([id]) => teams.some((t) => t.id === Number(id)))),
  };
  const ids = new Set([...(all ? report.all.people : []), ...teams.flatMap((t) => t.people)]);
  return {
    ...report,
    all: all ? report.all : null,
    teams,
    people: Object.fromEntries(Object.entries(report.people).filter(([id]) => ids.has(Number(id)))),
    ...(previous && { previous }),
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
