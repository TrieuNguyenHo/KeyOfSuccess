// Users in several teams (v9): Leaders lead every team they belong to, Managers may join any number,
// Members stay in exactly one.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api;
let boss, lead, memA, memB, memC, content, design, social;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  [content, design, social] = await Promise.all(['Content', 'Design', 'Social'].map((n) => api.team(boss, n)));
  lead = await api.approve(boss, 'lead', { role: 'leader', team: content });
  memA = await api.approve(boss, 'memA', { team: content });
  memB = await api.approve(boss, 'memB', { team: design });
  memC = await api.approve(boss, 'memC', { team: social });
});
after(() => server.stop());

const setTeams = (user, body) => api.patch(`/admin/users/${user.id}`, boss, body);

test('Leaders and Managers take several teams; Members only one', async () => {
  const res = await setTeams(lead, { team_ids: [design, content] });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.team_ids, [content, design]);
  assert.equal(res.body.team_name, 'Content, Design');
  assert.deepEqual(res.body.teams.map((t) => t.name), ['Content', 'Design']);

  assert.equal((await setTeams(boss, { team_ids: [content, design, social] })).status, 200);
  assert.equal((await setTeams(boss, { team_ids: [] })).status, 200, 'a Manager may have no team');

  assert.equal((await setTeams(memA, { team_ids: [content, design] })).status, 400);
  assert.equal((await setTeams(lead, { team_ids: [] })).status, 400, 'a Leader needs a team');
  assert.equal((await setTeams(lead, { role: 'member' })).status, 400, 'demoting keeps two teams');
  assert.equal((await setTeams(lead, { team_ids: [content, 999] })).status, 400);
});

test('team member counts include multi-team people', async () => {
  const teams = (await api.get('/teams', boss)).body;
  const count = (id) => teams.find((t) => t.id === id).member_count;
  assert.equal(`${count(content)}/${count(design)}/${count(social)}`, '2/2/1');
  assert.equal((await api.delete(`/teams/${design}`, boss)).status, 400, 'a team with people stays');
});

test('a multi-team Leader watches the people of every own team', async () => {
  const people = (await api.get('/people', lead)).body.map((p) => p.name).sort();
  assert.deepEqual(people, ['lead', 'memA', 'memB']);
  assert.equal((await api.get(`/tasks?assignee=${memB.id}`, lead)).status, 200);
  assert.equal((await api.get(`/tasks?assignee=${memC.id}`, lead)).status, 403);
  assert.equal((await api.get(`/tasks?team=${design}`, lead)).status, 200);
  assert.equal((await api.get(`/tasks?team=${social}`, lead)).status, 403);
  assert.equal((await api.get(`/dashboard?team=${design}`, lead)).status, 200);
  assert.equal((await api.get('/dashboard?all=1', lead)).status, 403);
});

test('?mine=1 covers all of a Leader’s teams together', async () => {
  const project = await api.project(boss, { name: 'Mixed', team_ids: [content, design, social] });
  const requirement = await api.requirement(boss, project.id);
  const section = await api.firstSection(boss, project.id);
  // Each Member creates their own task, which is assigned to them.
  for (const [title, who] of [['a', memA], ['b', memB], ['c', memC]]) {
    await api.post(`/projects/${project.id}/members`, boss, { email: `${who.name.toLowerCase()}@t.test` });
    await api.task(who, { section, requirement, title });
  }
  const mine = (await api.get('/tasks?mine=1', lead)).body.map((t) => t.title).sort();
  assert.deepEqual(mine, ['a', 'b']);
  const dash = (await api.get('/dashboard?mine=1', lead)).body;
  assert.equal(dash.summary.open, 2);
  assert.deepEqual(dash.people.map((p) => p.name).sort(), ['lead', 'memA', 'memB']);
  assert.equal(dash.people.find((p) => p.name === 'lead').team_name, 'Content, Design');
  assert.equal((await api.get('/tasks?mine=1', memA)).status, 403);
});

test('a multi-team Leader manages projects of any own team and gets their completions', async () => {
  const project = await api.project(boss, { name: 'Design only', team_ids: [design] });
  await api.post(`/projects/${project.id}/members`, boss, { email: 'memb@t.test' });
  const mine = (await api.get('/projects', lead)).body.find((p) => p.id === project.id);
  assert.equal(mine.access, 'manage');

  const requirement = await api.requirement(lead, project.id);
  const section = await api.firstSection(memB, project.id);
  const task = await api.task(memB, { section, requirement, title: 'banner' });
  assert.equal((await api.get(`/tasks/${task}`, lead)).body.task.access, 'admin');
  const before = await api.unread(lead);
  await api.patch(`/tasks/${task}`, memB, { completed: true });
  assert.equal(await api.unread(lead), before + 1);
});

test('a multi-team Leader assigns people of any own team in the project, not of other teams', async () => {
  const project = (await api.get('/projects', boss)).body.find((p) => p.name === 'Mixed');
  const { body } = await api.get(`/projects/${project.id}`, lead);
  const task = body.tasks.find((t) => t.title === 'a').id;
  assert.equal((await api.patch(`/tasks/${task}`, lead, { assignee_id: memB.id })).status, 200);
  assert.equal((await api.patch(`/tasks/${task}`, lead, { assignee_id: memC.id })).status, 400);
  assert.equal((await api.patch(`/tasks/${task}`, lead, { assignee_id: memA.id })).status, 200);
});

test('a project dashboard filters by any team of the assignee', async () => {
  const project = (await api.get('/projects', boss)).body.find((p) => p.name === 'Mixed');
  const url = `/projects/${project.id}/dashboard`;
  assert.equal((await api.get(`${url}?team=${design}`, boss)).body.summary.total, 1);
  assert.equal((await api.get(`${url}?team=${content}`, boss)).body.summary.total, 1);
});
