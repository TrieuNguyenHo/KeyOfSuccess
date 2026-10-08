// In-app notifications (the bell). Each function returns who was notified, for pushNotifications(), which the
// caller runs after its transaction.
import { db } from '../db.js';
import { taskAccess } from './access.js';
import { scopeOf } from './permissions.js';
import { isRoot } from './roles.js';
import { activeUsers, findUser, shareTeam } from './users.js';

// Tells whoever holds notify.task_completed over the assignee ('all', or 'team' when they share a team) that a
// top-level task was completed.
export function notifyCompleted(task, actor) {
  const recipients = activeUsers()
    .filter((u) => {
      if (u.id === actor.id) return false;
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

// ---------- Following a task (v38) ----------
// The assignee, the creator and commenters follow a task on their own (follow()); anyone who can see it turns it on
// or off by hand (setFollowing()), and turning it off stays off.

export function follow(taskId, userId) {
  if (userId != null) db.prepare('INSERT OR IGNORE INTO task_followers (task_id, user_id) VALUES (?, ?)').run(taskId, userId);
}

export function setFollowing(taskId, userId, following) {
  db.prepare(
    `INSERT INTO task_followers (task_id, user_id, following) VALUES (?, ?, ?)
     ON CONFLICT (task_id, user_id) DO UPDATE SET following = excluded.following`
  ).run(taskId, userId, following ? 1 : 0);
}

// The people at work following a task who can still see it, as findUser() returns them. Root is not part of the
// company: a task created before its account became root keeps the row but leaves it out.
export function followersOf(task) {
  return db
    .prepare('SELECT user_id FROM task_followers WHERE task_id = ? AND following = 1')
    .all(task.id)
    .map((r) => findUser(r.user_id))
    .filter((u) => u?.status === 'active' && !isRoot(u) && taskAccess(u, task));
}

// Tells a task's followers, except the actor and `skip` (people already notified about the same thing, e.g. the
// mentioned or the new assignee), that something happened to it. Returns who was notified.
export function notifyFollowers(task, actor, type, excerpt = null, skip = []) {
  const recipients = followersOf(task)
    .map((u) => u.id)
    .filter((id) => id !== actor.id && !skip.includes(id));
  const insert = db.prepare('INSERT INTO notifications (user_id, actor_id, task_id, type, excerpt) VALUES (?, ?, ?, ?, ?)');
  recipients.forEach((id) => insert.run(id, actor.id, task.id, type, excerpt));
  return recipients;
}

// What a change to a task tells its followers: due date, assignee, status (or the tick of a subtask, which has no
// status). `before` and `after` are task rows; `skip` as in notifyFollowers().
export function notifyTaskChanges(before, after, actor, skip = []) {
  const ids = [];
  if ((before.due_date ?? null) !== (after.due_date ?? null)) {
    ids.push(...notifyFollowers(after, actor, 'task_due', after.due_date ?? null, skip));
  }
  if ((before.assignee_id ?? null) !== (after.assignee_id ?? null)) {
    const name = after.assignee_id == null ? null : findUser(after.assignee_id)?.name ?? null;
    ids.push(...notifyFollowers(after, actor, 'task_assignee', name, [...skip, after.assignee_id]));
  }
  if (after.section_id != null && before.section_id !== after.section_id) {
    const status = db.prepare('SELECT name FROM sections WHERE id = ?').get(after.section_id)?.name ?? null;
    ids.push(...notifyFollowers(after, actor, 'task_status', status, skip));
  } else if (Boolean(before.completed) !== Boolean(after.completed)) {
    ids.push(...notifyFollowers(after, actor, after.completed ? 'task_done' : 'task_reopened', null, skip));
  }
  return ids;
}
