// Feedback on the app (v31, decided 2026-10-08). Any company user sends feedback and sees only their own (anyone else
// gets 404); root sees all of it and handles it. The sender edits or deletes it, and adds or removes its files, only
// while it is 'sent'; root deletes any. Root moves it between statuses freely (back included); 'rejected' needs a
// reason, posted in the thread. The thread (messages, with files) is between the sender and root, at any status.
// Notifications: root on a new feedback and on the sender's messages; the sender on a status change and root's messages.
// They stay out of the bell: each feedback carries its count of unread ones, read when it is opened.
import express from 'express';
import { db, transaction } from '../db.js';
import { FEEDBACK_STATUSES, FEEDBACK_TYPES, editable, loadFeedback, rootIds, touchFeedback } from '../lib/feedback.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';
import { pushNotifications } from '../lib/live.js';
import { plainExcerpt } from '../lib/mentions.js';
import { isRoot } from '../lib/roles.js';
import { attachmentsOf, rawUpload, saveAttachment, sweepUploads, withCommentFiles } from '../lib/uploads.js';
import { deployedVersion } from '../lib/version.js';

const router = express.Router();

const TITLE_MAX = 200;
const TEXT_MAX = 10000;

const MESSAGE_SELECT = `SELECT m.*, u.name AS user_name, (u.role = 'root') AS from_root
  FROM feedback_messages m LEFT JOIN users u ON u.id = m.user_id`;
const messageById = (id) => withCommentFiles([db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(id)], 'feedback_message_id')[0];

// One feedback as its sender or root sees it: its files, the thread and the status changes.
function detail(feedback, user) {
  const sender = db.prepare('SELECT name, email FROM users WHERE id = ?').get(feedback.user_id);
  return {
    ...feedback,
    user_name: sender?.name ?? null,
    user_email: sender?.email ?? null,
    can_edit: editable(feedback, user),
    attachments: attachmentsOf('feedback_id', feedback.id),
    messages: withCommentFiles(
      db.prepare(`${MESSAGE_SELECT} WHERE m.feedback_id = ? ORDER BY m.created_at, m.id`).all(feedback.id),
      'feedback_message_id'
    ),
    events: db
      .prepare(
        `SELECT e.*, u.name AS user_name FROM feedback_events e LEFT JOIN users u ON u.id = e.user_id
         WHERE e.feedback_id = ? ORDER BY e.created_at, e.id`
      )
      .all(feedback.id),
  };
}

// type, title and body from the request, or an error message.
function fields(body) {
  const type = body?.type;
  const title = String(body?.title ?? '').trim();
  const text = String(body?.body ?? '').trim();
  if (!FEEDBACK_TYPES.includes(type)) return { error: 'Loại feedback không hợp lệ' };
  if (!title) return { error: 'Tiêu đề không được để trống' };
  if (!text) return { error: 'Nội dung không được để trống' };
  if (title.length > TITLE_MAX || text.length > TEXT_MAX) return { error: 'Tiêu đề hoặc nội dung quá dài' };
  return { type, title, text };
}

// The people told about something on a feedback: root when its sender acts, the sender when root does.
const otherSide = (feedback, user) => (feedback.user_id === user.id ? rootIds() : [feedback.user_id]).filter((id) => id !== user.id);

function notify(userIds, actor, feedback, type, excerpt = null) {
  const insert = db.prepare('INSERT INTO notifications (user_id, actor_id, feedback_id, type, excerpt) VALUES (?, ?, ?, ?, ?)');
  userIds.forEach((id) => insert.run(id, actor.id, feedback.id, type, excerpt));
}

// Root: every feedback (?status, ?type to filter); anyone else: their own. Latest activity first; `unread` counts
// the user's unread notifications about each one.
router.get('/feedback', (req, res) => {
  const where = [];
  const params = [req.user.id];
  if (!isRoot(req.user)) {
    where.push('f.user_id = ?');
    params.push(req.user.id);
  }
  if (FEEDBACK_STATUSES.includes(req.query.status)) {
    where.push('f.status = ?');
    params.push(req.query.status);
  }
  if (FEEDBACK_TYPES.includes(req.query.type)) {
    where.push('f.type = ?');
    params.push(req.query.type);
  }
  const items = db
    .prepare(
      `SELECT f.id, f.user_id, f.type, f.title, f.status, f.created_at, f.updated_at, u.name AS user_name,
         (SELECT COUNT(*) FROM feedback_messages m WHERE m.feedback_id = f.id) AS message_count,
         (SELECT COUNT(*) FROM notifications n WHERE n.feedback_id = f.id AND n.user_id = ? AND n.read_at IS NULL) AS unread
       FROM feedback f LEFT JOIN users u ON u.id = f.user_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY f.updated_at DESC, f.id DESC`
    )
    .all(...params);
  res.json(items);
});

