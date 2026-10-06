// Channel tags (Facebook, TikTok…): one department-wide list kept by Managers; anyone who may edit a top-level
// task sets its channels, which show on the project's tasks and in the task history. Subtasks carry none.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { listen, startServer, wait } from './helpers.js';

let server, api;
let boss, leadC, memC, memC2, content, project, section, requirement, task, mine;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  content = await api.team(boss, 'Content');
  await api.patch(`/admin/users/${boss.id}`, boss, { team_ids: [content] });
  leadC = await api.approve(boss, 'leadC', { role: 'leader', team: content });
  memC = await api.approve(boss, 'memC', { team: content });
  memC2 = await api.approve(boss, 'memC2', { team: content });

  project = await api.project(boss, { name: 'Tet', team_ids: [content], add_team: true });
  section = await api.firstSection(boss, project.id);
  requirement = await api.requirement(boss, project.id);
  task = await api.task(boss, { section, requirement, title: 'post' });
  mine = await api.task(memC, { section, requirement, title: 'memC own' });
});
after(() => server.stop());

const channel = async (name, color) => {
  const res = await api.post('/channels', boss, { name, color });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
};
const setChannels = (as, id, channel_ids) => api.patch(`/tasks/${id}`, as, { channel_ids });
const tagsOf = async (id) =>
  (await api.get(`/projects/${project.id}`, boss)).body.tasks
    .find((t) => t.id === id)
    .channels.map((c) => c.name)
    .join();
const channelHistory = async (id) =>
  (await api.get(`/tasks/${id}/history`, boss)).body.filter((e) => e.field === 'channels').map((e) => `${e.from}>${e.to}`);

