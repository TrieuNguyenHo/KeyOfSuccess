// The bell (notifications) and the live event stream.
import express from 'express';
import { db } from '../db.js';
import { openEventStream } from '../lib/live.js';
import { can, scopeOf } from '../lib/permissions.js';
import { placeholders } from '../lib/util.js';

const router = express.Router();

router.get('/events', openEventStream);

// The bell holds the work only (tasks, requirements). Notifications about feedback on the app stay out of it
// (decided 2026-10-08): they show as unreadFeedback on the Feedback menu and as `unread` on each feedback, and are
// read when the feedback is opened (routes/feedback.js).
router.get('/notifications', (req, res) => {
  const items = db
    .prepare(
      `SELECT n.*, a.name AS actor_name, t.title AS task_title, r.title AS requirement_title,
         p.id AS project_id, p.name AS project_name
       FROM notifications n
       LEFT JOIN tasks t ON t.id = n.task_id
       LEFT JOIN requirements r ON r.id = n.requirement_id
       JOIN projects p ON p.id = COALESCE(t.project_id, r.project_id)
       LEFT JOIN users a ON a.id = n.actor_id
       WHERE n.user_id = ? AND n.feedback_id IS NULL ORDER BY n.id DESC LIMIT 50`
    )
    .all(req.user.id);
  const unreadOf = (feedback) =>
    db
      .prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL AND feedback_id IS ${feedback ? 'NOT ' : ''}NULL`)
      .get(req.user.id).n;
  const unread = unreadOf(false);
  const unreadFeedback = unreadOf(true);
  // Chat messages are no notifications: the others' messages after what the user last read (v32).
  const unreadChat = can(req.user, 'chat.use')
    ? db
        .prepare(
          `SELECT COUNT(*) AS n FROM messages m
           JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
           WHERE m.id > cm.last_read_id AND m.user_id IS NOT ? AND m.deleted_at IS NULL`
        )
        .get(req.user.id, req.user.id).n
    : 0;
  // Accounts waiting for this user's approval: all of them with users.manage 'all'; with 'team', those of the user's
  // teams and those with no team; with teams.members only, the self sign-ups without a team, which they may approve
  // into one of their teams (invitations wait for users.manage).
  let pendingUsers = 0;
  const users = scopeOf(req.user, 'users.manage');
  if (users === 'all') pendingUsers = db.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'pending'").get().n;
  else if (users === 'team') {
    pendingUsers = db
      .prepare(
        `SELECT COUNT(*) AS n FROM users u WHERE u.status = 'pending'
         AND (NOT EXISTS (SELECT 1 FROM user_teams ut WHERE ut.user_id = u.id)
           OR EXISTS (SELECT 1 FROM user_teams ut WHERE ut.user_id = u.id AND ut.team_id IN (${placeholders(req.user.team_ids)})))`
      )
      .get(...req.user.team_ids).n;
  } else if (can(req.user, 'teams.members')) {
    pendingUsers = db
      .prepare(
        `SELECT COUNT(*) AS n FROM users u WHERE u.status = 'pending' AND u.invited_by IS NULL
         AND NOT EXISTS (SELECT 1 FROM user_teams ut WHERE ut.user_id = u.id)`
      )
      .get().n;
  }
  res.json({ items, unread, unreadFeedback, unreadChat, pendingUsers });
});

// Body { id } marks one notification read; an empty body marks all of the bell's (feedback ones are read by opening
// the feedback).
router.post('/notifications/read', (req, res) => {
  const id = req.body?.id;
  if (id) {
    db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ? AND read_at IS NULL").run(id, req.user.id);
  } else {
    db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL AND feedback_id IS NULL").run(
      req.user.id
    );
  }
  res.status(204).end();
});

export default router;
