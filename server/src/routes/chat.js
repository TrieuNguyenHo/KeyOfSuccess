// Chat (v32, decided 2026-10-08; groups, project and team chats, muting, answers and task links since v33). Who is in
// which conversation: lib/chat.js. Only the author edits or deletes a message (a deleted one stays as "Tin nhắn đã bị
// xoá"); files go with a message, sent by its author right after posting it. @mentions reach members only. Unread
// messages are counted on the Messages menu, never in the bell. Messages are kept 6 months (purgeMessages()). Changes to
// a group (created, people added or taken out, someone leaving, a new name) show in it as system lines (v34). Since v36:
// pinning, @tất cả, search, the files and links of a conversation, forwarding, copying a message's files to a task.
import express from 'express';
import { db, transaction } from '../db.js';
import { canEdit, findProject, findTask, projectAccess, taskAccess } from '../lib/access.js';
import {
  EVERYONE_MARKUP,
  MESSAGE_MAX,
  MUTE_HOURS,
  PINNED_CHATS_MAX,
  REACTIONS,
  TITLE_MAX,
  canChatWith,
  conversationsOf,
  ensureState,
  findConversation,
  loadConversation,
  markNewcomers,
  memberIds,
  memberUsers,
  reachableMembers,
  stateOf,
  taskLinks,
  unreadFor,
} from '../lib/chat.js';
import { foldText } from '../lib/fold.js';
import { logEvent } from '../lib/history.js';
import { badRequest, forbidden, notFound, requirePermission } from '../lib/http.js';
import { pushChange, pushChat } from '../lib/live.js';
import { plainExcerpt, resolveMentions } from '../lib/mentions.js';
import { OPTIONS_LIMIT, OPTIONS_MAX, OPTIONS_MIN, OPTION_MAX, QUESTION_MAX, cleanOptions, findPoll, isOpen, toStamp, withPolls } from '../lib/polls.js';
import { can } from '../lib/permissions.js';
import { AT_WORK, USER_SELECT, findUser, withUserTeams } from '../lib/users.js';
import { ATTACHMENT_SELECT, IMAGE_TYPES, copyAttachments, rawUpload, saveAttachment, sweepUploads, withCommentFiles } from '../lib/uploads.js';
import { placeholders } from '../lib/util.js';

const router = express.Router();
const PAGE_SIZE = 50;
const EXCERPT_LENGTH = 120;
const AROUND_BEFORE = 25; // messages shown before the one jumped to (?around=)
const AROUND_MAX = 1000; // and at most this many from it on
const SEARCH_MIN = 2;
const SEARCH_LIMIT = 50;
const MEDIA_LIMIT = 300;
const URL_RE = /https?:\/\/[^\s<]+/g;

router.use(['/chats', '/chat-messages'], requirePermission('chat.use'));

const MESSAGE_SELECT = `SELECT m.*, u.name AS user_name, r.user_id AS reply_user_id, ru.name AS reply_user_name,
    r.body AS reply_body, r.deleted_at AS reply_deleted_at
  FROM messages m LEFT JOIN users u ON u.id = m.user_id
  LEFT JOIN messages r ON r.id = m.reply_to_id LEFT JOIN users ru ON ru.id = r.user_id`;

