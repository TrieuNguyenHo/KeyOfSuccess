// Chat (v32): one-to-one conversations between people at work who hold chat.use, private to their two members.
// Only the author edits or deletes a message; files go with a message. Unread messages are counted outside the bell.
// Messages are kept 6 months.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { listen, startServer, wait } from './helpers.js';

const SETTLE_MS = 300; // time for a pushed event to arrive

let server, api;
let root, boss, chief, ann, bob, carl, content;

before(async () => {
  server = await startServer();
  api = server.api;
  root = await api.root();
  boss = await api.manager();
  chief = await api.director();
  content = await api.team(boss, 'Content');
  ann = await api.approve(boss, 'ann', { team: content });
  bob = await api.approve(boss, 'bob', { team: content });
  carl = await api.approve(boss, 'carl', { team: content });
});
after(() => server.stop());

const open = async (as, other) => {
  const res = await api.post('/chats/direct', as, { user_id: other.id });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
};
const send = async (as, chatId, body = 'Chào bạn', extra = {}) => {
  const res = await api.post(`/chats/${chatId}/messages`, as, { body, ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
};
const unreadChat = async (as) => (await api.get('/notifications', as)).body.unreadChat;
const messagesOf = async (as, chatId, query = '') => (await api.get(`/chats/${chatId}/messages${query}`, as)).body;

async function upload(as, path, name = 'shot.png') {
  const res = await fetch(`${server.url}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${as.token}`,
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent(name),
      'X-File-Type': 'image/png',
    },
    body: Buffer.from('png bytes'),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('two people chat: one conversation per pair, listed once it has a message, counted outside the bell', async () => {
  const chat = await open(ann, bob);
  assert.equal(chat.other.id, bob.id);
  assert.equal((await open(bob, ann)).id, chat.id, 'the same conversation from both sides');
  assert.ok(!(await api.get('/chats', bob)).body.some((c) => c.id === chat.id), 'no message yet');

  const stream = listen(server.url, bob);
  await wait(SETTLE_MS);
  const bell = (await api.get('/notifications', bob)).body.unread;
  const message = await send(ann, chat.id, 'Xin chào Bob');
  await wait(SETTLE_MS);
  await stream.close();
  assert.ok(stream.events.includes('chat'), 'pushed live to the other member');
  assert.equal(message.user_name, 'ann');

  const listed = (await api.get('/chats', bob)).body.find((c) => c.id === chat.id);
  assert.equal(`${listed.other.name}/${listed.last_message.body}/${listed.unread}/${listed.can_send}`, 'ann/Xin chào Bob/1/true');
  assert.equal(await unreadChat(bob), 1);
  assert.equal(await unreadChat(ann), 0, 'what one writes counts as read');
  assert.equal((await api.get('/notifications', bob)).body.unread, bell, 'the bell holds the work only');

  assert.equal((await api.post(`/chats/${chat.id}/read`, bob)).status, 204);
  assert.equal(await unreadChat(bob), 0);
  assert.equal((await api.get(`/chats/${chat.id}`, ann)).body.other_last_read_id, message.id);
});

test('a conversation is private to its two members: Managers, the Director and root included', async () => {
  const chat = await open(ann, bob);
  for (const as of [carl, boss, chief]) {
    assert.equal((await api.get(`/chats/${chat.id}`, as)).status, 404);
    assert.equal((await api.get(`/chats/${chat.id}/messages`, as)).status, 404);
    assert.equal((await api.post(`/chats/${chat.id}/messages`, as, { body: 'x' })).status, 404);
    assert.ok(!(await api.get('/chats', as)).body.some((c) => c.id === chat.id));
  }
  const message = (await messagesOf(ann, chat.id)).messages[0];
  assert.equal((await api.patch(`/chat-messages/${message.id}`, carl, { body: 'x' })).status, 404);
  assert.equal((await api.get('/chats', root)).status, 403);
  assert.equal((await api.get(`/chats/${chat.id}`, root)).status, 403);
  assert.ok(!(await api.get('/chats/people', ann)).body.some((p) => p.id === root.id), 'root is nobody to chat with');
});

test('only people at work can be chatted with; a locked person stops receiving', async () => {
  const pending = await api.user('pending');
  await api.post('/admin/users', boss, { email: 'invited@t.test', name: 'Invited', team_id: content });
  const people = (await api.get('/chats/people', ann)).body.map((p) => p.name);
  assert.ok(people.includes('bob') && people.includes('boss'));
  for (const name of ['ann', 'pending', 'Invited']) assert.ok(!people.includes(name), name);
  for (const user_id of [ann.id, pending.id, 999999, 'x']) {
    assert.equal((await api.post('/chats/direct', ann, { user_id })).status, 400, String(user_id));
  }

  const chat = await open(ann, carl);
  await send(ann, chat.id, 'Trước khi khoá');
  await api.patch(`/admin/users/${carl.id}`, boss, { status: 'disabled' });
  assert.equal((await api.post(`/chats/${chat.id}/messages`, ann, { body: 'Sau khi khoá' })).status, 400);
  assert.equal((await api.get(`/chats/${chat.id}`, ann)).body.can_send, false);
  assert.equal((await messagesOf(ann, chat.id)).messages.length, 1, 'the old messages stay readable');
  await api.patch(`/admin/users/${carl.id}`, boss, { status: 'active' });
  await send(ann, chat.id, 'Mở khoá rồi');
});

test('chat.use is a permission: without it there is no chat', async () => {
  const chat = await open(ann, bob);
  const set = (scope) => api.patch('/admin/permissions', root, { role: 'member', permission: 'chat.use', scope });
  assert.equal((await set('none')).status, 200);
  try {
    assert.equal((await api.get('/chats', ann)).status, 403);
    assert.equal((await api.get(`/chats/${chat.id}/messages`, ann)).status, 403);
    assert.ok(!(await api.get('/chats/people', boss)).body.some((p) => p.id === ann.id));
    assert.equal(await unreadChat(ann), 0);
  } finally {
    await set('all');
  }
});

test('only the author edits or deletes a message; a deleted one keeps its place, not its text', async () => {
  const chat = await open(ann, bob);
  const message = await send(ann, chat.id, 'Bản đầu');
  assert.equal((await api.patch(`/chat-messages/${message.id}`, bob, { body: 'Sửa giùm' })).status, 403);
  assert.equal((await api.delete(`/chat-messages/${message.id}`, bob)).status, 403);
  assert.equal((await api.patch(`/chat-messages/${message.id}`, ann, { body: ' ' })).status, 400);
  const edited = await api.patch(`/chat-messages/${message.id}`, ann, { body: 'Bản sửa' });
  assert.equal(`${edited.body.body}/${Boolean(edited.body.edited_at)}`, 'Bản sửa/true');

  assert.equal((await api.delete(`/chat-messages/${message.id}`, ann)).status, 204);
  const shown = (await messagesOf(bob, chat.id)).messages.find((m) => m.id === message.id);
  assert.equal(`${shown.body}/${Boolean(shown.deleted_at)}`, '/true');
  assert.equal((await api.patch(`/chat-messages/${message.id}`, ann, { body: 'Lại' })).status, 404);
  assert.equal((await api.delete(`/chat-messages/${message.id}`, ann)).status, 404);

  assert.equal((await api.post(`/chats/${chat.id}/messages`, ann, { body: '' })).status, 400);
  assert.equal((await api.post(`/chats/${chat.id}/messages`, ann, { body: 'x'.repeat(4001) })).status, 400);
});

test('files go with a message: its members see them, only the uploader deletes, deleting the message removes them', async () => {
  const chat = await open(ann, bob);
  const message = await send(ann, chat.id, '', { with_files: true });
  assert.equal((await upload(bob, `/chat-messages/${message.id}/attachments`)).status, 403, 'only the author attaches');
  const file = (await upload(ann, `/chat-messages/${message.id}/attachments`)).body;
  assert.equal(file.message_id, message.id);
  assert.equal((await messagesOf(bob, chat.id)).messages.find((m) => m.id === message.id).attachments.length, 1);
  assert.equal((await api.get('/chats', bob)).body.find((c) => c.id === chat.id).last_message.has_files, true);

  const download = (as) => fetch(`${server.url}/attachments/${file.id}`, { headers: { Authorization: `Bearer ${as.token}` } });
  assert.equal((await download(bob)).status, 200);
  for (const as of [carl, boss, root]) assert.equal((await download(as)).status, 404);
  assert.equal((await api.delete(`/attachments/${file.id}`, bob)).status, 403);

  const files = readdirSync(server.uploadDir).length;
  assert.equal((await api.delete(`/chat-messages/${message.id}`, ann)).status, 204);
  assert.equal(readdirSync(server.uploadDir).length, files - 1);
  assert.equal((await download(bob)).status, 404);
});

test('messages come 50 at a time, older ones with ?before', async () => {
  const chat = await open(boss, bob);
  for (let i = 1; i <= 55; i++) await send(i % 2 ? boss : bob, chat.id, `Tin ${i}`);
  const latest = await messagesOf(bob, chat.id);
  assert.equal(`${latest.messages.length}/${latest.has_more}`, '50/true');
  assert.equal(latest.messages.at(-1).body, 'Tin 55', 'oldest first, ending with the latest');
  const older = await messagesOf(bob, chat.id, `?before=${latest.messages[0].id}`);
  assert.equal(`${older.messages.length}/${older.has_more}/${older.messages[0].body}`, '5/false/Tin 1');
});

test('messages older than 6 months are deleted, and conversations left without any', async () => {
  const chat = await open(carl, bob);
  await send(carl, chat.id, 'Cũ');
  const recent = await send(carl, (await open(carl, boss)).id, 'Mới');
  const db = new DatabaseSync(server.dbPath);
  db.prepare("UPDATE messages SET created_at = datetime('now', '-7 months') WHERE conversation_id = ?").run(chat.id);
  db.prepare("UPDATE conversations SET last_message_at = datetime('now', '-7 months') WHERE id = ?").run(chat.id);
  db.close();
  // Purging runs at startup (then daily): start another server on a copy of the database.
  const later = await startServer({
    prepareDb(path) {
      const from = new DatabaseSync(server.dbPath);
      from.exec(`VACUUM INTO '${path}'`);
      from.close();
    },
  });
  try {
    const db2 = new DatabaseSync(later.dbPath);
    const count = (sql, ...args) => db2.prepare(sql).get(...args).n;
    assert.equal(count('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?', chat.id), 0);
    assert.equal(count('SELECT COUNT(*) AS n FROM conversations WHERE id = ?', chat.id), 0);
    assert.equal(count('SELECT COUNT(*) AS n FROM messages WHERE id = ?', recent.id), 1);
    db2.close();
  } finally {
    await later.stop();
  }
});

test('the v32 and v33 migrations keep every file of a v31 database', async () => {
  const task = await api.task(boss, await taskTarget());
  const file = (await upload(boss, `/tasks/${task}/attachments`)).body;
  const old = await startServer({
    prepareDb(path) {
      const from = new DatabaseSync(server.dbPath);
      from.exec(`VACUUM INTO '${path}'`);
      from.close();
      // The attachments table as v31 left it: no message_id.
      const db = new DatabaseSync(path);
      db.exec(`
        DELETE FROM attachments WHERE message_id IS NOT NULL;
        CREATE TABLE attachments_v31 (
          id INTEGER PRIMARY KEY,
          task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
          requirement_id INTEGER REFERENCES requirements(id) ON DELETE CASCADE,
          feedback_id INTEGER REFERENCES feedback(id) ON DELETE CASCADE,
          comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
          requirement_comment_id INTEGER REFERENCES requirement_comments(id) ON DELETE CASCADE,
          feedback_message_id INTEGER REFERENCES feedback_messages(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, stored_name TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          CHECK ((task_id IS NOT NULL) + (requirement_id IS NOT NULL) + (feedback_id IS NOT NULL) = 1)
        );
        INSERT INTO attachments_v31 SELECT id, task_id, requirement_id, feedback_id, comment_id, requirement_comment_id,
          feedback_message_id, user_id, name, mime, size, stored_name, created_at FROM attachments;
        DROP TABLE attachments;
        ALTER TABLE attachments_v31 RENAME TO attachments;
        DROP TABLE messages; DROP TABLE conversation_members; DROP TABLE conversations;
        PRAGMA user_version = 31;
      `);
      db.close();
    },
  });
  try {
    const db = new DatabaseSync(old.dbPath);
    try {
      assert.equal(db.prepare('PRAGMA user_version').get().user_version, 33);
      const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(file.id);
      assert.equal(`${row.task_id}/${row.name}/${row.message_id}`, `${task}/shot.png/null`);
      assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
    } finally {
      db.close();
    }
    const boss2 = await old.api.manager();
    const bob2 = await old.api.user('bob');
    const chat = (await old.api.post('/chats/direct', boss2, { user_id: bob2.id })).body;
    assert.equal((await old.api.post(`/chats/${chat.id}/messages`, boss2, { body: 'Sau khi nâng cấp' })).status, 201);
  } finally {
    await old.stop();
  }
});

async function taskTarget() {
  const project = (await api.project(boss, { name: 'Chat files' })).id;
  return { section: await api.firstSection(boss, project), requirement: await api.requirement(boss, project) };
}
