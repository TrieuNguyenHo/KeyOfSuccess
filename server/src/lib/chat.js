// Chat (v32, decided 2026-10-08): one-to-one conversations between people at work who hold chat.use. Private: only
// the two members read a conversation (anyone else gets 404, Managers, Directors and root included). Messages are kept
// 6 months. Shared by routes/chat.js and the attachment routes (files sent in a message).
import { db } from '../db.js';
import { notFound } from './http.js';
import { can } from './permissions.js';
import { AT_WORK } from './users.js';

export const RETENTION_MONTHS = 6;
export const MESSAGE_MAX = 4000;

// Whether this user may chat with someone: at work (active, joined, not root) and holding chat.use.
export function canChatWith(userId) {
  const user = db.prepare(`SELECT u.id, u.role FROM users u WHERE u.id = ? AND ${AT_WORK}`).get(userId);
  return Boolean(user && can(user, 'chat.use'));
}

export const memberIds = (conversationId) =>
  db
    .prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?')
    .all(conversationId)
    .map((r) => r.user_id);

// Loads the conversation :id for one of its members; anyone else gets 404, as if it did not exist.
export function loadConversation(req, res, id) {
  const conversation = db
    .prepare(
      `SELECT c.* FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id AND m.user_id = ?
       WHERE c.id = ?`
    )
    .get(req.user.id, id);
  if (!conversation) {
    notFound(res);
    return null;
  }
  return conversation;
}

// Messages older than RETENTION_MONTHS go, their files with them (sweepUploads() removes the bytes), and so do the
// conversations left with none.
export function purgeMessages() {
  const cutoff = `datetime('now', '-${RETENTION_MONTHS} months')`;
  db.prepare(`DELETE FROM messages WHERE created_at < ${cutoff}`).run();
  db.prepare(
    `DELETE FROM conversations WHERE COALESCE(last_message_at, created_at) < ${cutoff}
     AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = conversations.id)`
  ).run();
}
