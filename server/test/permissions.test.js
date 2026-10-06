// Roles and permissions (v24): root sets the scope ('none' / 'team' / 'all') each role holds every permission with;
// the defaults are the rules from before, and changes take effect on the next request.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api;
let root, chief, boss, lead, mem, memD, content, design, designProject;

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
  memD = await api.approve(boss, 'memD', { team: design });
  designProject = await api.project(chief, { name: 'Design only', team_ids: [design] });
});
after(() => server.stop());

const set = (role, permission, scope) => api.patch('/admin/permissions', root, { role, permission, scope });

test('the signed-in user gets the permissions of their role', async () => {
  const me = (await api.get('/me', mem)).body.permissions;
  assert.equal(`${me['projects.create']}/${me['people.watch']}`, 'none/none');
  const lm = (await api.get('/me', lead)).body.permissions;
  assert.equal(`${lm['tasks.admin']}/${lm['people.watch']}/${lm['users.manage']}`, 'team/team/none');
  assert.equal((await api.get('/me', boss)).body.permissions['notify.task_completed'], 'all');
});

test('everyone reads the roles with their levels; only root reads the permissions', async () => {
  const roles = (await api.get('/roles', mem)).body.map((r) => `${r.key}:${r.level}`);
  assert.deepEqual(roles, ['director:4', 'manager:3', 'leader:2', 'member:1']);
  for (const as of [chief, boss, mem]) assert.equal((await api.get('/admin/permissions', as)).status, 403);
  const { body } = await api.get('/admin/permissions', root);
  assert.equal(body.grants.leader['projects.manage'], 'team');
  assert.deepEqual(body.permissions.find((p) => p.key === 'projects.create').scopes, ['none', 'all']);
  assert.equal((await api.patch('/admin/permissions', chief, { role: 'member', permission: 'projects.create', scope: 'all' })).status, 403);
});

test('scopes are checked against the permission', async () => {
  assert.equal((await set('member', 'projects.create', 'team')).status, 400);
  assert.equal((await set('member', 'nope', 'all')).status, 400);
  assert.equal((await set('ghost', 'projects.create', 'all')).status, 400);
  assert.equal((await set('root', 'projects.create', 'all')).status, 400);
});

test('giving a permission takes effect at once, and reset brings the defaults back', async () => {
  assert.equal((await api.post('/projects', mem, { name: 'Mine' })).status, 403);
  assert.equal((await set('member', 'projects.create', 'all')).body.grants.member['projects.create'], 'all');
  assert.equal((await api.post('/projects', mem, { name: 'Mine' })).status, 201);

  assert.equal((await set('manager', 'channels.manage', 'none')).status, 200);
  assert.equal((await api.post('/channels', boss, { name: 'Zalo' })).status, 403);

  await api.post('/admin/permissions/reset', root, { role: 'member' });
  await api.post('/admin/permissions/reset', root, { role: 'manager' });
  assert.equal((await api.post('/projects', mem, { name: 'Again' })).status, 403);
  assert.equal((await api.post('/channels', boss, { name: 'Zalo' })).status, 201);
});

test('scoped permissions follow the teams: tasks.admin and projects.view', async () => {
  // The Content Leader cannot open a Design project until tasks.admin / projects.view reach 'all'.
  assert.equal((await api.get(`/projects/${designProject.id}`, lead)).status, 404);
  await set('leader', 'projects.view', 'all');
  const viewed = (await api.get(`/projects/${designProject.id}`, lead)).body.project;
  assert.equal(`${viewed.access}/${viewed.task_admin}`, 'view/false');
  await set('leader', 'tasks.admin', 'all');
  assert.equal((await api.get(`/projects/${designProject.id}`, lead)).body.project.task_admin, true);
  await api.post('/admin/permissions/reset', root, { role: 'leader' });
  assert.equal((await api.get(`/projects/${designProject.id}`, lead)).status, 404);
});

test('people.watch decides work tracking and the overview dashboard', async () => {
  assert.equal((await api.get(`/tasks?assignee=${mem.id}`, lead)).status, 200);
  assert.equal((await api.get(`/tasks?assignee=${memD.id}`, lead)).status, 403);
  await set('leader', 'people.watch', 'none');
  assert.equal((await api.get('/dashboard?mine=1', lead)).status, 403);
  assert.equal((await api.get(`/tasks?assignee=${mem.id}`, lead)).status, 403);
  await set('leader', 'people.watch', 'team');
  assert.equal((await api.get('/dashboard?mine=1', lead)).status, 200);
});

test('notify.task_completed decides who is told', async () => {
  const section = await api.firstSection(chief, designProject.id);
  const requirement = await api.requirement(chief, designProject.id);
  const task = await api.task(chief, { section, requirement, title: 'Logo' });
  await api.patch(`/tasks/${task}`, chief, { assignee_id: memD.id });

  await set('director', 'notify.task_completed', 'all');
  await set('manager', 'notify.task_completed', 'none');
  const [chiefBefore, bossBefore] = [await api.unread(chief), await api.unread(boss)];
  await api.patch(`/tasks/${task}`, memD, { completed: true });
  assert.equal(await api.unread(chief), chiefBefore + 1);
  assert.equal(await api.unread(boss), bossBefore);
  await api.post('/admin/permissions/reset', root, { role: 'director' });
  await api.post('/admin/permissions/reset', root, { role: 'manager' });
});

test('role levels: nobody changes or gives a role above their own', async () => {
  assert.equal((await api.patch(`/admin/users/${mem.id}`, boss, { role: 'director' })).status, 403);
  assert.equal((await api.patch(`/admin/users/${chief.id}`, boss, { status: 'disabled' })).status, 403);
  // A Leader given users.manage still cannot touch a Manager, nor make anyone a Manager.
  await set('leader', 'users.manage', 'all');
  assert.equal((await api.patch(`/admin/users/${boss.id}`, lead, { status: 'disabled' })).status, 403);
  assert.equal((await api.patch(`/admin/users/${mem.id}`, lead, { role: 'manager' })).status, 403);
  assert.equal((await api.patch(`/admin/users/${memD.id}`, lead, { status: 'disabled' })).body.status, 'disabled');
  await api.patch(`/admin/users/${memD.id}`, lead, { status: 'active' });
  await api.post('/admin/permissions/reset', root, { role: 'leader' });
  assert.equal((await api.patch(`/admin/users/${memD.id}`, lead, { status: 'disabled' })).status, 403);
});
