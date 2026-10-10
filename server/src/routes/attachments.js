// Downloading and deleting an attached file. Uploads go through the task, requirement and comment routes.
import express from 'express';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { UPLOAD_DIR, db } from '../db.js';
import { findTask, loadProject, loadTask } from '../lib/access.js';
import { loadConversation, memberIds } from '../lib/chat.js';
import { editable, loadFeedback, touchFeedback } from '../lib/feedback.js';
import { logEvent } from '../lib/history.js';
import { forbidden, notFound } from '../lib/http.js';
import { pushChange, pushChat } from '../lib/live.js';
import { can } from '../lib/permissions.js';
import { canEditRequirements, findRequirement } from '../lib/requirements.js';
import { isRoot } from '../lib/roles.js';
import { IMAGE_TYPES } from '../lib/uploads.js';

const router = express.Router();

// Only IMAGE_TYPES are served with their own type (shown inline); anything else downloads as plain bytes, so an
// uploaded HTML or SVG file never runs as a page of the app.

// Loads an attachment the user can see (else 404), with whether they may delete it: the uploader, task admins
// for a task's files, requirement editors for a requirement's. A feedback's own files are deleted by root, or by
// the sender while it is still 'sent'; files of its messages by their author or root. Root reaches feedback files only.
// Files of a chat message: the conversation's members (with chat.use) see them, the uploader deletes.
function loadAttachment(req, res) {
  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
  if (!attachment || (isRoot(req.user) && !attachment.feedback_id)) {
    notFound(res);
    return null;
  }
  const own = attachment.user_id === req.user.id;
  if (attachment.message_id) {
    const message = db.prepare('SELECT conversation_id FROM messages WHERE id = ?').get(attachment.message_id);
    if (!can(req.user, 'chat.use')) {
      notFound(res);
      return null;
    }
    const conversation = loadConversation(req, res, message.conversation_id);
    return conversation && { ...attachment, conversation, canDelete: own };
  }
  if (attachment.feedback_id) {
    const feedback = loadFeedback(req, res, attachment.feedback_id);
    if (!feedback) return null;
    const mayDelete = attachment.feedback_message_id ? own : editable(feedback, req.user);
    return { ...attachment, feedback, canDelete: isRoot(req.user) || mayDelete };
  }
  if (attachment.task_id) {
    const task = loadTask(req, res, attachment.task_id, 'view');
    if (!task) return null;
    return { ...attachment, canDelete: own || task.access === 'admin', change: [{ project_id: task.project_id, task_id: task.id }, task] };
  }
  const requirement = findRequirement(attachment.requirement_id);
  const project = loadProject(req, res, requirement.project_id);
  if (!project) return null;
  return {
    ...attachment,
    canDelete: own || canEditRequirements(req.user, project),
    change: [{ project_id: project.id, requirement_id: requirement.id }],
  };
}

router.get('/attachments/:id', (req, res) => {
  const attachment = loadAttachment(req, res);
  if (!attachment) return;
  const inline = IMAGE_TYPES.includes(attachment.mime);
  res.set({
    'Content-Type': inline ? attachment.mime : 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
    'X-Content-Type-Options': 'nosniff',
  });
  res.sendFile(join(UPLOAD_DIR, attachment.stored_name), (err) => err && !res.headersSent && notFound(res));
});

router.delete('/attachments/:id', (req, res) => {
  const attachment = loadAttachment(req, res);
  if (!attachment) return;
  if (!attachment.canDelete) {
    if (attachment.feedback_message_id || attachment.message_id) return forbidden(res, 'Chỉ người tải lên mới xoá được file này');
    if (attachment.feedback) return forbidden(res, 'Feedback đã được tiếp nhận nên không đổi được file nữa');
    return forbidden(res, 'Chỉ người tải lên hoặc người quản lý task / project mới xoá được file này');
  }
  db.prepare('DELETE FROM attachments WHERE id = ?').run(attachment.id);
  rmSync(join(UPLOAD_DIR, attachment.stored_name), { force: true });
  if (attachment.task_id) {
    logEvent(findTask(attachment.task_id), req.user, 'file_deleted', { name: attachment.name, in_comment: Boolean(attachment.comment_id) });
  }
  if (attachment.feedback) touchFeedback(req, attachment.feedback);
  else if (attachment.conversation) pushChat(req, memberIds(attachment.conversation), attachment.conversation.id);
  else pushChange(req, ...attachment.change);
  res.status(204).end();
});

export default router;
