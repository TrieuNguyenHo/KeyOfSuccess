// Downloading and deleting an attached file. Uploads go through the task, requirement and comment routes.
import express from 'express';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { UPLOAD_DIR, db } from '../db.js';
import { findTask, loadProject, loadTask } from '../lib/access.js';
import { logEvent } from '../lib/history.js';
import { forbidden, notFound } from '../lib/http.js';
import { pushChange } from '../lib/live.js';
import { canEditRequirements, findRequirement } from '../lib/requirements.js';

const router = express.Router();

// Only these are served with their own type (shown inline); anything else downloads as plain bytes, so an
// uploaded HTML or SVG file never runs as a page of the app.
const INLINE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

// Loads an attachment the user can see (else 404), with whether they may delete it: the uploader, task admins
// for a task's files, requirement editors for a requirement's.
function loadAttachment(req, res) {
  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
  if (!attachment) {
    notFound(res);
    return null;
  }
  const own = attachment.user_id === req.user.id;
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
  const inline = INLINE_TYPES.includes(attachment.mime);
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
  if (!attachment.canDelete) return forbidden(res, 'Chỉ người tải lên hoặc người quản lý task / requirement mới xoá được file này');
  db.prepare('DELETE FROM attachments WHERE id = ?').run(attachment.id);
  rmSync(join(UPLOAD_DIR, attachment.stored_name), { force: true });
  if (attachment.task_id) {
    logEvent(findTask(attachment.task_id), req.user, 'file_deleted', { name: attachment.name, in_comment: Boolean(attachment.comment_id) });
  }
  pushChange(req, ...attachment.change);
  res.status(204).end();
});

export default router;
