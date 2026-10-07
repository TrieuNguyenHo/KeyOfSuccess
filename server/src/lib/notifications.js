// In-app notifications (the bell). Each function returns who was notified, for pushNotifications(), which the
// caller runs after its transaction.
import { db } from '../db.js';
import { scopeOf } from './permissions.js';
import { findUser, shareTeam } from './users.js';

// Tells whoever holds notify.task_completed over the assignee ('all', or 'team' when they share a team) that a
// top-level task was completed.
export function notifyCompleted(task, actor) {
  const recipients = db
    .prepare("SELECT id FROM users WHERE status = 'active' AND id != ?")
    .all(actor.id)
    .map((r) => findUser(r.id))
    .filter((u) => {
      const scope = scopeOf(u, 'notify.task_completed');
      return scope === 'all' || (scope === 'team' && task.assignee_id != null && shareTeam(u.id, task.assignee_id));
    })
    .map((u) => u.id);
  const insert = db.prepare("INSERT INTO notifications (user_id, actor_id, task_id, type) VALUES (?, ?, ?, 'task_completed')");
  recipients.forEach((id) => insert.run(id, actor.id, task.id));
  return recipients;
}

// Tells someone a task was assigned to them (unless they assigned it to themselves).
export function notifyAssigned(task, assigneeId, actor) {
  if (assigneeId === actor.id) return [];
  db.prepare("INSERT INTO notifications (user_id, actor_id, task_id, type) VALUES (?, ?, ?, 'assigned')").run(
    assigneeId,
    actor.id,
    task.id
  );
  return [assigneeId];
}

export function notifyMentions(userIds, actor, { taskId = null, requirementId = null, excerpt }) {
  const insert = db.prepare(
    "INSERT INTO notifications (user_id, actor_id, task_id, requirement_id, type, excerpt) VALUES (?, ?, ?, ?, 'mention', ?)"
  );
  userIds.forEach((userId) => insert.run(userId, actor.id, taskId, requirementId, excerpt));
  return userIds;
}
