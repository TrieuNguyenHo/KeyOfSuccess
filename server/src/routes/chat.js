// Chat (v32, decided 2026-10-08): one-to-one conversations between people at work who hold chat.use, private to their
// two members. Only the author edits or deletes a message (a deleted one stays as "Tin nhắn đã bị xoá"); files go with
// a message, sent by its author right after posting it. Unread messages are counted on the Messages menu, never in the
// bell. Messages are kept 6 months (purgeMessages()).
import express from 'express';
import { db, transaction } from '../db.js';
import { MESSAGE_MAX, canChatWith, loadConversation, memberIds } from '../lib/chat.js';
import { badRequest, forbidden, notFound, requirePermission } from '../lib/http.js';
import { pushChat } from '../lib/live.js';
import { can } from '../lib/permissions.js';
import { AT_WORK, USER_SELECT, findUser, withUserTeams } from '../lib/users.js';
import { rawUpload, saveAttachment, sweepUploads, withCommentFiles } from '../lib/uploads.js';

const router = express.Router();
const PAGE_SIZE = 50;
const EXCERPT_LENGTH = 120;

router.use(['/chats', '/chat-messages'], requirePermission('chat.use'));

const MESSAGE_SELECT = `SELECT m.*, u.name AS user_name FROM messages m LEFT JOIN users u ON u.id = m.user_id`;
const messagesWithFiles = (rows) => withCommentFiles(rows, 'message_id');
const messageById = (id) => messagesWithFiles([db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(id)])[0];

// A conversation as one of its members sees it: the other person (as anyone sees them, no personal details), the last
// message, the unread count and whether a message can be sent now (the other person still at work, with chat.use).
function summaryOf(conversation, me) {
  const members = db.prepare('SELECT user_id, last_read_id FROM conversation_members WHERE conversation_id = ?').all(conversation.id);
  const mine = members.find((m) => m.user_id === me.id);
  const other = members.find((m) => m.user_id !== me.id);
  const person = other && findUser(other.user_id);
  const last = db
    .prepare(
      `SELECT m.id, m.user_id, m.body, m.created_at, m.deleted_at,
         EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id) AS has_files
       FROM messages m WHERE m.conversation_id = ? ORDER BY m.id DESC LIMIT 1`
    )
    .get(conversation.id);
  const unread = db
    .prepare('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND id > ? AND user_id IS NOT ? AND deleted_at IS NULL')
    .get(conversation.id, mine.last_read_id, me.id).n;
  return {
    id: conversation.id,
    kind: conversation.kind,
    last_message_at: conversation.last_message_at,
    other: person ? { id: person.id, name: person.name, role_name: person.role_name, team_name: person.team_name, status: person.status } : null,
    last_message: last ? { ...last, body: last.deleted_at ? '' : last.body.slice(0, EXCERPT_LENGTH), has_files: Boolean(last.has_files) } : null,
    unread,
    last_read_id: mine.last_read_id,
    other_last_read_id: other?.last_read_id ?? 0,
    can_send: Boolean(person && canChatWith(person.id)),
  };
}

// The people this user can start a conversation with.
router.get('/chats/people', (req, res) => {
  const people = db
    .prepare(`${USER_SELECT} WHERE ${AT_WORK} AND u.id != ? ORDER BY u.name`)
    .all(req.user.id)
    .filter((u) => can(u, 'chat.use'))
    .map(withUserTeams);
  res.json(people.map((u) => ({ id: u.id, name: u.name, role_name: u.role_name, team_name: u.team_name })));
});

