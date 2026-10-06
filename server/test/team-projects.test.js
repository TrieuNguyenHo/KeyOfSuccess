// Projects owned by teams: only Managers create them, the team's Leader manages them and has full rights on
// their tasks, Managers outside the project's teams only view and comment, and only Managers move a project
// to another team.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api;
let boss, boss2, leadC, memC1, memC2, leadD, memD, content, design, p1, p2, section, requirement, task;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  content = await api.team(boss, 'Content');
  design = await api.team(boss, 'Design');
  boss2 = await api.approve(boss, 'boss2', { role: 'manager' }); // a Manager in no team
  leadC = await api.approve(boss, 'leadC', { role: 'leader', team: content });
  memC1 = await api.approve(boss, 'memC1', { team: content });
  memC2 = await api.approve(boss, 'memC2', { team: content });
  leadD = await api.approve(boss, 'leadD', { role: 'leader', team: design });
  memD = await api.approve(boss, 'memD', { team: design });
});
after(() => server.stop());

test('only Managers create projects', async () => {
  assert.equal((await api.post('/projects', memC1, { name: 'x' })).status, 403);
  assert.equal((await api.post('/projects', leadC, { name: 'x', team_ids: [content] })).status, 403);
  const project = await api.project(boss, { name: 'P1', team_ids: [content] });
  p1 = project.id;
  assert.equal(`${project.teams.map((t) => t.name).join()}/${project.access}`, 'Content/manage');
});

test('add_team makes the whole team members', async () => {
  p2 = (await api.project(boss, { name: 'P2', team_ids: [content], add_team: true })).id;
  const { body } = await api.get(`/projects/${p2}`, boss);
  assert.equal(body.members.map((m) => m.name).sort().join(), 'boss,leadC,memC1,memC2');
});

test("the team's Leader manages a project they are not a member of", async () => {
  const listed = (await api.get('/projects', leadC)).body.find((p) => p.id === p1);
  assert.equal(listed.access, 'manage');
  assert.equal((await api.get(`/projects/${p1}`, leadC)).body.project.task_admin, true);
  assert.equal((await api.patch(`/projects/${p1}`, leadC, { name: 'P1 renamed' })).status, 200);
  assert.equal((await api.post(`/projects/${p1}/members`, leadC, { email: 'memd@t.test' })).status, 201);
  assert.equal((await api.delete(`/projects/${p1}/members/${memD.id}`, leadC)).status, 204);
});

test("the team's Leader creates requirements, tasks and sections", async () => {
  section = await api.firstSection(leadC, p1);
  requirement = await api.requirement(leadC, p1);
  task = await api.task(leadC, { section, requirement, title: 'by leader' });
  assert.equal((await api.get(`/tasks/${task}`, leadC)).body.task.access, 'admin');
  assert.equal((await api.post(`/projects/${p1}/sections`, leadC, { name: 'Review' })).status, 201);
});

test('the Leader may not change the team', async () => {
  assert.equal((await api.patch(`/projects/${p1}`, leadC, { team_ids: [design] })).status, 403);
});

test("the team's Leader can edit the team's tasks in cross-project lists", async () => {
  assert.equal((await api.patch(`/tasks/${task}`, leadC, { assignee_id: memC1.id })).status, 200);
  const { body } = await api.get(`/tasks?assignee=${memC1.id}`, leadC);
  assert.equal(body.map((t) => t.can_edit).join(), 'true');
});

test("another team's Leader cannot see the project", async () => {
  assert.equal((await api.get('/projects', leadD)).body.some((p) => p.id === p1), false);
  assert.equal((await api.get(`/projects/${p1}`, leadD)).status, 404);
});

test('a teammate sees only the projects they are a member of', async () => {
  assert.equal((await api.get(`/projects/${p1}`, memC2)).status, 404);
  assert.equal((await api.get(`/projects/${p2}`, memC2)).status, 200);
  assert.equal((await api.patch(`/projects/${p2}`, memC2, { name: 'x' })).status, 403);
});

test("a Manager outside the project's teams views it but cannot change it", async () => {
  assert.equal((await api.get('/projects', boss2)).body.map((p) => p.access).join(), 'view,view');
  assert.equal((await api.get(`/projects/${p1}`, boss2)).body.project.task_admin, false);
  const create = await api.post('/tasks', boss2, { section_id: section, requirement_id: requirement, title: 'x' });
  assert.equal(create.status, 400);
  assert.equal((await api.post(`/projects/${p1}/sections`, boss2, { name: 'x' })).status, 403);
  assert.equal((await api.patch(`/projects/${p1}`, boss2, { name: 'x' })).status, 403);
  assert.equal((await api.delete(`/projects/${p1}`, boss2)).status, 403);
  assert.equal((await api.delete(`/tasks/${task}`, boss2)).status, 403);
});

test('a Manager can still comment', async () => {
  assert.equal((await api.post(`/tasks/${task}/comments`, boss2, { body: 'ok' })).status, 201);
});

test("a Manager in one of the project's teams has full rights on its tasks", async () => {
  await api.patch(`/admin/users/${boss2.id}`, boss, { team_ids: [content] });
  assert.equal((await api.get(`/projects/${p1}`, boss2)).body.project.task_admin, true);
  const extra = await api.task(boss2, { section, requirement, title: 'by manager' });
  assert.equal((await api.patch(`/tasks/${extra}`, boss2, { assignee_id: memC2.id })).status, 200);
  assert.equal((await api.post(`/projects/${p1}/sections`, boss2, { name: 'QA' })).status, 201);
  assert.equal((await api.delete(`/tasks/${extra}`, boss2)).status, 204);
  // Renaming or deleting the project still belongs to the owner and the team's Leader.
  assert.equal((await api.patch(`/projects/${p1}`, boss2, { name: 'x' })).status, 403);
});

test('a Manager moves the project to another team', async () => {
  assert.equal((await api.patch(`/projects/${p1}`, boss, { team_ids: [999] })).status, 400);
  const moved = await api.patch(`/projects/${p1}`, boss, { team_ids: [design] });
  assert.equal(moved.body.teams.map((t) => t.name).join(), 'Design');
  assert.equal((await api.get(`/projects/${p1}`, leadC)).status, 404);
  assert.equal((await api.get(`/projects/${p1}`, leadD)).body.project.access, 'manage');
  assert.equal((await api.get(`/projects/${p1}`, memC1)).body.project.access, 'edit');
});

test('a Manager creates department-wide projects and must name real teams', async () => {
  const project = await api.project(boss, { name: 'All hands' });
  assert.equal(`${project.teams.length}/${project.access}`, '0/manage');
  assert.equal((await api.post('/projects', boss, { name: 'x', team_ids: [999] })).status, 400);
});

test("the team's Leader can delete the team's project", async () => {
  assert.equal((await api.delete(`/projects/${p2}`, leadC)).status, 204);
});