// A message as this reader sees it: the message it answers (a short excerpt), the tasks it links to that the reader
// may see; a deleted message keeps its place, nothing of what it said.
function shown(row, reader) {
  const { reply_user_id, reply_user_name, reply_body, reply_deleted_at, search, ...rest } = row;
  const m = { ...rest, data: rest.data ? JSON.parse(rest.data) : null };
  if (m.kind === 'system') return { ...m, body: '', attachments: [], reply: null, tasks: [] };
  const reply = m.reply_to_id
    ? { id: m.reply_to_id, user_id: reply_user_id, user_name: reply_user_name, body: reply_deleted_at ? '' : plainExcerpt(reply_body), deleted: Boolean(reply_deleted_at) }
    : null;
  if (m.deleted_at) return { ...m, body: '', attachments: [], reply: null, tasks: [] };
  return { ...m, reply, tasks: taskLinks(m.body, reader) };
}
// Each message's reactions (v35), grouped by emoji: how many, who, whether the reader is one of them.
function withReactions(messages, reader) {
  if (!messages.length) return messages;
  const rows = db
    .prepare(
      `SELECT r.message_id, r.emoji, r.user_id, u.name FROM message_reactions r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.message_id IN (${placeholders(messages)}) ORDER BY r.created_at, r.rowid`
    )
    .all(...messages.map((m) => m.id));
  return messages.map((m) => {
    const own = rows.filter((r) => r.message_id === m.id);
    const reactions = REACTIONS.map((emoji) => own.filter((r) => r.emoji === emoji))
      .filter((list) => list.length)
      .map((list) => ({ emoji: list[0].emoji, count: list.length, names: list.map((r) => r.name), mine: list.some((r) => r.user_id === reader.id) }));
    return { ...m, reactions };
  });
}
const messagesFor = (rows, reader) => withPolls(withReactions(withCommentFiles(rows, 'message_id').map((m) => shown(m, reader)), reader), reader);
const messageById = (id, reader) => messagesFor([db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(id)], reader)[0];

const personOf = (u) => ({ id: u.id, name: u.name, role_name: u.role_name, team_name: u.team_name, status: u.status });

