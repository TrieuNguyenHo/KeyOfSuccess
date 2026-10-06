// Task history: who changed what on a task, kept 30 days, readable by whoever sees the task.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './helpers.js';

let server, api;
let boss, lead, memA, outsider, project, requirement, other, todo, doing, task;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  const content = await api.team(boss, 'Content');
  const design = await api.team(boss, 'Design');
  lead = await api.approve(boss, 'lead', { role: 'leader', team: content });
  memA = await api.approve(boss, 'memA', { team: content });
  outsider = await api.approve(boss, 'outsider', { team: design });
  project = (await api.project(boss, { name: 'Tet', team_ids: [content] })).id;
  await api.post(`/projects/${project}/members`, boss, { email: 'mema@t.test' });
  requirement = await api.requirement(boss, project, 'Landing');
  other = await api.requirement(boss, project, 'Social');
  [todo, doing] = (await api.get(`/projects/${project}`, boss)).body.sections.map((s) => s.id);
  task = await api.task(lead, { section: todo, requirement, title: 'Banner' });
});
after(() => server.stop());

const history = async (as = memA, id = task) => (await api.get(`/tasks/${id}/history`, as)).body;
// Newest first; a compact line per event for assertions.
const lines = async () =>
  (await history()).map((e) =>
    [e.user_name, e.type, e.field, e.subtask, e.from, e.to, e.title, e.excerpt, e.name].filter((x) => x !== undefined && x !== null).join('|')
  );

test('creating a task starts its history', async () => {
  assert.deepEqual(await lines(), ['lead|created|Banner']);
});

test('field changes are kept as people read them, old → new', async () => {
  await api.patch(`/tasks/${task}`, lead, {
    title: 'Banner Tết',
    assignee_id: memA.id,
    due_date: '2026-10-21',
    priority: 'high',
    requirement_id: other,
  });
  await api.patch(`/tasks/${task}`, lead, { description: 'Kích thước 1200x628' });
  await api.patch(`/tasks/${task}`, lead, { description: 'Kích thước 1080x1080' });
  const events = await history();
  const fields = Object.fromEntries(events.filter((e) => e.type === 'field').reverse().map((e) => [e.field, `${e.from}→${e.to}`]));
  assert.equal(fields.title, 'Banner→Banner Tết');
  assert.equal(fields.assignee_id, 'null→memA');
  assert.equal(fields.due_date, 'null→2026-10-21');
  assert.equal(fields.priority, 'null→high');
  assert.equal(fields.requirement_id, 'Landing→Social');
  assert.equal(events[0].from, 'Kích thước 1200x628'); // the last description edit keeps both versions
  assert.equal(events[0].to, 'Kích thước 1080x1080');
  // Saving the same values again records nothing.
  const count = events.length;
  await api.patch(`/tasks/${task}`, lead, { title: 'Banner Tết', priority: 'high' });
  assert.equal((await history()).length, count);
});

test('ticking records the status move and the tick; status names are kept', async () => {
  await api.patch(`/tasks/${task}`, memA, { completed: true });
  const [a, b] = (await history()).filter((e) => e.type === 'field').slice(0, 2);
  assert.deepEqual(
    [a, b].map((e) => `${e.user_name}|${e.field}|${e.from}→${e.to}`).sort(),
    ['memA|completed|false→true', 'memA|section_id|Cần làm→Hoàn thành']
  );
  await api.patch(`/sections/${doing}`, lead, { name: 'Đang xử lý' });
  await api.patch(`/tasks/${task}`, memA, { completed: false });
  const moved = (await history()).find((e) => e.field === 'section_id');
  assert.equal(`${moved.from}→${moved.to}`, 'Hoàn thành→Đang xử lý');
});

test('subtasks, comments and files show in the parent task history', async () => {
  const sub = (await api.post('/tasks', lead, { parent_id: task, title: 'Crop ảnh' })).body.id;
  await api.patch(`/tasks/${sub}`, memA, { completed: true });
  const c = (await api.post(`/tasks/${task}/comments`, memA, { body: `@[lead](${lead.id}) xem giúp` })).body;
  await api.patch(`/comments/${c.id}`, memA, { body: 'đã sửa' });
  const res = await fetch(`${server.url}/comments/${c.id}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${memA.token}`, 'Content-Type': 'application/octet-stream', 'X-File-Name': 'a.png' },
    body: Buffer.from('x'),
  });
  await res.json();
  await api.delete(`/comments/${c.id}`, boss);
  await api.delete(`/tasks/${sub}`, lead);

  const recent = (await lines()).slice(0, 7);
  assert.deepEqual(recent, [
    'lead|subtask_deleted|Crop ảnh',
    'boss|comment_deleted|đã sửa',
    'memA|file_added|a.png',
    'memA|comment_edited|@lead xem giúp|đã sửa',
    'memA|comment_added|@lead xem giúp',
    'memA|field|completed|Crop ảnh|false|true',
    'lead|subtask_added|Crop ảnh|Crop ảnh',
  ]);
  const deleted = (await history()).find((e) => e.type === 'comment_deleted');
  assert.equal(`${deleted.author}|${deleted.files}`, 'memA|1');
});

test('whoever sees the task reads its history; outsiders get 404', async () => {
  assert.equal((await api.get(`/tasks/${task}/history`, boss)).status, 200);
  assert.equal((await api.get(`/tasks/${task}/history`, outsider)).status, 404);
});

test('events older than 30 days are not shown', async () => {
  const before = (await history()).length;
  const db = new DatabaseSync(server.dbPath);
  db.prepare("UPDATE task_events SET created_at = datetime('now', '-31 days') WHERE id = (SELECT MIN(id) FROM task_events WHERE task_id = ?)").run(task);
  db.close();
  const now = await history();
  assert.equal(now.length, before - 1);
  assert.ok(!now.some((e) => e.type === 'created'));
});

test('deleting a task deletes its history', async () => {
  await api.delete(`/tasks/${task}`, lead);
  const db = new DatabaseSync(server.dbPath);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM task_events WHERE task_id = ?').get(task);
  db.close();
  assert.equal(n, 0);
});
