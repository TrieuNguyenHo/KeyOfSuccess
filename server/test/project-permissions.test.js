// Owner / member / outsider rights inside a department-wide project (no team). Only Managers create projects;
// the owner here is a Manager, so a task admin. Members work on their own tasks only.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api;
let owner, member, outsider, project, section, requirement, task, own;

before(async () => {
  server = await startServer();
  api = server.api;
  const boss = await api.manager();
  const [t, u] = [await api.team(boss, 'T'), await api.team(boss, 'U')];
  owner = await api.approve(boss, 'owner', { role: 'manager', team: t });
  member = await api.approve(boss, 'member', { team: t });
  outsider = await api.approve(boss, 'outsider', { team: u });
  project = await api.project(owner, { name: 'P' });
  requirement = await api.requirement(owner, project.id);
  section = await api.firstSection(owner, project.id);
  task = await api.task(owner, { section, requirement, title: 'T' });
});
after(() => server.stop());

test('an outsider cannot see the project or its tasks', async () => {
  assert.equal((await api.get(`/projects/${project.id}`, outsider)).status, 404);
  assert.deepEqual((await api.get('/projects', outsider)).body, []);
  assert.equal((await api.get(`/tasks/${task}`, outsider)).status, 404);
});

test('an outsider cannot create tasks, edit sections or comment', async () => {
  const create = await api.post('/tasks', outsider, { section_id: section, requirement_id: requirement, title: 'x' });
  assert.equal(create.status, 400);
  assert.equal((await api.patch(`/sections/${section}`, outsider, { name: 'x' })).status, 404);
  assert.equal((await api.post(`/tasks/${task}/comments`, outsider, { body: 'x' })).status, 404);
});

test('an outsider cannot add themselves', async () => {
  const res = await api.post(`/projects/${project.id}/members`, outsider, { email: 'outsider@t.test' });
  assert.equal(res.status, 404);
});

test("tasks go only to the assigner's own teams", async () => {
  assert.equal((await api.patch(`/tasks/${task}`, owner, { assignee_id: outsider.id })).status, 400);
});

test('inviting needs an existing account, once', async () => {
  const invite = (email) => api.post(`/projects/${project.id}/members`, owner, { email });
  assert.equal((await invite('nobody@t.test')).status, 404);
  assert.equal((await invite('member@t.test')).status, 201);
  assert.equal((await invite('member@t.test')).status, 409);
});

test("a member's new task is assigned to them, and they edit it but cannot delete it", async () => {
  const { body } = await api.get(`/projects/${project.id}`, member);
  assert.equal(`${body.project.access}/${body.project.task_admin}`, 'edit/false');
  const res = await api.post('/tasks', member, { section_id: section, requirement_id: requirement, title: 'M' });
  assert.equal(`${res.status}/${res.body.assignee_id}`, `201/${member.id}`);
  own = res.body.id;
  assert.equal((await api.get(`/tasks/${own}`, member)).body.task.access, 'edit');
  assert.equal((await api.patch(`/tasks/${own}`, member, { priority: 'high', completed: true })).status, 200);
  assert.equal((await api.post('/tasks', member, { parent_id: own, title: 'sub' })).status, 201);
  assert.equal((await api.delete(`/tasks/${own}`, member)).status, 403);
});

test("a member only views other people's tasks and cannot manage sections", async () => {
  assert.equal((await api.get(`/tasks/${task}`, member)).body.task.access, 'view');
  assert.equal((await api.patch(`/tasks/${task}`, member, { title: 'x' })).status, 403);
  assert.equal((await api.post('/tasks', member, { parent_id: task, title: 'sub' })).status, 400);
  assert.equal((await api.post(`/projects/${project.id}/sections`, member, { name: 'x' })).status, 403);
  assert.equal((await api.patch(`/sections/${section}`, member, { name: 'x' })).status, 403);
  assert.equal((await api.delete(`/sections/${section}`, member)).status, 403);
});

test('the owner assigns to a member and deletes tasks', async () => {
  assert.equal((await api.patch(`/tasks/${task}`, owner, { assignee_id: member.id })).status, 200);
  assert.equal((await api.get(`/tasks/${task}`, member)).body.task.access, 'edit');
  const extra = await api.task(owner, { section, requirement, title: 'extra' });
  assert.equal((await api.delete(`/tasks/${extra}`, owner)).status, 204);
});

test('a member cannot rename, delete or manage members', async () => {
  assert.equal((await api.patch(`/projects/${project.id}`, member, { name: 'x' })).status, 403);
  assert.equal((await api.delete(`/projects/${project.id}`, member)).status, 403);
  assert.equal((await api.post(`/projects/${project.id}/members`, member, { email: 'outsider@t.test' })).status, 403);
  assert.equal((await api.delete(`/projects/${project.id}/members/${owner.id}`, member)).status, 400);
});

test('members are listed owner first', async () => {
  const { body } = await api.get(`/projects/${project.id}`, owner);
  assert.equal(body.members.map((m) => m.name).join(), 'owner,member');
});

test('removing a member revokes access and unassigns their tasks', async () => {
  assert.equal((await api.delete(`/projects/${project.id}/members/${member.id}`, owner)).status, 204);
  assert.equal((await api.get(`/projects/${project.id}`, member)).status, 404);
  assert.equal((await api.get(`/tasks/${task}`, owner)).body.task.assignee_id, null);
});

test('a member can leave; the owner cannot be removed', async () => {
  await api.post(`/projects/${project.id}/members`, owner, { email: 'member@t.test' });
  assert.equal((await api.delete(`/projects/${project.id}/members/${member.id}`, member)).status, 204);
  assert.equal((await api.delete(`/projects/${project.id}/members/${owner.id}`, owner)).status, 400);
});

test('the owner renames and deletes the project', async () => {
  assert.equal((await api.patch(`/projects/${project.id}`, owner, { name: 'P2' })).status, 200);
  assert.equal((await api.delete(`/projects/${project.id}`, owner)).status, 204);
});