// A conversation as one of its members sees it. Direct: the other person (as anyone sees them, no personal details)
// and how far they have read. Group: title, owner. Project / team: which one. withMembers adds the member list.
function summaryOf(c, me, { withMembers = false } = {}) {
  const { state, unread, mentions } = unreadFor(c, me.id);
  const last = db
    .prepare(
      `SELECT m.id, m.user_id, u.name AS user_name, m.body, m.kind, m.data, m.created_at, m.deleted_at,
         EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id) AS has_files,
         EXISTS (SELECT 1 FROM polls p WHERE p.message_id = m.id) AS is_poll
       FROM messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.conversation_id = ? ORDER BY m.id DESC LIMIT 1`
    )
    .get(c.id);
  const summary = {
    id: c.id,
    kind: c.kind,
    title: c.title,
    created_at: c.created_at,
    last_message_at: c.last_message_at,
    last_message: last
      ? {
          ...last,
          body: last.deleted_at || last.kind ? '' : plainExcerpt(last.body).slice(0, EXCERPT_LENGTH),
          data: last.data ? JSON.parse(last.data) : null,
          has_files: Boolean(last.has_files),
          is_poll: Boolean(last.is_poll),
        }
      : null,
    unread,
    mentioned: mentions > 0,
    muted: Boolean(state.muted),
    muted_until: state.muted_until ?? null,
    pinned_chat: Boolean(state.pinned_at), // at the top of the user's list (v37); `pinned` lists the pinned messages
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
    // Pinned messages (v36), latest pinned first.
    summary.pinned = db
      .prepare(
        `SELECT m.id, m.user_id, u.name AS user_name, m.body, m.pinned_at, p.name AS pinned_by_name,
           EXISTS (SELECT 1 FROM attachments a WHERE a.message_id = m.id) AS has_files
         FROM messages m LEFT JOIN users u ON u.id = m.user_id LEFT JOIN users p ON p.id = m.pinned_by
         WHERE m.conversation_id = ? AND m.pinned_at IS NOT NULL AND m.deleted_at IS NULL ORDER BY m.pinned_at DESC, m.id DESC`
      )
      .all(c.id)
      .map((m) => ({ ...m, body: plainExcerpt(m.body), has_files: Boolean(m.has_files) }));
    // last_read_id: how far each has read, for "Đã xem" (null: nothing stored yet).
    summary.members = memberUsers(c).map((u) => {
      const state = stateOf(c.id, u.id);
      return { ...personOf(u), owner: c.kind === 'group' && u.id === c.owner_id, at_work: canChatWith(u.id), last_read_id: state.missing ? null : state.last_read_id };
    });
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

// A system line in a group (v34): what happened (event), done by `actor`, about `people`, whose @[Name](id) go in the
// body so it counts as unread for them; data keeps the names as they are now (and `extra`, e.g. the new title).
function systemLine(conversation, actor, event, { people = [], ...extra } = {}) {
  const named = people.map(({ id, name }) => ({ id, name: name.replace(/[\]\n]/g, '').slice(0, 80) }));
  db.prepare("INSERT INTO messages (conversation_id, user_id, body, kind, data) VALUES (?, ?, ?, 'system', ?)").run(
    conversation.id,
    actor.id,
    named.map((p) => `@[${p.name}](${p.id})`).join(' '),
    JSON.stringify({ event, people: named, ...extra })
  );
  db.prepare("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?").run(conversation.id);
}
const usersById = (ids) => ids.map((id) => findUser(id));

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

// Body-less search (v36): ?q= (accent-insensitive, at least 2 characters) in the user's conversations, or only in
// ?conversation=<id>; newest first, each result with its conversation's name.
router.get('/chats/search', (req, res) => {
  const q = foldText(req.query.q ?? '').trim();
  if (q.length < SEARCH_MIN) return res.json([]);
  let conversations = conversationsOf(req.user);
  if (req.query.conversation) conversations = conversations.filter((c) => c.id === Number(req.query.conversation));
  if (!conversations.length) return res.json([]);
  const pattern = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  const rows = db
    .prepare(
      `SELECT m.id, m.conversation_id, m.user_id, u.name AS user_name, m.body, m.created_at
       FROM messages m LEFT JOIN users u ON u.id = m.user_id
       WHERE m.conversation_id IN (${placeholders(conversations)}) AND m.kind IS NULL AND m.deleted_at IS NULL
         AND m.search LIKE ? ESCAPE '\\'
       ORDER BY m.id DESC LIMIT ?`
    )
    .all(...conversations.map((c) => c.id), pattern, SEARCH_LIMIT);
  const named = new Map();
  const nameOf = (id) => {
    if (!named.has(id)) {
      const { kind, title, other, project, team } = summaryOf(conversations.find((c) => c.id === id), req.user);
      named.set(id, { id, kind, title, other, project, team });
    }
    return named.get(id);
  };
  res.json(rows.map((m) => ({ ...m, body: plainExcerpt(m.body), conversation: nameOf(m.conversation_id) })));
});

// The user's conversations: those with messages, the groups they are in and those they pinned; pinned ones first
// (v37), each part latest first.
router.get('/chats', (req, res) => {
  const latest = (c) => c.last_message_at ?? c.created_at;
  const list = conversationsOf(req.user)
    .map((c) => ({ c, pinned: Boolean(stateOf(c.id, req.user.id).pinned_at) }))
    .filter(({ c, pinned }) => c.last_message_at || c.kind === 'group' || pinned)
    .sort((a, b) => b.pinned - a.pinned || latest(b.c).localeCompare(latest(a.c)) || b.c.id - a.c.id);
  res.json(list.map(({ c }) => summaryOf(c, req.user)));
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
    const created = findConversation(lastInsertRowid);
    systemLine(created, req.user, 'created', { people: usersById(ids), title });
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
  if (title !== conversation.title) {
    transaction(() => {
      db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title, conversation.id);
      systemLine(conversation, req.user, 'renamed', { title });
    });
  }
  pushChat(req, memberIds(conversation), conversation.id);
  res.json(summaryOf({ ...conversation, title }, req.user, { withMembers: true }));
});

