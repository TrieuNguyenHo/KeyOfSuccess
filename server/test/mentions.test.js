// @mentions in task comments and requirement feedback: only people who can see the discussion
// can be mentioned and notified; everything else becomes plain text.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api;
let boss, leadC, memC, memC2, leadD, memD, pending, project, requirement, task;
const tag = (user) => `@[${user.name}](${user.id})`;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  const content = await api.team(boss, 'Content');
  const design = await api.team(boss, 'Design');
  leadC = await api.approve(boss, 'leadC', { role: 'leader', team: content });
  memC = await api.approve(boss, 'memC', { team: content });
  memC2 = await api.approve(boss, 'memC2', { team: content }); // teammate who is not in the project
  leadD = await api.approve(boss, 'leadD', { role: 'leader', team: design });
  memD = await api.approve(boss, 'memD', { team: design });
  pending = await api.user('pend');

  // A Content project with memC and memD (Design) as members; memC creates the task, so it is theirs.
  project = (await api.project(boss, { name: 'Tet', team_ids: [content] })).id;
  for (const email of ['memc@t.test', 'memd@t.test']) await api.post(`/projects/${project}/members`, boss, { email });
  requirement = await api.requirement(boss, project, 'Landing');
  const section = await api.firstSection(boss, project);
  task = await api.task(memC, { section, requirement, title: 'Form' });
});
after(() => server.stop());

const latest = async (as) => (await api.get('/notifications', as)).body;

test('the mention list is the people who can see the task, minus yourself', async () => {
  assert.equal((await api.get(`/tasks/${task}/mentionable`, memC)).body.map((u) => u.name).join(), 'boss,leadC,memD');
  assert.equal((await api.get(`/tasks/${task}/mentionable`, memC2)).status, 404);
  assert.equal(
    (await api.get(`/requirements/${requirement}/mentionable`, memD)).body.map((u) => u.name).join(),
    'boss,leadC,memC'
  );
});

test('mentions of people who cannot see the task become plain text', async () => {
  const body = `Nho xem ${tag(memD)}, ${tag(memC2)}, @[ghost](9999), ${tag(pending)} va ${tag(memC)}`;
  const saved = (await api.post(`/tasks/${task}/comments`, memC, { body })).body.body;
  assert.equal(saved, `Nho xem ${tag(memD)}, @memC2, @ghost, @pend va ${tag(memC)}`);
  assert.ok((await api.get(`/tasks/${task}`, memD)).body.comments[0].body.includes('@[memD]'));
});

test('only the valid mention is notified, with a plain-text excerpt', async () => {
  const { unread, items } = await latest(memD);
  assert.equal([unread, items[0].type, items[0].actor_name, items[0].task_title, items[0].project_name].join('|'), '1|mention|memC|Form|Tet');
  assert.equal(items[0].excerpt, 'Nho xem @memD, @memC2, @ghost, @pend va @memC');
  assert.equal(await api.unread(memC2), 0); // cannot see the task
  assert.equal(await api.unread(memC), 0); // tagged themselves
  assert.equal(await api.unread(leadD), 0);
});

test('a Manager viewing the project can mention people', async () => {
  assert.equal((await api.post(`/tasks/${task}/comments`, boss, { body: `${tag(leadC)} xem` })).status, 201);
  const { items } = await latest(leadC);
  assert.equal(`${items[0].type}|${items[0].actor_name}`, 'mention|boss');
});

test('mentioning someone twice notifies them once', async () => {
  assert.equal((await api.post(`/tasks/${task}/comments`, memC, { body: `${tag(memD)} ${tag(memD)}` })).status, 201);
  assert.equal(await api.unread(memD), 2);
});

test('mentions in requirement feedback point at the requirement', async () => {
  const comment = (body) => api.post(`/requirements/${requirement}/comments`, memD, { body });
  assert.equal((await comment(`${tag(leadC)} duyet giup`)).status, 201);
  const n = (await latest(leadC)).items[0];
  assert.equal([n.type, n.requirement_title, n.task_title, n.project_name, n.project_id].join('|'), `mention|Landing||Tet|${project}`);
  assert.equal((await comment(tag(memC2))).body.body, '@memC2');
});

test('subtasks share the parent task audience', async () => {
  assert.equal((await api.post('/tasks', memC, { parent_id: task, title: 'sub' })).status, 201);
  const subtask = (await api.get(`/tasks/${task}`, memC)).body.subtasks[0].id;
  assert.equal((await api.get(`/tasks/${subtask}/mentionable`, memC)).body.map((u) => u.name).join(), 'boss,leadC,memD');
});

test('mention notifications live alongside completion notifications', async () => {
  const id = (await latest(leadC)).items[0].id;
  assert.equal((await api.post('/notifications/read', leadC, { id })).status, 204);
  await api.patch(`/tasks/${task}`, memC, { completed: true });
  const n = (await latest(leadC)).items[0];
  assert.equal(`${n.type}|${n.task_title}`, 'task_completed|Form');
});
