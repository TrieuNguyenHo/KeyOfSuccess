// Root accounts (v23): the emails in ROOT_EMAILS configure the system (roles, status and teams of people), are not
// part of the company (no teams, hidden from every list of people) and never reach the company's work.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './helpers.js';

let server, api;
let root, chief, boss, mem, content;

before(async () => {
  server = await startServer();
  api = server.api;
  root = await api.root();
  chief = await api.director();
  boss = await api.manager();
  content = await api.team(boss, 'Content');
  mem = await api.approve(boss, 'mem', { team: content });
  await api.patch('/me', mem, { phone: '0912345678' });
});
after(() => server.stop());

test('ROOT_EMAILS sign in as an active root outside every team', () => {
  assert.equal(`${root.role}/${root.status}/${root.team_ids.length}`, 'root/active/0');
});

test('root is hidden from every list of people', async () => {
  const ids = (list) => list.map((u) => u.id);
  assert.ok(!ids((await api.get('/admin/users', chief)).body).includes(root.id));
  assert.ok(!ids((await api.get('/admin/users', root)).body).includes(root.id));
  assert.ok(!ids((await api.get('/people', boss)).body).includes(root.id));
  assert.ok(!ids((await api.get(`/teams/${content}/members`, boss)).body.candidates).includes(root.id));
  const workload = (await api.get('/dashboard?all=1', boss)).body.people;
  assert.ok(!ids(workload).includes(root.id));
  const project = await api.project(boss, { name: 'P', team_ids: [] });
  assert.equal((await api.post(`/projects/${project.id}/members`, boss, { email: 'root@t.test' })).status, 404);
});

test("root reads the user list, teams and its own account, but not people's personal details", async () => {
  assert.equal((await api.get('/me', root)).status, 200);
  assert.equal((await api.get('/teams', root)).status, 200);
  const users = (await api.get('/admin/users', root)).body;
  assert.equal(users.find((u) => u.id === mem.id).phone, undefined);
  assert.equal((await api.get(`/users/${mem.id}/profile`, root)).status, 403);
});

test("root never reaches the company's work", async () => {
  for (const path of ['/projects', '/tasks?assignee=me', '/notifications', '/dashboard?all=1', '/people', '/channels']) {
    assert.equal((await api.get(path, root)).status, 403, path);
  }
  assert.equal((await api.post('/projects', root, { name: 'X' })).status, 403);
  assert.equal((await api.post('/teams', root, { name: 'X' })).status, 403);
});

test('root sets roles, status and teams, the Director role included', async () => {
  const lead = await api.user('lead');
  const res = await api.patch(`/admin/users/${lead.id}`, root, { status: 'active', role: 'leader', team_ids: [content] });
  assert.equal(`${res.status}/${res.body.role}/${res.body.team_name}`, '200/leader/Content');
  assert.equal(res.body.phone, undefined, 'the answer carries no personal details either');

  assert.equal((await api.patch(`/admin/users/${boss.id}`, root, { role: 'director' })).body.role, 'director');
  assert.equal((await api.patch(`/admin/users/${boss.id}`, root, { role: 'manager' })).body.role, 'manager');
  assert.equal((await api.patch(`/admin/users/${chief.id}`, root, { status: 'disabled' })).body.status, 'disabled');
  assert.equal((await api.patch(`/admin/users/${chief.id}`, root, { status: 'active' })).body.status, 'active');
  // Managers still cannot.
  assert.equal((await api.patch(`/admin/users/${mem.id}`, boss, { role: 'director' })).status, 403);
});