// Body { muted, hours }: a muted conversation is not counted on the Messages menu, except mentions of the user. With
// hours (1 or 8, v37) the mute ends by itself; without, it lasts until turned back on.
router.post('/chats/:id/mute', (req, res) => {
  const conversation = loadConversation(req, res, req.params.id);
  if (!conversation) return;
  const muted = Boolean(req.body?.muted);
  const hours = req.body?.hours ?? null;
  if (muted && hours !== null && !MUTE_HOURS.includes(hours)) return badRequest(res, 'Thời gian tắt thông báo không hợp lệ');
  ensureState(conversation.id, req.user.id);
  db.prepare(
    `UPDATE conversation_members SET muted = ?, muted_until = ${muted && hours ? "datetime('now', ?)" : 'NULL'}
     WHERE conversation_id = ? AND user_id = ?`
  ).run(...[muted ? 1 : 0, ...(muted && hours ? [`+${hours} hours`] : []), conversation.id, req.user.id]);
  pushChat(req, [req.user.id], conversation.id);
  res.status(204).end();
});

// Body { pinned }: keeps the conversation at the top of the user's own list (v37), at most PINNED_CHATS_MAX of them.
router.post('/chats/:id/pin', (req, res) => {
  const conversation = loadConversation(req, res, req.params.id);
  if (!conversation) return;
  const pinned = Boolean(req.body?.pinned);
  if (pinned && !stateOf(conversation.id, req.user.id).pinned_at) {
    const count = conversationsOf(req.user).filter((c) => stateOf(c.id, req.user.id).pinned_at).length;
    if (count >= PINNED_CHATS_MAX) return badRequest(res, 'Chỉ ghim được tối đa 5 cuộc trò chuyện');
  }
  ensureState(conversation.id, req.user.id);
  db.prepare(`UPDATE conversation_members SET pinned_at = ${pinned ? "COALESCE(pinned_at, datetime('now'))" : 'NULL'} WHERE conversation_id = ? AND user_id = ?`).run(
    conversation.id,
    req.user.id
  );
  pushChat(req, [req.user.id], conversation.id);
  res.status(204).end();
});

// Body { question, options, multiple, allow_add, closes_at }: a poll (v37) in a group, project or team chat, by anyone
// in it. 2 to 10 options; closes_at (optional) must be ahead.
router.post('/chats/:id/polls', (req, res) => {
  const conversation = loadConversation(req, res, req.params.id);
  if (!conversation) return;
  if (conversation.kind === 'direct') return badRequest(res, 'Chỉ tạo bình chọn được trong nhóm, chat project hoặc chat team');
  const raw = String(req.body?.question ?? '').trim();
  if (!raw) return badRequest(res, 'Cần nhập câu hỏi');
  if (raw.length > QUESTION_MAX) return badRequest(res, 'Câu hỏi quá dài');
  const options = cleanOptions(req.body?.options);
  if (!options) return badRequest(res, 'Phương án quá dài');
  if (options.length < OPTIONS_MIN || options.length > OPTIONS_MAX) return badRequest(res, 'Cần từ 2 đến 10 phương án');
  let closesAt = null;
  if (req.body?.closes_at) {
    const date = new Date(req.body.closes_at);
    if (Number.isNaN(date.getTime()) || date <= new Date()) return badRequest(res, 'Hạn chót phải ở tương lai');
    closesAt = toStamp(date);
  }
  const body = messageBody(req, res, conversation, { allowEmpty: false, raw });
  if (body === null) return;
  const id = transaction(() => {
    const messageId = postMessage(conversation, req.user, { body });
    db.prepare('INSERT INTO polls (message_id, multiple, allow_add, closes_at) VALUES (?, ?, ?, ?)').run(
      messageId,
      req.body?.multiple ? 1 : 0,
      req.body?.allow_add ? 1 : 0,
      closesAt
    );
    const insert = db.prepare('INSERT INTO poll_options (message_id, text, added_by) VALUES (?, ?, ?)');
    options.forEach((text) => insert.run(messageId, text, req.user.id));
    return messageId;
  });
  pushChat(req, memberIds(conversation), conversation.id);
  res.status(201).json(messageById(id, req.user));
});

