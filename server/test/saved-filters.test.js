// Saved filters (v41): each person's own quick views (a screen's URL hash), on projects they can open, My tasks and
// Work tracking.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api;
let boss, memA, memB, project;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  const content = await api.team(boss, 'Content');
  memA = await api.approve(boss, 'memA', { team: content });
  memB = await api.approve(boss, 'memB', { team: content });
  project = (await api.project(boss, { name: 'Tet', team_ids: [content] })).id;
  await api.post(`/projects/${project}/members`, boss, { email: 'mema@t.test' });
});
after(() => server.stop());

const save = (as, name, hash) => api.post('/saved-filters', as, { name, hash });

test('a person saves filters of a project, My tasks and Work tracking, and sees only their own', async () => {
  const a = await save(memA, 'Facebook tuần này', `#/activity/${project}/board?channel=1&due=week`);
  assert.equal(a.status, 201);
  assert.equal(`${a.body.screen}|${a.body.project_id}`, `project|${project}`);
  assert.equal((await save(memA, 'Của tôi', '#/my?layout=calendar')).body.screen, 'my');
  assert.equal((await save(boss, 'Team Content', '#/team/team:1?channel=2')).body.screen, 'team');
  assert.deepEqual(
    (await api.get('/saved-filters', memA)).body.map((f) => f.name),
    ['Facebook tuần này', 'Của tôi']
  );
  assert.deepEqual((await api.get('/saved-filters', memB)).body, []);
});

test('a name and a screen hash are needed; a project one only for a project the person can open', async () => {
  assert.equal((await save(memA, ' ', '#/my')).status, 400);
  for (const hash of ['#/admin', 'https://example.com', '#/project/x/board', '#/chat/3', '#/my#x']) {
    assert.equal((await save(memA, 'X', hash)).status, 400, hash);
  }
  assert.equal((await save(memB, 'X', `#/project/${project}/list`)).status, 404);
});

test('only the owner deletes a saved filter', async () => {
  const id = (await api.get('/saved-filters', memA)).body[0].id;
  assert.equal((await api.delete(`/saved-filters/${id}`, memB)).status, 404);
  assert.equal((await api.delete(`/saved-filters/${id}`, memA)).status, 204);
  assert.equal((await api.get('/saved-filters', memA)).body.length, 1);
});

test('a screen keeps up to 20 of them', async () => {
  for (let i = 0; i < 19; i++) assert.equal((await save(memA, `M${i}`, '#/my')).status, 201);
  assert.equal((await save(memA, 'one more', '#/my')).status, 400);
});

test('deleting a project deletes its saved filters', async () => {
  const other = (await api.project(boss, { name: 'Tạm', team_ids: [] })).id;
  await save(boss, 'Tạm', `#/project/${other}/list`);
  await api.delete(`/projects/${other}`, boss);
  assert.ok(!(await api.get('/saved-filters', boss)).body.some((f) => f.project_id === other));
});
