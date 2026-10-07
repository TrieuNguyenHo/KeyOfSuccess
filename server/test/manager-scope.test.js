// Managers run their own teams only (v26 defaults, decided 2026-10-06): user management, teams, project teams, work
// tracking, profiles and completion notifications are all team-scoped; the Director alone sees the whole department.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
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

// Release v1.0 was deployed from a line where v26 meant the fixed statuses; it never ran the Manager scope. Such a
// database (version 26, sections already allowing 'pending') gets it while moving on to v27 and v28.
test('a database deployed from v1.0 (v26 = fixed statuses) gets the Manager scope on its way to v28', async () => {
  const old = await startServer({
    managerScope: 'team',
    prepareDb(dbPath) {
      const db = new DatabaseSync(dbPath);
      db.exec(`
        CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')));
        CREATE TABLE users (
          id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, google_sub TEXT UNIQUE,
          role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('root', 'director', 'manager', 'leader', 'member')),
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'disabled')),
          team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
          invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          language TEXT NOT NULL DEFAULT 'vi' CHECK (language IN ('vi', 'en')),
          birthday TEXT, phone TEXT, job_title TEXT, bio TEXT,
          gender TEXT CHECK (gender IN ('male', 'female', 'other', 'undisclosed')),
          avatar TEXT, joined_at TEXT
        );
        CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#4573d2',
          owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL, team_id INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now')));
        CREATE TABLE sections (id INTEGER PRIMARY KEY,
          project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL, position REAL NOT NULL,
          kind TEXT CHECK (kind IN ('todo', 'doing', 'done', 'pending')));
        CREATE TABLE roles (key TEXT PRIMARY KEY, name TEXT NOT NULL, level INTEGER NOT NULL);
        CREATE TABLE role_permissions (role TEXT NOT NULL REFERENCES roles(key) ON DELETE CASCADE, permission TEXT NOT NULL,
          scope TEXT NOT NULL CHECK (scope IN ('none', 'team', 'all')), PRIMARY KEY (role, permission));
        INSERT INTO roles VALUES ('member', 'Member', 1), ('leader', 'Leader', 2), ('manager', 'Manager', 3), ('director', 'Director', 4);
        INSERT INTO role_permissions VALUES ('manager', 'users.manage', 'all'), ('manager', 'projects.view', 'all'),
          ('manager', 'channels.manage', 'all');
        INSERT INTO users (id, name, email, role, status, joined_at) VALUES (5, 'Hue', 'hue@t.test', 'manager', 'active', datetime('now'));
        INSERT INTO projects (id, name) VALUES (1, 'Tet');
        INSERT INTO sections (project_id, name, position, kind) VALUES (1, 'Planned', 1, 'todo'), (1, 'In-Progress', 2, 'doing'),
          (1, 'Completed', 3, 'done'), (1, 'Pending', 4, 'pending');
        PRAGMA user_version = 26;
      `);
      db.close();
    },
  });
  try {
    const db = new DatabaseSync(old.dbPath);
    const version = db.prepare('PRAGMA user_version').get().user_version;
    const scopes = db.prepare("SELECT permission || '=' || scope AS s FROM role_permissions WHERE role = 'manager' ORDER BY permission").all();
    const sections = db.prepare('SELECT COUNT(*) AS n FROM sections WHERE project_id = 1').get().n;
    const builtin = db.prepare('SELECT COUNT(*) AS n FROM roles WHERE builtin = 1').get().n;
    db.close();
    assert.ok(version >= 28, `schema v${version}`); // later migrations run on top
    const manager = Object.fromEntries(scopes.map((r) => r.s.split('=')));
    assert.deepEqual([manager['users.manage'], manager['projects.view'], manager['channels.manage']], ['team', 'team', 'all']);
    assert.equal(sections, 4, 'the fixed statuses are not added twice');
    assert.equal(builtin, 4);
    assert.equal((await old.api.user('hue')).role, 'manager');
  } finally {
    await old.stop();
  }
});