// Body { user_ids }: anyone in a group adds people who can be messaged.
router.post('/chats/:id/members', (req, res) => {
  const conversation = loadConversation(req, res, req.params.id);
  if (!conversation) return;
  if (conversation.kind !== 'group') return badRequest(res, 'Chỉ thêm người được vào nhóm tự tạo');
  const ids = chattableIds(req.body?.user_ids, req.user);
  if (!ids?.length) return badRequest(res, 'Chọn ít nhất một người nhắn tin được');
  const already = new Set(memberIds(conversation));
  const added = ids.filter((id) => !already.has(id));
  if (added.length) {
    transaction(() => {
      // The messages from before they joined count as read: only the line about them is new.
      const { last } = db.prepare('SELECT COALESCE(MAX(id), 0) AS last FROM messages WHERE conversation_id = ?').get(conversation.id);
      const insert = db.prepare('INSERT INTO conversation_members (conversation_id, user_id, last_read_id) VALUES (?, ?, ?)');
      added.forEach((id) => insert.run(conversation.id, id, last));
      systemLine(conversation, req.user, 'added', { people: usersById(added) });
    });
  }
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
  const target = findUser(userId);
  transaction(() => {
    db.prepare('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?').run(conversation.id, userId);
    const next = db.prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? ORDER BY rowid LIMIT 1').get(conversation.id);
    if (!next) {
      db.prepare('DELETE FROM conversations WHERE id = ?').run(conversation.id);
    } else if (userId !== req.user.id) {
      systemLine(conversation, req.user, 'removed', { people: [target] });
    } else if (userId === conversation.owner_id) {
      // The new owner is told: the line names them.
      db.prepare('UPDATE conversations SET owner_id = ? WHERE id = ?').run(next.user_id, conversation.id);
      systemLine(conversation, req.user, 'left', { people: [findUser(next.user_id)], owner: true });
    } else {
      systemLine(conversation, req.user, 'left');
    }
  });
  sweepUploads(); // a deleted group took its files
  pushChat(req, before, conversation.id);
  res.status(204).end();
});

// The latest PAGE_SIZE messages, or those before ?before=<id>, oldest first; has_more when older ones remain.
router.get('/chats/:id/messages', (req, res) => {
  const conversation = loadConversation(req, res, req.params.id);
  if (!conversation) return;
  const around = Number(req.query.around);
  if (around) {
    // A message to jump to (a search result, a pin, a link from a task): a few before it, and everything from it on.
    const older = db
      .prepare(`${MESSAGE_SELECT} WHERE m.conversation_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`)
      .all(conversation.id, around, AROUND_BEFORE + 1);
    const newer = db.prepare(`${MESSAGE_SELECT} WHERE m.conversation_id = ? AND m.id >= ? ORDER BY m.id LIMIT ?`).all(conversation.id, around, AROUND_MAX);
    return res.json({ messages: messagesFor([...older.slice(0, AROUND_BEFORE).reverse(), ...newer], req.user), has_more: older.length > AROUND_BEFORE });
  }
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const rows = db
    .prepare(`${MESSAGE_SELECT} WHERE m.conversation_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`)
    .all(conversation.id, before, PAGE_SIZE + 1);
  res.json({ messages: messagesFor(rows.slice(0, PAGE_SIZE).reverse(), req.user), has_more: rows.length > PAGE_SIZE });
});

// The images, other files and links sent in a conversation (v36), newest first.
router.get('/chats/:id/media', (req, res) => {
  const conversation = loadConversation(req, res, req.params.id);
  if (!conversation) return;
  const files = db
    .prepare(
      `${ATTACHMENT_SELECT} JOIN messages m ON m.id = a.message_id
       WHERE m.conversation_id = ? AND m.deleted_at IS NULL ORDER BY a.id DESC LIMIT ?`
    )
    .all(conversation.id, MEDIA_LIMIT);
  const links = db
    .prepare(
      `SELECT m.id AS message_id, m.body, m.created_at, u.name AS user_name FROM messages m LEFT JOIN users u ON u.id = m.user_id
       WHERE m.conversation_id = ? AND m.kind IS NULL AND m.deleted_at IS NULL AND m.body LIKE '%http%' ORDER BY m.id DESC LIMIT ?`
    )
    .all(conversation.id, MEDIA_LIMIT)
    .flatMap(({ body, ...m }) => (body.match(URL_RE) ?? []).map((url) => ({ ...m, url })));
  res.json({
    images: files.filter((f) => IMAGE_TYPES.includes(f.mime)),
    files: files.filter((f) => !IMAGE_TYPES.includes(f.mime)),
    links,
  });
});

