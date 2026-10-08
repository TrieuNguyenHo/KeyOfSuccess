// Chat, part 4 (v36): @tất cả, pinned messages, search, jumping to a message, a conversation's images / files / links,
// forwarding, and copying a message's files to a task.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api;
let boss, ann, bob, carl, content, project, section, requirement;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  content = await api.team(boss, 'Content');
  const design = await api.team(boss, 'Design');
  ann = await api.approve(boss, 'ann', { team: content });
  bob = await api.approve(boss, 'bob', { team: content });
  carl = await api.approve(boss, 'carl', { team: design });
  project = (await api.project(boss, { name: 'Tết', team_ids: [content], add_team: true })).id;
  requirement = await api.requirement(boss, project, 'Landing');
  section = await api.firstSection(boss, project);
});
after(() => server.stop());

const group = async (as, people, title = 'G') => (await api.post('/chats/group', as, { title, user_ids: people.map((p) => p.id) })).body;
const send = async (as, chatId, body, extra = {}) => {
  const res = await api.post(`/chats/${chatId}/messages`, as, { body, ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
};
const listed = async (as, id) => (await api.get('/chats', as)).body.find((c) => c.id === id);
const unreadChat = async (as) => (await api.get('/notifications', as)).body.unreadChat;

async function upload(as, messageId, name, type) {
  const res = await fetch(`${server.url}/chat-messages/${messageId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${as.token}`, 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name), 'X-File-Type': type },
    body: Buffer.from(`${name} bytes`),
  });
  return res.json();
}
const download = (as, id) => fetch(`${server.url}/attachments/${id}`, { headers: { Authorization: `Bearer ${as.token}` } });

test('@tất cả mentions everyone in a group, even a muted one; in a one-to-one chat it stays plain text', async () => {
  const chat = await group(ann, [bob, carl]);
  await api.post(`/chats/${chat.id}/read`, bob);
  await api.post(`/chats/${chat.id}/mute`, bob, { muted: true });
  const before = await unreadChat(bob);
  const message = await send(ann, chat.id, '@[tất cả](0) họp lúc 3h');
  assert.equal(message.body, '@[all](0) họp lúc 3h', 'stored the same whatever the sender typed');
  assert.equal((await listed(bob, chat.id)).mentioned, true);
  assert.equal(await unreadChat(bob), before + 1, 'counted although muted');

  const direct = (await api.post('/chats/direct', ann, { user_id: bob.id })).body;
  assert.equal((await send(ann, direct.id, '@[everyone](0) xin chào')).body, '@all xin chào');
});

test('anyone in the conversation pins and unpins; a line says so; a deleted message leaves the pins', async () => {
  const chat = await group(ann, [bob]);
  const message = await send(ann, chat.id, 'Brief: banner 1200x628, hạn thứ 6');
  assert.equal((await api.post(`/chat-messages/${message.id}/pin`, bob, { pinned: true })).status, 200);
  const pinned = (await api.get(`/chats/${chat.id}`, ann)).body.pinned;
  assert.deepEqual(pinned.map((p) => `${p.id}/${p.user_name}/${p.pinned_by_name}`), [`${message.id}/ann/bob`]);
  const lines = (await api.get(`/chats/${chat.id}/messages`, ann)).body.messages.filter((m) => m.kind === 'system').map((m) => m.data.event);
  assert.deepEqual(lines.slice(-1), ['pinned']);
  assert.equal((await api.post(`/chat-messages/${message.id}/pin`, carl, { pinned: false })).status, 404, 'not in the conversation');

  assert.equal((await api.post(`/chat-messages/${message.id}/pin`, ann, { pinned: false })).status, 200);
  assert.deepEqual((await api.get(`/chats/${chat.id}`, ann)).body.pinned, []);
  await api.post(`/chat-messages/${message.id}/pin`, ann, { pinned: true });
  await api.delete(`/chat-messages/${message.id}`, ann);
  assert.deepEqual((await api.get(`/chats/${chat.id}`, bob)).body.pinned, []);
});

