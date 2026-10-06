// Live content updates: `change` events on GET /api/events when tasks, comments, sections or requirements change.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { listen, startServer, wait } from './helpers.js';

const SETTLE_MS = 300; // time for a pushed event to arrive

let server, api;
let boss, memC, memD, leadD, memX, content, design, project, section, requirement;
const streams = {};

before(async () => {
  server = await startServer();
  api = server.api;
  boss = { ...(await api.manager()), clientId: 'boss-tab' };
  content = await api.team(boss, 'Content');
  design = await api.team(boss, 'Design');
  await api.patch(`/admin/users/${boss.id}`, boss, { team_ids: [content, design] });
  memC = await api.approve(boss, 'memC', { team: content });
  memD = await api.approve(boss, 'memD', { team: design });
  leadD = await api.approve(boss, 'leadD', { role: 'leader', team: design });
  memX = await api.approve(boss, 'memX', { team: design }); // never in the project
  project = (await api.project(boss, { name: 'Tet', team_ids: [content] })).id;
  for (const email of ['memc@t.test', 'memd@t.test']) await api.post(`/projects/${project}/members`, boss, { email });
  requirement = await api.requirement(boss, project, 'Landing');
  section = await api.firstSection(boss, project);
  for (const [name, user] of Object.entries({ boss, memC, leadD, memX })) streams[name] = listen(server.url, user);
  await wait(SETTLE_MS);
});
after(async () => {
  for (const stream of Object.values(streams)) await stream.close();
  await server.stop();
});

// Runs `fn`, waits for the events, and returns the change events each stream received meanwhile.
async function changesDuring(fn) {
  const before = Object.fromEntries(Object.entries(streams).map(([name, s]) => [name, s.changes.length]));
  await fn();
  await wait(SETTLE_MS);
  return Object.fromEntries(Object.entries(streams).map(([name, s]) => [name, s.changes.slice(before[name])]));
}

let task;

test('creating a task reaches everyone who can open the project, with its ids and the source tab', async () => {
  const got = await changesDuring(async () => {
    task = await api.task(boss, { section, requirement, title: 'Form' });
  });
  assert.deepEqual(got.memC, [{ project_id: project, task_id: task, requirement_id: null, source: 'boss-tab' }]);
  assert.equal(got.boss.length, 1);
  assert.equal(got.memX.length, 0);
  assert.equal(got.leadD.length, 0); // Design is not a team of the project
});

test('editing a task and commenting on it are pushed too', async () => {
  const got = await changesDuring(async () => {
    await api.patch(`/tasks/${task}`, boss, { title: 'Form v2' });
    await api.post(`/tasks/${task}/comments`, memC, { body: 'ok' });
  });
  assert.deepEqual(
    got.memC.map((c) => `${c.task_id}|${c.source}`),
    [`${task}|boss-tab`, `${task}|`]
  );
  assert.equal(got.memX.length, 0);
});

test("a Leader watching the assignee hears about that task, but not about the rest of the project", async () => {
  // memD can only be given the task while Design takes part; leadD keeps watching it after Design leaves.
  await api.patch(`/projects/${project}`, boss, { team_ids: [content, design] });
  assert.equal((await api.patch(`/tasks/${task}`, boss, { assignee_id: memD.id })).body.assignee_id, memD.id);
  await api.patch(`/projects/${project}`, boss, { team_ids: [content] });
  const got = await changesDuring(async () => {
    await api.patch(`/tasks/${task}`, boss, { title: 'Form v3' });
    await api.post(`/projects/${project}/sections`, boss, { name: 'Later' });
  });
  assert.deepEqual(got.leadD.map((c) => c.task_id), [task]);
  assert.deepEqual(got.memC.map((c) => c.task_id), [task, null]);
  assert.equal(got.memX.length, 0);
});

test('requirement edits and feedback carry the requirement id', async () => {
  const got = await changesDuring(async () => {
    await api.patch(`/requirements/${requirement}`, boss, { title: 'Landing page' });
    await api.post(`/requirements/${requirement}/comments`, memC, { body: 'góp ý' });
  });
  assert.deepEqual(got.memC.map((c) => c.requirement_id), [requirement, requirement]);
  assert.equal(got.memX.length, 0);
});

test('deleting a task is pushed', async () => {
  const got = await changesDuring(() => api.delete(`/tasks/${task}`, boss));
  assert.deepEqual(got.memC.map((c) => c.task_id), [task]);
});

test('failed requests push nothing', async () => {
  const got = await changesDuring(() => api.patch(`/tasks/999999`, memC, { title: 'x' }));
  assert.equal(got.memC.length + got.boss.length, 0);
});
