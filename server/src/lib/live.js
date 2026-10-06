// Live updates (Server-Sent Events).
// Open event streams per user. The client reads GET /api/events with its bearer token (fetch, not
// EventSource, so the token never goes into a URL). On `notification` it refetches /api/notifications;
// on `change` it reloads whatever open view shows that project, task or requirement.
import { findProject, projectAccess, taskAccess } from './access.js';
import { findUser } from './users.js';

const streams = new Map();
const HEARTBEAT_MS = 25000; // keeps proxies from closing an idle stream

export function openEventStream(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 5000\n\n');
  const userId = req.user.id;
  if (!streams.has(userId)) streams.set(userId, new Set());
  streams.get(userId).add(res);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  req.on('close', () => {
    clearInterval(heartbeat);
    streams.get(userId)?.delete(res);
    if (!streams.get(userId)?.size) streams.delete(userId);
  });
}

// Tells the given users' open tabs that they have new notifications. Called after the transaction
// that created them, so the refetch sees committed rows.
export function pushNotifications(userIds) {
  for (const userId of new Set(userIds)) {
    for (const res of streams.get(userId) ?? []) res.write('event: notification\ndata: {}\n\n');
  }
}

// Tells the open tabs of everyone who can open the project (or, given `task`, see that task) that its tasks,
// sections, requirements or comments changed. Carries ids only, so nothing leaks; `source` echoes the
// X-Client-Id of the tab that made the change, which already has it and skips the event.
export function pushChange(req, { project_id, task_id = null, requirement_id = null }, task = null) {
  const project = findProject(project_id);
  if (!project) return;
  const source = String(req.get('X-Client-Id') ?? '').slice(0, 64);
  const message = `event: change\ndata: ${JSON.stringify({ project_id, task_id, requirement_id, source })}\n\n`;
  for (const [userId, tabs] of streams) {
    const user = findUser(userId);
    if (user?.status !== 'active') continue;
    if (!projectAccess(user, project) && !(task && taskAccess(user, task))) continue;
    for (const res of tabs) res.write(message);
  }
}
