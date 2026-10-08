// Following a task (v38): the assignee, the creator and commenters follow it on their own, anyone who can see it
// follows or stops by hand, and followers hear of comments, due date, assignee and status changes.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './helpers.js';

let server, api;
let boss, lead, memA, memB, project, requirement, sections, task;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  const content = await api.team(boss, 'Content');
  lead = await api.approve(boss, 'lead', { role: 'leader', team: content });
  memA = await api.approve(boss, 'memA', { team: content });
  memB = await api.approve(boss, 'memB', { team: content });
  project = (await api.project(boss, { name: 'Tet', team_ids: [content] })).id;
  for (const email of ['lead@t.test', 'mema@t.test', 'memb@t.test']) await api.post(`/projects/${project}/members`, boss, { email });
  requirement = await api.requirement(boss, project, 'Landing');
  sections = (await api.get(`/projects/${project}`, boss)).body.sections;
  task = await api.task(lead, { section: sections[0].id, requirement, title: 'Banner' });
  await api.patch(`/tasks/${task}`, lead, { assignee_id: memA.id });
});
after(() => server.stop());

const items = async (user) => (await api.get('/notifications', user)).body.items;
const latest = async (user) => (await items(user))[0];
const followers = async (as = lead) => (await api.get(`/tasks/${task}`, as)).body.followers.map((u) => u.name).sort();
const statusOf = (kind) => sections.find((s) => s.kind === kind).id;

test('the creator and the assignee follow a task; the assignee is told once, by the assignment', async () => {
  assert.deepEqual(await followers(), ['lead', 'memA']);
  assert.equal((await api.get(`/tasks/${task}`, memA)).body.following, true);
  assert.deepEqual((await items(memA)).map((n) => n.type), ['assigned']);
});

test('a comment tells the followers but not its author, who now follows the task', async () => {
  await api.post(`/tasks/${task}/comments`, memB, { body: 'Mình gửi bản nháp nhé' });
  for (const user of [lead, memA]) {
    const n = await latest(user);
    assert.equal(`${n.type}|${n.actor_name}|${n.excerpt}|${n.task_title}`, 'comment|memB|Mình gửi bản nháp nhé|Banner');
  }
  assert.equal(await api.unread(memB), 0);
  assert.deepEqual(await followers(), ['lead', 'memA', 'memB']);
});

test('someone mentioned in a comment on a task they follow gets the mention only', async () => {
  const before = (await items(memA)).length;
  await api.post(`/tasks/${task}/comments`, lead, { body: `@[memA](${memA.id}) xem giúp` });
  const after = await items(memA);
  assert.equal(after.length, before + 1);
  assert.equal(after[0].type, 'mention');
});

test('followers hear of a new due date, not the person who changed it', async () => {
  await api.patch(`/tasks/${task}`, lead, { due_date: '2026-11-20' });
  for (const user of [memA, memB]) {
    const n = await latest(user);
    assert.equal(`${n.type}|${n.excerpt}`, 'task_due|2026-11-20');
  }
  assert.notEqual((await latest(lead)).type, 'task_due');
});

test('moving the task to another status tells the followers; reordering within one does not', async () => {
  await api.patch(`/tasks/${task}`, lead, { section_id: statusOf('doing') });
  const n = await latest(memB);
  assert.equal(`${n.type}|${n.excerpt}`, 'task_status|In-Progress');
  const count = (await items(memB)).length;
  await api.patch(`/tasks/${task}`, lead, { section_id: statusOf('doing'), position: 5 });
  await api.patch(`/tasks/${task}`, lead, { title: 'Banner Tết' });
  assert.equal((await items(memB)).length, count);
});

test('anyone who can see the task follows it by hand; stopping stays stopped, even after commenting', async () => {
  assert.equal((await api.post(`/tasks/${task}/follow`, boss, { following: true })).body.following, true);
  await api.post(`/tasks/${task}/comments`, memA, { body: 'Đã sửa màu' });
  assert.equal((await latest(boss)).type, 'comment');

  const res = await api.post(`/tasks/${task}/follow`, memB, { following: false });
  assert.equal(res.body.following, false);
  assert.ok(!res.body.followers.some((u) => u.id === memB.id));
  await api.post(`/tasks/${task}/comments`, memB, { body: 'Ok' });
  const count = (await items(memB)).length;
  await api.patch(`/tasks/${task}`, lead, { due_date: '2026-11-21' });
  assert.equal((await items(memB)).length, count);
  assert.equal((await api.get(`/tasks/${task}`, memB)).body.following, false);
});

test('nobody follows a task they cannot see', async () => {
  const outsider = await api.approve(boss, 'outsider');
  assert.equal((await api.post(`/tasks/${task}/follow`, outsider, { following: true })).status, 404);
});