test('search finds words with or without accents, in the user own conversations only', async () => {
  const chat = await group(ann, [bob], 'Thiết kế');
  const hit = await send(ann, chat.id, 'Thiết kế banner Tết cho Đức');
  const gone = await send(ann, chat.id, 'Thiết kế cũ');
  await api.delete(`/chat-messages/${gone.id}`, ann);
  const found = (await api.get(`/chats/search?q=${encodeURIComponent('thiet ke')}`, bob)).body;
  assert.deepEqual(found.map((m) => m.id), [hit.id], 'the deleted one is not found');
  assert.equal(`${found[0].conversation.title}/${found[0].user_name}`, 'Thiết kế/ann');
  assert.equal((await api.get(`/chats/search?q=duc`, bob)).body.length, 1, 'đ reads as d');
  assert.deepEqual((await api.get(`/chats/search?q=${encodeURIComponent('thiet ke')}`, carl)).body, []);
  assert.deepEqual((await api.get(`/chats/search?q=t`, bob)).body, [], 'too short');
  assert.deepEqual((await api.get(`/chats/search?q=50%25`, bob)).body, [], '% is a character, not a wildcard');
  const other = await group(ann, [bob]);
  await send(ann, other.id, 'Thiết kế khác');
  assert.equal((await api.get(`/chats/search?q=thiet&conversation=${chat.id}`, bob)).body.length, 1);
});

test('?around= loads a few messages before the one jumped to and everything from it on', async () => {
  const chat = await group(ann, [bob]);
  const ids = [];
  for (let i = 1; i <= 60; i++) ids.push((await send(ann, chat.id, `Tin ${i}`)).id);
  const page = (await api.get(`/chats/${chat.id}/messages?around=${ids[39]}`, bob)).body;
  assert.equal(page.messages.find((m) => m.kind !== 'system').body, 'Tin 15');
  assert.equal(page.messages.at(-1).body, 'Tin 60');
  assert.equal(page.has_more, true);
});

test('a conversation lists its images, other files and links', async () => {
  const chat = await group(ann, [bob]);
  const withFiles = await send(ann, chat.id, '', { with_files: true });
  await upload(ann, withFiles.id, 'banner.png', 'image/png');
  await upload(ann, withFiles.id, 'brief.pdf', 'application/pdf');
  await send(bob, chat.id, 'Xem https://example.com/a và https://example.com/b');
  const media = (await api.get(`/chats/${chat.id}/media`, ann)).body;
  assert.deepEqual(media.images.map((f) => f.name), ['banner.png']);
  assert.deepEqual(media.files.map((f) => f.name), ['brief.pdf']);
  assert.deepEqual(media.links.map((l) => `${l.user_name} ${l.url}`), ['bob https://example.com/a', 'bob https://example.com/b']);
  assert.equal((await api.get(`/chats/${chat.id}/media`, carl)).status, 404);
});

test('forwarding copies the text and files, says only "forwarded", and keeps mentions of the new members only', async () => {
  const from = await group(ann, [bob]);
  const to = await group(ann, [carl]);
  const original = await send(ann, from.id, `Gửi @[bob](${bob.id}) brief`, { with_files: true });
  const file = await upload(ann, original.id, 'brief.pdf', 'application/pdf');
  const res = await api.post(`/chat-messages/${original.id}/forward`, ann, { conversation_id: to.id });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(`${res.body.forwarded}/${res.body.body}/${res.body.attachments.length}`, '1/Gửi @bob brief/1');
  assert.notEqual(res.body.attachments[0].id, file.id);

  await api.delete(`/chat-messages/${original.id}`, ann);
  assert.equal((await download(carl, res.body.attachments[0].id)).status, 200, 'the copy outlives the original');
  assert.equal((await api.post(`/chat-messages/${res.body.id}/forward`, carl, { conversation_id: from.id })).status, 404, 'carl is not in the first group');
  const line = (await api.get(`/chats/${to.id}/messages`, ann)).body.messages.find((m) => m.kind === 'system');
  assert.equal((await api.post(`/chat-messages/${line.id}/forward`, ann, { conversation_id: from.id })).status, 404);
});

test("a message's files are copied to a task the user may edit", async () => {
  const chat = await group(ann, [bob, carl]);
  const message = await send(ann, chat.id, 'Ảnh tham khảo', { with_files: true });
  await upload(ann, message.id, 'ref.png', 'image/png');
  const task = (await api.post('/tasks', ann, { section_id: section, requirement_id: requirement, title: 'Ảnh tham khảo' })).body;
  const res = await api.post(`/chat-messages/${message.id}/copy-files`, ann, { task_id: task.id });
  assert.equal(`${res.status}/${res.body.copied}`, '200/1');
  const files = (await api.get(`/tasks/${task.id}`, ann)).body.attachments;
  assert.deepEqual(files.map((f) => f.name), ['ref.png']);
  assert.equal((await api.post(`/chat-messages/${message.id}/copy-files`, carl, { task_id: task.id })).status, 404, 'carl cannot see the task');
  assert.equal((await api.post(`/chat-messages/${message.id}/copy-files`, bob, { task_id: task.id })).status, 403, 'bob sees it but may not edit it');
});
