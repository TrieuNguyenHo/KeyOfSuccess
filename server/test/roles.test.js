// Roles, teams, approval, who watches whose tasks, and completion notifications.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api;
let boss, leadA, leadB, memA, memB, stranger, content, design, project, task, subtask;

before(async () => {
  server = await startServer();
  api = server.api;
});
after(() => server.stop());

test('the MANAGER_EMAILS account signs in as an active Manager', async () => {
  const { body } = await api.signIn('boss');
  assert.equal(`${body.user.role}/${body.user.status}`, 'manager/active');
});

test('a new account starts as a pending Member', async () => {
  const { body } = await api.signIn('leadA');
  assert.equal(`${body.user.role}/${body.user.status}`, 'member/pending');
  [boss, leadA, leadB, memA, memB, stranger] = await Promise.all(
    ['boss', 'leadA', 'leadB', 'memA', 'memB', 'stranger'].map((n) => api.user(n))
  );
});

test('a pending account may read /me only', async () => {
  assert.equal((await api.get('/me', leadA)).status, 200);
  assert.equal((await api.get('/projects', leadA)).status, 403);
});

test('a Member cannot use the admin API', async () => {
  assert.equal((await api.get('/admin/users', stranger)).status, 403);
});

test('team names are unique', async () => {
  content = await api.team(boss, 'Content');
  design = await api.team(boss, 'Design');
  assert.equal((await api.post('/teams', boss, { name: 'Content' })).status, 409);
});

test('a Leader must belong to a team', async () => {
  const res = await api.patch(`/admin/users/${leadA.id}`, boss, { role: 'leader', status: 'active' });
  assert.equal(res.status, 400);
});

test('the Manager approves a Leader with a team', async () => {
  const res = await api.patch(`/admin/users/${leadA.id}`, boss, { role: 'leader', status: 'active', team_id: content });
  assert.equal(res.status, 200);
  await api.approve(boss, 'leadB', { role: 'leader', team: design });
  await api.approve(boss, 'memA'); // no team yet, so the project below is department-wide
  await api.approve(boss, 'memB', { team: design });
});

test('a Manager cannot demote themselves', async () => {
  assert.equal((await api.patch(`/admin/users/${boss.id}`, boss, { role: 'member' })).status, 400);
});

test('a team that still has people cannot be deleted', async () => {
  assert.equal((await api.delete(`/teams/${content}`, boss)).status, 400);
});

test('the Manager sees how many accounts wait for approval', async () => {
  assert.equal((await api.get('/notifications', boss)).body.pendingUsers, 1);
});

test('a Leader may watch their own team only', async () => {
  const { body } = await api.get('/people', leadA);
  assert.equal(body.map((p) => p.name).join(), 'leadA');
});

test('a Member may watch nobody', async () => {
  assert.deepEqual((await api.get('/people', memA)).body, []);
});

test('pending accounts cannot be invited to a project', async () => {
  // In the end a project of a team no Leader here leads, so leadA only watches memA's task and boss (in no team)
  // only views. memA's task comes from when Content still took part (only people of the project's teams get
  // tasks); it keeps its assignee after Content leaves.
  const ads = await api.team(boss, 'Ads');
  project = await api.project(boss, { name: 'Campaign', team_ids: [ads, content] });
  await api.patch(`/admin/users/${memA.id}`, boss, { team_id: content });
  await api.post(`/projects/${project.id}/members`, boss, { email: 'mema@t.test' });
  const requirement = await api.requirement(boss, project.id);
  const section = await api.firstSection(memA, project.id);
  task = await api.task(memA, { section, requirement, title: 'Viet bai' }); // assigned to memA, who created it
  subtask = (await api.post('/tasks', memA, { parent_id: task, title: 'sub' })).body.id;
  await api.patch(`/projects/${project.id}`, boss, { team_ids: [ads] });
  const res = await api.post(`/projects/${project.id}/members`, boss, { email: 'stranger@t.test' });
  assert.equal(res.status, 404);
});

test('My Tasks lists the user own tasks as editable', async () => {
  const { body } = await api.get('/tasks?assignee=me', memA);
  assert.equal(body.map((t) => `${t.title}:${t.can_edit}`).join(), 'Viet bai:true');
});

test('a Member of another team cannot open the task', async () => {
  assert.equal((await api.get(`/tasks/${task}`, memB)).status, 404);
});

test('a Member cannot watch a colleague', async () => {
  assert.equal((await api.get(`/tasks?assignee=${memA.id}`, memB)).status, 403);
});

test("a Leader sees their member's task read-only", async () => {
  const { body } = await api.get(`/tasks?assignee=${memA.id}`, leadA);
  assert.equal(body.map((t) => `${t.title}:${t.can_edit}`).join(), 'Viet bai:false');
});

test('a Leader sees the whole team', async () => {
  assert.equal((await api.get(`/tasks?team=${content}`, leadA)).body.length, 1);
});

test('a Leader cannot watch another team', async () => {
  assert.equal((await api.get(`/tasks?team=${design}`, leadA)).status, 403);
});

test("a Leader cannot watch another team's member", async () => {
  assert.equal((await api.get(`/tasks?assignee=${memB.id}`, leadA)).status, 403);
});

test("another team's Leader cannot open the task", async () => {
  assert.equal((await api.get(`/tasks/${task}`, leadB)).status, 404);
});

