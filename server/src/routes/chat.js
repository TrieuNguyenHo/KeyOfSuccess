// Chat (v32, decided 2026-10-08; groups, project and team chats, muting, answers and task links since v33). Who is in
// which conversation: lib/chat.js. Only the author edits or deletes a message (a deleted one stays as "Tin nhắn đã bị
// xoá"); files go with a message, sent by its author right after posting it. @mentions reach members only. Unread
// messages are counted on the Messages menu, never in the bell. Messages are kept 6 months (purgeMessages()).
import express from 'express';
import { db, transaction } from '../db.js';
import { findProject, projectAccess } from '../lib/access.js';
import {
  MESSAGE_MAX,
  TITLE_MAX,
  canChatWith,
  conversationsOf,
  ensureState,
  findConversation,
  loadConversation,
  memberIds,
  memberUsers,
  reachableMembers,
  stateOf,
  taskLinks,
  unreadOf,
} from '../lib/chat.js';
import { badRequest, forbidden, notFound, requirePermission } from '../lib/http.js';
import { pushChat } from '../lib/live.js';
import { plainExcerpt, resolveMentions } from '../lib/mentions.js';
import { can } from '../lib/permissions.js';
import { AT_WORK, USER_SELECT, findUser, withUserTeams } from '../lib/users.js';
import { rawUpload, saveAttachment, sweepUploads, withCommentFiles } from '../lib/uploads.js';

const router = express.Router();
const PAGE_SIZE = 50;
const EXCERPT_LENGTH = 120;

router.use(['/chats', '/chat-messages'], requirePermission('chat.use'));

const MESSAGE_SELECT = `SELECT m.*, u.name AS user_name, r.user_id AS reply_user_id, ru.name AS reply_user_name,
    r.body AS reply_body, r.deleted_at AS reply_deleted_at
  FROM messages m LEFT JOIN users u ON u.id = m.user_id
  LEFT JOIN messages r ON r.id = m.reply_to_id LEFT JOIN users ru ON ru.id = r.user_id`;

// A message as this reader sees it: the message it answers (a short excerpt), the tasks it links to that the reader
// may see; a deleted message keeps its place, nothing of what it said.
function shown(row, reader) {
  const { reply_user_id, reply_user_name, reply_body, reply_deleted_at, ...m } = row;
  const reply = m.reply_to_id
    ? { id: m.reply_to_id, user_id: reply_user_id, user_name: reply_user_name, body: reply_deleted_at ? '' : plainExcerpt(reply_body), deleted: Boolean(reply_deleted_at) }
    : null;
  if (m.deleted_at) return { ...m, body: '', attachments: [], reply: null, tasks: [] };
  return { ...m, reply, tasks: taskLinks(m.body, reader) };
}
const messagesFor = (rows, reader) => withCommentFiles(rows, 'message_id').map((m) => shown(m, reader));
const messageById = (id, reader) => messagesFor([db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(id)], reader)[0];

const personOf = (u) => ({ id: u.id, name: u.name, role_name: u.role_name, team_name: u.team_name, status: u.status });