// Body { type, title, body, page }; the app version and the browser are recorded too. Files follow, uploaded to
// /api/feedback/:id/attachments.
router.post('/feedback', (req, res) => {
  const { type, title, text, error } = fields(req.body);
  if (error) return badRequest(res, error);
  const page = typeof req.body.page === 'string' ? req.body.page.slice(0, 500) : null;
  const roots = rootIds();
  const feedback = transaction(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO feedback (user_id, type, title, body, page, app_version, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.id, type, title, text, page, deployedVersion()?.version ?? null, req.get('User-Agent')?.slice(0, 500) ?? null);
    const row = db.prepare('SELECT * FROM feedback WHERE id = ?').get(lastInsertRowid);
    notify(roots, req.user, row, 'feedback_new');
    return row;
  });
  pushNotifications(roots);
  touchFeedback(req, feedback);
  res.status(201).json(detail(feedback, req.user));
});

// Opening a feedback reads the user's notifications about it; their other tabs update their counts.
router.get('/feedback/:id', (req, res) => {
  const feedback = loadFeedback(req, res, req.params.id);
  if (!feedback) return;
  const { changes } = db
    .prepare("UPDATE notifications SET read_at = datetime('now') WHERE feedback_id = ? AND user_id = ? AND read_at IS NULL")
    .run(feedback.id, req.user.id);
  if (changes) pushNotifications([req.user.id]);
  res.json(detail(feedback, req.user));
});

router.patch('/feedback/:id', (req, res) => {
  const feedback = loadFeedback(req, res, req.params.id);
  if (!feedback) return;
  if (!editable(feedback, req.user)) return forbidden(res, 'Feedback đã được tiếp nhận nên không sửa được nữa');
  const { type, title, text, error } = fields(req.body);
  if (error) return badRequest(res, error);
  db.prepare('UPDATE feedback SET type = ?, title = ?, body = ? WHERE id = ?').run(type, title, text, feedback.id);
  touchFeedback(req, feedback);
  res.json(detail({ ...feedback, type, title, body: text }, req.user));
});

router.delete('/feedback/:id', (req, res) => {
  const feedback = loadFeedback(req, res, req.params.id);
  if (!feedback) return;
  if (!editable(feedback, req.user) && !isRoot(req.user)) return forbidden(res, 'Feedback đã được tiếp nhận nên không xoá được nữa');
  touchFeedback(req, feedback); // before the row goes, so the open lists reload
  db.prepare('DELETE FROM feedback WHERE id = ?').run(feedback.id);
  sweepUploads(); // its files went with it
  res.status(204).end();
});

// Root only. Body { status, note? }: the note goes to the thread; 'rejected' needs one (the reason).
router.patch('/feedback/:id/status', (req, res) => {
  const feedback = loadFeedback(req, res, req.params.id);
  if (!feedback) return;
  if (!isRoot(req.user)) return forbidden(res, 'Chỉ quản trị hệ thống mới đổi được trạng thái feedback');
  const status = req.body?.status;
  const note = String(req.body?.note ?? '').trim();
  if (!FEEDBACK_STATUSES.includes(status)) return badRequest(res, 'Trạng thái không hợp lệ');
  if (status === 'rejected' && !note) return badRequest(res, 'Cần ghi lý do khi chọn Không xử lý');
  if (note.length > TEXT_MAX) return badRequest(res, 'Nội dung quá dài');
  if (status === feedback.status && !note) return res.json(detail(feedback, req.user));
  transaction(() => {
    if (status !== feedback.status) {
      db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(status, feedback.id);
      db.prepare('INSERT INTO feedback_events (feedback_id, user_id, from_status, to_status) VALUES (?, ?, ?, ?)').run(
        feedback.id,
        req.user.id,
        feedback.status,
        status
      );
      notify([feedback.user_id], req.user, feedback, 'feedback_status', status);
    }
    if (note) {
      db.prepare('INSERT INTO feedback_messages (feedback_id, user_id, body) VALUES (?, ?, ?)').run(feedback.id, req.user.id, note);
      if (status === feedback.status) notify([feedback.user_id], req.user, feedback, 'feedback_message', plainExcerpt(note));
    }
  });
  pushNotifications([feedback.user_id]);
  touchFeedback(req, feedback);
  res.json(detail({ ...feedback, status }, req.user));
});

