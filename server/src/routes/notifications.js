// The bell (notifications) and the live event stream.
import express from 'express';
import { db } from '../db.js';
import { openEventStream } from '../lib/live.js';

const router = express.Router();

router.get('/events', openEventStream);

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
       WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 50`
    )
    .all(req.user.id);
  const { unread } = db
    .prepare('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read_at IS NULL')
    .get(req.user.id);
  // Accounts waiting for this user's approval: all of them for Managers; for Leaders, the self sign-ups without
  // a team, which they may approve into one of their teams (a Leader's own invitations wait for a Manager).
  let pendingUsers = 0;
  if (req.user.role === 'manager') pendingUsers = db.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'pending'").get().n;
  if (req.user.role === 'leader') {
    pendingUsers = db
      .prepare(
        `SELECT COUNT(*) AS n FROM users u WHERE u.status = 'pending' AND u.invited_by IS NULL
         AND NOT EXISTS (SELECT 1 FROM user_teams ut WHERE ut.user_id = u.id)`
      )
      .get().n;
  }
  res.json({ items, unread, pendingUsers });
});

// Body { id } marks one notification read; an empty body marks all of them.
router.post('/notifications/read', (req, res) => {
  const id = req.body?.id;
  if (id) {
    db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ? AND read_at IS NULL").run(id, req.user.id);
  } else {
    db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(req.user.id);
  }
  res.status(204).end();
});

export default router;
