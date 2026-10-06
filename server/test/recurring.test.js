// Recurring tasks: whoever may edit a top-level task sets a repeat rule; completing an occurrence creates the next
// one (same fields, channels, unticked subtasks) due on the rule's next day, never in the past, and moves the rule.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api;
let boss, leadC, memC, memC2, content, design, project, section, done, requirement;

// Calendar dates as the server sees them (same machine, same timezone).
const day = (d) => d.toLocaleDateString('sv-SE');
const shift = (s, n) => {
  const d = new Date(`${s}T12:00:00`);
  d.setDate(d.getDate() + n);
  return day(d);
};
const weekday = (s) => ((new Date(`${s}T12:00:00`).getDay() + 6) % 7) + 1; // 1 = Monday
const today = day(new Date());

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  content = await api.team(boss, 'Content');
  design = await api.team(boss, 'Design');
  await api.patch(`/admin/users/${boss.id}`, boss, { team_ids: [content] });
  leadC = await api.approve(boss, 'leadC', { role: 'leader', team: content });
  memC = await api.approve(boss, 'memC', { team: content });
  memC2 = await api.approve(boss, 'memC2', { team: content });
  project = await api.project(boss, { name: 'Social', team_ids: [content], add_team: true });
  const sections = (await api.get(`/projects/${project.id}`, boss)).body.sections;
  section = sections.find((s) => s.kind === 'doing').id; // tasks start outside "Cần làm" to see the next one land there
  done = sections.find((s) => s.kind === 'done').id;
  requirement = await api.requirement(boss, project.id);
});
after(() => server.stop());

const newTask = async (fields = {}) => {
  const id = await api.task(boss, { section, requirement, title: fields.title ?? 'Báo cáo tuần' });
  const res = await api.patch(`/tasks/${id}`, boss, { assignee_id: memC.id, ...fields });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return id;
};
const repeat = (as, id, recurrence) => api.patch(`/tasks/${id}`, as, { recurrence });
const complete = (as, id) => api.patch(`/tasks/${id}`, as, { completed: true });
const get = async (id) => (await api.get(`/tasks/${id}`, boss)).body;
const nextOf = async (id) => (await get(id)).task.next_task_id;

test('rules are validated; subtasks and view-only people cannot set one', async () => {
  const id = await newTask({ due_date: shift(today, 3) });
  for (const bad of [{ freq: 'yearly' }, { freq: 'weekly' }, { freq: 'weekly', days: [8] }, { freq: 'monthly', day: 0 }, 'weekly']) {
    assert.equal((await repeat(boss, id, bad)).status, 400, JSON.stringify(bad));
  }
  const sub = await api.post('/tasks', boss, { parent_id: id, title: 'sub' });
  assert.equal((await repeat(boss, sub.body.id, { freq: 'daily' })).status, 400);
  assert.equal((await repeat(memC2, id, { freq: 'daily' })).status, 403, 'not their task');
  const res = await repeat(memC, id, { freq: 'weekly', days: [5, 1, 1] });
  assert.equal(res.status, 200, 'the assignee sets it');
  assert.deepEqual(JSON.parse(res.body.recurrence), { freq: 'weekly', days: [1, 5] });
  assert.equal((await repeat(memC, id, null)).body.recurrence, null);
});

test('a rule on a task without a due date gives it the first day of the rule from today', async () => {
  const id = await newTask();
  assert.equal((await repeat(boss, id, { freq: 'weekly', days: [weekday(today)] })).body.due_date, today);
});

test('completing an occurrence creates the next one with the same content, and moves the rule', async () => {
  const due = shift(today, 10);
  const id = await newTask({ due_date: due, priority: 'high', description: 'Số liệu FB + TikTok' });
  await api.post('/tasks', boss, { parent_id: id, title: 'lấy số liệu FB' });
  const sub = await api.post('/tasks', boss, { parent_id: id, title: 'lấy số liệu TikTok' });
  await api.patch(`/tasks/${sub.body.id}`, boss, { completed: true });
  const fb = (await api.post('/channels', boss, { name: 'Facebook' })).body;
  await api.patch(`/tasks/${id}`, boss, { channel_ids: [fb.id], recurrence: { freq: 'weekly', days: [weekday(due)] } });

  assert.equal((await complete(memC, id)).status, 200);
  const old = await get(id);
  assert.equal(old.task.recurrence, null);
  assert.equal(old.next_task.due_date, shift(due, 7));

  const next = await get(old.task.next_task_id);
  const t = next.task;
  assert.deepEqual(
    [t.title, t.description, t.priority, t.assignee_id, t.requirement_id, t.completed, t.due_date],
    ['Báo cáo tuần', 'Số liệu FB + TikTok', 'high', memC.id, requirement, 0, shift(due, 7)]
  );
  assert.deepEqual(JSON.parse(t.recurrence), { freq: 'weekly', days: [weekday(due)] });
  assert.equal(t.channels.map((c) => c.name).join(), 'Facebook');
  assert.deepEqual(next.subtasks.map((s) => `${s.title}:${s.completed}`), ['lấy số liệu FB:0', 'lấy số liệu TikTok:0']);
  const sections = (await api.get(`/projects/${project.id}`, boss)).body.sections;
  assert.equal(sections.find((s) => s.id === t.section_id).kind, 'todo');
});