test('a root account is never a follower, e.g. one that created tasks before it became root', async () => {
  const root = await api.root();
  const db = new DatabaseSync(server.dbPath);
  db.prepare('INSERT INTO task_followers (task_id, user_id) VALUES (?, ?)').run(task, root.id);
  db.close();
  assert.ok(!(await followers()).includes(root.name));
  await api.post(`/tasks/${task}/comments`, lead, { body: 'Root không nhận' });
  assert.equal((await api.get('/notifications', root)).body.items.length, 0);
});

test('someone who loses access to the project is no longer told', async () => {
  await api.post(`/tasks/${task}/follow`, memB, { following: true });
  await api.delete(`/projects/${project}/members/${memB.id}`, boss);
  const count = (await items(memB)).length;
  await api.post(`/tasks/${task}/comments`, lead, { body: 'Chốt' });
  assert.equal((await items(memB)).length, count);
  assert.ok(!(await followers()).includes('memB'));
});

test('completing the task: followers told it was completed (Leader, Manager) are not told its new status too', async () => {
  const before = [(await items(lead)).length, (await items(boss)).length];
  await api.patch(`/tasks/${task}`, memA, { completed: true });
  for (const [i, user] of [lead, boss].entries()) {
    const after = await items(user);
    assert.equal(after.length, before[i] + 1);
    assert.equal(after[0].type, 'task_completed');
  }
});

test('a reassignment tells the former assignee; the new one gets the assignment only', async () => {
  await api.patch(`/tasks/${task}`, lead, { assignee_id: lead.id });
  const n = await latest(memA);
  assert.equal(`${n.type}|${n.excerpt}`, 'task_assignee|lead');
  await api.patch(`/tasks/${task}`, lead, { assignee_id: memA.id });
  assert.equal((await latest(memA)).type, 'assigned');
  assert.equal((await latest(boss)).excerpt, 'memA');
});

test('ticking a subtask tells its followers', async () => {
  const subtask = (await api.post('/tasks', memA, { parent_id: task, title: 'Ảnh' })).body.id;
  await api.patch(`/tasks/${subtask}`, lead, { completed: true });
  const n = await latest(memA);
  assert.equal(`${n.type}|${n.task_title}`, 'task_done|Ảnh');
  await api.patch(`/tasks/${subtask}`, lead, { completed: false });
  assert.equal((await latest(memA)).type, 'task_reopened');
});

test('the next occurrence of a recurring task keeps the followers', async () => {
  const daily = await api.task(lead, { section: statusOf('todo'), requirement, title: 'Đăng bài' });
  await api.patch(`/tasks/${daily}`, lead, { assignee_id: memA.id, recurrence: { freq: 'daily' } });
  await api.post(`/tasks/${daily}/follow`, boss, { following: true });
  await api.patch(`/tasks/${daily}`, memA, { completed: true });
  const next = (await api.get(`/tasks/${daily}`, lead)).body.next_task.id;
  const names = (await api.get(`/tasks/${next}`, lead)).body.followers.map((u) => u.name).sort();
  assert.deepEqual(names, ['boss', 'lead', 'memA']);
});

test('the v38 migration lets the people a task already has follow it and keeps the notifications', async () => {
  const old = await startServer({
    prepareDb(path) {
      const from = new DatabaseSync(server.dbPath);
      from.exec(`VACUUM INTO '${path}'`);
      from.close();
      const db = new DatabaseSync(path);
      // The tables as v37 left them: no followers, the narrower CHECK on notifications.
      db.exec(`
        DROP TABLE task_followers;
        CREATE TABLE notifications_v37 (
          id INTEGER PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
          requirement_id INTEGER REFERENCES requirements(id) ON DELETE CASCADE,
          feedback_id INTEGER REFERENCES feedback(id) ON DELETE CASCADE,
          type TEXT NOT NULL, excerpt TEXT, read_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          CHECK (task_id IS NOT NULL OR requirement_id IS NOT NULL OR feedback_id IS NOT NULL)
        );
        INSERT INTO notifications_v37 SELECT * FROM notifications;
        DROP TABLE notifications;
        ALTER TABLE notifications_v37 RENAME TO notifications;
        PRAGMA user_version = 37;
      `);
      db.close();
    },
  });
  try {
    const db = new DatabaseSync(server.dbPath);
    const notifications = db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n;
    db.close();
    const migrated = new DatabaseSync(old.dbPath);
    assert.equal(migrated.prepare('PRAGMA user_version').get().user_version, 39);
    assert.equal(migrated.prepare('SELECT COUNT(*) AS n FROM notifications').get().n, notifications);
    const followerNames = migrated
      .prepare('SELECT u.name FROM task_followers f JOIN users u ON u.id = f.user_id WHERE f.task_id = ? ORDER BY u.name')
      .all(task)
      .map((r) => r.name);
    // Its creator, its assignee and everyone who commented (boss followed by hand, which no migration can know).
    assert.deepEqual(followerNames, ['lead', 'memA', 'memB']);
    assert.ok(migrated.prepare("SELECT sql FROM sqlite_master WHERE name = 'notifications'").get().sql.includes('due_digest'));
    migrated.close();
  } finally {
    await old.stop();
  }
});