// Keeps @mentions of the conversation's members (others become plain "@Name") and, outside one-to-one chats, @tất cả
// (v36); checks the length. `raw` defaults to the request's body text.
function messageBody(req, res, conversation, { allowEmpty, raw = String(req.body?.body ?? '').trim() }) {
  if (!raw && !allowEmpty) {
    badRequest(res, 'Tin nhắn không được để trống');
    return null;
  }
  if (raw.length > MESSAGE_MAX) {
    badRequest(res, 'Tin nhắn quá dài');
    return null;
  }
  const everyone = conversation.kind !== 'direct';
  const held = raw.replace(/@\[[^\]\n]{1,80}\]\(0\)/g, everyone ? '\u0000' : '@all');
  return resolveMentions(held, reachableMembers(conversation), req.user).body.replaceAll('\u0000', EVERYONE_MARKUP);
}

// Writes a message (and what goes with it: newcomers' read positions, the conversation's latest time, the author's
// own read position); returns its id. Shared by sending and forwarding.
function postMessage(conversation, user, { body, replyTo = null, forwarded = false }) {
  return transaction(() => {
    markNewcomers(conversation);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO messages (conversation_id, user_id, body, reply_to_id, forwarded, search) VALUES (?, ?, ?, ?, ?, ?)')
      .run(conversation.id, user.id, body, replyTo, forwarded ? 1 : 0, foldText(body));
    db.prepare("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?").run(conversation.id);
    // What one writes counts as read.
    ensureState(conversation.id, user.id);
    db.prepare('UPDATE conversation_members SET last_read_id = ? WHERE conversation_id = ? AND user_id = ?').run(lastInsertRowid, conversation.id, user.id);
    return lastInsertRowid;
  });
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
    !db.prepare('SELECT 1 FROM messages WHERE id = ? AND conversation_id = ? AND deleted_at IS NULL AND kind IS NULL').get(replyTo, conversation.id)
  ) {
    return badRequest(res, 'Không tìm thấy tin nhắn được trả lời');
  }
  const id = postMessage(conversation, req.user, { body, replyTo });
  pushChat(req, memberIds(conversation), conversation.id);
  res.status(201).json(messageById(id, req.user));
});

// Marks the conversation read up to its last message. The user's other tabs update their counts; the others' threads
// show it as "Đã xem".
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
  if (changes) pushChat(req, memberIds(conversation), conversation.id);
  res.status(204).end();
});

// Loads the message :id with its conversation (members only, else 404), not yet deleted and not a system line.
function loadMessage(req, res) {
  const message = db.prepare('SELECT * FROM messages WHERE id = ? AND deleted_at IS NULL AND kind IS NULL').get(req.params.id);
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
  if (findPoll(message.id)) return badRequest(res, 'Không sửa được bình chọn');
  const hasFiles = Boolean(db.prepare('SELECT 1 FROM attachments WHERE message_id = ?').get(message.id));
  const body = messageBody(req, res, conversation, { allowEmpty: hasFiles });
  if (body === null) return;
  db.prepare("UPDATE messages SET body = ?, search = ?, edited_at = datetime('now') WHERE id = ?").run(body, foldText(body), message.id);
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
    db.prepare("UPDATE messages SET body = '', search = '', pinned_at = NULL, pinned_by = NULL, deleted_at = datetime('now') WHERE id = ?").run(message.id);
    db.prepare('DELETE FROM attachments WHERE message_id = ?').run(message.id);
    db.prepare('DELETE FROM message_reactions WHERE message_id = ?').run(message.id);
  });
  sweepUploads();
  pushChat(req, memberIds(conversation), conversation.id);
  res.status(204).end();
});

