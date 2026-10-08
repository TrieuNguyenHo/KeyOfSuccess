// Chat, part 5 (v37): polls in group, project and team chats; muting for a while; pinning conversations to the top.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './helpers.js';

let server, api;
let boss, ann, bob, carl, content;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  content = await api.team(boss, 'Content');
  ann = await api.approve(boss, 'ann', { team: content });
  bob = await api.approve(boss, 'bob', { team: content });
  carl = await api.approve(boss, 'carl', { team: content });
});
after(() => server.stop());

const group = async (as, people, title = 'G') => (await api.post('/chats/group', as, { title, user_ids: people.map((p) => p.id) })).body;
const poll = async (as, chatId, body) => {
  const res = await api.post(`/chats/${chatId}/polls`, as, { question: 'Họp lúc nào?', options: ['Sáng', 'Chiều'], ...body });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
};
const vote = (as, messageId, ids) => api.post(`/chat-messages/${messageId}/vote`, as, { option_ids: ids });
const summary = (p) => p.options.map((o) => `${o.text}:${o.count}${o.mine ? '*' : ''}`).join(' ');
const unreadChat = async (as) => (await api.get('/notifications', as)).body.unreadChat;
const sql = (statement, ...args) => {
  const db = new DatabaseSync(server.dbPath);
  db.prepare(statement).run(...args);
  db.close();
};

test('a poll needs a group, project or team chat, a question and 2 to 10 different options, a deadline ahead', async () => {
  const chat = await group(ann, [bob, carl]);
  const direct = (await api.post('/chats/direct', ann, { user_id: bob.id })).body;
  assert.equal((await api.post(`/chats/${direct.id}/polls`, ann, { question: 'Q', options: ['A', 'B'] })).status, 400);
  for (const body of [
    { question: ' ', options: ['A', 'B'] },
    { question: 'Q', options: ['A', 'a', ' '] },
    { question: 'Q', options: Array.from({ length: 11 }, (_, i) => `O${i}`) },
    { question: 'Q', options: ['A', 'B'], closes_at: '2000-01-01T00:00:00Z' },
  ]) {
    assert.equal((await api.post(`/chats/${chat.id}/polls`, ann, body)).status, 400, JSON.stringify(body));
  }
  const created = await poll(ann, chat.id, { options: ['Sáng', 'sáng', 'Chiều'] });
  assert.equal(`${created.body}/${summary(created.poll)}/${created.poll.open}`, 'Họp lúc nào?/Sáng:0 Chiều:0/true', 'repeats are dropped');
  assert.equal((await api.get('/chats', bob)).body.find((c) => c.id === chat.id).last_message.body, 'Họp lúc nào?');
});

test('one option unless the poll allows several; votes change, show who voted, and count as nothing unread', async () => {
  const chat = await group(ann, [bob, carl]);
  const single = await poll(ann, chat.id);
  const [morning, afternoon] = single.poll.options.map((o) => o.id);
  await api.post(`/chats/${chat.id}/read`, ann);
  const before = await unreadChat(ann);
  assert.equal((await vote(bob, single.id, [morning, afternoon])).status, 400);
  assert.equal(summary((await vote(bob, single.id, [morning])).body.poll), 'Sáng:1* Chiều:0');
  assert.equal(summary((await vote(bob, single.id, [afternoon])).body.poll), 'Sáng:0 Chiều:1*', 'changed');
  const seen = (await vote(carl, single.id, [afternoon])).body.poll;
  assert.deepEqual(seen.options[1].voters.map((v) => v.name), ['bob', 'carl']);
  assert.equal(seen.voter_count, 2);
  assert.equal(await unreadChat(ann), before, 'votes are no messages');
  assert.equal(summary((await vote(bob, single.id, [])).body.poll), 'Sáng:0 Chiều:1', 'taken back');

  const multiple = await poll(ann, chat.id, { multiple: true });
  assert.equal(summary((await vote(bob, multiple.id, multiple.poll.options.map((o) => o.id))).body.poll), 'Sáng:1* Chiều:1*');
  assert.equal((await vote(bob, multiple.id, [morning])).status, 400, 'an option of another poll');
});

test('others add options only when the poll allows it; no repeats', async () => {
  const chat = await group(ann, [bob]);
  const closedToOthers = await poll(ann, chat.id);
  assert.equal((await api.post(`/chat-messages/${closedToOthers.id}/poll-options`, bob, { text: 'Tối' })).status, 403);
  assert.equal((await api.post(`/chat-messages/${closedToOthers.id}/poll-options`, ann, { text: 'Tối' })).status, 201, 'its creator may');
  const open = await poll(ann, chat.id, { allow_add: true });
  assert.equal(summary((await api.post(`/chat-messages/${open.id}/poll-options`, bob, { text: 'Tối' })).body.poll), 'Sáng:0 Chiều:0 Tối:0');
  assert.equal((await api.post(`/chat-messages/${open.id}/poll-options`, bob, { text: 'tối' })).status, 400);
});

