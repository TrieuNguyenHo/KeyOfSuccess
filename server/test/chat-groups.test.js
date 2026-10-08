// Chat, part 2 (v33): groups made by hand (run by their owner), project chats (whoever can open the project), team
// chats (the people of the team), muting, @mentions, answers and task links.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api;
let root, boss, ann, bob, carl, dan, content, design, project, task;

before(async () => {
  server = await startServer();
  api = server.api;
  root = await api.root();
  boss = await api.manager();
  content = await api.team(boss, 'Content');
  design = await api.team(boss, 'Design');
  ann = await api.approve(boss, 'ann', { team: content });
  bob = await api.approve(boss, 'bob', { team: content });
  carl = await api.approve(boss, 'carl', { team: content });
  dan = await api.approve(boss, 'dan', { team: design });
  await api.patch(`/admin/users/${boss.id}`, boss, { team_ids: [content, design] }); // so boss runs tasks there
  project = (await api.project(boss, { name: 'Tết', team_ids: [content], add_team: true })).id;
  const requirement = await api.requirement(boss, project, 'Landing');
  task = await api.task(boss, { section: await api.firstSection(boss, project), requirement, title: 'Banner Tết' });
});
after(() => server.stop());

const group = async (as, title, people) => {
  const res = await api.post('/chats/group', as, { title, user_ids: people.map((p) => p.id) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
};
const send = async (as, chatId, body, extra = {}) => {
  const res = await api.post(`/chats/${chatId}/messages`, as, { body, ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
};
const unreadChat = async (as) => (await api.get('/notifications', as)).body.unreadChat;
const listed = async (as, id) => (await api.get('/chats', as)).body.find((c) => c.id === id);
const lastOf = async (as, id) => (await api.get(`/chats/${id}/messages`, as)).body.messages.at(-1);

test('a group: its creator runs it, it is listed for everyone in it at once, nobody else sees it', async () => {
  const chat = await group(ann, 'Tết team', [bob, dan]);
  assert.equal(`${chat.kind}/${chat.title}/${chat.is_owner}`, 'group/Tết team/true');
  assert.deepEqual(chat.members.map((m) => `${m.name}${m.owner ? '*' : ''}`), ['ann*', 'bob', 'dan']);
  assert.ok(await listed(dan, chat.id), 'listed before any message');
  for (const as of [carl, boss]) assert.equal((await api.get(`/chats/${chat.id}`, as)).status, 404);
  assert.equal((await api.get(`/chats/${chat.id}`, root)).status, 403);

  const pending = await api.user('pending');
  for (const body of [{ title: ' ', user_ids: [bob.id] }, { title: 'X', user_ids: [] }, { title: 'X', user_ids: [pending.id] }, { title: 'X'.repeat(81), user_ids: [bob.id] }]) {
    assert.equal((await api.post('/chats/group', ann, body)).status, 400, JSON.stringify(body));
  }
});

test('anyone in a group adds people; only the owner renames or takes people out; the owner leaving hands it on', async () => {
  const chat = await group(ann, 'Nhóm', [bob, dan]);
  assert.equal((await api.post(`/chats/${chat.id}/members`, bob, { user_ids: [carl.id] })).status, 200);
  assert.equal((await api.get(`/chats/${chat.id}`, carl)).status, 200);

  assert.equal((await api.patch(`/chats/${chat.id}`, bob, { title: 'Đổi' })).status, 403);
  assert.equal((await api.patch(`/chats/${chat.id}`, ann, { title: 'Nhóm Tết' })).body.title, 'Nhóm Tết');
  assert.equal((await api.delete(`/chats/${chat.id}/members/${dan.id}`, bob)).status, 403);
  assert.equal((await api.delete(`/chats/${chat.id}/members/${dan.id}`, ann)).status, 204);
  assert.equal((await api.get(`/chats/${chat.id}`, dan)).status, 404, 'out of the group, out of its messages');

  assert.equal((await api.delete(`/chats/${chat.id}/members/${ann.id}`, ann)).status, 204);
  const now = (await api.get(`/chats/${chat.id}`, bob)).body;
  assert.equal(`${now.is_owner}/${now.members.find((m) => m.owner).name}`, 'true/bob', 'the earliest member takes over');

  for (const who of [carl, bob]) assert.equal((await api.delete(`/chats/${chat.id}/members/${who.id}`, who)).status, 204);
  assert.equal((await api.get(`/chats/${chat.id}`, bob)).status, 404, 'the last one out deletes it');
  assert.equal((await api.post(`/chats/${(await api.post('/chats/direct', ann, { user_id: bob.id })).body.id}/members`, ann, { user_ids: [carl.id] })).status, 400);
});

test('a project chat is for whoever can open the project, and ends with that access', async () => {
  const chat = (await api.post(`/chats/project/${project}`, ann)).body;
  assert.equal(`${chat.kind}/${chat.title}/${chat.project.id}`, `project/Tết/${project}`);
  assert.equal((await api.post(`/chats/project/${project}`, bob)).body.id, chat.id, 'one chat per project');
  assert.equal((await api.post(`/chats/project/${project}`, dan)).status, 404);
  assert.equal((await api.get(`/chats/${chat.id}`, dan)).status, 404);
  assert.equal((await api.get(`/chats/${chat.id}`, boss)).status, 200, 'a Manager who sees every project');

  const before = await unreadChat(bob);
  await send(ann, chat.id, 'Chào cả project');
  assert.equal(await unreadChat(bob), before + 1);
  assert.equal((await listed(bob, chat.id)).last_message.user_name, 'ann');

  assert.equal((await api.delete(`/projects/${project}/members/${carl.id}`, boss)).status, 204);
  // carl is still in the project's team, so the team rules may still let him open it; take him out of the team too.
  await api.patch(`/admin/users/${carl.id}`, boss, { team_id: design });
  assert.equal((await api.get(`/chats/${chat.id}`, carl)).status, 404);
  assert.equal(await listed(carl, chat.id), undefined);
  await api.patch(`/admin/users/${carl.id}`, boss, { team_id: content });
});

test('a team chat is for the people of the team', async () => {
  const chat = (await api.post(`/chats/team/${content}`, bob)).body;
  assert.equal(`${chat.kind}/${chat.title}`, 'team/Content');
  assert.equal((await api.post(`/chats/team/${content}`, dan)).status, 404);
  await send(bob, chat.id, 'Họp team 3h');
  assert.equal((await lastOf(ann, chat.id)).body, 'Họp team 3h');
  assert.equal((await api.get(`/chats/${chat.id}`, dan)).status, 404);
  assert.ok((await api.get(`/chats/${chat.id}`, ann)).body.members.some((m) => m.id === carl.id));

  await api.patch(`/admin/users/${ann.id}`, boss, { team_id: design });
  assert.equal((await api.get(`/chats/${chat.id}`, ann)).status, 404, 'leaving the team ends the access');
  await api.patch(`/admin/users/${ann.id}`, boss, { team_id: content });
  assert.ok((await api.get('/chats/rooms', ann)).body.teams.some((t) => t.id === content));
});

test('mentions reach members only; a muted conversation counts only the mentions of the user', async () => {
  const chat = await group(ann, 'Mute', [bob]);
  const message = await send(ann, chat.id, `Nhờ @[bob](${bob.id}) và @[dan](${dan.id})`);
  assert.equal(message.body, `Nhờ @[bob](${bob.id}) và @dan`, 'dan is not in the group');
  assert.equal((await listed(bob, chat.id)).mentioned, true);
  await api.post(`/chats/${chat.id}/read`, bob);

  assert.equal((await api.post(`/chats/${chat.id}/mute`, bob, { muted: true })).status, 204);
  const before = await unreadChat(bob);
  await send(ann, chat.id, 'Tin thường');
  assert.equal(await unreadChat(bob), before, 'muted');
  assert.equal((await listed(bob, chat.id)).unread, 1, 'still shown on the conversation');
  await send(ann, chat.id, `@[bob](${bob.id}) gấp`);
  assert.equal(await unreadChat(bob), before + 1, 'a mention counts even muted');
  await api.post(`/chats/${chat.id}/mute`, bob, { muted: false });
  assert.equal(await unreadChat(bob), before + 2);
});

test('answering a message quotes it; only a message of the same conversation can be answered', async () => {
  const chat = await group(ann, 'Reply', [bob]);
  const question = await send(ann, chat.id, `Ai làm banner? @[bob](${bob.id})`);
  const answer = await send(bob, chat.id, 'Em làm', { reply_to_id: question.id });
  assert.equal(`${answer.reply.user_name}/${answer.reply.body}`, 'ann/Ai làm banner? @bob');
  const other = await group(ann, 'Khác', [bob]);
  assert.equal((await api.post(`/chats/${other.id}/messages`, bob, { body: 'x', reply_to_id: question.id })).status, 400);
  await api.delete(`/chat-messages/${question.id}`, ann);
  assert.equal((await lastOf(bob, chat.id)).reply.deleted, true);
});

test('a task link shows the task only to those who can see it', async () => {
  const chat = await group(ann, 'Link', [dan]);
  await send(ann, chat.id, `Xem http://localhost:5173/#/task/${task} nhé`);
  assert.deepEqual((await lastOf(ann, chat.id)).tasks.map((t) => `${t.id}/${t.title}/${t.project_name}`), [`${task}/Banner Tết/Tết`]);
  assert.deepEqual((await lastOf(dan, chat.id)).tasks, [], 'dan cannot see the task');
  // A screen with the task's side panel open links to it too.
  await send(ann, chat.id, `http://localhost:5173/#/project/${project}/board?task=${task} và #/my?layout=calendar&task=${task}`);
  assert.deepEqual((await lastOf(ann, chat.id)).tasks.map((t) => t.id), [task]);
});

// System lines (v34): what happens to a group shows in it; it counts as unread only for the people it is about.
const lines = async (as, id) =>
  (await api.get(`/chats/${id}/messages`, as)).body.messages
    .filter((m) => m.kind === 'system')
    .map((m) => `${m.user_name}:${m.data.event}:${m.data.people.map((p) => p.name).join(',')}${m.data.title ? `:${m.data.title}` : ''}${m.data.owner ? ':owner' : ''}`);

test('a new group tells the people added to it: one unread line each, none for its creator', async () => {
  const before = { ann: await unreadChat(ann), bob: await unreadChat(bob) };
  const chat = await group(ann, 'Báo tin', [bob, carl]);
  assert.deepEqual(await lines(bob, chat.id), ['ann:created:bob,carl:Báo tin']);
  assert.equal(await unreadChat(bob), before.bob + 1);
  assert.equal(await unreadChat(ann), before.ann);
  const row = await listed(bob, chat.id);
  assert.equal(`${row.unread}/${row.mentioned}/${row.last_message.kind}/${row.last_message.body}`, '1/false/system/', 'a line is no mention');
});

test('someone added later sees only the line about them as unread, not the messages from before', async () => {
  const chat = await group(ann, 'Đến sau', [bob]);
  await api.post(`/chats/${chat.id}/read`, bob);
  for (const body of ['Một', 'Hai', 'Ba']) await send(ann, chat.id, body);
  await api.post(`/chats/${chat.id}/read`, bob);
  const bobBefore = await unreadChat(bob);
  const danBefore = await unreadChat(dan);
  assert.equal((await api.post(`/chats/${chat.id}/members`, bob, { user_ids: [dan.id, ann.id] })).status, 200);
  assert.equal(await unreadChat(dan), danBefore + 1, 'the line, not the three earlier messages');
  assert.equal((await listed(dan, chat.id)).unread, 1);
  assert.equal(await unreadChat(bob), bobBefore, 'the others are not told');
  assert.deepEqual((await lines(dan, chat.id)).at(-1), 'bob:added:dan', 'only the newcomers are named');
});

test('taking out, leaving, the owner leaving and renaming show as lines; lines cannot be edited, deleted or answered', async () => {
  const chat = await group(ann, 'Đổi', [bob, carl, dan]);
  await api.patch(`/chats/${chat.id}`, ann, { title: 'Đổi tên' });
  await api.patch(`/chats/${chat.id}`, ann, { title: 'Đổi tên' }); // unchanged: no line
  await api.delete(`/chats/${chat.id}/members/${dan.id}`, ann);
  await api.delete(`/chats/${chat.id}/members/${carl.id}`, carl);
  await api.post(`/chats/${chat.id}/read`, bob);
  const before = await unreadChat(bob);
  await api.delete(`/chats/${chat.id}/members/${ann.id}`, ann);
  assert.deepEqual(await lines(bob, chat.id), [
    'ann:created:bob,carl,dan:Đổi',
    'ann:renamed::Đổi tên',
    'ann:removed:dan',
    'carl:left:',
    'ann:left:bob:owner',
  ]);
  assert.equal(await unreadChat(bob), before + 1, 'the new owner is told');

  const line = (await api.get(`/chats/${chat.id}/messages`, bob)).body.messages.at(-1);
  assert.equal((await api.patch(`/chat-messages/${line.id}`, ann, { body: 'x' })).status, 404);
  assert.equal((await api.delete(`/chat-messages/${line.id}`, ann)).status, 404);
  assert.equal((await api.post(`/chats/${chat.id}/messages`, bob, { body: 'x', reply_to_id: line.id })).status, 400);
});