test('only Managers may list every task', async () => {
  assert.equal((await api.get('/tasks?all=1', leadA)).status, 403);
});

test('a watching Leader opens the task as view, without assignee choices', async () => {
  const { body } = await api.get(`/tasks/${task}`, leadA);
  assert.equal(`${body.task.access}/${body.assignees.length}`, 'view/0');
});

test('a watching Leader can open its subtask too', async () => {
  assert.equal((await api.get(`/tasks/${subtask}`, leadA)).status, 200);
});

test('a watching Leader cannot edit, delete or add subtasks', async () => {
  assert.equal((await api.patch(`/tasks/${task}`, leadA, { title: 'x' })).status, 403);
  assert.equal((await api.delete(`/tasks/${task}`, leadA)).status, 403);
  assert.equal((await api.post('/tasks', leadA, { parent_id: task, title: 'x' })).status, 400);
});

test('a watching Leader can comment', async () => {
  assert.equal((await api.post(`/tasks/${task}/comments`, leadA, { body: 'nhanh nhe' })).status, 201);
});

test('a Manager lists every task', async () => {
  assert.equal((await api.get('/tasks?all=1', boss)).body.length, 1);
});

test("a Manager outside the project's teams opens its tasks as view and cannot edit", async () => {
  assert.equal((await api.get(`/tasks/${task}`, boss)).body.task.access, 'view');
  assert.equal((await api.patch(`/tasks/${task}`, boss, { title: 'x' })).status, 403);
});

test('completing a subtask notifies nobody', async () => {
  await api.patch(`/tasks/${subtask}`, memA, { completed: true });
  assert.equal(await api.unread(leadA), 0);
});

test("completing a task notifies the assignee's Leader and the Managers", async () => {
  await api.patch(`/tasks/${task}`, memA, { completed: true });
  const { body } = await api.get('/notifications', leadA);
  assert.equal(`${body.unread}:${body.items[0].actor_name}:${body.items[0].task_title}`, '1:memA:Viet bai');
  assert.equal(await api.unread(boss), 1);
});

test('nobody else is notified, including the person who completed it', async () => {
  assert.equal(await api.unread(leadB), 0);
  assert.equal(await api.unread(memA), 0);
});

test('editing a finished task does not notify again', async () => {
  await api.patch(`/tasks/${task}`, memA, { title: 'Viet bai 2' });
  assert.equal(await api.unread(boss), 1);
});

test("nobody can mark someone else's notification read", async () => {
  const id = (await api.get('/notifications', leadA)).body.items[0].id;
  await api.post('/notifications/read', boss, { id });
  assert.equal(await api.unread(leadA), 1);
});

test('marking all read clears the count', async () => {
  await api.post('/notifications/read', leadA, {});
  assert.equal(await api.unread(leadA), 0);
});

test('a disabled account loses its session and cannot sign in', async () => {
  await api.patch(`/admin/users/${memB.id}`, boss, { status: 'disabled' });
  assert.equal((await api.get('/me', memB)).status, 401);
  assert.equal((await api.signIn('memB')).status, 403);
});

test('Google sign-in is refused without a client id', async () => {
  assert.equal((await api.post('/auth/google', null, { credential: 'x' })).status, 400);
});

test('a Manager invites a new person straight into a team', async () => {
  const invited = await api.post('/admin/users', boss, { email: ' Newbie@T.test ', name: 'Newbie', team_id: design });
  assert.equal(invited.status, 201, JSON.stringify(invited.body));
  const u = invited.body;
  assert.equal(`${u.email}/${u.name}/${u.role}/${u.status}/${u.team_name}`, 'newbie@t.test/Newbie/member/active/Design');

  // The first sign-in with that email opens the same, already active account.
  const { body } = await api.signIn('newbie');
  assert.equal(`${body.user.id}/${body.user.status}/${body.user.team_ids}`, `${u.id}/active/${design}`);
  assert.equal((await api.get('/projects', { token: body.token })).status, 200);

  // Without a name, the part before @ is used.
  assert.equal((await api.post('/admin/users', boss, { email: 'anon@t.test', team_id: design })).body.name, 'anon');
});

test('the first sign-in replaces a placeholder name with the real one, and only a placeholder', async () => {
  // anon was invited without a name above; newbie was invited as "Newbie".
  const signIn = async (email, name) => (await api.post('/auth/dev', null, { email, name })).body.user.name;
  assert.equal(await signIn('anon@t.test', 'Anh Nguyễn'), 'Anh Nguyễn');
  assert.equal(await signIn('anon@t.test', 'Someone Else'), 'Anh Nguyễn');
  assert.equal(await signIn('newbie@t.test', 'Google Name'), 'Newbie');
  assert.equal(await signIn('anon@t.test', ''), 'Anh Nguyễn');
});

test('invitations are checked', async () => {
  assert.equal((await api.post('/admin/users', leadA, { email: 'x@t.test', team_id: content })).status, 403);
  assert.equal((await api.post('/admin/users', boss, { email: 'not-an-email', team_id: content })).status, 400);
  assert.equal((await api.post('/admin/users', boss, { email: 'x@t.test', team_id: 999 })).status, 400);
  assert.equal((await api.post('/admin/users', boss, { email: 'x@t.test' })).status, 400);
  // An existing account is added from the list instead.
  assert.equal((await api.post('/admin/users', boss, { email: 'MEMA@t.test', team_id: content })).status, 409);
});