test('only Managers keep the channel list; everyone reads it, only Managers see task counts', async () => {
  const facebook = await channel('Facebook');
  assert.match(facebook.color, /^#[0-9a-f]{6}$/i, 'a channel without a color takes one of the palette');
  await channel('TikTok', '#20aaea');
  assert.equal((await api.post('/channels', leadC, { name: 'SEO' })).status, 403);
  assert.equal((await api.post('/channels', memC, { name: 'SEO' })).status, 403);
  assert.equal((await api.patch(`/channels/${facebook.id}`, leadC, { name: 'FB' })).status, 403);
  assert.equal((await api.delete(`/channels/${facebook.id}`, memC)).status, 403);

  const list = (await api.get('/channels', memC)).body;
  assert.equal(list.map((c) => c.name).join(), 'Facebook,TikTok');
  assert.equal(list[0].task_count, undefined);
  assert.equal((await api.get('/channels', boss)).body[0].task_count, 0);
});

test('channel names are required and unique (ignoring case); colors must be hex', async () => {
  assert.equal((await api.post('/channels', boss, { name: '  ' })).status, 400);
  assert.equal((await api.post('/channels', boss, { name: 'facebook' })).status, 409);
  assert.equal((await api.post('/channels', boss, { name: 'Email', color: 'red' })).status, 400);
  const email = await channel('Email');
  assert.equal((await api.patch(`/channels/${email.id}`, boss, { name: 'TIKTOK' })).status, 409);
  assert.equal((await api.patch(`/channels/${email.id}`, boss, { color: '#62d26f' })).body.color, '#62d26f');
  assert.equal((await api.patch('/channels/9999', boss, { name: 'X' })).status, 404);
});

test('task admins and the assignee set channels; the task shows them; others cannot', async () => {
  const [facebook, tiktok] = (await api.get('/channels', boss)).body.filter((c) => c.name !== 'Email');
  const res = await setChannels(boss, task, [tiktok.id, facebook.id, facebook.id]);
  assert.equal(res.status, 200);
  assert.equal(res.body.channels.map((c) => c.name).join(), 'Facebook,TikTok');
  assert.equal(await tagsOf(task), 'Facebook,TikTok');

  assert.equal((await setChannels(memC, mine, [facebook.id])).status, 200, 'the assignee edits their own task');
  assert.equal((await setChannels(memC, task, [])).status, 403, 'not their task');
  assert.equal((await setChannels(leadC, mine, [tiktok.id])).body.channels.map((c) => c.name).join(), 'TikTok');

  const detail = (await api.get(`/tasks/${task}`, memC)).body;
  assert.equal(detail.task.channels.length, 2, 'viewers see the tags');
  assert.equal(detail.channels.length, 0, 'but get no choices');
  assert.equal((await api.get(`/tasks/${task}`, boss)).body.channels.length, 3);
});

test('unknown channels, non-lists and subtasks are refused', async () => {
  assert.equal((await setChannels(boss, task, [9999])).status, 400);
  assert.equal((await setChannels(boss, task, ['x'])).status, 400);
  assert.equal((await setChannels(boss, task, 'Facebook')).status, 400);
  const sub = await api.post('/tasks', boss, { parent_id: task, title: 'sub' });
  assert.equal((await setChannels(boss, sub.body.id, [])).status, 400);
  assert.equal(await tagsOf(task), 'Facebook,TikTok', 'nothing changed');
});

test('changes go to the history; saving the same set records nothing', async () => {
  const { id: facebook } = (await api.get('/channels', boss)).body.find((c) => c.name === 'Facebook');
  await setChannels(boss, task, [facebook]);
  await setChannels(boss, task, [facebook]);
  await setChannels(boss, task, []);
  assert.deepEqual(await channelHistory(task), ['Facebook>null', 'Facebook, TikTok>Facebook', 'null>Facebook, TikTok']);
});

test('channels can be set together with other fields', async () => {
  const { id: tiktok } = (await api.get('/channels', boss)).body.find((c) => c.name === 'TikTok');
  const res = await api.patch(`/tasks/${task}`, boss, { priority: 'high', channel_ids: [tiktok] });
  assert.equal(res.body.priority, 'high');
  assert.equal(res.body.channels.map((c) => c.name).join(), 'TikTok');
});

test('renaming a channel renames it on every task; viewers of the project hear of it', async () => {
  const { id: tiktok } = (await api.get('/channels', boss)).body.find((c) => c.name === 'TikTok');
  const stream = listen(server.url, memC2);
  while (!stream.isOpen()) await wait(10);
  await api.patch(`/channels/${tiktok}`, boss, { name: 'TikTok Shop' });
  await wait(50);
  await stream.close();
  assert.equal(await tagsOf(task), 'TikTok Shop');
  assert.ok(stream.changes.some((c) => c.project_id === project.id));
});

test('deleting a channel takes it off its tasks and records that on each', async () => {
  const list = (await api.get('/channels', boss)).body;
  const tiktok = list.find((c) => c.name === 'TikTok Shop');
  assert.equal(tiktok.task_count, 2);
  assert.equal((await api.delete(`/channels/${tiktok.id}`, boss)).status, 204);
  assert.equal(await tagsOf(task), '');
  assert.equal(await tagsOf(mine), '');
  assert.equal((await channelHistory(mine))[0], 'TikTok Shop>null');
  assert.equal((await api.delete(`/channels/${tiktok.id}`, boss)).status, 404);
});

test('Task của tôi and Theo dõi carry each task\'s channels', async () => {
  const seo = await channel('SEO');
  await setChannels(memC, mine, [seo.id]);
  const list = (await api.get('/tasks?assignee=me', memC)).body;
  assert.equal(list.find((t) => t.id === mine).channels.map((c) => c.name).join(), 'SEO');
  assert.equal((await api.get(`/tasks?team=${content}`, leadC)).body.find((t) => t.id === mine).channels.length, 1);
});

test('project dashboard: progress per channel (a task counts in each of its channels), and the untagged ones', async () => {
  const p = await api.project(boss, { name: 'Dash', team_ids: [content], add_team: true });
  const s = await api.firstSection(boss, p.id);
  const r = await api.requirement(boss, p.id);
  const a = await api.task(boss, { section: s, requirement: r, title: 'a' });
  const b = await api.task(boss, { section: s, requirement: r, title: 'b' });
  await api.task(boss, { section: s, requirement: r, title: 'untagged' });
  const fb = await channel('FB dash');
  const em = await channel('Email dash');
  await setChannels(boss, a, [fb.id, em.id]);
  await setChannels(boss, b, [fb.id]);
  await api.patch(`/tasks/${b}`, boss, { completed: true, assignee_id: memC.id });
  await api.patch(`/tasks/${a}`, boss, { due_date: '2000-01-01' });

  const d = (await api.get(`/projects/${p.id}/dashboard`, memC)).body;
  assert.deepEqual(
    d.channels.map((x) => `${x.name}:${x.done}/${x.total}:${x.overdue}`),
    ['Email dash:0/1:1', 'FB dash:1/2:1']
  );
  assert.equal(`${d.no_channel.done}/${d.no_channel.total}`, '0/1');

  const byTeam = (await api.get(`/projects/${p.id}/dashboard?team=${content}`, boss)).body;
  assert.deepEqual(byTeam.channels.map((x) => `${x.name}:${x.total}`), ['FB dash:1'], 'only tasks of people in the team');
  assert.equal(byTeam.no_channel.total, 0);
});

test('overview dashboard: channels within the scope only', async () => {
  const design = await api.team(boss, 'Design');
  const leadD = await api.approve(boss, 'leadD', { role: 'leader', team: design });
  const p = await api.project(boss, { name: 'DesignOnly', team_ids: [design] });
  const s = await api.firstSection(boss, p.id);
  const r = await api.requirement(boss, p.id);
  const t = await api.task(leadD, { section: s, requirement: r, title: 'd' });
  await api.patch(`/tasks/${t}`, leadD, { assignee_id: leadD.id });
  const tv = await channel('TV');
  await setChannels(leadD, t, [tv.id]);

  const names = async (as, query) => (await api.get(`/dashboard?${query}`, as)).body.channels.map((x) => x.name);
  assert.ok((await names(boss, 'all=1')).includes('TV'));
  assert.ok((await names(leadD, 'mine=1')).includes('TV'));
  assert.ok(!(await names(leadC, 'mine=1')).includes('TV'), "another team's channel counts stay hidden");
  assert.equal((await api.get(`/dashboard?team=${design}`, leadC)).status, 403);
});
