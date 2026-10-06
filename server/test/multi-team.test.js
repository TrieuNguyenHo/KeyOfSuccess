// Projects owned by several teams: every owning team's Leader manages them; Managers set the teams.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api;
let boss, leadC, memC, leadD, memD, leadA, memA, content, design, ads, project;
const names = (p) => p.teams.map((t) => t.name).join();

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  [content, design, ads] = [await api.team(boss, 'Content'), await api.team(boss, 'Design'), await api.team(boss, 'Ads')];
  leadC = await api.approve(boss, 'leadC', { role: 'leader', team: content });
  memC = await api.approve(boss, 'memC', { team: content });
  leadD = await api.approve(boss, 'leadD', { role: 'leader', team: design });
  memD = await api.approve(boss, 'memD', { team: design });
  leadA = await api.approve(boss, 'leadA', { role: 'leader', team: ads });
  memA = await api.approve(boss, 'memA', { team: ads });
});
after(() => server.stop());

test('a Manager creates a project for several teams (duplicates ignored)', async () => {
  project = await api.project(boss, { name: 'Tet', team_ids: [content, design, content], add_team: true });
  assert.equal(names(project), 'Content,Design');
});

test('add_team adds every owning team', async () => {
  const { body } = await api.get(`/projects/${project.id}`, boss);
  assert.equal(body.members.map((m) => m.name).sort().join(), 'boss,leadC,leadD,memC,memD');
});

test('team_ids must be an array of existing teams; none means department-wide', async () => {
  assert.equal((await api.post('/projects', boss, { name: 'x', team_ids: [999] })).status, 400);
  assert.equal((await api.post('/projects', boss, { name: 'x', team_ids: content })).status, 400);
  assert.equal((await api.project(boss, { name: 'All' })).teams.length, 0);
});

test("every owning team's Leader manages the project", async () => {
  assert.equal((await api.get(`/projects/${project.id}`, leadC)).body.project.access, 'manage');
  assert.equal((await api.get(`/projects/${project.id}`, leadD)).body.project.access, 'manage');
  assert.equal((await api.patch(`/projects/${project.id}`, leadD, { name: 'Tet 2027' })).status, 200);
});

test("other teams' Leaders stay out, even when one of their people joins", async () => {
  assert.equal((await api.get(`/projects/${project.id}`, leadA)).status, 404);
  assert.equal((await api.post(`/projects/${project.id}/members`, leadD, { email: 'mema@t.test' })).status, 201);
  assert.equal((await api.get(`/projects/${project.id}`, leadA)).status, 404);
});

test('Leaders cannot change the owning teams', async () => {
  assert.equal((await api.patch(`/projects/${project.id}`, leadC, { team_ids: [content] })).status, 403);
});

test("a co-owning Leader edits the other team's tasks", async () => {
  const section = await api.firstSection(memD, project.id);
  const requirement = await api.requirement(boss, project.id);
  const task = await api.task(memD, { section, requirement, title: 'banner' }); // a Member's task is theirs
  assert.equal((await api.patch(`/tasks/${task}`, leadC, { priority: 'high' })).status, 200);
  assert.equal((await api.get(`/tasks?team=${design}`, leadD)).body.map((t) => t.can_edit).join(), 'true');
  const listed = (await api.get('/projects', leadD)).body.find((p) => p.id === project.id);
  assert.equal(`${listed.access}:${listed.teams.length}`, 'manage:2');
});

test('Members and Leaders cannot create projects', async () => {
  assert.equal((await api.post('/projects', memC, { name: 'x' })).status, 403);
  assert.equal((await api.post('/projects', leadC, { name: 'y', team_ids: [content] })).status, 403);
});

test('a Manager narrows, widens and clears the owning teams', async () => {
  const set = (team_ids) => api.patch(`/projects/${project.id}`, boss, { team_ids });
  assert.equal(names((await set([content])).body), 'Content');
  assert.equal((await api.get(`/projects/${project.id}`, leadD)).body.project.access, 'edit'); // still a member
  assert.equal(names((await set([content, ads])).body), 'Ads,Content');
  assert.equal((await api.get(`/projects/${project.id}`, leadA)).body.project.access, 'manage');
  assert.equal((await set([])).body.teams.length, 0);
  assert.equal((await api.get(`/projects/${project.id}`, leadA)).status, 404);
});

test('a team that still has people cannot be deleted', async () => {
  await api.patch(`/projects/${project.id}`, boss, { team_ids: [ads] });
  await api.patch(`/admin/users/${memA.id}`, boss, { team_id: content });
  assert.equal((await api.delete(`/teams/${ads}`, boss)).status, 400); // leadA is still in Ads
});

test('deleting an emptied team removes it from its projects', async () => {
  await api.patch(`/admin/users/${leadA.id}`, boss, { team_id: content });
  assert.equal((await api.delete(`/teams/${ads}`, boss)).status, 204);
  assert.equal((await api.get(`/projects/${project.id}`, boss)).body.project.teams.length, 0);
});