// Body { pinned }: anyone in the conversation pins a message to its top, or takes it off (v36); a system line says so.
router.post('/chat-messages/:id/pin', (req, res) => {
  const found = loadMessage(req, res);
  if (!found) return;
  const { message, conversation } = found;
  const pinned = Boolean(req.body?.pinned);
  if (pinned === Boolean(message.pinned_at)) return res.json(messageById(message.id, req.user));
  transaction(() => {
    db.prepare(`UPDATE messages SET pinned_at = ${pinned ? "datetime('now')" : 'NULL'}, pinned_by = ? WHERE id = ?`).run(pinned ? req.user.id : null, message.id);
    systemLine(conversation, req.user, pinned ? 'pinned' : 'unpinned', { excerpt: plainExcerpt(message.body).slice(0, 80) });
  });
  pushChat(req, memberIds(conversation), conversation.id);
  res.json(messageById(message.id, req.user));
});

// Body { conversation_id }: sends a copy of the message (text and files) to another conversation the user can write in,
// marked as forwarded without saying from where (decided 2026-10-08). Mentions there keep only that conversation's
// members.
router.post('/chat-messages/:id/forward', (req, res) => {
  const found = loadMessage(req, res);
  if (!found) return;
  if (findPoll(found.message.id)) return badRequest(res, 'Không chuyển tiếp được bình chọn');
  const target = loadConversation(req, res, Number(req.body?.conversation_id));
  if (!target) return;
  if (!summaryOf(target, req.user).can_send) return badRequest(res, 'Người này hiện không nhận được tin nhắn');
  const files = db.prepare('SELECT * FROM attachments WHERE message_id = ?').all(found.message.id);
  const body = messageBody(req, res, target, { allowEmpty: files.length > 0, raw: found.message.body });
  if (body === null) return;
  const id = postMessage(target, req.user, { body, forwarded: true });
  copyAttachments(files, { message_id: id }, req.user);
  pushChat(req, memberIds(target), target.id);
  res.status(201).json(messageById(id, req.user));
});

// Body { task_id }: copies the message's files to a task the user may edit (making a task from a message, v36).
router.post('/chat-messages/:id/copy-files', (req, res) => {
  const found = loadMessage(req, res);
  if (!found) return;
  const task = findTask(Number(req.body?.task_id));
  const access = task && taskAccess(req.user, task);
  if (!task || !access) return notFound(res);
  if (!canEdit(access)) return forbidden(res, 'Bạn không sửa được task này');
  const files = db.prepare('SELECT * FROM attachments WHERE message_id = ?').all(found.message.id);
  copyAttachments(files, { taskId: task.id }, req.user);
  files.forEach((f) => logEvent(task, req.user, 'file_added', { name: f.name, in_comment: false }));
  pushChange(req, { project_id: task.project_id, task_id: task.id }, task);
  res.json({ copied: files.length });
});

// The open poll of the message :id (members only), or an error sent.
function loadOpenPoll(req, res) {
  const found = loadMessage(req, res);
  if (!found) return null;
  const poll = findPoll(found.message.id);
  if (!poll) {
    notFound(res);
    return null;
  }
  if (!isOpen(poll)) {
    badRequest(res, 'Bình chọn đã khoá');
    return null;
  }
  return { ...found, poll };
}