// A conversation as one of its members sees it. Direct: the other person (as anyone sees them, no personal details)
// and how far they have read. Group: title, owner. Project / team: which one. withMembers adds the member list.
function summaryOf(c, me, { withMembers = false } = {}) {
  const state = stateOf(c.id, me.id);
  const { unread, mentions } = unreadOf(c.id, me.id, state.last_read_id);
  const last = db
    .prepare(
      `SELECT m.id, m.user_id, u.name AS user_name, m.body, m.created_at, m.deleted_at,
         EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id) AS has_files
       FROM messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.conversation_id = ? ORDER BY m.id DESC LIMIT 1`
    )
    .get(c.id);
  const summary = {
    id: c.id,
    kind: c.kind,
    title: c.title,
    created_at: c.created_at,
    last_message_at: c.last_message_at,
    last_message: last ? { ...last, body: last.deleted_at ? '' : plainExcerpt(last.body).slice(0, EXCERPT_LENGTH), has_files: Boolean(last.has_files) } : null,
    unread,
    mentioned: mentions > 0,
    muted: Boolean(state.muted),
    last_read_id: state.last_read_id,
    can_send: true,
  };
  if (c.kind === 'direct') {
    const other = db.prepare('SELECT user_id, last_read_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?').get(c.id, me.id);
    const person = other && findUser(other.user_id);
    Object.assign(summary, {
      other: person ? personOf(person) : null,
      other_last_read_id: other?.last_read_id ?? 0,
      can_send: Boolean(person && canChatWith(person.id)),
    });
  } else if (c.kind === 'group') {
    Object.assign(summary, { owner_id: c.owner_id, is_owner: c.owner_id === me.id });
  } else if (c.project_id) {
    const project = findProject(c.project_id);
    Object.assign(summary, { title: project.name, project: { id: project.id, name: project.name, color: project.color } });
  } else {
    const team = db.prepare('SELECT id, name FROM teams WHERE id = ?').get(c.team_id);
    Object.assign(summary, { title: team.name, team });
  }
  if (withMembers) {
    summary.members = memberUsers(c).map((u) => ({ ...personOf(u), owner: c.kind === 'group' && u.id === c.owner_id, at_work: canChatWith(u.id) }));
  }
  return summary;
}

// The user ids of a request body, unique, not the user, every one someone who can be messaged; else null.
function chattableIds(value, me) {
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.map(Number))];
  if (ids.some((id) => !Number.isInteger(id) || id === me.id || !canChatWith(id))) return null;
  return ids;
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

// The project and team chats the user can open: the projects they can open, their teams.
router.get('/chats/rooms', (req, res) => {
  const projects = db
    .prepare('SELECT id FROM projects ORDER BY name')
    .all()
    .map((r) => findProject(r.id))
    .filter((p) => projectAccess(req.user, p))
    .map(({ id, name, color }) => ({ id, name, color }));
  res.json({ projects, teams: req.user.teams });
});

// The user's conversations: those with messages, and the groups they are in; latest first.
router.get('/chats', (req, res) => {
  const list = conversationsOf(req.user)
    .filter((c) => c.last_message_at || c.kind === 'group')
    .sort((a, b) => (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at) || b.id - a.id);
  res.json(list.map((c) => summaryOf(c, req.user)));
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
    return findConversation(lastInsertRowid);
  });
  res.json(summaryOf(conversation, req.user));
});

// Body { title, user_ids }: a group of the user (its owner) and those people.
router.post('/chats/group', (req, res) => {
  const title = String(req.body?.title ?? '').trim();
  if (!title) return badRequest(res, 'Cần đặt tên nhóm');
  if (title.length > TITLE_MAX) return badRequest(res, 'Tên nhóm quá dài');
  const ids = chattableIds(req.body?.user_ids, req.user);
  if (!ids?.length) return badRequest(res, 'Chọn ít nhất một người nhắn tin được');
  const conversation = transaction(() => {
    const { lastInsertRowid } = db.prepare("INSERT INTO conversations (kind, title, owner_id) VALUES ('group', ?, ?)").run(title, req.user.id);
    const insert = db.prepare('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)');
    for (const id of [req.user.id, ...ids]) insert.run(lastInsertRowid, id);
    return findConversation(lastInsertRowid);
  });
  pushChat(req, memberIds(conversation), conversation.id);
  res.status(201).json(summaryOf(conversation, req.user, { withMembers: true }));
});

// The conversation of a project or team, created on first use; anyone in it opens it (else 404).
function openRoom(req, res, column, id, allowed) {
  if (!allowed) return notFound(res);
  const kind = column === 'project_id' ? 'project' : 'team';
  const conversation = transaction(() => {
    db.prepare(`INSERT OR IGNORE INTO conversations (kind, ${column}) VALUES (?, ?)`).run(kind, id);
    return db.prepare(`SELECT * FROM conversations WHERE ${column} = ?`).get(id);
  });
  res.json(summaryOf(conversation, req.user));
}
router.post('/chats/project/:projectId', (req, res) => {
  const project = findProject(req.params.projectId);
  openRoom(req, res, 'project_id', project?.id, project && projectAccess(req.user, project));
});
router.post('/chats/team/:teamId', (req, res) => {
  const id = Number(req.params.teamId);
  openRoom(req, res, 'team_id', id, req.user.team_ids.includes(id));
});

