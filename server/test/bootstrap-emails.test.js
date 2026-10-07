// ROOT_EMAILS / DIRECTOR_EMAILS / MANAGER_EMAILS give their role once (users.env_role, v29): a role changed or an
// account locked in the app since stays so at the next sign-in; an email added to a list later is given its role.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './helpers.js';

const env = { MANAGER_EMAILS: 'boss@t.test,newmgr@t.test' };
let server, api, chief, boss, content;

before(async () => {
  server = await startServer({ env });
  api = server.api;
  chief = await api.director();
  boss = await api.manager();
  content = await api.team(chief, 'Content');
});
after(() => server.stop());

const roleOf = async (name) => {
  const res = await api.signIn(name);
  return res.status === 200 ? `${res.body.user.role}/${res.body.user.status}` : res.status;
};
// A copy of the running server's database, for a second server started with other lists.
const copyInto = (from) => (path) => {
  const db = new DatabaseSync(from);
  db.exec(`VACUUM INTO '${path}'`);
  db.close();
};

test('a role changed in the app stays at the next sign-in, even for an email in the lists', async () => {
  assert.equal(await roleOf('boss'), 'manager/active');
  assert.equal((await api.patch(`/admin/users/${boss.id}`, chief, { role: 'member', team_id: content })).status, 200);
  assert.equal(await roleOf('boss'), 'member/active');
  await api.patch(`/admin/users/${boss.id}`, chief, { role: 'manager' });
  assert.equal(await roleOf('boss'), 'manager/active');
});

test('an account locked in the app stays locked, even for an email in the lists', async () => {
  assert.equal((await api.patch(`/admin/users/${boss.id}`, chief, { status: 'disabled' })).status, 200);
  assert.equal(await roleOf('boss'), 403);
  await api.patch(`/admin/users/${boss.id}`, chief, { status: 'active' });
  assert.equal(await roleOf('boss'), 'manager/active');
});

test('an invited account whose email is in a list gets that role at its first sign-in', async () => {
  const res = await api.post('/admin/users', chief, { email: 'newmgr@t.test', name: 'New', role: 'member', team_id: content });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(await roleOf('newmgr'), 'manager/active');
});

test('an email added to a list later is given its role once; taken out, the role stays', async () => {
  const mem = await api.approve(chief, 'mem', { team: content });
  const later = await startServer({ prepareDb: copyInto(server.dbPath), env: { MANAGER_EMAILS: `${env.MANAGER_EMAILS},mem@t.test` } });
  try {
    const sign = async (name) => `${(await later.api.signIn(name)).body.user.role}`;
    assert.equal(await sign('mem'), 'manager');
    const director = await later.api.director();
    await later.api.patch(`/admin/users/${mem.id}`, director, { role: 'member', team_id: content });
    assert.equal(await sign('mem'), 'member');
  } finally {
    await later.stop();
  }
});

test('the v29 migration counts accounts already in the lists as given their role', async () => {
  await api.patch(`/admin/users/${boss.id}`, chief, { status: 'disabled' });
  const old = await startServer({
    env,
    prepareDb(path) {
      copyInto(server.dbPath)(path);
      const db = new DatabaseSync(path);
      db.exec('ALTER TABLE users DROP COLUMN env_role; PRAGMA user_version = 28;');
      db.close();
    },
  });
  try {
    // Before v29 this sign-in unlocked the account; now the lock set in the app stays.
    assert.equal((await old.api.signIn('boss')).status, 403);
    assert.equal((await old.api.signIn('chief')).body.user.role, 'director');
  } finally {
    await old.stop();
    await api.patch(`/admin/users/${boss.id}`, chief, { status: 'active' });
  }
});
