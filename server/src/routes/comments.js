// Editing and deleting task comments and requirement feedback, and the files sent with them (see COMMENT_KINDS).
import express from 'express';
import { db, transaction } from '../db.js';
import { COMMENT_KINDS, commentById, loadComment } from '../lib/comments.js';
import { logEvent } from '../lib/history.js';
import { badRequest, forbidden } from '../lib/http.js';
import { pushChange, pushNotifications } from '../lib/live.js';
import { MENTION_RE, plainExcerpt, resolveMentions } from '../lib/mentions.js';
import { notifyMentions } from '../lib/notifications.js';
import { rawUpload, saveAttachment, sweepUploads } from '../lib/uploads.js';
import { nameOfUser } from '../lib/users.js';
import { can } from '../lib/permissions.js';

const router = express.Router();

for (const [path, kind] of Object.entries(COMMENT_KINDS)) {
  const load = (req, res) => loadComment(kind, req, res);

  router.patch(`/${path}/:id`, (req, res) => {
    const found = load(req, res);
    if (!found) return;
    const { comment, viewers, target, change } = found;
    if (comment.user_id !== req.user.id) return forbidden(res, 'Chỉ người viết mới sửa được nội dung này');
    // Emptied text is fine while the comment still has files.
    const raw = req.body?.body?.trim() ?? '';
    const hasFiles = db.prepare(`SELECT 1 FROM attachments WHERE ${kind.fileColumn} = ?`).get(comment.id);
    if (!raw && !hasFiles) return badRequest(res, 'Nội dung không được để trống');
    const { body, mentioned, excerpt } = resolveMentions(raw, viewers, req.user);
    const before = new Set([...comment.body.matchAll(MENTION_RE)].map((m) => Number(m[2])));
    const added = mentioned.filter((id) => !before.has(id));
    transaction(() => {
      db.prepare(`UPDATE ${kind.table} SET body = ?, edited_at = datetime('now') WHERE id = ?`).run(body, comment.id);
      notifyMentions(added, req.user, { ...target, excerpt });
      if (found.task) logEvent(found.task, req.user, 'comment_edited', { from: plainExcerpt(comment.body), to: plainExcerpt(body) });
    });
    pushNotifications(added);
    pushChange(req, ...change);
    res.json(commentById(kind, comment.id));
  });

  router.delete(`/${path}/:id`, (req, res) => {
    const found = load(req, res);
    if (!found) return;
    if (found.comment.user_id !== req.user.id && !can(req.user, 'comments.delete_any')) {
      return forbidden(res, 'Chỉ người viết hoặc Manager mới xoá được nội dung này');
    }
    if (found.task) {
      const files = db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE comment_id = ?').get(found.comment.id).n;
      logEvent(found.task, req.user, 'comment_deleted', {
        excerpt: plainExcerpt(found.comment.body),
        author: nameOfUser(found.comment.user_id),
        files,
      });
    }
    db.prepare(`DELETE FROM ${kind.table} WHERE id = ?`).run(found.comment.id);
    sweepUploads(); // its files went with it
    pushChange(req, ...found.change);
    res.status(204).end();
  });

  // Files sent with a comment: only its author adds them, right after posting it (or while editing it).
  router.post(`/${path}/:id/attachments`, rawUpload, (req, res) => {
    const found = load(req, res);
    if (!found) return;
    if (found.comment.user_id !== req.user.id) return forbidden(res, 'Chỉ người viết mới đính kèm file vào nội dung này');
    saveAttachment(req, res, { ...found.target, [kind.fileColumn]: found.comment.id }, found.change);
  });
}

export default router;
