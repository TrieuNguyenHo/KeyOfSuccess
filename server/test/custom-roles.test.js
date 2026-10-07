// Roles root adds, renames and deletes (v27), and the team rules each role carries (min_teams 0/1, max_teams 1/none).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './helpers.js';

let server, api;
let root, chief, boss, lead, mem, content, design;

before(async () => {
  server = await startServer();
  api = server.api;
  root = await api.root();
  chief = await api.director();
  boss = await api.manager();
  content = await api.team(boss, 'Content');
  design = await api.team(boss, 'Design');
  lead = await api.approve(boss, 'lead', { role: 'leader', team: content });
  mem = await api.approve(boss, 'mem', { team: content });
});
after(() => server.stop());

const roles = async (as = root) => (await api.get('/roles', as)).body;
const addRole = (body) => api.post('/admin/roles', root, body);
const roleNamed = (list, name) => list.find((r) => r.name === name);

test('the built-in roles carry the team rules that were hard-coded', async () => {
  const list = await roles(boss);
  const rule = (key) => {
    const r = list.find((x) => x.key === key);
    return `${r.builtin}/${r.min_teams}/${r.max_teams}`;
  };
  assert.deepEqual(
    ['member', 'leader', 'manager', 'director'].map(rule),
    ['1/0/1', '1/1/null', '1/0/null', '1/0/null']
  );
  // Only root sees how many people hold each role.
  assert.equal(list[0].user_count, undefined);
  assert.equal(typeof (await roles())[0].user_count, 'number');
});

test('only root adds, changes and deletes roles', async () => {
  assert.equal((await api.post('/admin/roles', chief, { name: 'X', copy_from: 'member' })).status, 403);
  assert.equal((await api.patch('/admin/roles/member', chief, { name: 'X' })).status, 403);
  assert.equal((await api.delete('/admin/roles/member', chief)).status, 403);
});

test('a new role copies the permissions and team rules of another, at the level root picks', async () => {
  const res = await addRole({ name: 'Senior', level: 2, copy_from: 'leader' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const senior = roleNamed(res.body, 'Senior');
  assert.equal(`${senior.level}/${senior.builtin}/${senior.min_teams}/${senior.max_teams}`, '2/0/1/null');
  const { grants } = (await api.get('/admin/permissions', root)).body;
  assert.deepEqual(grants[senior.key], grants.leader);

  assert.equal((await addRole({ name: 'senior', copy_from: 'member' })).status, 409);
  assert.equal((await addRole({ name: 'Nope', copy_from: 'nobody' })).status, 400);
  assert.equal((await addRole({ name: 'Nope', level: 0, copy_from: 'member' })).status, 400);
  assert.equal((await addRole({ name: '  ', copy_from: 'member' })).status, 400);
});

test('a new role is given like any other, and holds what it copied', async () => {
  const senior = roleNamed(await roles(), 'Senior');
  const res = await api.patch(`/admin/users/${mem.id}`, boss, { role: senior.key });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.role_name, 'Senior');
  const me = (await api.get('/me', mem)).body;
  assert.equal(me.permissions['tasks.admin'], 'team');
  // Back to Member for the next tests.
  await api.patch(`/admin/users/${mem.id}`, boss, { role: 'member' });
});

test('built-in roles are renamed, but keep their level and are never deleted', async () => {
  const res = await api.patch('/admin/roles/leader', root, { name: 'Trưởng nhóm' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal((await api.get('/me', lead)).body.role_name, 'Trưởng nhóm');
  assert.equal((await api.patch('/admin/roles/leader', root, { level: 5 })).status, 400);
  assert.equal((await api.delete('/admin/roles/leader', root)).status, 400);
  assert.equal((await api.post('/admin/permissions/reset', root, { role: 'leader' })).status, 200);
  await api.patch('/admin/roles/leader', root, { name: 'Leader' });
});

test('the team rules of a role decide how many teams its holders have', async () => {
  // Member: one team at most.
  let res = await api.patch(`/admin/users/${mem.id}`, boss, { team_ids: [content, design] });
  assert.equal(res.status, 400);
  // Lifting the limit lets a Member belong to two teams.
  assert.equal((await api.patch('/admin/roles/member', root, { max_teams: null })).status, 200);
  res = await api.patch(`/admin/users/${mem.id}`, boss, { team_ids: [content, design] });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  // The rule cannot come back while a Member breaks it.
  res = await api.patch('/admin/roles/member', root, { max_teams: 1 });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /^Có 1 người/);
  await api.patch(`/admin/users/${mem.id}`, boss, { team_ids: [content] });
  assert.equal((await api.patch('/admin/roles/member', root, { max_teams: 1 })).status, 200);
  // A role needing a team: its holders keep one.
  res = await api.delete(`/teams/${content}/members/${lead.id}`, boss);
  assert.equal(res.status, 400);
  assert.equal((await api.patch('/admin/roles/leader', root, { min_teams: 2 })).status, 400);
});

test('an invitation into a role that needs a team names one', async () => {
  const senior = roleNamed(await roles(), 'Senior');
  const body = { email: 'inv@t.test', role: senior.key };
  assert.equal((await api.post('/admin/users', chief, body)).status, 400);
  const invited = await api.post('/admin/users', chief, { ...body, team_id: design });
  assert.equal(invited.status, 201, JSON.stringify(invited.body));
  // A role somebody holds cannot go; once nobody holds it, it can.
  let res = await api.delete(`/admin/roles/${senior.key}`, root);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /còn 1 người/);
  await api.delete(`/admin/users/${invited.body.id}`, chief);
  res = await api.delete(`/admin/roles/${senior.key}`, root);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(roleNamed(res.body, 'Senior'), undefined);
  assert.equal((await api.get('/admin/permissions', root)).body.grants[senior.key], undefined);
});

test('root manages roles; everything else stays closed to root', async () => {
  const res = await addRole({ name: 'Intern', level: 1, copy_from: 'member' });
  assert.equal(res.status, 201);
  const intern = roleNamed(res.body, 'Intern');
  assert.equal((await api.post('/admin/permissions/reset', root, { role: intern.key })).status, 400);
  assert.equal((await api.delete(`/admin/roles/${intern.key}`, root)).status, 200);
  assert.equal((await api.get('/projects', root)).status, 403);
});

// The migration from a database with the old CHECK is in director.test.js (from v21).
test('users.role has no CHECK any more: roles live in the roles table', () => {
  const db = new DatabaseSync(server.dbPath);
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'users'").get().sql;
  db.close();
  assert.doesNotMatch(sql, /CHECK \(role IN/);
});