test('a poll closes by hand (its creator only) or at its deadline; then nobody votes or adds options', async () => {
  const chat = await group(ann, [bob]);
  const manual = await poll(ann, chat.id, { allow_add: true });
  assert.equal((await api.post(`/chat-messages/${manual.id}/close-poll`, bob)).status, 403);
  assert.equal((await api.post(`/chat-messages/${manual.id}/close-poll`, ann)).body.poll.open, false);
  assert.equal((await vote(bob, manual.id, [manual.poll.options[0].id])).status, 400);
  assert.equal((await api.post(`/chat-messages/${manual.id}/poll-options`, bob, { text: 'Tối' })).status, 400);

  const timed = await poll(ann, chat.id, { closes_at: new Date(Date.now() + 3600e3).toISOString() });
  assert.ok(timed.poll.closes_at);
  assert.equal((await vote(bob, timed.id, [timed.poll.options[0].id])).status, 200);
  sql("UPDATE polls SET closes_at = datetime('now', '-1 minute') WHERE message_id = ?", timed.id);
  assert.equal((await vote(bob, timed.id, [timed.poll.options[1].id])).status, 400);
  const shown = (await api.get(`/chats/${chat.id}/messages`, bob)).body.messages.find((m) => m.id === timed.id).poll;
  assert.equal(`${shown.open}/${summary(shown)}`, 'false/Sáng:1* Chiều:0', 'the votes stay');
});

test('a poll is neither edited nor forwarded; deleting its message removes it', async () => {
  const chat = await group(ann, [bob]);
  const other = await group(ann, [carl]);
  const created = await poll(ann, chat.id);
  assert.equal((await api.patch(`/chat-messages/${created.id}`, ann, { body: 'Khác' })).status, 400);
  assert.equal((await api.post(`/chat-messages/${created.id}/forward`, ann, { conversation_id: other.id })).status, 400);
  await api.delete(`/chat-messages/${created.id}`, ann);
  assert.equal((await api.get(`/chats/${chat.id}/messages`, bob)).body.messages.find((m) => m.id === created.id).poll, null);
});

test('muting for 1 or 8 hours ends by itself; without hours it lasts', async () => {
  const chat = await group(ann, [bob]);
  assert.equal((await api.post(`/chats/${chat.id}/mute`, bob, { muted: true, hours: 3 })).status, 400);
  assert.equal((await api.post(`/chats/${chat.id}/mute`, bob, { muted: true, hours: 1 })).status, 204);
  const muted = (await api.get(`/chats/${chat.id}`, bob)).body;
  assert.equal(`${muted.muted}/${Boolean(muted.muted_until)}`, 'true/true');
  await api.post(`/chats/${chat.id}/read`, bob);
  const before = await unreadChat(bob);
  await api.post(`/chats/${chat.id}/messages`, ann, { body: 'Tin khi đang tắt' });
  assert.equal(await unreadChat(bob), before);

  sql("UPDATE conversation_members SET muted_until = datetime('now', '-1 minute') WHERE conversation_id = ? AND user_id = ?", chat.id, bob.id);
  const over = (await api.get(`/chats/${chat.id}`, bob)).body;
  assert.equal(`${over.muted}/${over.muted_until}`, 'false/null');
  assert.equal(await unreadChat(bob), before + 1, 'counted again once the mute is over');

  await api.post(`/chats/${chat.id}/mute`, bob, { muted: true });
  assert.equal(`${(await api.get(`/chats/${chat.id}`, bob)).body.muted_until}`, 'null', 'until turned back on');
});

test('up to 5 conversations are pinned to the top of the user own list', async () => {
  const chats = [];
  for (let i = 0; i < 6; i++) chats.push(await group(bob, [carl], `P${i}`));
  for (const c of chats.slice(0, 5)) assert.equal((await api.post(`/chats/${c.id}/pin`, carl, { pinned: true })).status, 204);
  assert.equal((await api.post(`/chats/${chats[5].id}/pin`, carl, { pinned: true })).status, 400);

  await api.post(`/chats/${chats[5].id}/messages`, bob, { body: 'Mới nhất' });
  const list = (await api.get('/chats', carl)).body;
  assert.deepEqual(list.slice(0, 5).map((c) => c.pinned_chat), [true, true, true, true, true], 'pinned ones first');
  assert.equal(list[5].id, chats[5].id, 'then the latest');
  const one = (await api.get(`/chats/${chats[1].id}`, carl)).body;
  assert.equal(`${one.pinned_chat}/${Array.isArray(one.pinned)}`, 'true/true', 'the conversation pin, next to its pinned messages');
  assert.ok(!(await api.get('/chats', bob)).body.find((c) => c.id === chats[0].id).pinned_chat, "a pin is the user's own");

  const team = (await api.post(`/chats/team/${content}`, carl)).body;
  await api.post(`/chats/${chats[0].id}/pin`, carl, { pinned: false });
  await api.post(`/chats/${team.id}/pin`, carl, { pinned: true });
  assert.ok((await api.get('/chats', carl)).body.some((c) => c.id === team.id), 'a pinned chat shows even without messages');
});