router.get('/chats/:id', (req, res) => {
  const conversation = loadConversation(req, res, req.params.id);
  if (conversation) res.json(summaryOf(conversation, req.user, { withMembers: true }));
});

// Body { title }: only the owner renames a group.
router.patch('/chats/:id', (req, res) => {
  const conversation = loadConversation(req, res, req.params.id);
  if (!conversation) return;
  if (conversation.kind !== 'group') return badRequest(res, 'Chỉ đổi tên được nhóm tự tạo');
  if (conversation.owner_id !== req.user.id) return forbidden(res, 'Chỉ người quản lý nhóm mới đổi được tên nhóm');
  const title = String(req.body?.title ?? '').trim();
  if (!title) return badRequest(res, 'Cần đặt tên nhóm');
  if (title.length > TITLE_MAX) return badRequest(res, 'Tên nhóm quá dài');
  db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title, conversation.id);
  pushChat(req, memberIds(conversation), conversation.id);
  res.json(summaryOf({ ...conversation, title }, req.user, { withMembers: true }));
});

// Body { muted }: a muted conversation is not counted on the Messages menu, except mentions of the user.
router.post('/chats/:id/mute', (req, res) => {
  const conversation = loadConversation(req, res, req.params.id);
  if (!conversation) return;
  ensureState(conversation.id, req.user.id);
  db.prepare('UPDATE conversation_members SET muted = ? WHERE conversation_id = ? AND user_id = ?').run(
    req.body?.muted ? 1 : 0,
    conversation.id,
    req.user.id
  );
  pushChat(req, [req.user.id], conversation.id);
  res.status(204).end();
});

// Body { user_ids }: anyone in a group adds people who can be messaged.
router.post('/chats/:id/members', (req, res) => {
  const conversation = loadConversation(req, res, req.params.id);
  if (!conversation) return;
  if (conversation.kind !== 'group') return badRequest(res, 'Chỉ thêm người được vào nhóm tự tạo');
  const ids = chattableIds(req.body?.user_ids, req.user);
  if (!ids?.length) return badRequest(res, 'Chọn ít nhất một người nhắn tin được');
  const insert = db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)');
  transaction(() => ids.forEach((id) => insert.run(conversation.id, id)));
  pushChat(req, memberIds(conversation), conversation.id);
  res.json(summaryOf(conversation, req.user, { withMembers: true }));
});

// Leaving a group (anyone), or taking someone out (the owner). When the owner leaves, the member who joined first
// runs the group; the last one out deletes it.
router.delete('/chats/:id/members/:userId', (req, res) => {
  const conversation = loadConversation(req, res, req.params.id);
  if (!conversation) return;
  if (conversation.kind !== 'group') return badRequest(res, 'Chỉ rời được nhóm tự tạo');
  const userId = Number(req.params.userId);
  if (userId !== req.user.id && conversation.owner_id !== req.user.id) return forbidden(res, 'Chỉ người quản lý nhóm mới bỏ được người khác');
  const before = memberIds(conversation);
  if (!before.includes(userId)) return notFound(res);
  transaction(() => {
    db.prepare('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?').run(conversation.id, userId);
    const next = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? ORDER BY rowid LIMIT 1').get(conversation.id);
    if (!next) db.prepare('DELETE FROM conversations WHERE id = ?').run(conversation.id);
    else if (userId === conversation.owner_id) db.prepare('UPDATE conversations SET owner_id = ? WHERE id = ?').run(next.user_id, conversation.id);
  });
  sweepUploads(); // a deleted group took its files
  pushChat(req, before, conversation.id);
  res.status(204).end();
});

