// The Director role (v22): full rights on every project and task, every Manager right, and the only role that gives
// the Director role or changes a Director's account. Directors are not told when tasks are completed.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './helpers.js';

let server, api;
let chief, boss, leadC, memC, memD, content, design, project, task;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  chief = await api.director();
  content = await api.team(boss, 'Content');
  design = await api.team(boss, 'Design');
  leadC = await api.approve(boss, 'leadC', { role: 'leader', team: content });
  memC = await api.approve(boss, 'memC', { team: content });
  memD = await api.approve(boss, 'memD', { team: design });

  // A Content project the Director neither owns, joins nor shares a team with.
  project = await api.project(boss, { name: 'Tet', team_ids: [content] });
  const section = await api.firstSection(boss, project.id);
  const requirement = await api.requirement(boss, project.id);
  task = await api.task(chief, { section, requirement, title: 'post' }); // boss is not in Content: only the Director may
});
after(() => server.stop());

test('DIRECTOR_EMAILS sign in as an active Director', () => {
  assert.equal(`${chief.role}/${chief.status}`, 'director/active');
});

test('a Director manages every project and is task admin on it', async () => {
  const listed = (await api.get('/projects', chief)).body.find((p) => p.id === project.id);
  assert.equal(listed?.access, 'manage');
  const { body } = await api.get(`/projects/${project.id}`, chief);
  assert.equal(`${body.project.access}/${body.project.task_admin}`, 'manage/true');
  assert.equal((await api.patch(`/projects/${project.id}`, chief, { name: 'Tet 2027', team_ids: [content, design] })).status, 200);
  assert.equal((await api.patch(`/projects/${project.id}`, chief, { team_ids: [content] })).status, 200);

  // Assigns anyone of the project's teams, and not people of other teams.
  const assignees = (await api.get(`/tasks/${task}`, chief)).body.assignees.map((u) => u.name);
  assert.deepEqual(assignees.sort(), ['leadC', 'memC']);
  assert.equal((await api.patch(`/tasks/${task}`, chief, { assignee_id: memC.id })).status, 200);
  assert.equal((await api.patch(`/tasks/${task}`, chief, { assignee_id: memD.id })).status, 400);
});

test('a Director has the Manager rights: user administration, channels, watching everyone', async () => {
  assert.equal((await api.get('/admin/users', chief)).status, 200);
  assert.equal((await api.post('/channels', chief, { name: 'Zalo' })).status, 201);
  assert.equal((await api.get('/tasks?all=1', chief)).status, 200);
  assert.equal((await api.post('/projects', chief, { name: 'Brand book', team_ids: [] })).status, 201);
});

test('only a Director gives the Director role or changes a Director', async () => {
  assert.equal((await api.patch(`/admin/users/${memD.id}`, boss, { role: 'director' })).status, 403);
  assert.equal((await api.patch(`/admin/users/${chief.id}`, boss, { status: 'disabled' })).status, 403);
  assert.equal((await api.patch(`/admin/users/${chief.id}`, boss, { team_ids: [content] })).status, 403);

  const vice = await api.approve(boss, 'vice', { role: 'manager' });
  assert.equal((await api.patch(`/admin/users/${vice.id}`, chief, { role: 'director' })).body.role, 'director');
  assert.equal((await api.patch(`/admin/users/${vice.id}`, chief, { role: 'manager' })).body.role, 'manager');
  // Directors manage the Managers.
  assert.equal((await api.patch(`/admin/users/${boss.id}`, chief, { team_ids: [content, design] })).status, 200);
});

test('a Director cannot step down or lock themselves', async () => {
  assert.equal((await api.patch(`/admin/users/${chief.id}`, chief, { role: 'manager' })).status, 400);
  assert.equal((await api.patch(`/admin/users/${chief.id}`, chief, { status: 'disabled' })).status, 400);
  assert.equal((await api.patch(`/admin/users/${chief.id}`, chief, { team_ids: [design] })).status, 200);
});

test("a Director's teams are changed by Directors only", async () => {
  const { body } = await api.get(`/teams/${content}/members`, boss);
  assert.ok(!body.candidates.some((u) => u.id === chief.id), 'Managers are not offered the Director');
  assert.equal((await api.delete(`/teams/${design}/members/${chief.id}`, boss)).status, 403);
  assert.ok((await api.get(`/teams/${content}/members`, chief)).body.candidates.some((u) => u.id === chief.id));
});

test("a Director's profile is for Directors; a Director reads everyone's", async () => {
  await api.patch('/me', chief, { phone: '0912345678' });
  await api.patch('/me', boss, { phone: '0987654321' });
  assert.equal((await api.get(`/users/${chief.id}/profile`, boss)).status, 404);
  assert.equal((await api.get(`/users/${boss.id}/profile`, chief)).body.phone, '0987654321');
  assert.equal((await api.get(`/users/${chief.id}/profile`, leadC)).status, 404);

  const asManager = (await api.get('/admin/users', boss)).body.find((u) => u.id === chief.id);
  assert.equal(asManager.phone, undefined, 'the user list hides a Director’s details from Managers');
  const asDirector = (await api.get('/admin/users', chief)).body.find((u) => u.id === boss.id);
  assert.equal(asDirector.phone, '0987654321');
});

test('Directors are not told when tasks are completed', async () => {
  const before = await api.unread(chief);
  await api.patch(`/tasks/${task}`, memC, { completed: true });
  assert.equal(await api.unread(chief), before);
  assert.ok((await api.get('/notifications', boss)).body.items.some((n) => n.type === 'task_completed'));
});

test('signing in through MANAGER_EMAILS never demotes a Director', async () => {
  await api.patch(`/admin/users/${boss.id}`, chief, { role: 'director' });
  assert.equal((await api.manager()).role, 'director');
  await api.patch(`/admin/users/${boss.id}`, chief, { role: 'manager' });
});

test('the v22 migration keeps every user and makes DIRECTOR_EMAILS Directors', async () => {
  const old = await startServer({
    prepareDb(dbPath) {
      const db = new DatabaseSync(dbPath);
      db.exec(`
        CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')));
        CREATE TABLE users (
          id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, google_sub TEXT UNIQUE,
          role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('manager', 'leader', 'member')),
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'disabled')),
          team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
          invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          language TEXT NOT NULL DEFAULT 'vi' CHECK (language IN ('vi', 'en')),
          birthday TEXT, phone TEXT, job_title TEXT, bio TEXT,
          gender TEXT CHECK (gender IN ('male', 'female', 'other', 'undisclosed')),
          avatar TEXT
        );
        INSERT INTO users (id, name, email, role, status, language, phone) VALUES
          (7, 'Chief', 'chief@t.test', 'manager', 'active', 'en', '0911'),
          (9, 'Mem', 'mem@t.test', 'member', 'active', 'vi', NULL);
        PRAGMA user_version = 21;
      `);
      db.close();
    },
  });
  try {
    const chiefOld = await old.api.director();
    assert.equal(`${chiefOld.id}/${chiefOld.role}/${chiefOld.language}/${chiefOld.phone}`, '7/director/en/0911');
    const users = (await old.api.get('/admin/users', chiefOld)).body.map((u) => `${u.id}:${u.role}`);
    assert.deepEqual(users.sort(), ['7:director', '9:member']);
    const db = new DatabaseSync(old.dbPath);
    const [version, broken] = [db.prepare('PRAGMA user_version').get().user_version, db.prepare('PRAGMA foreign_key_check').all()];
    db.close();
    assert.ok(version >= 22, `schema v${version}`);
    assert.deepEqual(broken, []);
  } finally {
    await old.stop();
  }
});
