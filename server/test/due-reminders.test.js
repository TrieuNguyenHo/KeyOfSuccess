// The morning reminder of due dates (v38): one notification at 8:00 on work days counting each person's open tasks
// that are overdue, due today and due by the next work day. The reminder is run here in the test process, on the
// test server's database, with fixed dates.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api, reminders, db;
let boss, memA, memB, project, requirement, section;

// Wednesday 14 and Friday 16 October 2026, in the server's time zone.
const at = (day, time = '09:00') => new Date(`${day}T${time}:00`);
const WEDNESDAY = '2026-10-14';
const FRIDAY = '2026-10-16';

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  const content = await api.team(boss, 'Content');
  await api.patch(`/admin/users/${boss.id}`, boss, { team_ids: [content] });
  memA = await api.approve(boss, 'memA', { team: content });
  memB = await api.approve(boss, 'memB', { team: content });
  project = (await api.project(boss, { name: 'Tet', team_ids: [content] })).id;
  for (const email of ['mema@t.test', 'memb@t.test']) await api.post(`/projects/${project}/members`, boss, { email });
  requirement = await api.requirement(boss, project, 'Landing');
  section = await api.firstSection(boss, project);
  // memA: overdue, due Wednesday, Thursday, Friday, Monday, next Tuesday, one done, one without a date, a subtask.
  const due = async (title, date, extra = {}) => {
    const id = await api.task(boss, { section, requirement, title });
    await api.patch(`/tasks/${id}`, boss, { assignee_id: memA.id, due_date: date, ...extra });
    return id;
  };
  const parent = await due('Cũ', '2026-10-10');
  await due('Thứ Tư', WEDNESDAY);
  await due('Thứ Năm', '2026-10-15');
  await due('Thứ Sáu', FRIDAY);
  await due('Thứ Hai', '2026-10-19');
  await due('Thứ Ba', '2026-10-20');
  await due('Xong', '2026-10-12', { completed: true });
  await due('Không hạn', null);
  const sub = (await api.post('/tasks', boss, { parent_id: parent, title: 'Sub' })).body.id;
  await api.patch(`/tasks/${sub}`, boss, { assignee_id: memA.id, due_date: '2026-10-11' });

  process.env.DB_PATH = server.dbPath;
  reminders = await import('../src/lib/reminders.js');
  ({ db } = await import('../src/db.js'));
  db.prepare("DELETE FROM app_state WHERE key = 'due_digest_day'").run();
});
after(async () => {
  db?.close();
  await server.stop();
});

const digests = async (user) =>
  (await api.get('/notifications', user)).body.items.filter((n) => n.type === 'due_digest').map((n) => JSON.parse(n.excerpt));

test('nothing is sent before 8:00 or at the weekend', async () => {
  assert.deepEqual(reminders.runDueDigests(at(WEDNESDAY, '07:59')), []);
  assert.deepEqual(reminders.runDueDigests(at('2026-10-17')), []);
  assert.deepEqual(reminders.runDueDigests(at('2026-10-18', '10:00')), []);
  assert.deepEqual(await digests(memA), []);
});

test('at 8:00 on a work day each person gets one reminder of their own open tasks, nobody with none', async () => {
  assert.deepEqual(reminders.runDueDigests(at(WEDNESDAY, '08:00')), [memA.id]);
  const [digest] = await digests(memA);
  assert.deepEqual(digest, { day: WEDNESDAY, until: '2026-10-15', overdue: 1, today: 1, soon: 1 });
  assert.deepEqual(await digests(memB), []);
  const n = (await api.get('/notifications', memA)).body.items.find((x) => x.type === 'due_digest');
  assert.equal(`${n.task_id}|${n.project_id}|${n.read_at}`, 'null|null|null');
});

test('it goes out once a day, even when the server checks again or restarts', async () => {
  assert.deepEqual(reminders.runDueDigests(at(WEDNESDAY, '08:05')), []);
  assert.deepEqual(reminders.runDueDigests(at(WEDNESDAY, '16:00')), []);
  assert.equal((await digests(memA)).length, 1);
});

test('on a Friday the next work day is Monday', async () => {
  reminders.runDueDigests(at(FRIDAY, '08:00'));
  const [digest] = await digests(memA);
  // Overdue: the old one, Wednesday's and Thursday's; today: Friday's; by Monday: Monday's.
  assert.deepEqual(digest, { day: FRIDAY, until: '2026-10-19', overdue: 3, today: 1, soon: 1 });
});

test('someone taken out of a project no longer counts its tasks', async () => {
  await api.delete(`/projects/${project}/members/${memA.id}`, boss);
  assert.deepEqual(reminders.runDueDigests(at('2026-10-19', '08:00')), []);
});
