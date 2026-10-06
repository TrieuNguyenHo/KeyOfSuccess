// Invitations (v25): an invited account counts as joined only from its first sign-in (users.joined_at). Until then
// it is shown as invited, is not given tasks, added to projects, watched or counted, and its invitation can be
// revoked (the account is deleted).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api;
let boss, chief, root, lead, content, project, task;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  chief = await api.director();
  root = await api.root();
  content = await api.team(boss, 'Content');
  await api.patch(`/admin/users/${boss.id}`, boss, { team_ids: [content] });
  lead = await api.approve(boss, 'lead', { role: 'leader', team: content });
  project = await api.project(boss, { name: 'Tet', team_ids: [content] });
  const section = await api.firstSection(boss, project.id);
  const requirement = await api.requirement(boss, project.id);
  task = await api.task(boss, { section, requirement, title: 'post' });
});
after(() => server.stop());

const invite = (as, email, body = {}) => api.post('/admin/users', as, { email, team_id: content, ...body });
const listed = async (email) => (await api.get('/admin/users', boss)).body.find((u) => u.email === email);

test('an invited account is shown as not joined until its first sign-in', async () => {
  const { body } = await invite(boss, 'newbie@t.test');
  assert.equal(`${body.status}/${body.joined}`, 'active/0');
  assert.equal((await listed('newbie@t.test')).joined, 0);
  await api.user('newbie');
  assert.equal((await listed('newbie@t.test')).joined, 1);
  assert.equal((await api.get('/me', boss)).body.joined, 1, 'people who sign up themselves have joined');
});

test('until they join, invited people are not given tasks, added to projects, watched or counted', async () => {
  const { body: ghost } = await invite(boss, 'ghost@t.test');
  const assignees = (await api.get(`/tasks/${task}`, boss)).body.assignees.map((u) => u.id);
  assert.ok(!assignees.includes(ghost.id));
  assert.equal((await api.patch(`/tasks/${task}`, boss, { assignee_id: ghost.id })).status, 400);
  assert.equal((await api.post(`/projects/${project.id}/members`, boss, { email: 'ghost@t.test' })).status, 404);
  assert.ok(!(await api.get('/people', boss)).body.some((u) => u.id === ghost.id));
  assert.ok(!(await api.get('/dashboard?all=1', boss)).body.people.some((u) => u.id === ghost.id));
  const withTeam = await api.project(boss, { name: 'Whole team', team_ids: [content], add_team: true });
  const members = (await api.get(`/projects/${withTeam.id}`, boss)).body.members.map((m) => m.id);
  assert.ok(!members.includes(ghost.id));

  // Signing in is accepting: from then on they are like everyone else.
  await api.user('ghost');
  assert.equal((await api.patch(`/tasks/${task}`, boss, { assignee_id: ghost.id })).status, 200);
});

test('a Leader invitation waits for approval and shows as not joined', async () => {
  const res = await api.post(`/teams/${content}/invite`, lead, { email: 'pend@t.test' });
  assert.equal(`${res.body.status}/${res.body.joined}`, 'pending/0');
});

test('the inviter, users.manage and root revoke an invitation; joined accounts are only locked', async () => {
  const { body: byBoss } = await invite(boss, 'a@t.test');
  const { body: byLead } = await api.post(`/teams/${content}/invite`, lead, { email: 'b@t.test' });
  const { body: byRoot } = await invite(root, 'c@t.test', { role: 'director', team_id: null });

  assert.equal((await api.delete(`/admin/users/${byBoss.id}`, lead)).status, 403, 'not their invitation');
  assert.equal((await api.delete(`/admin/users/${byLead.id}`, lead)).status, 204, 'their own invitation');
  assert.equal((await api.delete(`/admin/users/${byBoss.id}`, chief)).status, 204);
  assert.equal((await api.delete(`/admin/users/${byRoot.id}`, boss)).status, 403, 'a Director is above a Manager');
  assert.equal((await api.delete(`/admin/users/${byRoot.id}`, root)).status, 204);
  assert.equal(await listed('a@t.test'), undefined);

  assert.equal((await api.delete(`/admin/users/${lead.id}`, boss)).status, 400);
  assert.equal((await api.delete(`/admin/users/${root.id}`, chief)).status, 404);
  // The email can be invited again afterwards.
  assert.equal((await invite(boss, 'a@t.test')).status, 201);
});
