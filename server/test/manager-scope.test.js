// Managers run their own teams only (v26 defaults, decided 2026-10-06): user management, teams, project teams, work
// tracking, profiles and completion notifications are all team-scoped; the Director alone sees the whole department.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api;
let chief, mgr, leadC, memC, memD, selfSignup, content, design, designProject, contentProject;

before(async () => {
  server = await startServer({ managerScope: 'team' });
  api = server.api;
  chief = await api.director();
  content = await api.team(chief, 'Content');
  design = await api.team(chief, 'Design');
  mgr = await api.approve(chief, 'mgr', { role: 'manager', team: content });
  leadC = await api.approve(chief, 'leadC', { role: 'leader', team: content });
  memC = await api.approve(chief, 'memC', { team: content });
  memD = await api.approve(chief, 'memD', { team: design });
  selfSignup = await api.user('stranger'); // pending, no team
  designProject = await api.project(chief, { name: 'Design only', team_ids: [design] });
  contentProject = await api.project(mgr, { name: 'Content only', team_ids: [content] });
});
after(() => server.stop());

const ids = (list) => list.map((u) => u.id);

test("a Manager's user list holds their teams' people and those without a team, not other teams or higher roles", async () => {
  const listed = ids((await api.get('/admin/users', mgr)).body);
  for (const u of [mgr, leadC, memC, selfSignup]) assert.ok(listed.includes(u.id), u.name);
  assert.ok(!listed.includes(memD.id), 'another team');
  assert.ok(!listed.includes(chief.id), 'a Director');
  assert.equal(ids((await api.get('/admin/users', chief)).body).length, 6, 'the Director sees everyone');
});

test('a Manager changes only the people they manage, and only their own teams', async () => {
  assert.equal((await api.patch(`/admin/users/${memD.id}`, mgr, { status: 'disabled' })).status, 404);
  // Placing the self sign-up: Design is ignored, Content is theirs to give.
  const placed = await api.patch(`/admin/users/${selfSignup.id}`, mgr, { status: 'active', role: 'leader', team_ids: [content, design] });
  assert.deepEqual(placed.body.team_ids, [content]);
  // A Leader of Content and Design: the Manager takes them out of Content; Design stays.
  await api.patch(`/admin/users/${selfSignup.id}`, chief, { team_ids: [content, design] });
  assert.deepEqual((await api.patch(`/admin/users/${selfSignup.id}`, mgr, { team_ids: [] })).body.team_ids, [design]);
});

test("a Manager invites into their own teams only and counts only their teams' pending people", async () => {
  assert.equal((await api.post('/admin/users', mgr, { email: 'x@t.test', team_id: design })).status, 403);
  assert.equal((await api.post('/admin/users', mgr, { email: 'x@t.test', team_id: content })).status, 201);
  await api.user('newcomer'); // a self sign-up, no team: theirs to approve
  await api.post(`/teams/${design}/invite`, await api.approve(chief, 'leadD', { role: 'leader', team: design }), { email: 'd@t.test' });
  assert.equal((await api.get('/notifications', mgr)).body.pendingUsers, 1);
  assert.equal((await api.get('/notifications', chief)).body.pendingUsers, 2);
});

test('a Manager renames their own teams; creating and deleting teams is for the Director', async () => {
  assert.equal((await api.patch(`/teams/${content}`, mgr, { name: 'Content VN' })).status, 200);
  assert.equal((await api.patch(`/teams/${design}`, mgr, { name: 'Design VN' })).status, 403);
  assert.equal((await api.post('/teams', mgr, { name: 'New' })).status, 403);
  assert.equal((await api.delete(`/teams/${content}`, mgr)).status, 403);
  assert.equal((await api.post('/teams', chief, { name: 'New' })).status, 201);
});

test("a Manager's projects belong to their own teams", async () => {
  assert.equal((await api.post('/projects', mgr, { name: 'D', team_ids: [design] })).status, 403);
  assert.equal((await api.post('/projects', mgr, { name: 'All', team_ids: [] })).status, 403);
  const res = await api.patch(`/projects/${contentProject.id}`, mgr, { team_ids: [content, design] });
  assert.deepEqual(res.body.teams.map((t) => t.id), [content], 'Design is not theirs to add');
  assert.equal((await api.patch(`/projects/${contentProject.id}`, mgr, { team_ids: [] })).status, 403);
});

test('a Manager sees and watches their own teams only', async () => {
  assert.equal((await api.get(`/projects/${designProject.id}`, mgr)).status, 404);
  assert.equal((await api.get('/tasks?all=1', mgr)).status, 403);
  assert.equal((await api.get('/dashboard?all=1', mgr)).status, 403);
  assert.equal((await api.get('/dashboard?mine=1', mgr)).status, 200);
  assert.equal((await api.get(`/tasks?assignee=${memD.id}`, mgr)).status, 403);
  assert.equal((await api.get(`/users/${memD.id}/profile`, mgr)).status, 404);
  assert.equal((await api.get(`/users/${memC.id}/profile`, mgr)).status, 200);
});

test("a Manager is told of completed tasks of their own teams' people only", async () => {
  const done = async (projectId, assignee) => {
    const section = await api.firstSection(chief, projectId);
    const requirement = await api.requirement(chief, projectId);
    const task = await api.task(chief, { section, requirement, title: 'T' });
    await api.patch(`/tasks/${task}`, chief, { assignee_id: assignee.id });
    await api.patch(`/tasks/${task}`, assignee, { completed: true });
  };
  const before = await api.unread(mgr);
  await done(designProject.id, memD);
  assert.equal(await api.unread(mgr), before);
  await done(contentProject.id, memC);
  assert.equal(await api.unread(mgr), before + 1);
});