// The user's conversations that have messages, latest first.
router.get('/chats', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.* FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id AND m.user_id = ?
       WHERE c.last_message_at IS NOT NULL ORDER BY c.last_message_at DESC, c.id DESC`
    )
    .all(req.user.id);
  res.json(rows.map((c) => summaryOf(c, req.user)));
});

// Body { user_id }: the conversation with that person, created on first use. It shows in their list only once it
// has a message.
router.post('/chats/direct', (req, res) => {
  const otherId = Number(req.body?.user_id);
  if (!Number.isInteger(otherId) || otherId === req.user.id || !canChatWith(otherId)) {
    return badRequest(res, 'Không nhắn tin được cho người này');
  }
  const key = [req.user.id, otherId].sort((a, b) => a - b).join(':');
  const conversation = transaction(() => {
    const found = db.prepare('SELECT * FROM conversations WHERE direct_key = ?').get(key);
    if (found) return found;
    const { lastInsertRowid } = db.prepare("INSERT INTO conversations (kind, direct_key) VALUES ('direct', ?)").run(key);
    const insert = db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)');
    insert.run(lastInsertRowid, req.user.id);
    insert.run(lastInsertRowid, otherId);
    return db.prepare('SELECT * FROM conversations WHERE id = ?').get(lastInsertRowid);
  });
  res.json(summaryOf(conversation, req.user));
});

router.get('/chats/:id', (req, res) => {
  const conversation = loadConversation(req, res, req.params.id);
  if (conversation) res.json(summaryOf(conversation, req.user));
});

// The latest PAGE_SIZE messages, or those before ?before=<id>, oldest first; has_more when older ones remain.
router.get('/chats/:id/messages', (req, res) => {
  const conversation = loadConversation(req, res, req.params.id);
  if (!conversation) return;
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const rows = db
    .prepare(`${MESSAGE_SELECT} WHERE m.conversation_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`)
    .all(conversation.id, before, PAGE_SIZE + 1);
  const page = rows.slice(0, PAGE_SIZE).reverse();
  res.json({ messages: messagesWithFiles(page).map(shown), has_more: rows.length > PAGE_SIZE });
});

// A deleted message keeps its place in the thread, nothing of what it said.
const shown = (m) => (m.deleted_at ? { ...m, body: '', attachments: [] } : m);

// Body { body, with_files }: the text may be left out when files follow, uploaded to /api/chat-messages/:id/attachments.
router.post('/chats/:id/messages', (req, res) => {
  const conversation = loadConversation(req, res, req.params.id);
  if (!conversation) return;
  const body = String(req.body?.body ?? '').trim();
  if (!body && !req.body?.with_files) return badRequest(res, 'Tin nhắn không được để trống');
  if (body.length > MESSAGE_MAX) return badRequest(res, 'Tin nhắn quá dài');
  const members = memberIds(conversation.id);
  if (members.some((id) => id !== req.user.id && !canChatWith(id))) return badRequest(res, 'Người này hiện không nhận được tin nhắn');
  const id = transaction(() => {
    const { lastInsertRowid } = db.prepare('INSERT INTO messages (conversation_id, user_id, body) VALUES (?, ?, ?)').run(conversation.id, req.user.id, body);
    db.prepare("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?").run(conversation.id);
    // What one writes counts as read.
    db.prepare('UPDATE conversation_members SET last_read_id = ? WHERE conversation_id = ? AND user_id = ?').run(lastInsertRowid, conversation.id, req.user.id);
    return lastInsertRowid;
  });
  pushChat(req, members, conversation.id);
  res.status(201).json(messageById(id));
});

// Marks the conversation read up to its last message. Both members are told: the user's other tabs update their
// counts, the other member's thread shows "Đã xem".
router.post('/chats/:id/read', (req, res) => {
  const conversation = loadConversation(req, res, req.params.id);
  if (!conversation) return;
  const { changes } = db
    .prepare(
      `UPDATE conversation_members SET last_read_id = (SELECT COALESCE(MAX(id), 0) FROM messages WHERE conversation_id = ?)
       WHERE conversation_id = ? AND user_id = ? AND last_read_id < (SELECT COALESCE(MAX(id), 0) FROM messages WHERE conversation_id = ?)`
    )
    .run(conversation.id, conversation.id, req.user.id, conversation.id);
  if (changes) pushChat(req, memberIds(conversation.id), conversation.id);
  res.status(204).end();
});

// Loads the message :id with its conversation (members only, else 404), not yet deleted.
function loadMessage(req, res) {
  const message = db.prepare('SELECT * FROM messages WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
  if (!message) {
    notFound(res);
    return null;
  }
  const conversation = loadConversation(req, res, message.conversation_id);
  return conversation && { message, conversation };
}

// Only the author edits; emptied text is fine while the message still has files.
router.patch('/chat-messages/:id', (req, res) => {
  const found = loadMessage(req, res);
  if (!found) return;
  const { message, conversation } = found;
  if (message.user_id !== req.user.id) return forbidden(res, 'Chỉ người viết mới sửa được nội dung này');
  const body = String(req.body?.body ?? '').trim();
  const hasFiles = db.prepare('SELECT 1 FROM attachments WHERE message_id = ?').get(message.id);
  if (!body && !hasFiles) return badRequest(res, 'Tin nhắn không được để trống');
  if (body.length > MESSAGE_MAX) return badRequest(res, 'Tin nhắn quá dài');
  db.prepare("UPDATE messages SET body = ?, edited_at = datetime('now') WHERE id = ?").run(body, message.id);
  pushChat(req, memberIds(conversation.id), conversation.id);
  res.json(messageById(message.id));
});

// Only the author deletes: the text and files go, the row stays as "Tin nhắn đã bị xoá".
router.delete('/chat-messages/:id', (req, res) => {
  const found = loadMessage(req, res);
  if (!found) return;
  const { message, conversation } = found;
  if (message.user_id !== req.user.id) return forbidden(res, 'Chỉ người viết mới xoá được nội dung này');
  transaction(() => {
    db.prepare("UPDATE messages SET body = '', deleted_at = datetime('now') WHERE id = ?").run(message.id);
    db.prepare('DELETE FROM attachments WHERE message_id = ?').run(message.id);
  });
  sweepUploads();
  pushChat(req, memberIds(conversation.id), conversation.id);
  res.status(204).end();
});

// Files sent with a message: only its author, right after posting it.
router.post('/chat-messages/:id/attachments', rawUpload, (req, res) => {
  const found = loadMessage(req, res);
  if (!found) return;
  if (found.message.user_id !== req.user.id) return forbidden(res, 'Chỉ người viết mới đính kèm file vào nội dung này');
  saveAttachment(req, res, { conversation: found.conversation, message_id: found.message.id });
});

export default router;
