// Profile (v20): the signed-in user edits their display name and personal details; only they and Managers read
// the personal details, which never appear in the responses other people get about them.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api, boss, lead, mem, team;
const PRIVATE = ['birthday', 'phone', 'job_title', 'bio', 'gender'];

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  team = await api.team(boss, 'Content');
  lead = await api.approve(boss, 'lead', { role: 'leader', team });
  mem = await api.approve(boss, 'mem', { team });
});
after(() => server.stop());

const today = new Date().toLocaleDateString('sv-SE');

test('the user reads and edits their own profile', async () => {
  const me = (await api.get('/me', mem)).body;
  assert.deepEqual(PRIVATE.map((f) => me[f]), [null, null, null, null, null]);
  assert.ok(me.created_at, 'the joining date is shown');

  const res = await api.patch('/me', mem, {
    name: '  Minh Content  ',
    birthday: '1995-04-30',
    phone: '+84 912 345 678',
    job_title: 'Content Executive',
    bio: 'Viết bài Facebook và SEO.',
    gender: 'female',
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(
    [res.body.name, res.body.birthday, res.body.phone, res.body.job_title, res.body.bio, res.body.gender],
    ['Minh Content', '1995-04-30', '+84 912 345 678', 'Content Executive', 'Viết bài Facebook và SEO.', 'female']
  );
  assert.equal((await api.get('/me', mem)).body.birthday, '1995-04-30');
});

test('empty values clear optional fields; the display name stays required', async () => {
  const res = await api.patch('/me', mem, { phone: '', bio: null, gender: '' });
  assert.deepEqual([res.body.phone, res.body.bio, res.body.gender], [null, null, null]);
  assert.equal(res.body.job_title, 'Content Executive', 'fields not sent are kept');
  assert.equal((await api.patch('/me', mem, { name: '   ' })).status, 400);
});

test('invalid values are refused', async () => {
  const bad = [
    { birthday: '1995-02-30' },
    { birthday: '30/04/1995' },
    { birthday: '1800-01-01' },
    { birthday: '2999-01-01' },
    { phone: 'call me' },
    { phone: '123' },
    { gender: 'robot' },
    { name: 'x'.repeat(81) },
    { job_title: 'x'.repeat(81) },
    { bio: 'x'.repeat(501) },
    {},
  ];
  for (const body of bad) assert.equal((await api.patch('/me', mem, body)).status, 400, JSON.stringify(body));
  assert.equal((await api.patch('/me', mem, { birthday: today })).status, 200, 'today is fine');
});

test('the new name shows everywhere the user appears', async () => {
  await api.patch('/me', mem, { name: 'Minh C.' });
  const members = (await api.get(`/teams/${team}/members`, lead)).body.members;
  assert.ok(members.some((u) => u.name === 'Minh C.'));
});

test('Managers read everyone\'s profile in user administration; nobody else sees it', async () => {
  await api.patch('/me', mem, { phone: '0912345678', gender: 'female' });
  const row = (await api.get('/admin/users', boss)).body.find((u) => u.id === mem.id);
  assert.equal(row.phone, '0912345678');
  assert.equal((await api.patch(`/admin/users/${mem.id}`, boss, {})).body.phone, '0912345678');
  assert.equal((await api.get('/admin/users', lead)).status, 403);

  // What a Leader and colleagues receive about other people carries no personal details.
  const seen = [
    ...(await api.get(`/teams/${team}/members`, lead)).body.members,
    ...(await api.get('/people', lead)).body,
  ];
  assert.ok(seen.length > 0);
  for (const u of seen) for (const f of PRIVATE) assert.equal(u[f], undefined, `${f} leaked for ${u.name}`);
});

test("a user's profile opens to them, Managers and the Leaders of their teams only", async () => {
  const other = await api.team(boss, 'Design');
  const leadOther = await api.approve(boss, 'leadOther', { role: 'leader', team: other });
  const colleague = await api.approve(boss, 'colleague', { team });
  const profile = (as, id = mem.id) => api.get(`/users/${id}/profile`, as);

  assert.equal((await profile(boss)).body.phone, '0912345678', 'Manager');
  assert.equal((await profile(lead)).body.phone, '0912345678', 'Leader of their team');
  assert.equal((await profile(mem)).body.phone, '0912345678', 'themselves');
  assert.equal((await profile(leadOther)).status, 404, 'Leader of another team');
  assert.equal((await profile(colleague)).status, 404, 'a teammate who is not a Leader');
  assert.equal((await profile(boss, 99999)).status, 404);
  assert.equal((await profile(boss, 'abc')).status, 404);

  // A Leader with several teams reads the people of each.
  await api.patch(`/admin/users/${leadOther.id}`, boss, { team_ids: [other, team] });
  assert.equal((await profile(leadOther)).status, 200);
  // ...and the other Leaders of their teams.
  assert.equal((await profile(leadOther, lead.id)).status, 200);
});

test("a Manager's profile is for Managers only, even for the Leaders of the Manager's teams", async () => {
  await api.patch(`/admin/users/${boss.id}`, boss, { team_ids: [team] });
  const boss2 = await api.approve(boss, 'boss2', { role: 'manager', team });
  assert.equal((await api.get(`/users/${boss.id}/profile`, lead)).status, 404);
  assert.equal((await api.get(`/users/${boss.id}/profile`, mem)).status, 404);
  assert.equal((await api.get(`/users/${boss.id}/profile`, boss2)).status, 200);
  assert.equal((await api.get(`/users/${boss.id}/profile`, boss)).status, 200, 'themselves');
});

test('a Manager edits only their own profile through /me', async () => {
  const res = await api.patch('/me', boss, { job_title: 'Marketing Manager' });
  assert.equal(res.body.job_title, 'Marketing Manager');
  assert.equal((await api.get('/me', mem)).body.job_title, 'Content Executive', 'others untouched');
});