test('each occurrence spawns only once, even when unticked and ticked again', async () => {
  const id = await newTask({ due_date: shift(today, 2) });
  await repeat(boss, id, { freq: 'daily' });
  await complete(boss, id);
  const first = await nextOf(id);
  const count = async () => (await api.get(`/projects/${project.id}`, boss)).body.tasks.length;
  const before = await count();
  await api.patch(`/tasks/${id}`, boss, { completed: false });
  await complete(boss, id);
  assert.equal(await nextOf(id), first);
  assert.equal(await count(), before);
});

test('moving an occurrence into the done status also creates the next one', async () => {
  const id = await newTask({ due_date: shift(today, 1), title: 'Đăng bài' });
  await repeat(boss, id, { freq: 'weekly', days: [weekday(shift(today, 1))] });
  await api.patch(`/tasks/${id}`, boss, { section_id: done });
  assert.ok(await nextOf(id));
});

test('a late occurrence gets its next due date from today on, never in the past', async () => {
  const id = await newTask({ due_date: shift(today, -30) });
  await repeat(boss, id, { freq: 'weekly', days: [weekday(today)] });
  await complete(boss, id);
  assert.equal((await get(id)).next_task.due_date, today);
});

test('monthly rules use the last day of shorter months; biweekly rules skip the odd weeks', async () => {
  const id = await newTask({ due_date: '2099-01-31' });
  await repeat(boss, id, { freq: 'monthly', day: 31 });
  await complete(boss, id);
  const feb = await nextOf(id);
  assert.equal((await get(feb)).task.due_date, '2099-02-28');
  await complete(boss, feb);
  assert.equal((await get(await nextOf(feb))).task.due_date, '2099-03-31');

  const monday = '2099-01-05';
  assert.equal(weekday(monday), 1);
  const b = await newTask({ due_date: monday });
  await repeat(boss, b, { freq: 'biweekly', days: [1, 3] });
  await complete(boss, b);
  const wed = await nextOf(b);
  assert.equal((await get(wed)).task.due_date, '2099-01-07');
  await complete(boss, wed);
  assert.equal((await get(await nextOf(wed))).task.due_date, '2099-01-19');
});

test('notifications: daily completions stay quiet; the next occurrence notifies its assignee when someone else ticks', async () => {
  const daily = await newTask({ due_date: shift(today, 1) });
  await repeat(boss, daily, { freq: 'daily' });
  const leadBefore = await api.unread(leadC);
  await complete(memC, daily);
  assert.equal(await api.unread(leadC), leadBefore, 'no "task completed" for a daily task');

  const weekly = await newTask({ due_date: shift(today, 1) });
  await repeat(boss, weekly, { freq: 'weekly', days: [1] });
  const memBefore = await api.unread(memC);
  await complete(leadC, weekly);
  assert.equal(await api.unread(leadC), leadBefore, 'the Leader ticked it themselves');
  assert.equal(await api.unread(memC), memBefore + 1, 'memC is told about the new occurrence');
  const notes = (await api.get('/notifications', memC)).body.items;
  assert.equal(notes[0].type, 'assigned');
  assert.equal(notes[0].task_id, await nextOf(weekly));

  const own = await newTask({ due_date: shift(today, 1) });
  await repeat(memC, own, { freq: 'weekly', days: [2] });
  const mine = await api.unread(memC);
  await complete(memC, own);
  assert.equal(await api.unread(memC), mine, 'no notice for ticking your own');
  assert.ok((await api.unread(leadC)) > leadBefore, 'weekly completions still reach the Leader');
});

test('the next occurrence is unassigned when the assignee may no longer get the project\'s tasks', async () => {
  const id = await newTask({ due_date: shift(today, 1), assignee_id: memC2.id });
  await repeat(boss, id, { freq: 'weekly', days: [3] });
  await api.patch(`/admin/users/${memC2.id}`, boss, { team_ids: [design] });
  await complete(boss, id);
  assert.equal((await get(await nextOf(id))).task.assignee_id, null);
});

test('history: the rule change, "created the next one" on the old, "from a recurring task" on the new', async () => {
  const due = shift(today, 5);
  const id = await newTask({ due_date: due });
  await repeat(boss, id, { freq: 'weekly', days: [1, 4] });
  await complete(boss, id);
  const next = await nextOf(id);
  const oldEvents = (await api.get(`/tasks/${id}/history`, boss)).body;
  assert.ok(oldEvents.some((e) => e.field === 'recurrence' && e.from === null && e.to === '{"freq":"weekly","days":[1,4]}'));
  assert.ok(oldEvents.some((e) => e.type === 'recurred' && e.next_id === next));
  const newEvents = (await api.get(`/tasks/${next}/history`, boss)).body;
  assert.ok(newEvents.some((e) => e.type === 'created' && e.recurring_from === id));
});