// Body { option_ids }: the user's choice, replacing the previous one (none takes it back); one option unless the poll
// allows several.
router.post('/chat-messages/:id/vote', (req, res) => {
  const found = loadOpenPoll(req, res);
  if (!found) return;
  const { message, conversation, poll } = found;
  const ids = [...new Set((Array.isArray(req.body?.option_ids) ? req.body.option_ids : []).map(Number))];
  const own = new Set(db.prepare('SELECT id FROM poll_options WHERE message_id = ?').all(message.id).map((o) => o.id));
  if (ids.some((id) => !own.has(id))) return badRequest(res, 'Phương án không hợp lệ');
  if (ids.length > 1 && !poll.multiple) return badRequest(res, 'Bình chọn này chỉ chọn một phương án');
  transaction(() => {
    db.prepare(`DELETE FROM poll_votes WHERE user_id = ? AND option_id IN (${placeholders([...own])})`).run(req.user.id, ...own);
    const insert = db.prepare('INSERT INTO poll_votes (option_id, user_id) VALUES (?, ?)');
    ids.forEach((id) => insert.run(id, req.user.id));
  });
  pushChat(req, memberIds(conversation), conversation.id);
  res.json(messageById(message.id, req.user));
});

// Body { text }: another option, by its creator or, when the poll allows it, by anyone in the conversation.
router.post('/chat-messages/:id/poll-options', (req, res) => {
  const found = loadOpenPoll(req, res);
  if (!found) return;
  const { message, conversation, poll } = found;
  if (!poll.allow_add && message.user_id !== req.user.id) return forbidden(res, 'Người tạo bình chọn không cho thêm phương án');
  const text = String(req.body?.text ?? '').trim();
  if (!text) return badRequest(res, 'Cần nhập phương án');
  if (text.length > OPTION_MAX) return badRequest(res, 'Phương án quá dài');
  const options = db.prepare('SELECT text FROM poll_options WHERE message_id = ?').all(message.id);
  if (options.some((o) => o.text.toLowerCase() === text.toLowerCase())) return badRequest(res, 'Phương án này đã có');
  if (options.length >= OPTIONS_LIMIT) return badRequest(res, 'Bình chọn đã đủ 20 phương án');
  db.prepare('INSERT INTO poll_options (message_id, text, added_by) VALUES (?, ?, ?)').run(message.id, text, req.user.id);
  pushChat(req, memberIds(conversation), conversation.id);
  res.status(201).json(messageById(message.id, req.user));
});

// Its creator closes a poll before its deadline (or one without).
router.post('/chat-messages/:id/close-poll', (req, res) => {
  const found = loadOpenPoll(req, res);
  if (!found) return;
  const { message, conversation } = found;
  if (message.user_id !== req.user.id) return forbidden(res, 'Chỉ người tạo mới khoá được bình chọn');
  db.prepare("UPDATE polls SET closed_at = datetime('now') WHERE message_id = ?").run(message.id);
  pushChat(req, memberIds(conversation), conversation.id);
  res.json(messageById(message.id, req.user));
});

// Body { emoji }: the user's reaction to a message (one per person, replacing theirs); null or '' takes it back.
router.post('/chat-messages/:id/reaction', (req, res) => {
  const found = loadMessage(req, res);
  if (!found) return;
  const emoji = req.body?.emoji || null;
  if (emoji !== null && !REACTIONS.includes(emoji)) return badRequest(res, 'Cảm xúc không hợp lệ');
  if (emoji === null) {
    db.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?').run(found.message.id, req.user.id);
  } else {
    db.prepare(
      `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)
       ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = excluded.emoji, created_at = datetime('now')`
    ).run(found.message.id, req.user.id, emoji);
  }
  pushChat(req, memberIds(found.conversation), found.conversation.id);
  res.json(messageById(found.message.id, req.user));
});

// Files sent with a message: only its author, right after posting it.
router.post('/chat-messages/:id/attachments', rawUpload, (req, res) => {
  const found = loadMessage(req, res);
  if (!found) return;
  if (found.message.user_id !== req.user.id) return forbidden(res, 'Chỉ người viết mới đính kèm file vào nội dung này');
  saveAttachment(req, res, { conversation: found.conversation, message_id: found.message.id });
});

export default router;
