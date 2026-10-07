// Project roles (schema v30): a role set by hand for one member of one project wins over the team rules, in both
// directions; without one, the team rules decide. 'admin' manages the project (not deleting it) with full task rights,
// 'member' works on their own tasks and may be assigned even from another team, 'viewer' views and comments.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api;
let boss, chief, leadC, memC, memC2, memD, content, design, project, section, requirement, task;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  chief = await api.director();
  content = await api.team(boss, 'Content');
  design = await api.team(boss, 'Design');
  await api.patch(`/admin/users/${boss.id}`, boss, { team_ids: [content] });
  leadC = await api.approve(boss, 'leadC', { role: 'leader', team: content });
  memC = await api.approve(boss, 'memC', { team: content });
  memC2 = await api.approve(boss, 'memC2', { team: content });
  memD = await api.approve(boss, 'memD', { team: design });

  project = await api.project(boss, { name: 'Tet', team_ids: [content] });
  for (const u of [memC, memC2, memD, leadC, chief]) {
    const res = await api.post(`/projects/${project.id}/members`, boss, { email: u.email });
    assert.equal(res.status, 201, JSON.stringify(res.body));
  }
  section = await api.firstSection(boss, project.id);
  requirement = await api.requirement(boss, project.id);
  task = await api.task(boss, { section, requirement, title: 'post' });
});
after(() => server.stop());

const setRole = (as, user, role) => api.patch(`/projects/${project.id}/members/${user.id}`, as, { role });
const view = async (as) => (await api.get(`/projects/${project.id}`, as)).body;
const member = async (as, user) => (await view(as)).members.find((m) => m.id === user.id);
const assignees = async (as) => (await api.get(`/tasks/${task}`, as)).body.assignees.map((u) => u.name).sort().join();

test('without a role the team rules decide, and the members list says what they give', async () => {
  const body = await view(boss);
  const of = (u) => body.members.find((m) => m.id === u.id);
  assert.deepEqual(
    [memC, memD, leadC].map((u) => [of(u).role, of(u).team_role, of(u).fixed, of(u).can_set_role]),
    [
      [null, 'member', false, true],
      [null, 'viewer', false, true],
      [null, 'admin', false, true],
    ]
  );
  assert.equal(of(boss).fixed, true, 'the owner');
  assert.equal(of(chief).fixed, true, 'whoever manages every project');
  const d = (await view(memD)).project;
  assert.deepEqual([d.access, d.role, d.task_admin, d.can_add_tasks], ['edit', null, false, false]);
});

test("'admin' gives full task rights and project management, but not deleting the project", async () => {
  assert.equal((await setRole(boss, memC, 'admin')).status, 200);
  const p = (await view(memC)).project;
  assert.deepEqual([p.access, p.role, p.task_admin, p.can_edit_requirements], ['manage', 'admin', true, true]);
  assert.equal((await api.post(`/projects/${project.id}/requirements`, memC, { title: 'R2' })).status, 201);
  assert.equal((await api.patch(`/tasks/${task}`, memC, { assignee_id: memC2.id })).status, 200, 'assigns the project teams');
  assert.equal((await api.patch(`/projects/${project.id}`, memC, { name: 'Tet 2027' })).status, 200);
  assert.equal((await api.delete(`/projects/${project.id}`, memC)).status, 403);
  assert.equal((await setRole(memC, memD, 'member')).status, 200, 'an admin sets roles too');
});

test("'member' lets someone from another team add tasks and be assigned", async () => {
  const p = (await view(memD)).project;
  assert.deepEqual([p.access, p.role, p.task_admin, p.can_add_tasks], ['edit', 'member', false, true]);
  const res = await api.post('/tasks', memD, { section_id: section, requirement_id: requirement, title: 'mine' });
  assert.equal(res.status, 201);
  assert.equal(res.body.assignee_id, memD.id);
  assert.match(await assignees(boss), /memD/);
  assert.equal((await api.patch(`/tasks/${task}`, boss, { assignee_id: memD.id })).status, 200);
  assert.equal((await api.patch(`/tasks/${task}`, memD, { title: 'post!' })).status, 200, 'edits a task assigned to them');
});

test("'viewer' takes away what the team rules give, even from a Leader of the project's team", async () => {
  assert.equal((await view(leadC)).project.task_admin, true, 'before');
  assert.equal((await setRole(boss, leadC, 'viewer')).status, 200);
  const p = (await view(leadC)).project;
  assert.deepEqual([p.access, p.task_admin, p.can_add_tasks, p.can_edit_requirements], ['view', false, false, false]);
  const add = await api.post('/tasks', leadC, { section_id: section, requirement_id: requirement, title: 'x' });
  assert.equal(add.status, 400, 'like any viewer: the status is not theirs to add to');
  assert.equal((await api.patch(`/tasks/${task}`, leadC, { title: 'x' })).status, 403);
  assert.equal((await api.post(`/projects/${project.id}/requirements`, leadC, { title: 'R3' })).status, 403);
  assert.doesNotMatch(await assignees(boss), /leadC/);
  assert.equal((await api.patch(`/tasks/${task}`, boss, { assignee_id: leadC.id })).status, 400);
  assert.equal((await api.post(`/tasks/${task}/comments`, leadC, { body: 'still comments' })).status, 201);
});

test('null goes back to the team rules', async () => {
  assert.equal((await setRole(boss, leadC, null)).status, 200);
  assert.equal((await view(leadC)).project.task_admin, true);
  assert.equal((await member(boss, leadC)).role, null);
});

test('who may set a role, and on whom', async () => {
  assert.equal((await setRole(boss, boss, 'viewer')).status, 400, 'the owner (and oneself)');
  assert.equal((await setRole(boss, chief, 'viewer')).status, 400, 'whoever manages every project');
  assert.equal((await setRole(memC, memC, 'member')).status, 400, 'oneself');
  assert.equal((await setRole(boss, memC2, 'boss')).status, 400, 'not a project role');
  assert.equal((await setRole(memC2, memD, 'viewer')).status, 403, 'without manage access');
  assert.equal((await setRole(memC, leadC, 'viewer')).status, 403, 'a higher role level');
  assert.equal((await member(memC, leadC)).can_set_role, false);
  const outsider = await api.approve(boss, 'outsider', { team: design });
  assert.equal((await setRole(boss, outsider, 'member')).status, 404, 'not a member of the project');
});

test('the project role is kept per project', async () => {
  const other = await api.project(boss, { name: 'Other', team_ids: [content] });
  await api.post(`/projects/${other.id}/members`, boss, { email: memC.email });
  const p = (await api.get(`/projects/${other.id}`, memC)).body.project;
  assert.deepEqual([p.role, p.task_admin], [null, false]);
});
