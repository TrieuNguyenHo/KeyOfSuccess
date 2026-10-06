// Assignment notifications and the live event stream (GET /api/events).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { listen, startServer, wait } from './helpers.js';

const SETTLE_MS = 300; // time for a pushed event to arrive

let server, api;
let boss, leadC, memC, memD, requirement, task, memDStream, bossStream;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  const content = await api.team(boss, 'Content');
  const design = await api.team(boss, 'Design');
  leadC = await api.approve(boss, 'leadC', { role: 'leader', team: content });
  memC = await api.approve(boss, 'memC', { team: content });
  memD = await api.approve(boss, 'memD', { team: design });
  // boss belongs to both teams, so they assign anyone here.
  await api.patch(`/admin/users/${boss.id}`, boss, { team_ids: [content, design] });
  const project = (await api.project(boss, { name: 'Tet', team_ids: [content, design] })).id;
  for (const email of ['memc@t.test', 'memd@t.test']) await api.post(`/projects/${project}/members`, boss, { email });
  requirement = await api.requirement(boss, project, 'Landing');
  const section = await api.firstSection(boss, project);
  task = await api.task(boss, { section, requirement, title: 'Form' });
});
after(async () => {
  await memDStream?.close();
  await bossStream?.close();
  await server.stop();
});

const assign = async (as, assignee_id, extra = {}) => {
  await api.patch(`/tasks/${task}`, as, { assignee_id, ...extra });
  await wait(SETTLE_MS);
};

test('the event stream needs a token', async () => {
  const res = await fetch(`${server.url}/events`);
  assert.equal(res.status, 401);
  await res.body?.cancel();
});

test('signed-in users can open the stream', async () => {
  memDStream = listen(server.url, memD);
  bossStream = listen(server.url, boss);
  await wait(SETTLE_MS);
  assert.ok(memDStream.isOpen());
});

test('assigning a task notifies the assignee, live', async () => {
  await assign(boss, memD.id);
  const { unread, items } = (await api.get('/notifications', memD)).body;
  assert.equal([unread, items[0].type, items[0].actor_name, items[0].task_title].join('|'), '1|assigned|boss|Form');
  assert.equal(memDStream.events.length, 1);
  assert.equal(bossStream.events.length, 0);
});

test('saving the same assignee again does not notify', async () => {
  await assign(boss, memD.id, { title: 'Form v2' });
  assert.equal(await api.unread(memD), 1);
});

test('assigning yourself does not notify', async () => {
  await assign(boss, boss.id);
  assert.equal(await api.unread(boss), 0);
});

test('reassigning notifies the new assignee; unassigning notifies nobody', async () => {
  await assign(boss, leadC.id);
  const { unread, items } = (await api.get('/notifications', leadC)).body;
  assert.equal(`${items[0].type}|${unread}`, 'assigned|1');
  await assign(boss, null);
  assert.equal(await api.unread(leadC), 1);
});

test('mentions are pushed to the mentioned user', async () => {
  await api.post(`/tasks/${task}/comments`, memC, { body: `@[memD](${memD.id}) xem` });
  await wait(SETTLE_MS);
  assert.equal(memDStream.events.length, 2);
  await api.post(`/requirements/${requirement}/comments`, memC, { body: `@[memD](${memD.id}) ok` });
  await wait(SETTLE_MS);
  assert.equal(memDStream.events.length, 3);
});

test('completions are pushed to Managers', async () => {
  await assign(boss, memD.id);
  await api.patch(`/tasks/${task}`, memD, { completed: true });
  await wait(SETTLE_MS);
  assert.equal(bossStream.events.length, 1);
  assert.equal((await api.get('/notifications', boss)).body.items[0].type, 'task_completed');
  assert.ok(memDStream.isOpen());
});
