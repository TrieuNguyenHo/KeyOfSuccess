// Dashboard: who may see it, totals, workload per person, completion trend and completed_at stamps.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, wait } from './helpers.js';

let server, api;
let boss, leadA, memA, memC, content, design, done, project;
const day = (offset) => new Date(Date.now() + offset * 86400000).toLocaleDateString('sv-SE');

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  content = await api.team(boss, 'Content');
  design = await api.team(boss, 'Design');
  leadA = await api.approve(boss, 'leadA', { role: 'leader', team: content });
  memA = await api.approve(boss, 'memA', { team: content });
  memC = await api.approve(boss, 'memC', { team: content }); // nothing assigned: shows as free capacity
  const memB = await api.approve(boss, 'memB', { team: design });

  // A Content + Design project, so memB from Design may take tasks too. Members create their own tasks
  // (assigned to them); the Content Leader creates the one that stays unassigned.
  project = await api.project(boss, { name: 'Campaign', team_ids: [content, design] });
  for (const email of ['mema@t.test', 'memb@t.test']) await api.post(`/projects/${project.id}/members`, boss, { email });
  const requirement = await api.requirement(boss, project.id);
  const section = await api.firstSection(boss, project.id);
  const make = (as, title) => api.task(as, { section, requirement, title });
  const [overdue, soon, finished] = await Promise.all(['overdue', 'soon', 'done'].map((t) => make(memA, t)));
  const designer = await make(memB, 'designer');
  await make(leadA, 'nobody'); // stays unassigned
  done = finished;
  await api.patch(`/tasks/${overdue}`, memA, { due_date: day(-2), priority: 'high' });
  await api.patch(`/tasks/${soon}`, memA, { due_date: day(3) });
  await api.patch(`/tasks/${done}`, memA, { completed: true });
  await api.patch(`/tasks/${designer}`, memB, { due_date: day(20) });
});
after(() => server.stop());

test('Members and other teams are kept out', async () => {
  assert.equal((await api.get(`/dashboard?team=${content}`, memA)).status, 403);
  assert.equal((await api.get(`/dashboard?team=${design}`, leadA)).status, 403);
  assert.equal((await api.get('/dashboard?all=1', leadA)).status, 403);
});

test("a Leader's dashboard covers the team", async () => {
  const { body } = await api.get(`/dashboard?team=${content}`, leadA);
  const s = body.summary;
  assert.equal([s.open, s.overdue, s.due_soon, s.done_7d, s.unassigned].join(), '2,1,1,1,0');
  assert.equal(
    body.people.map((p) => `${p.name}:${p.open}/${p.overdue}/${p.high}`).join(),
    'memA:2/1/1,leadA:0/0/0,memC:0/0/0'
  );
  assert.equal(body.trend.length, 14);
  assert.equal(body.trend[13].done, 1);
  assert.equal(body.trend.reduce((sum, d) => sum + d.done, 0), 1);
  assert.equal(body.trend[13].day, day(0));
  assert.equal(body.projects.map((p) => `${p.name}:${p.open}/${p.done}`).join(), 'Campaign:2/1');
});

test("a Manager's dashboard covers everyone, or one team", async () => {
  const all = (await api.get('/dashboard?all=1', boss)).body;
  assert.equal([all.summary.open, all.summary.overdue, all.summary.unassigned].join(), '4,1,1');
  assert.equal(all.people.length, 5);
  const team = (await api.get(`/dashboard?team=${design}`, boss)).body;
  assert.equal(`${team.summary.open}:${team.people.map((p) => p.name).join()}`, '1:memB');
});

test('a project dashboard is open to whoever can open the project', async () => {
  assert.equal((await api.get(`/projects/${project.id}/dashboard`, memC)).status, 404);
  for (const user of [memA, leadA, boss]) assert.equal((await api.get(`/projects/${project.id}/dashboard`, user)).status, 200);
});

test('a project dashboard counts its tasks by requirement, section and person', async () => {
  const { body } = await api.get(`/projects/${project.id}/dashboard`, memA);
  const s = body.summary;
  assert.equal([s.total, s.open, s.done, s.overdue, s.due_soon, s.done_7d, s.unassigned].join(), '5,4,1,1,1,1,1');
  assert.equal(body.requirements.map((r) => `${r.total}/${r.done}/${r.open}/${r.overdue}`).join(), '5/1/4/1');
  // The finished task moved to "Completed" when it was ticked; the others stay in "Planned".
  assert.equal(
    body.sections.map((x) => `${x.name}:${x.total}/${x.done}`).join(),
    'Planned:4/0,In-Progress:0/0,Completed:1/1,Pending:0/0'
  );
  // Members only, never memC from the same team; memB is a member from another team.
  assert.equal(body.people.map((p) => `${p.name}:${p.open}/${p.overdue}/${p.high}`).join(), 'memA:2/1/1,memB:1/0/0,boss:0/0/0');
  assert.equal(body.trend.length, 14);
  assert.equal(body.trend[13].done, 1);
});

test('a project dashboard filters by the team of the assignee', async () => {
  const url = `/projects/${project.id}/dashboard`;
  assert.equal((await api.get(url, memA)).body.teams.map((t) => t.name).join(), 'Content,Design');

  const c = (await api.get(`${url}?team=${content}`, memA)).body;
  const s = c.summary;
  assert.equal([s.total, s.open, s.done, s.overdue, s.due_soon, s.unassigned].join(), '3,2,1,1,1,0');
  assert.equal(c.requirements.map((r) => `${r.total}/${r.done}`).join(), '3/1');
  assert.equal(c.sections.map((x) => x.total).join(), '2,0,1,0');
  assert.equal(c.people.map((p) => `${p.name}:${p.open}`).join(), 'memA:2');
  assert.equal(c.trend[13].done, 1);
  // The choices stay the same whatever the filter.
  assert.equal(c.teams.length, 2);

  const d = (await api.get(`${url}?team=${design}`, memA)).body;
  assert.equal(`${d.summary.total}/${d.summary.open}:${d.people.map((p) => p.name).join()}`, '1/1:memB');
  assert.equal(d.trend[13].done, 0);

  assert.equal((await api.get(`${url}?team=abc`, memA)).status, 400);
});

test('completed_at is stamped once and cleared when reopened', async () => {
  const stamp = (await api.get(`/tasks/${done}`, memA)).body.task.completed_at;
  assert.ok(stamp);
  await wait(1100);
  await api.patch(`/tasks/${done}`, memA, { completed: true, title: 'done again' });
  assert.equal((await api.get(`/tasks/${done}`, memA)).body.task.completed_at, stamp);
  await api.patch(`/tasks/${done}`, memA, { completed: false });
  assert.equal((await api.get(`/tasks/${done}`, memA)).body.task.completed_at, null);
  assert.equal((await api.get(`/dashboard?team=${content}`, leadA)).body.trend[13].done, 0);
});
