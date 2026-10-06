// Project → Requirements → Tasks: who manages requirements, the task ↔ requirement rules,
// progress counts, deletion guard and per-requirement feedback.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api;
let boss, content, leadC, memC, memD, memX, project, section, r1, r2, r3, otherRequirement, task;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  content = await api.team(boss, 'Content');
  const design = await api.team(boss, 'Design');
  leadC = await api.approve(boss, 'leadC', { role: 'leader', team: content });
  memC = await api.approve(boss, 'memC', { team: content });
  memD = await api.approve(boss, 'memD', { team: design });
  memX = await api.approve(boss, 'memX', { team: design });
  // A Content project created by the Manager, with memC and memD (Design) as plain members.
  project = (await api.project(boss, { name: 'Tet', team_ids: [content] })).id;
  for (const email of ['memc@t.test', 'memd@t.test']) await api.post(`/projects/${project}/members`, boss, { email });
  section = await api.firstSection(memC, project);
});
after(() => server.stop());

const requirements = async () => (await api.get(`/projects/${project}`, memC)).body.requirements;
const addRequirement = (as, title) => api.post(`/projects/${project}/requirements`, as, { title });

test('a new project has no requirements, so tasks cannot be added yet', async () => {
  assert.equal((await requirements()).length, 0);
  assert.equal((await api.post('/tasks', memC, { section_id: section, title: 'x' })).status, 400);
});

test('only the owner, a Leader of the team or a Manager adds requirements', async () => {
  assert.equal((await addRequirement(memD, 'x')).status, 403); // plain member
  assert.equal((await addRequirement(memC, 'x')).status, 403); // plain member of the owning team
  assert.equal((await addRequirement(memX, 'x')).status, 404); // outsider
  assert.equal((await addRequirement(boss, '  ')).status, 400);
  r1 = await api.requirement(boss, project, 'Landing page', 'Form dang ky');
  r2 = await api.requirement(leadC, project, 'Ads Facebook');
  r3 = await api.requirement(boss, project, 'Bao cao');
  assert.equal(
    (await requirements()).map((r) => `${r.title}:${r.task_count}`).join('|'),
    'Landing page:0|Ads Facebook:0|Bao cao:0'
  );
});

test("a task cannot use another project's requirement", async () => {
  const other = (await api.project(boss, { name: 'Other', team_ids: [content] })).id;
  otherRequirement = await api.requirement(boss, other, 'Q req');
  const res = await api.post('/tasks', memC, { section_id: section, requirement_id: otherRequirement, title: 'x' });
  assert.equal(res.status, 400);
});

test('a member creates a task inside a requirement', async () => {
  // memD is a member from Design, outside the project's team: not assigned, so no tasks of their own.
  assert.equal((await api.post('/tasks', memD, { section_id: section, requirement_id: r1, title: 'x' })).status, 403);
  task = await api.task(memC, { section, requirement: r1, title: 'Thiet ke form' });
  const { body } = await api.get(`/tasks/${task}`, memC);
  assert.equal(`${body.task.requirement_id}:${body.task.requirement_title}`, `${r1}:Landing page`);
});

test('subtasks follow their parent and take no requirement', async () => {
  assert.equal((await api.post('/tasks', memC, { parent_id: task, title: 'sub' })).status, 201);
  const subtask = (await api.get(`/tasks/${task}`, memC)).body.subtasks[0].id;
  assert.equal((await api.patch(`/tasks/${subtask}`, memC, { requirement_id: r1 })).status, 400);
});

test('progress counts finished top-level tasks', async () => {
  await api.patch(`/tasks/${task}`, memC, { completed: true }); // memC created it, so it is theirs
  const landing = (await requirements()).find((r) => r.id === r1);
  assert.equal(`${landing.done_count}/${landing.task_count}`, '1/1');
  assert.equal((await api.get('/tasks?assignee=me', memC)).body.map((t) => t.requirement_title).join(), 'Landing page');
});

test('a task moves to another requirement of its project, never to none', async () => {
  assert.equal((await api.patch(`/tasks/${task}`, memC, { requirement_id: r2 })).status, 200);
  assert.equal((await api.patch(`/tasks/${task}`, memC, { requirement_id: null })).status, 400);
  assert.equal((await api.patch(`/tasks/${task}`, memC, { requirement_id: otherRequirement })).status, 400);
  assert.equal((await api.get(`/tasks/${task}`, memC)).body.task.requirement_title, 'Ads Facebook');
});

test('editing requirements follows the same rights', async () => {
  const edited = await api.patch(`/requirements/${r2}`, boss, { description: 'Ngan sach 50tr' });
  assert.equal(`${edited.body.title}/${edited.body.description}`, 'Ads Facebook/Ngan sach 50tr');
  assert.equal((await api.patch(`/requirements/${r2}`, memD, { title: 'x' })).status, 403);
  assert.equal((await api.patch(`/requirements/${r2}`, leadC, { title: ' ' })).status, 400);
  assert.equal((await api.get(`/requirements/${r2}/comments`, memX)).status, 404);
});

test('a requirement with tasks cannot be deleted', async () => {
  assert.equal((await api.delete(`/requirements/${r2}`, boss)).status, 400);
  assert.equal((await api.delete(`/requirements/${r3}`, memD)).status, 403);
  assert.equal((await api.delete(`/requirements/${r3}`, boss)).status, 204);
  await api.patch(`/tasks/${task}`, memC, { requirement_id: r1 });
  assert.equal((await api.delete(`/requirements/${r2}`, leadC)).status, 204);
});

test('anyone who can open the project gives feedback on a requirement', async () => {
  const comment = (as, body) => api.post(`/requirements/${r1}/comments`, as, { body });
  assert.equal((await comment(memD, 'Can them Zalo')).status, 201);
  assert.equal((await comment(boss, 'Duyet')).status, 201);
  assert.equal((await comment(memC, ' ')).status, 400);
  assert.equal((await comment(memX, 'x')).status, 404);
  const listed = (await api.get(`/requirements/${r1}/comments`, leadC)).body;
  assert.equal(listed.map((c) => `${c.user_name}:${c.body}`).join('|'), 'memD:Can them Zalo|boss:Duyet');
  assert.equal((await requirements()).find((r) => r.id === r1).comment_count, 2);
});

test('deleting the project removes its requirements', async () => {
  assert.equal((await api.delete(`/projects/${project}`, boss)).status, 204);
  assert.equal((await api.get(`/requirements/${r1}/comments`, memC)).status, 404);
});

