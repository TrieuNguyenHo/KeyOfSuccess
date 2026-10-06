// Department-wide channel tags (Facebook, TikTok, SEO…) on top-level tasks.
import { db } from '../db.js';
import { placeholders } from './util.js';

// Map of task id → its channels ({ id, name, color }, by name).
export function channelsByTask(taskIds) {
  const rows = db
    .prepare(
      `SELECT tc.task_id, c.id, c.name, c.color FROM task_channels tc JOIN channels c ON c.id = tc.channel_id
       WHERE tc.task_id IN (${placeholders(taskIds)}) ORDER BY c.name`
    )
    .all(...taskIds);
  const map = new Map();
  for (const { task_id, ...channel } of rows) map.set(task_id, [...(map.get(task_id) ?? []), channel]);
  return map;
}
export const withChannels = (task) => task && { ...task, channels: channelsByTask([task.id]).get(task.id) ?? [] };
// As the history shows them: the names joined, or null for none.
export const channelNames = (channels) => channels.map((c) => c.name).join(', ') || null;