// A message in the thread. Body { body, with_files }: the text may be left out when files follow, uploaded to
// /api/feedback-messages/:id/attachments.
router.post('/feedback/:id/messages', (req, res) => {
  const feedback = loadFeedback(req, res, req.params.id);
  if (!feedback) return;
  const body = String(req.body?.body ?? '').trim();
  if (!body && !req.body?.with_files) return badRequest(res, 'Comment không được để trống');
  if (body.length > TEXT_MAX) return badRequest(res, 'Nội dung quá dài');
  const recipients = otherSide(feedback, req.user);
  const id = transaction(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO feedback_messages (feedback_id, user_id, body) VALUES (?, ?, ?)')
      .run(feedback.id, req.user.id, body);
    notify(recipients, req.user, feedback, 'feedback_message', plainExcerpt(body) || null);
    return lastInsertRowid;
  });
  pushNotifications(recipients);
  touchFeedback(req, feedback);
  res.status(201).json(messageById(id));
});

// Loads the message :id with its feedback (sender or root only, else 404).
function loadMessage(req, res) {
  const message = db.prepare('SELECT * FROM feedback_messages WHERE id = ?').get(req.params.id);
  if (!message) {
    notFound(res);
    return null;
  }
  const feedback = loadFeedback(req, res, message.feedback_id);
  return feedback && { message, feedback };
}

// Only the author edits; emptied text is fine while the message still has files.
router.patch('/feedback-messages/:id', (req, res) => {
  const found = loadMessage(req, res);
  if (!found) return;
  const { message, feedback } = found;
  if (message.user_id !== req.user.id) return forbidden(res, 'Chỉ người viết mới sửa được nội dung này');
  const body = String(req.body?.body ?? '').trim();
  const hasFiles = db.prepare('SELECT 1 FROM attachments WHERE feedback_message_id = ?').get(message.id);
  if (!body && !hasFiles) return badRequest(res, 'Nội dung không được để trống');
  if (body.length > TEXT_MAX) return badRequest(res, 'Nội dung quá dài');
  db.prepare("UPDATE feedback_messages SET body = ?, edited_at = datetime('now') WHERE id = ?").run(body, message.id);
  touchFeedback(req, feedback);
  res.json(messageById(message.id));
});

// The author or root deletes; the message's files go with it.
router.delete('/feedback-messages/:id', (req, res) => {
  const found = loadMessage(req, res);
  if (!found) return;
  if (found.message.user_id !== req.user.id && !isRoot(req.user)) return forbidden(res, 'Chỉ người viết mới xoá được nội dung này');
  db.prepare('DELETE FROM feedback_messages WHERE id = ?').run(found.message.id);
  sweepUploads();
  touchFeedback(req, found.feedback);
  res.status(204).end();
});

// The feedback's own files (screenshots…): the sender, while it is 'sent'.
router.post('/feedback/:id/attachments', rawUpload, (req, res) => {
  const feedback = loadFeedback(req, res, req.params.id);
  if (!feedback) return;
  if (!editable(feedback, req.user)) return forbidden(res, 'Feedback đã được tiếp nhận nên không đổi được file nữa');
  saveAttachment(req, res, { feedback });
});

// Files sent with a message: only its author, right after posting it.
router.post('/feedback-messages/:id/attachments', rawUpload, (req, res) => {
  const found = loadMessage(req, res);
  if (!found) return;
  if (found.message.user_id !== req.user.id) return forbidden(res, 'Chỉ người viết mới đính kèm file vào nội dung này');
  saveAttachment(req, res, { feedback: found.feedback, feedback_message_id: found.message.id });
});

export default router;
