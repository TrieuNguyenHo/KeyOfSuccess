// Who may assign a task, and to whom: task admins (Managers and Leaders of a team taking part in the project)
// assign to themselves and to the active people of their own teams in the project, who join when assigned.
// Members never assign.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api;
let boss, leadC, memC, memD, pending, content, design, project, task;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  content = await api.team(boss, 'Content');
  design = await api.team(boss, 'Design');
  await api.patch(`/admin/users/${boss.id}`, boss, { team_ids: [content] });
  leadC = await api.approve(boss, 'leadC', { role: 'leader', team: content });
  memC = await api.approve(boss, 'memC', { team: content });
  memD = await api.approve(boss, 'memD', { team: design });
  pending = await api.user('pendC'); // in the team but never approved
  await api.patch(`/admin/users/${pending.id}`, boss, { team_id: content });

  project = await api.project(boss, { name: 'Tet', team_ids: [content] });
  const section = await api.firstSection(boss, project.id);
  const requirement = await api.requirement(boss, project.id);
  task = await api.task(boss, { section, requirement, title: 'post' });
});
after(() => server.stop());

const assign = (as, assignee_id) => api.patch(`/tasks/${task}`, as, { assignee_id });
const memberNames = async () => (await api.get(`/projects/${project.id}`, boss)).body.members.map((m) => m.name);

test('assignee choices are yourself plus your own teams in the project', async () => {
  const { body } = await api.get(`/tasks/${task}`, boss);
  assert.equal(body.assignees.map((u) => `${u.name}:${u.is_member}`).join(), 'boss:1,leadC:0,memC:0');
});

test('assigning a teammate adds them to the project', async () => {
  assert.equal((await api.get(`/projects/${project.id}`, memC)).status, 404);
  assert.equal((await assign(boss, memC.id)).status, 200);
  assert.equal((await memberNames()).join(), 'boss,memC');
  assert.equal((await api.get(`/projects/${project.id}`, memC)).body.project.access, 'edit');
  assert.equal((await api.get('/tasks?assignee=me', memC)).body.map((t) => t.title).join(), 'post');
});

test('people outside your teams, or not approved, cannot be assigned', async () => {
  assert.equal((await assign(boss, memD.id)).status, 400);
  assert.equal((await assign(boss, pending.id)).status, 400);
});

test('a Member cannot assign, not even their own task; the team Leader can', async () => {
  assert.equal((await assign(memC, leadC.id)).status, 403);
  assert.equal((await assign(memC, null)).status, 403);
  assert.equal((await assign(memC, memC.id)).status, 200, 'saving the same assignee is no change');
  assert.equal((await assign(leadC, leadC.id)).status, 200);
  assert.equal((await memberNames()).sort().join(), 'boss,leadC,memC');
});

test('reassigning, unassigning and string ids work', async () => {
  assert.equal((await assign(boss, memC.id)).status, 200);
  assert.equal((await assign(boss, null)).body.assignee_id, null);
  assert.equal((await assign(boss, String(leadC.id))).status, 200);
});

test('in a shared project each Leader assigns only their own team', async () => {
  const shared = await api.project(boss, { name: 'Shared', team_ids: [content, design] });
  const section = await api.firstSection(boss, shared.id);
  const requirement = await api.requirement(boss, shared.id);
  const id = await api.task(boss, { section, requirement, title: 'banner' });
  assert.equal((await api.get(`/tasks/${id}`, leadC)).body.assignees.map((u) => u.name).join(), 'boss,leadC,memC');
  assert.equal((await api.patch(`/tasks/${id}`, leadC, { assignee_id: memD.id })).status, 400);
});

test("department-wide projects offer the assigner's own teams", async () => {
  const all = await api.project(boss, { name: 'All' });
  const section = await api.firstSection(boss, all.id);
  const requirement = await api.requirement(boss, all.id);
  const allTask = await api.task(boss, { section, requirement, title: 'x' });
  assert.equal((await api.get(`/tasks/${allTask}`, boss)).body.assignees.map((u) => u.name).join(), 'boss,leadC,memC');
  assert.equal((await api.patch(`/tasks/${allTask}`, boss, { assignee_id: memD.id })).status, 400);
});

// ---------- Only people of the project's teams take its tasks ----------

test("a member from another team views the project but is not assigned and adds no task of their own", async () => {
  await api.post(`/projects/${project.id}/members`, boss, { email: 'memd@t.test' });
  const view = (await api.get(`/projects/${project.id}`, memD)).body;
  assert.equal(view.project.can_add_tasks, false);
  assert.equal((await api.get(`/projects/${project.id}`, memC)).body.project.can_add_tasks, true);
  const [section] = view.sections;
  const requirement = view.requirements[0].id;
  assert.equal((await api.post('/tasks', memD, { section_id: section.id, requirement_id: requirement, title: 'x' })).status, 403);
  assert.ok(!(await api.get(`/tasks/${task}`, boss)).body.assignees.some((u) => u.id === memD.id));
  assert.equal((await assign(boss, memD.id)).status, 400);
  // They still comment.
  assert.equal((await api.post(`/tasks/${task}/comments`, memD, { body: 'góp ý' })).status, 201);
});

test("a task shows its assignee's teams in the project; an old assignee keeps their own teams", async () => {
  const teamsOf = async () =>
    (await api.get(`/projects/${project.id}`, boss)).body.tasks.find((t) => t.id === task).assignee_teams.map((t) => t.name);
  // boss is in Content and Design; in this Content project only Content shows.
  await api.patch(`/admin/users/${boss.id}`, boss, { team_ids: [content, design] });
  await assign(boss, boss.id);
  assert.deepEqual(await teamsOf(), ['Content']);
  // memC (Content) keeps the task when the project moves to Design only: their own team still shows.
  await assign(boss, memC.id);
  await api.patch(`/projects/${project.id}`, boss, { team_ids: [design] });
  assert.deepEqual(await teamsOf(), ['Content']);
  assert.equal((await api.get(`/tasks/${task}`, memC)).body.task.assignee_id, memC.id);
  // Back as it was.
  await api.patch(`/projects/${project.id}`, boss, { team_ids: [content] });
  await api.patch(`/admin/users/${boss.id}`, boss, { team_ids: [content] });
  await assign(boss, null);
  assert.deepEqual(await teamsOf(), []);
});

test('in a department-wide project anyone with a team is assigned; a Manager with no team is not', async () => {
  const loner = await api.approve(boss, 'loner', { role: 'manager' }); // a Manager in no team
  const wide = (await api.project(boss, { name: 'Wide', team_ids: [] })).id;
  const section = await api.firstSection(boss, wide);
  const requirement = await api.requirement(boss, wide);
  const t = await api.task(boss, { section, requirement, title: 'wide' });
  assert.equal((await api.patch(`/tasks/${t}`, boss, { assignee_id: memD.id })).status, 400); // boss is not in Design
  const choices = (await api.get(`/tasks/${t}`, loner)).body.assignees.map((u) => u.name);
  assert.ok(!choices.includes('loner'));
});
