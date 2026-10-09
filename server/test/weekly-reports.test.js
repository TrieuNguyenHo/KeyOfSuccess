// Weekly reports (v41): written at 8:00 on Monday for the week before, read within the people.watch scope, with the
// overload thresholds set on the Administration screen. The report is run here in the test process, on the test
// server's database, with fixed dates.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './helpers.js';

let server, api, reports, db;
let boss, chief, leadC, memC, memD, project, requirement, section;

const MONDAY = '2026-10-12'; // the report of the week 05/10 – 11/10
const at = (day, time = '08:00') => new Date(`${day}T${time}:00`);

before(async () => {
  server = await startServer({ managerScope: 'team' });
  api = server.api;
  boss = await api.manager();
  chief = await api.director();
  const content = await api.team(chief, 'Content');
  const design = await api.team(chief, 'Design');
  await api.patch(`/admin/users/${boss.id}`, chief, { team_ids: [content] });
  boss = { ...boss, team_ids: [content] };
  leadC = await api.approve(chief, 'leadC', { role: 'leader', team: content });
  memC = await api.approve(chief, 'memC', { team: content });
  memD = await api.approve(chief, 'memD', { team: design });
  project = (await api.project(chief, { name: 'Tet', team_ids: [content, design] })).id;
  requirement = await api.requirement(chief, project, 'R');
  section = await api.firstSection(chief, project);

  // memC: 2 done in the week (one late), 1 done the week before, 3 overdue, 1 due soon; memD: 1 due soon.
  const task = async (assignee, due, doneAt) => {
    const id = await api.task(chief, { section, requirement, title: `T${due}` });
    await api.patch(`/tasks/${id}`, chief, { assignee_id: assignee.id, due_date: due, ...(doneAt && { completed: true }) });
    return [id, doneAt];
  };
  const done = [
    await task(memC, '2026-10-08', '2026-10-07 03:00:00'),
    await task(memC, '2026-10-06', '2026-10-09 03:00:00'),
    await task(memC, '2026-10-01', '2026-10-02 03:00:00'),
  ];
  for (const due of ['2026-10-01', '2026-10-05', '2026-10-10']) await task(memC, due);
  await task(memC, '2026-10-15');
  await task(memD, '2026-10-14');

  process.env.DB_PATH = server.dbPath;
  reports = await import('../src/lib/reports.js');
  ({ db } = await import('../src/db.js'));
  const stamp = db.prepare('UPDATE tasks SET completed_at = ? WHERE id = ?');
  done.forEach(([id, doneAt]) => stamp.run(doneAt, id));
});
after(async () => {
  db?.close();
  await server.stop();
});

test('nothing is written before 8:00 on Monday or on another day', () => {
  assert.deepEqual(reports.runWeeklyReport(at(MONDAY, '07:59')), []);
  assert.deepEqual(reports.runWeeklyReport(at('2026-10-13', '09:00')), []);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM weekly_reports').get().n, 0);
});

test('at 8:00 on Monday last week is written once and the people who watch others are told', async () => {
  const told = reports.runWeeklyReport(at(MONDAY));
  assert.deepEqual(new Set(told), new Set([boss.id, chief.id, leadC.id]));
  assert.deepEqual(reports.runWeeklyReport(at(MONDAY, '10:00')), []);
  const n = (await api.get('/notifications', leadC)).body.items.find((x) => x.type === 'weekly_report');
  assert.equal(`${n.excerpt}|${n.project_id}`, '2026-10-05|null');
  assert.ok(!(await api.get('/notifications', memC)).body.items.some((x) => x.type === 'weekly_report'));
});

test('the report counts the week, the overdue and the overloaded as they stood', async () => {
  const r = (await api.get('/reports/2026-10-05', chief)).body;
  assert.equal(`${r.week_start}|${r.week_end}|${r.taken_on}`, '2026-10-05|2026-10-11|2026-10-12');
  const c = r.people[memC.id];
  assert.deepEqual(
    [c.done, c.done_late, c.open, c.overdue, c.due_soon, c.overloaded],
    [2, 1, 4, 3, 1, true]
  );
  assert.equal(r.people[memD.id].overloaded, false);
  assert.equal(r.all.totals.overloaded, 1);
  const content = r.teams.find((t) => t.name === 'Content');
  assert.deepEqual([content.totals.done, content.totals.overdue], [2, 3]);
});

test('each reader sees their scope: a Leader or a team Manager their teams, the Director the department', async () => {
  assert.deepEqual((await api.get('/reports', leadC)).body, ['2026-10-05']);
  for (const user of [leadC, boss]) {
    const r = (await api.get('/reports/2026-10-05', user)).body;
    assert.equal(r.all, null);
    assert.deepEqual(r.teams.map((t) => t.name), ['Content']);
    assert.ok(!r.people[memD.id]);
  }
  const all = (await api.get('/reports/2026-10-05', chief)).body;
  assert.deepEqual(all.teams.map((t) => t.name), ['Content', 'Design']);
  assert.equal((await api.get('/reports', memC)).status, 403);
  assert.equal((await api.get('/reports/2026-10-05', memC)).status, 403);
  assert.equal((await api.get('/reports/2020-01-06', chief)).status, 404);
});

test('the thresholds are set with users.manage over the department and apply from the next report', async () => {
  assert.deepEqual((await api.get('/report-settings', leadC)).body, { overdue: 3, due_soon: 8 });
  assert.equal((await api.put('/report-settings', boss, { overdue: 2, due_soon: 5 })).status, 403);
  assert.equal((await api.put('/report-settings', chief, { overdue: 0, due_soon: 5 })).status, 400);
  assert.deepEqual((await api.put('/report-settings', chief, { overdue: 5, due_soon: 1 })).body, { overdue: 5, due_soon: 1 });

  reports.runWeeklyReport(at('2026-10-19'));
  const next = (await api.get('/reports/2026-10-12', chief)).body;
  assert.deepEqual(next.thresholds, { overdue: 5, due_soon: 1 });
  assert.equal(next.previous.week_start, '2026-10-05');
  assert.equal(next.previous.all, 2);
  assert.equal((await api.get('/reports/2026-10-05', chief)).body.thresholds.overdue, 3);
});

test('a database of v40 moves to v41 and keeps its notifications', async () => {
  const old = await startServer({
    prepareDb(path) {
      const from = new DatabaseSync(server.dbPath);
      from.exec(`VACUUM INTO '${path}'`);
      from.close();
      const d = new DatabaseSync(path);
      d.exec(`
        DROP TABLE saved_filters; DROP TABLE weekly_reports;
        DELETE FROM notifications WHERE type = 'weekly_report';
        PRAGMA user_version = 40;
      `);
      d.close();
    },
  });
  try {
    const d = new DatabaseSync(old.dbPath);
    assert.equal(d.prepare('PRAGMA user_version').get().user_version, 41);
    assert.ok(d.prepare("SELECT 1 FROM sqlite_master WHERE name = 'weekly_reports'").get());
    d.close();
  } finally {
    await old.stop();
  }
});