// The latest PAGE_SIZE messages, or those before ?before=<id>, oldest first; has_more when older ones remain.
router.get('/chats/:id/messages', (req, res) => {
  const conversation = loadConversation(req, res, req.params.id);
  if (!conversation) return;
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const rows = db
    .prepare(`${MESSAGE_SELECT} WHERE m.conversation_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`)
    .all(conversation.id, before, PAGE_SIZE + 1);
  res.json({ messages: messagesFor(rows.slice(0, PAGE_SIZE).reverse(), req.user), has_more: rows.length > PAGE_SIZE });
});

// Keeps @mentions of the conversation's members (others become plain "@Name"); checks the length.
function messageBody(req, res, conversation, { allowEmpty }) {
  const raw = String(req.body?.body ?? '').trim();
  if (!raw && !allowEmpty) {
    badRequest(res, 'Tin nhắn không được để trống');
    return null;
  }
  if (raw.length > MESSAGE_MAX) {
    badRequest(res, 'Tin nhắn quá dài');
    return null;
  }
  return resolveMentions(raw, reachableMembers(conversation), req.user).body;
}

// Body { body, with_files, reply_to_id }: the text may be left out when files follow, uploaded to
// /api/chat-messages/:id/attachments; reply_to_id answers a message of the same conversation.
router.post('/chats/:id/messages', (req, res) => {
  const conversation = loadConversation(req, res, req.params.id);
  if (!conversation) return;
  if (!summaryOf(conversation, req.user).can_send) return badRequest(res, 'Người này hiện không nhận được tin nhắn');
  const body = messageBody(req, res, conversation, { allowEmpty: Boolean(req.body?.with_files) });
  if (body === null) return;
  const replyTo = req.body?.reply_to_id ?? null;
  if (
    replyTo !== null &&
    !db.prepare('SELECT 1 FROM messages WHERE id = ? AND conversation_id = ? AND deleted_at IS NULL').get(replyTo, conversation.id)
  ) {
    return badRequest(res, 'Không tìm thấy tin nhắn được trả lời');
  }
  const id = transaction(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO messages (conversation_id, user_id, body, reply_to_id) VALUES (?, ?, ?, ?)')
      .run(conversation.id, req.user.id, body, replyTo);
    db.prepare("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?").run(conversation.id);
    // What one writes counts as read.
    ensureState(conversation.id, req.user.id);
    db.prepare('UPDATE conversation_members SET last_read_id = ? WHERE conversation_id = ? AND user_id = ?').run(lastInsertRowid, conversation.id, req.user.id);
    return lastInsertRowid;
  });
  pushChat(req, memberIds(conversation), conversation.id);
  res.status(201).json(messageById(id, req.user));
});

// Marks the conversation read up to its last message. The user's other tabs update their counts; in a one-to-one
// conversation the other person's thread shows "Đã xem".
router.post('/chats/:id/read', (req, res) => {
  const conversation = loadConversation(req, res, req.params.id);
  if (!conversation) return;
  ensureState(conversation.id, req.user.id);
  const { changes } = db
    .prepare(
      `UPDATE conversation_members SET last_read_id = (SELECT COALESCE(MAX(id), 0) FROM messages WHERE conversation_id = ?)
       WHERE conversation_id = ? AND user_id = ? AND last_read_id < (SELECT COALESCE(MAX(id), 0) FROM messages WHERE conversation_id = ?)`
    )
    .run(conversation.id, conversation.id, req.user.id, conversation.id);
  if (changes) pushChat(req, conversation.kind === 'direct' ? memberIds(conversation) : [req.user.id], conversation.id);
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
  const hasFiles = Boolean(db.prepare('SELECT 1 FROM attachments WHERE message_id = ?').get(message.id));
  const body = messageBody(req, res, conversation, { allowEmpty: hasFiles });
  if (body === null) return;
  db.prepare("UPDATE messages SET body = ?, edited_at = datetime('now') WHERE id = ?").run(body, message.id);
  pushChat(req, memberIds(conversation), conversation.id);
  res.json(messageById(message.id, req.user));
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
  pushChat(req, memberIds(conversation), conversation.id);
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
