// Feedback on the app (v31, decided 2026-10-08): any company user sends it and sees only their own; root handles it.
// Shared by routes/feedback.js and the attachment routes (files of a feedback and of its messages).
import { ROOT_EMAILS } from '../config.js';
import { db } from '../db.js';
import { notFound } from './http.js';
import { pushFeedbackChange } from './live.js';
import { isRoot } from './roles.js';

export const FEEDBACK_TYPES = ['bug', 'idea', 'other'];
export const FEEDBACK_STATUSES = ['sent', 'received', 'in_progress', 'done', 'rejected'];

// The root accounts that handle feedback: active, and still in ROOT_EMAILS.
export const rootIds = () =>
  db
    .prepare("SELECT id, email FROM users WHERE role = 'root' AND status = 'active'")
    .all()
    .filter((u) => ROOT_EMAILS.includes(u.email))
    .map((u) => u.id);

// Loads the feedback :id for its sender or root; anyone else gets 404, as if it did not exist.
export function loadFeedback(req, res, id) {
  const feedback = db.prepare('SELECT * FROM feedback WHERE id = ?').get(id);
  if (!feedback || (feedback.user_id !== req.user.id && !isRoot(req.user))) {
    notFound(res);
    return null;
  }
  return feedback;
}

// The sender edits, deletes and adds or removes files of their feedback only until root takes it up.
export const editable = (feedback, user) => feedback.user_id === user.id && feedback.status === 'sent';

// Marks the feedback as changed now and tells the open tabs of its sender and of root.
export function touchFeedback(req, feedback) {
  db.prepare("UPDATE feedback SET updated_at = datetime('now') WHERE id = ?").run(feedback.id);
  pushFeedbackChange(req, [feedback.user_id, ...rootIds()], feedback.id);
}
