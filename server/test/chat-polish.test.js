// Chat, part 3 (v35): reactions, read positions for "Đã xem" in groups, and newcomers to a project or team chat not
// being handed its whole history as unread.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { listen, startServer, wait } from './helpers.js';

const SETTLE_MS = 300; // time for a pushed event to arrive

let server, api;
let boss, ann, bob, carl, content, design;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  content = await api.team(boss, 'Content');
  design = await api.team(boss, 'Design');
  ann = await api.approve(boss, 'ann', { team: content });
  bob = await api.approve(boss, 'bob', { team: content });
  carl = await api.approve(boss, 'carl', { team: design });
});
after(() => server.stop());

const group = async (as, people) => (await api.post('/chats/group', as, { title: 'G', user_ids: people.map((p) => p.id) })).body;
const send = async (as, chatId, body) => {
  const res = await api.post(`/chats/${chatId}/messages`, as, { body });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
};
const react = (as, messageId, emoji) => api.post(`/chat-messages/${messageId}/reaction`, as, { emoji });
const messageIn = async (as, chatId, id) => (await api.get(`/chats/${chatId}/messages`, as)).body.messages.find((m) => m.id === id);
const unreadChat = async (as) => (await api.get('/notifications', as)).body.unreadChat;

test('one reaction per person per message, from the fixed set; changing it replaces it, null takes it back', async () => {
  const chat = await group(ann, [bob]);
  const message = await send(ann, chat.id, 'Banner xong rồi');
  assert.equal((await react(bob, message.id, '👍')).status, 200);
  assert.equal((await react(ann, message.id, '👍')).status, 200);
  assert.deepEqual((await messageIn(bob, chat.id, message.id)).reactions, [{ emoji: '👍', count: 2, names: ['bob', 'ann'], mine: true }]);

  assert.equal((await react(bob, message.id, '❤️')).body.reactions.map((r) => `${r.emoji}${r.count}${r.mine ? '*' : ''}`).join(' '), '👍1 ❤️1*');
  assert.equal((await react(bob, message.id, null)).body.reactions.map((r) => r.emoji).join(), '👍');
  assert.equal((await react(bob, message.id, '🍕')).status, 400);
  assert.equal((await react(carl, message.id, '👍')).status, 404, 'not in the conversation');

  const line = (await api.get(`/chats/${chat.id}/messages`, bob)).body.messages.find((m) => m.kind === 'system');
  assert.equal((await react(bob, line.id, '👍')).status, 404, 'no reactions on system lines');
  await api.delete(`/chat-messages/${message.id}`, ann);
  assert.deepEqual((await messageIn(bob, chat.id, message.id)).reactions, [], 'a deleted message loses its reactions');
});

test('reading is pushed to everyone in a group, with each member read position', async () => {
  const chat = await group(ann, [bob, carl]);
  const message = await send(ann, chat.id, 'Ai đọc chưa?');
  const stream = listen(server.url, ann);
  await wait(SETTLE_MS);
  await api.post(`/chats/${chat.id}/read`, bob);
  await wait(SETTLE_MS);
  await stream.close();
  assert.ok(stream.events.includes('chat'), 'ann hears that bob read');
  const members = (await api.get(`/chats/${chat.id}`, ann)).body.members;
  const position = (u) => members.find((m) => m.id === u.id).last_read_id;
  assert.equal(position(bob), message.id);
  assert.ok(position(carl) < message.id, 'carl has not read it');
});

test('someone who joins a team later does not get its old messages as unread, only the new ones', async () => {
  const chat = (await api.post(`/chats/team/${content}`, ann)).body;
  for (const body of ['Một', 'Hai', 'Ba']) await send(ann, chat.id, body);
  assert.equal((await api.get('/chats', bob)).body.find((c) => c.id === chat.id).unread, 3, 'bob was in the team all along');

  await api.patch(`/admin/users/${carl.id}`, boss, { team_id: content });
  const before = await unreadChat(carl);
  assert.equal((await api.get(`/chats/${chat.id}`, carl)).body.unread, 0);
  assert.equal(await unreadChat(carl), before);
  await send(ann, chat.id, 'Chào Carl');
  assert.equal((await api.get(`/chats/${chat.id}`, carl)).body.unread, 1);
  assert.equal(await unreadChat(carl), before + 1);
  await api.patch(`/admin/users/${carl.id}`, boss, { team_id: design });
});
