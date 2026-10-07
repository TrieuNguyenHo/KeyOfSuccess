// Statuses (board columns) and the done tick move together: Planned / In-Progress / Completed (+ Pending).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api;
let boss, lead, memA, project, requirement, todo, doing, done, pending;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  const content = await api.team(boss, 'Content');
  lead = await api.approve(boss, 'lead', { role: 'leader', team: content });
  memA = await api.approve(boss, 'memA', { team: content });
  project = (await api.project(boss, { name: 'Tet', team_ids: [content] })).id;
  await api.post(`/projects/${project}/members`, boss, { email: 'mema@t.test' });
  requirement = await api.requirement(boss, project, 'Landing');
  [todo, doing, done, pending] = (await api.get(`/projects/${project}`, boss)).body.sections.map((s) => s.id);
});
after(() => server.stop());

const taskOf = async (id) => (await api.get(`/tasks/${id}`, boss)).body.task;
const state = async (id) => {
  const t = await taskOf(id);
  return `${t.section_id === todo ? 'todo' : t.section_id === doing ? 'doing' : t.section_id === done ? 'done' : t.section_id}/${t.completed}`;
};
const newTask = (title, section = todo, as = lead) => api.task(as, { section, requirement, title });

test('new projects start with Planned, In-Progress, Completed, Pending', async () => {
  const { sections } = (await api.get(`/projects/${project}`, boss)).body;
  assert.equal(
    sections.map((s) => `${s.name}:${s.kind}`).join(),
    'Planned:todo,In-Progress:doing,Completed:done,Pending:pending'
  );
});

test('ticking moves a task to the end of Completed; unticking moves it to In-Progress', async () => {
  const first = await newTask('First', done);
  const t = await newTask('Banner');
  await api.patch(`/tasks/${t}`, lead, { completed: true });
  assert.equal(await state(t), 'done/1');
  const { tasks } = (await api.get(`/projects/${project}`, boss)).body;
  assert.ok(tasks.find((x) => x.id === t).position > tasks.find((x) => x.id === first).position);
  assert.ok((await taskOf(t)).completed_at);

  await api.patch(`/tasks/${t}`, lead, { completed: false });
  assert.equal(await state(t), 'doing/0');
  assert.equal((await taskOf(t)).completed_at, null);
});

test('moving a task into Completed ticks it, and tells the Managers; moving it out unticks it', async () => {
  const t = await newTask('Caption', doing);
  const before = await api.unread(boss);
  await api.patch(`/tasks/${t}`, lead, { section_id: done, position: 99 });
  assert.equal(await state(t), 'done/1');
  assert.equal(await api.unread(boss), before + 1);

  await api.patch(`/tasks/${t}`, lead, { section_id: todo, position: 99 });
  assert.equal(await state(t), 'todo/0');
  // Reordering inside Completed keeps it ticked.
  await api.patch(`/tasks/${t}`, lead, { section_id: done, position: 1 });
  await api.patch(`/tasks/${t}`, lead, { section_id: done, position: 0.5 });
  assert.equal(await state(t), 'done/1');
});

test('a task added straight into Completed is done', async () => {
  const t = await newTask('Already done', done);
  assert.equal(await state(t), 'done/1');
  assert.ok((await taskOf(t)).completed_at);
});

test('Members get the same rule on their own tasks', async () => {
  const t = await newTask('Mine', todo, memA);
  await api.patch(`/tasks/${t}`, memA, { completed: true });
  assert.equal(await state(t), 'done/1');
  await api.patch(`/tasks/${t}`, memA, { section_id: doing, position: 1 });
  assert.equal(await state(t), 'doing/0');
});

test('Pending is an ordinary open status; subtasks only take the tick', async () => {
  const t = await newTask('Waiting', pending);
  assert.equal(await state(t), `${pending}/0`);
  await api.patch(`/tasks/${t}`, lead, { completed: true });
  assert.equal(await state(t), 'done/1');

  const sub = (await api.post('/tasks', lead, { parent_id: t, title: 'Sub' })).body.id;
  await api.patch(`/tasks/${sub}`, lead, { completed: true });
  const s = await taskOf(sub);
  assert.equal(`${s.section_id}/${s.completed}`, 'null/1');
});

test('the built-in statuses can be neither renamed nor deleted; added ones can', async () => {
  for (const id of [todo, doing, done, pending]) {
    for (const res of [await api.delete(`/sections/${id}`, lead), await api.patch(`/sections/${id}`, lead, { name: 'X' })]) {
      assert.equal(res.status, 400);
      assert.match(res.body.error, /mặc định/);
    }
  }
  const extra = (await api.post(`/projects/${project}/sections`, lead, { name: 'Review' })).body;
  assert.equal(extra.kind, null);
  assert.equal((await api.patch(`/sections/${extra.id}`, lead, { name: 'Duyệt' })).body.name, 'Duyệt');
  assert.equal((await api.delete(`/sections/${extra.id}`, lead)).status, 204);
  const { sections } = (await api.get(`/projects/${project}`, boss)).body;
  assert.equal(sections.map((s) => s.name).join(), 'Planned,In-Progress,Completed,Pending');
});
