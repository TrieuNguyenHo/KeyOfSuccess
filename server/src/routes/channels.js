// The department-wide channel list. Everyone reads it; only Managers change it.
import express from 'express';
import { db, transaction } from '../db.js';
import { findTask } from '../lib/access.js';
import { channelNames, channelsByTask } from '../lib/channels.js';
import { logEvent } from '../lib/history.js';
import { badRequest, managerOnly, notFound } from '../lib/http.js';
import { pushChange } from '../lib/live.js';

const router = express.Router();

const CHANNEL_COLORS = ['#4573d2', '#e8384f', '#fd9a00', '#62d26f', '#a862ea', '#20aaea', '#f06a6a', '#37c5ab'];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// Everyone reads the list (filters, the task panel); only Managers see how many tasks carry each channel,
// since that counts tasks across the whole department.
router.get('/channels', (req, res) => {
  const count = req.user.role === 'manager';
  res.json(
    db
      .prepare(
        `SELECT c.*${count ? ', (SELECT COUNT(*) FROM task_channels tc WHERE tc.channel_id = c.id) AS task_count' : ''}
         FROM channels c ORDER BY c.name`
      )
      .all()
  );
});

const findChannel = (id) => db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
const channelNameTaken = (name, exceptId = 0) =>
  Boolean(db.prepare('SELECT 1 FROM channels WHERE lower(name) = lower(?) AND id != ?').get(name, exceptId));

// Tells everyone who sees a project with tasks on this channel that their tags changed.
function pushChannelChange(req, projectIds) {
  projectIds.forEach((project_id) => pushChange(req, { project_id }));
}
const projectsOfChannel = (channelId) =>
  db
    .prepare('SELECT DISTINCT t.project_id FROM task_channels tc JOIN tasks t ON t.id = tc.task_id WHERE tc.channel_id = ?')
    .all(channelId)
    .map((r) => r.project_id);

// Body { name, color? }; without a color the channel takes the next one of the palette.
router.post('/channels', managerOnly, (req, res) => {
  const name = req.body?.name?.trim();
  if (!name) return badRequest(res, 'Cần nhập tên kênh');
  if (channelNameTaken(name)) return res.status(409).json({ error: 'Tên kênh đã tồn tại' });
  const color = req.body.color ?? CHANNEL_COLORS[db.prepare('SELECT COUNT(*) AS n FROM channels').get().n % CHANNEL_COLORS.length];
  if (!HEX_COLOR.test(color)) return badRequest(res, 'Màu không hợp lệ');
  const { lastInsertRowid } = db.prepare('INSERT INTO channels (name, color) VALUES (?, ?)').run(name, color);
  res.status(201).json(findChannel(lastInsertRowid));
});

// Body { name?, color? }.
router.patch('/channels/:id', managerOnly, (req, res) => {
  const channel = findChannel(req.params.id);
  if (!channel) return notFound(res);
  const name = req.body?.name === undefined ? channel.name : String(req.body.name).trim();
  const color = req.body?.color ?? channel.color;
  if (!name) return badRequest(res, 'Cần nhập tên kênh');
  if (channelNameTaken(name, channel.id)) return res.status(409).json({ error: 'Tên kênh đã tồn tại' });
  if (!HEX_COLOR.test(color)) return badRequest(res, 'Màu không hợp lệ');
  db.prepare('UPDATE channels SET name = ?, color = ? WHERE id = ?').run(name, color, channel.id);
  pushChannelChange(req, projectsOfChannel(channel.id));
  res.json(findChannel(channel.id));
});

// The channel leaves every task that carried it; each of those tasks records it in its history.
router.delete('/channels/:id', managerOnly, (req, res) => {
  const channel = findChannel(req.params.id);
  if (!channel) return notFound(res);
  const projectIds = projectsOfChannel(channel.id);
  transaction(() => {
    const taskIds = db.prepare('SELECT task_id FROM task_channels WHERE channel_id = ?').all(channel.id).map((r) => r.task_id);
    const before = channelsByTask(taskIds);
    for (const taskId of taskIds) {
      const from = before.get(taskId);
      logEvent(findTask(taskId), req.user, 'field', {
        field: 'channels',
        from: channelNames(from),
        to: channelNames(from.filter((c) => c.id !== channel.id)),
      });
    }
    db.prepare('DELETE FROM channels WHERE id = ?').run(channel.id);
  });
  pushChannelChange(req, projectIds);
  res.status(204).end();
});

export default router;
