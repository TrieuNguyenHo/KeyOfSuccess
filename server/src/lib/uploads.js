// Attached files on disk (UPLOAD_DIR) and their rows in `attachments`.
import express from 'express';
import { randomBytes } from 'node:crypto';
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { UPLOAD_DIR, db } from '../db.js';
import { findTask } from './access.js';
import { memberIds } from './chat.js';
import { touchFeedback } from './feedback.js';
import { logEvent } from './history.js';
import { badRequest } from './http.js';
import { pushChange, pushChat } from './live.js';
import { placeholders } from './util.js';

export const MAX_UPLOAD_MB = 25;
export const ATTACHMENT_SELECT = `SELECT a.id, a.task_id, a.requirement_id, a.feedback_id, a.comment_id, a.requirement_comment_id,
  a.feedback_message_id, a.message_id, a.user_id, a.name, a.mime, a.size, a.created_at, u.name AS user_name
  FROM attachments a LEFT JOIN users u ON u.id = a.user_id`;
// A task's, requirement's or feedback's own files; those sent with its comments or messages are listed under them.
export const attachmentsOf = (column, id) =>
  db
    .prepare(
      `${ATTACHMENT_SELECT} WHERE a.${column} = ? AND a.comment_id IS NULL AND a.requirement_comment_id IS NULL
       AND a.feedback_message_id IS NULL ORDER BY a.id`
    )
    .all(id);

// Adds each comment's files as `attachments`; column is attachments.comment_id, requirement_comment_id,
// feedback_message_id or (chat) message_id.
export function withCommentFiles(comments, column) {
  if (!comments.length) return comments;
  const files = db
    .prepare(`${ATTACHMENT_SELECT} WHERE a.${column} IN (${placeholders(comments)}) ORDER BY a.id`)
    .all(...comments.map((c) => c.id));
  return comments.map((c) => ({ ...c, attachments: files.filter((f) => f[column] === c.id) }));
}

// Removes files whose row is gone: deleted, or cascaded away with a task, section, requirement or project.
export function sweepUploads() {
  const kept = new Set(
    db
      .prepare('SELECT stored_name FROM attachments UNION SELECT avatar FROM users WHERE avatar IS NOT NULL')
      .all()
      .map((r) => r.stored_name)
  );
  for (const name of readdirSync(UPLOAD_DIR)) if (!kept.has(name)) rmSync(join(UPLOAD_DIR, name), { force: true });
}

// The client sends the bytes as application/octet-stream (so express.json leaves them alone), with the file
// name URI-encoded in X-File-Name and its type in X-File-Type.
export const rawUpload = express.raw({ type: 'application/octet-stream', limit: `${MAX_UPLOAD_MB}mb` });

// target: { taskId } | { requirementId } | { feedback: row } | { conversation: row, message_id }, plus comment_id /
// requirement_comment_id / feedback_message_id for a file sent with one; change: what pushChange() announces
// (feedback and chat tell their own people).
export function saveAttachment(req, res, target, change) {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return badRequest(res, 'File trống hoặc không đọc được');
  let name = '';
  try {
    name = decodeURIComponent(req.get('X-File-Name') ?? '');
  } catch {
    // A malformed name falls back to "file".
  }
  name = name.replace(/[\\/\x00-\x1f]/g, '_').trim().slice(0, 200) || 'file';
  const type = req.get('X-File-Type') ?? '';
  const mime = /^[\w.+-]+\/[\w.+-]+$/.test(type) ? type.toLowerCase() : 'application/octet-stream';
  const storedName = randomBytes(16).toString('hex');
  writeFileSync(join(UPLOAD_DIR, storedName), req.body);
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO attachments (task_id, requirement_id, feedback_id, comment_id, requirement_comment_id, feedback_message_id,
         message_id, user_id, name, mime, size, stored_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      target.taskId ?? null,
      target.requirementId ?? null,
      target.feedback?.id ?? null,
      target.comment_id ?? null,
      target.requirement_comment_id ?? null,
      target.feedback_message_id ?? null,
      target.message_id ?? null,
      req.user.id,
      name,
      mime,
      req.body.length,
      storedName
    );
  if (target.taskId) logEvent(findTask(target.taskId), req.user, 'file_added', { name, in_comment: Boolean(target.comment_id) });
  if (target.feedback) touchFeedback(req, target.feedback);
  else if (target.conversation) pushChat(req, memberIds(target.conversation.id), target.conversation.id);
  else pushChange(req, ...change);
  res.status(201).json(db.prepare(`${ATTACHMENT_SELECT} WHERE a.id = ?`).get(lastInsertRowid));
}