test('root invites new people with any role; Members and Leaders need a team', async () => {
  const res = await api.post('/admin/users', root, { email: 'Vice@T.test', name: 'Vice', role: 'director' });
  assert.equal(`${res.status}/${res.body.role}/${res.body.status}/${res.body.team_ids.length}`, '201/director/active/0');
  assert.ok((await api.get('/admin/users', chief)).body.some((u) => u.email === 'vice@t.test' && u.invited_by === root.id));
  assert.equal((await api.post('/admin/users', root, { email: 'm1@t.test' })).status, 400);
  assert.equal((await api.post('/admin/users', root, { email: 'l1@t.test', role: 'leader' })).status, 400);
  assert.equal((await api.post('/admin/users', root, { email: 'l1@t.test', role: 'leader', team_id: content })).body.role, 'leader');
  assert.equal((await api.post('/admin/users', root, { email: 'r1@t.test', role: 'root' })).status, 400);
  // The first sign-in with that email lands in the app with the role given.
  assert.equal((await api.user('Vice')).role, 'director');
});

test('invitations respect role levels', async () => {
  assert.equal((await api.post('/admin/users', boss, { email: 'd2@t.test', role: 'director' })).status, 403);
  assert.equal((await api.post('/admin/users', boss, { email: 'm2@t.test', role: 'manager' })).body.role, 'manager');
  // A Director invites anyone up to their own level, with or without a team for Managers and Directors.
  assert.equal((await api.post('/admin/users', chief, { email: 'd3@t.test', role: 'director' })).body.role, 'director');
  assert.equal((await api.post('/admin/users', chief, { email: 'l3@t.test', role: 'leader', team_id: content })).body.role, 'leader');
});

test('nobody changes a root account in the app, and root cannot be given', async () => {
  for (const as of [chief, boss, root]) {
    assert.equal((await api.patch(`/admin/users/${root.id}`, as, { status: 'disabled' })).status, 404);
  }
  assert.equal((await api.patch(`/admin/users/${mem.id}`, root, { role: 'root' })).status, 400);
  assert.equal((await api.patch(`/admin/users/${mem.id}`, chief, { role: 'root' })).status, 400);
});

test('an account taken out of ROOT_EMAILS loses its access at once', async () => {
  const ghost = await api.user('ghost');
  const db = new DatabaseSync(server.dbPath);
  db.prepare("UPDATE users SET role = 'root', status = 'active' WHERE id = ?").run(ghost.id);
  db.close();
  assert.equal((await api.get('/me', ghost)).status, 401);
  assert.equal((await api.signIn('ghost')).status, 403);
});

test('the v23 migration makes an existing account in ROOT_EMAILS root and takes it out of its teams', async () => {
  const old = await startServer({
    prepareDb(dbPath) {
      const db = new DatabaseSync(dbPath);
      db.exec(`
        CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')));
        CREATE TABLE users (
          id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, google_sub TEXT UNIQUE,
          role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('director', 'manager', 'leader', 'member')),
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'disabled')),
          team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
          invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          language TEXT NOT NULL DEFAULT 'vi' CHECK (language IN ('vi', 'en')),
          birthday TEXT, phone TEXT, job_title TEXT, bio TEXT,
          gender TEXT CHECK (gender IN ('male', 'female', 'other', 'undisclosed')),
          avatar TEXT
        );
        CREATE TABLE user_teams (user_id INTEGER NOT NULL, team_id INTEGER NOT NULL, PRIMARY KEY (user_id, team_id));
        INSERT INTO teams (id, name) VALUES (1, 'Content');
        INSERT INTO users (id, name, email, role, status) VALUES (3, 'Root', 'root@t.test', 'member', 'active');
        INSERT INTO user_teams VALUES (3, 1);
        PRAGMA user_version = 22;
      `);
      db.close();
    },
  });
  try {
    const db = new DatabaseSync(old.dbPath);
    const version = db.prepare('PRAGMA user_version').get().user_version;
    const role = db.prepare('SELECT role FROM users WHERE id = 3').get().role;
    const teams = db.prepare('SELECT COUNT(*) AS n FROM user_teams').get().n;
    db.close();
    assert.ok(version >= 23, `schema v${version}`);
    assert.equal(`${role}/${teams}`, 'root/0');
  } finally {
    await old.stop();
  }
});
