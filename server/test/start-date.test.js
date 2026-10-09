// Start dates (v40): top-level tasks carry one for the Timeline, never after their due date; recurring tasks and
// project templates keep the lead time before the due date.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api;
let boss, memA, project, requirement, section, task;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  const content = await api.team(boss, 'Content');
  await api.patch(`/admin/users/${boss.id}`, boss, { team_ids: [content] });
  memA = await api.approve(boss, 'memA', { team: content });
  project = (await api.project(boss, { name: 'Tet', team_ids: [content] })).id;
  await api.post(`/projects/${project}/members`, boss, { email: 'mema@t.test' });
  requirement = await api.requirement(boss, project, 'Landing');
  section = await api.firstSection(boss, project);
  task = await api.task(boss, { section, requirement, title: 'Banner' });
});
after(() => server.stop());

const patch = (body, as = boss, id = task) => api.patch(`/tasks/${id}`, as, body);

test('a task gets a start date, shown in the project and in the task lists', async () => {
  const res = await patch({ start_date: '2026-11-02', due_date: '2026-11-06', assignee_id: memA.id });
  assert.equal(res.status, 200);
  assert.equal(`${res.body.start_date}|${res.body.due_date}`, '2026-11-02|2026-11-06');
  const listed = (await api.get(`/projects/${project}`, boss)).body.tasks.find((t) => t.id === task);
  assert.equal(listed.start_date, '2026-11-02');
  assert.equal((await api.get('/tasks', memA)).body.find((t) => t.id === task).start_date, '2026-11-02');
});

test('the start date is never after the due date; moving both at once is fine', async () => {
  assert.equal((await patch({ start_date: '2026-11-07' })).status, 400);
  assert.equal((await patch({ due_date: '2026-11-01' })).status, 400);
  assert.equal((await patch({ start_date: '2026-11-09', due_date: '2026-11-13' })).status, 200);
  assert.equal((await patch({ start_date: '2026-11-13' })).status, 200);
  // Without a due date, any start date goes.
  assert.equal((await patch({ due_date: null })).status, 200);
  assert.equal((await patch({ start_date: '2026-12-01' })).status, 200);
  assert.equal((await patch({ start_date: '2026-11-09', due_date: '2026-11-13' })).status, 200);
});

test('invalid dates are refused, and subtasks have no start date', async () => {
  for (const start_date of ['2026-02-30', 'mai', '2026-1-5']) assert.equal((await patch({ start_date })).status, 400);
  assert.equal((await patch({ due_date: '2026-13-01' })).status, 400);
  const sub = (await api.post('/tasks', boss, { parent_id: task, title: 'Sub' })).body.id;
  assert.equal((await patch({ start_date: '2026-11-10' }, boss, sub)).status, 400);
});

test('the assignee sets it on their own task; others who only view cannot', async () => {
  assert.equal((await patch({ start_date: '2026-11-10' }, memA)).status, 200);
  const outsider = await api.approve(boss, 'outsider');
  assert.equal((await patch({ start_date: '2026-11-11' }, outsider)).status, 404);
});

test('changes of the start date go to the task history', async () => {
  const events = (await api.get(`/tasks/${task}/history`, boss)).body.filter((e) => e.field === 'start_date');
  assert.equal(`${events[0].from}|${events[0].to}`, '2026-11-09|2026-11-10');
});

test('the next occurrence of a recurring task keeps the lead time before its due date', async () => {
  const weekly = await api.task(boss, { section, requirement, title: 'Báo cáo' });
  await patch({ due_date: '2030-01-04', start_date: '2030-01-02', recurrence: { freq: 'weekly', days: [5] } }, boss, weekly);
  await patch({ completed: true }, boss, weekly);
  const next = (await api.get(`/tasks/${weekly}`, boss)).body.next_task.id;
  const { task: t } = (await api.get(`/tasks/${next}`, boss)).body;
  assert.equal(`${t.start_date}|${t.due_date}`, '2030-01-09|2030-01-11');
});

test('a project template keeps the start dates, counted from the earliest one', async () => {
  const source = (await api.project(boss, { name: 'Nguồn', team_ids: [] })).id;
  const r = await api.requirement(boss, source, 'R');
  const s = await api.firstSection(boss, source);
  const a = await api.task(boss, { section: s, requirement: r, title: 'A' });
  await patch({ start_date: '2026-11-01', due_date: '2026-11-05' }, boss, a);
  const b = await api.task(boss, { section: s, requirement: r, title: 'B' });
  await patch({ due_date: '2026-11-10' }, boss, b);
  const template = (await api.post(`/projects/${source}/template`, boss, { name: 'Có ngày bắt đầu' })).body;
  assert.equal(template.span, 9);
  const created = (await api.post('/projects', boss, { name: 'Mới', template_id: template.id, anchor_date: '2027-03-01' })).body;
  const tasks = (await api.get(`/projects/${created.id}`, boss)).body.tasks;
  const byTitle = Object.fromEntries(tasks.map((t) => [t.title, `${t.start_date}|${t.due_date}`]));
  assert.deepEqual(byTitle, { A: '2027-03-01|2027-03-05', B: 'null|2027-03-10' });
});
