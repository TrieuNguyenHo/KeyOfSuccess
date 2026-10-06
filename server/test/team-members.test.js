// Team member management: Managers for any team, Leaders for their own teams.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api;
let boss, lead, other, memA, memB, loose, signup, content, design;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  [content, design] = await Promise.all(['Content', 'Design'].map((n) => api.team(boss, n)));
  lead = await api.approve(boss, 'lead', { role: 'leader', team: content });
  other = await api.approve(boss, 'other', { role: 'leader', team: design });
  memA = await api.approve(boss, 'memA', { team: content });
  memB = await api.approve(boss, 'memB', { team: design });
  loose = await api.approve(boss, 'loose'); // active, no team
  signup = await api.user('signup'); // signed up, waiting for approval
});
after(() => server.stop());

const names = (users) => users.map((u) => u.name).sort().join();

test('a Leader sees the own team with members and candidates, but no other team', async () => {
  const { status, body } = await api.get(`/teams/${content}/members`, lead);
  assert.equal(status, 200);
  assert.equal(names(body.members), 'lead,memA');
  assert.equal(names(body.candidates), 'loose,signup', 'Members without a team only');
  assert.equal((await api.get(`/teams/${design}/members`, lead)).status, 404);
  assert.equal((await api.get(`/teams/${content}/members`, memA)).status, 404);
});

test('a Manager may also add Leaders and Managers from other teams', async () => {
  const { body } = await api.get(`/teams/${content}/members`, boss);
  assert.equal(names(body.candidates), 'boss,loose,other,signup');
});

test('a Leader counts the self sign-ups they may approve; Members count nothing', async () => {
  assert.equal((await api.get('/notifications', lead)).body.pendingUsers, 1);
  assert.equal((await api.get('/notifications', memA)).body.pendingUsers, 0);
});

test('a Leader adds a teamless Member and approves a self sign-up into the team', async () => {
  const added = await api.post(`/teams/${content}/members`, lead, { user_id: loose.id });
  assert.equal(added.status, 201, JSON.stringify(added.body));
  assert.deepEqual(added.body.team_ids, [content]);

  const approved = await api.post(`/teams/${content}/members`, lead, { user_id: signup.id });
  assert.equal(`${approved.body.status}/${approved.body.team_ids}`, `active/${content}`);
  assert.equal((await api.get('/projects', signup)).status, 200, 'the approved account can use the app');
  assert.equal((await api.get('/notifications', lead)).body.pendingUsers, 0);
});

test('a Leader cannot take people from other teams or add to other teams', async () => {
  assert.equal((await api.post(`/teams/${content}/members`, lead, { user_id: memB.id })).status, 400);
  assert.equal((await api.post(`/teams/${content}/members`, lead, { user_id: other.id })).status, 400);
  assert.equal((await api.post(`/teams/${design}/members`, lead, { user_id: memA.id })).status, 404);
  assert.equal((await api.post(`/teams/${content}/members`, memA, { user_id: memB.id })).status, 404);
});

test("a Leader's invitation waits for a Manager", async () => {
  const invited = await api.post(`/teams/${content}/invite`, lead, { email: 'Fresh@t.test', name: 'Fresh' });
  assert.equal(invited.status, 201, JSON.stringify(invited.body));
  const u = invited.body;
  assert.equal(`${u.status}/${u.team_ids}/${u.invited_by_name}`, `pending/${content}/lead`);
  assert.equal((await api.get('/notifications', boss)).body.pendingUsers, 1);
  assert.equal((await api.get('/notifications', lead)).body.pendingUsers, 0, "a Leader's own invitation is not theirs to approve");

  // Signing in lands on the waiting screen; the Leader cannot approve it, a Manager can.
  const { body } = await api.signIn('fresh');
  assert.equal(`${body.user.id}/${body.user.status}`, `${u.id}/pending`);
  assert.equal((await api.post(`/teams/${design}/members`, other, { user_id: u.id })).status, 403);
  const ok = await api.patch(`/admin/users/${u.id}`, boss, { status: 'active' });
  assert.equal(`${ok.body.status}/${ok.body.team_ids}`, `active/${content}`);

  assert.equal((await api.post(`/teams/${content}/invite`, lead, { email: 'fresh@t.test' })).status, 409);
  assert.equal((await api.post(`/teams/${content}/invite`, lead, { email: 'nope' })).status, 400);
  assert.equal((await api.post(`/teams/${design}/invite`, lead, { email: 'x@t.test' })).status, 404);
});

test("a Manager's invitation is active at once", async () => {
  const { body } = await api.post(`/teams/${design}/invite`, boss, { email: 'direct@t.test' });
  assert.equal(`${body.name}/${body.status}/${body.team_ids}/${body.invited_by_name}`, `direct/active/${design}/boss`);
});

test('a Leader removes Members only; a Leader keeps one team', async () => {
  assert.equal((await api.delete(`/teams/${content}/members/${memA.id}`, lead)).status, 204);
  assert.deepEqual((await api.get(`/teams/${content}/members`, lead)).body.candidates.some((u) => u.id === memA.id), true);
  assert.equal((await api.delete(`/teams/${content}/members/${lead.id}`, lead)).status, 403);
  assert.equal((await api.delete(`/teams/${design}/members/${memB.id}`, lead)).status, 404);
  assert.equal((await api.delete(`/teams/${content}/members/${memB.id}`, lead)).status, 404, 'not in this team');

  assert.equal((await api.delete(`/teams/${design}/members/${other.id}`, boss)).status, 400);
  await api.post(`/teams/${content}/members`, boss, { user_id: other.id });
  assert.equal((await api.delete(`/teams/${design}/members/${other.id}`, boss)).status, 204);
});
