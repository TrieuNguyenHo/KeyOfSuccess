// Chat (v32, decided 2026-10-08), shared by routes/chat.js, the attachment routes and the Messages count. Kinds:
// - direct: one-to-one, its two members in conversation_members;
// - group (v33): made by hand, members in conversation_members, run by owner_id (rename, remove people); anyone in it
//   adds people or leaves; when the owner leaves, the member who joined first takes over;
// - project (v33): whoever can open the project (projectAccess), like its comments;
// - team (v33): the people of the team.
// Project and team members come from those rules at each request, so leaving a project or team ends the access at
// once; their conversation_members rows only keep each person's read position and mute. Everyone holds chat.use and
// is at work. Private to the members: anyone else gets 404, Managers, Directors and root included. Messages are kept
// 6 months.
import { db } from '../db.js';
import { findProject, findTask, projectAccess, taskAccess } from './access.js';
import { notFound } from './http.js';
import { can } from './permissions.js';
import { isRoot } from './roles.js';
import { AT_WORK, activeUsers, findUser } from './users.js';
import { placeholders } from './util.js';

export const RETENTION_MONTHS = 6;
export const MESSAGE_MAX = 4000;
export const TITLE_MAX = 80;
// A task's page (#/task/12) or any screen with its side panel open (#/project/3/board?task=12, #/my?task=12).
const TASK_LINK_RE = /#\/(?:task\/(\d+)|[^\s#]*[?&]task=(\d+))/g;
const TASK_LINKS_MAX = 5;

// Someone who can take part in chat: at work (active, joined, not root) and holding chat.use.
const atWork = (u) => u.status === 'active' && u.joined && !isRoot(u) && can(u, 'chat.use');

// Whether a user (by id) can be messaged: at work and holding chat.use.
export function canChatWith(userId) {
  const user = db.prepare(`SELECT u.id, u.role FROM users u WHERE u.id = ? AND ${AT_WORK}`).get(userId);
  return Boolean(user && can(user, 'chat.use'));
}

const rowMembers = (conversationId) =>
  db
    .prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? ORDER BY rowid')
    .all(conversationId)
    .map((r) => findUser(r.user_id))
    .filter(Boolean);

// The people in a conversation now. Direct and group: everyone listed (someone locked since stays listed); project and
// team: those the rules let in.
export function memberUsers(conversation) {
  if (conversation.project_id) {
    const project = findProject(conversation.project_id);
    return activeUsers().filter((u) => atWork(u) && projectAccess(u, project));
  }
  if (conversation.team_id) return activeUsers().filter((u) => atWork(u) && u.team_ids.includes(conversation.team_id));
  return rowMembers(conversation.id);
}
export const memberIds = (conversation) => memberUsers(conversation).map((u) => u.id);
// The members who can be mentioned or told about a message: those at work.
export const reachableMembers = (conversation) => memberUsers(conversation).filter(atWork);

export function isMember(user, conversation) {
  if (conversation.project_id) {
    const project = findProject(conversation.project_id);
    return Boolean(project && projectAccess(user, project));
  }
  if (conversation.team_id) return user.team_ids.includes(conversation.team_id);
  return Boolean(db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversation.id, user.id));
}

export const findConversation = (id) => db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);

// Loads the conversation :id for one of its members; anyone else gets 404, as if it did not exist.
export function loadConversation(req, res, id) {
  const conversation = findConversation(id);
  if (!conversation || !isMember(req.user, conversation)) {
    notFound(res);
    return null;
  }
  return conversation;
}

// Every conversation the user is in (with or without messages).
export function conversationsOf(user) {
  return db
    .prepare(
      `SELECT c.* FROM conversations c
       WHERE c.project_id IS NOT NULL OR c.team_id IN (${placeholders(user.team_ids)})
         OR (c.project_id IS NULL AND c.team_id IS NULL
           AND EXISTS (SELECT 1 FROM conversation_members m WHERE m.conversation_id = c.id AND m.user_id = ?))`
    )
    .all(...user.team_ids, user.id)
    .filter((c) => !c.project_id || isMember(user, c));
}

// A member's read position and mute; nothing stored yet reads as nothing read, not muted.
export const stateOf = (conversationId, userId) =>
  db.prepare('SELECT last_read_id, muted FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(conversationId, userId) ?? {
    last_read_id: 0,
    muted: 0,
  };
// Project and team members get their row when they first read, mute or write there.
export const ensureState = (conversationId, userId) =>
  db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)').run(conversationId, userId);

// The others' messages after the user's read position, and how many of them mention the user.
export function unreadOf(conversationId, userId, lastReadId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS unread, COALESCE(SUM(body LIKE ?), 0) AS mentions FROM messages
       WHERE conversation_id = ? AND id > ? AND user_id IS NOT ? AND deleted_at IS NULL`
    )
    .get(`%](${userId})%`, conversationId, lastReadId, userId);
}

// The count on the Messages menu: unread messages, of muted conversations only those that mention the user.
export function totalUnread(user) {
  if (!can(user, 'chat.use')) return 0;
  return conversationsOf(user).reduce((sum, c) => {
    const state = stateOf(c.id, user.id);
    const { unread, mentions } = unreadOf(c.id, user.id, state.last_read_id);
    return sum + (state.muted ? mentions : unread);
  }, 0);
}

// The tasks a message links to (#/task/12), as this reader may see them: a link to a task they cannot see shows
// nothing of it.
export function taskLinks(body, user) {
  const ids = [...new Set([...body.matchAll(TASK_LINK_RE)].map((m) => Number(m[1] ?? m[2])))].slice(0, TASK_LINKS_MAX);
  return ids
    .map((id) => findTask(id))
    .filter((task) => task && taskAccess(user, task))
    .map((t) => ({ id: t.id, title: t.title, completed: Boolean(t.completed), project_name: t.project_name, project_color: t.project_color }));
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
