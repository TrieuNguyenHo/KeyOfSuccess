// Saved filters (v41, decided 2026-10-09): each person's own quick views of a project (its tab and filters), of My
// tasks or of Work tracking, kept as the screen's URL hash. Nobody else sees them; a link does the sharing.
import express from 'express';
import { db } from '../db.js';
import { findProject, projectAccess } from '../lib/access.js';
import { badRequest, notFound } from '../lib/http.js';

const router = express.Router();
const NAME_MAX = 60;
const PER_SCREEN = 20;
// #/activity/3/board?… (#/project/3/board?… before 2026-10-10), #/my?…, #/team?…, #/team/team:3?… (the task panel's ?task= is left out by the client).
const HASH_RE = /^#\/(?:(?:activity|project)\/(\d+)\/[a-z]+|my|team(?:\/[\w:%.-]+)?)(?:\?[^#\s]*)?$/;

router.get('/saved-filters', (req, res) => {
  res.json(db.prepare('SELECT id, screen, project_id, name, hash FROM saved_filters WHERE user_id = ? ORDER BY id').all(req.user.id));
});

// Body { name, hash }.
router.post('/saved-filters', (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, NAME_MAX);
  const hash = String(req.body?.hash ?? '');
  const match = hash.length <= 500 && HASH_RE.exec(hash);
  if (!name) return badRequest(res, 'Cần đặt tên cho bộ lọc');
  if (!match) return badRequest(res, 'Bộ lọc không hợp lệ');
  const projectId = match[1] ? Number(match[1]) : null;
  const screen = projectId ? 'project' : hash.startsWith('#/my') ? 'my' : 'team';
  if (projectId) {
    const project = findProject(projectId);
    if (!project || !projectAccess(req.user, project)) return notFound(res);
  }
  const count = db
    .prepare('SELECT COUNT(*) AS n FROM saved_filters WHERE user_id = ? AND screen = ? AND project_id IS ?')
    .get(req.user.id, screen, projectId).n;
  if (count >= PER_SCREEN) return badRequest(res, 'Mỗi màn lưu được tối đa 20 bộ lọc');
  const { lastInsertRowid } = db
    .prepare('INSERT INTO saved_filters (user_id, screen, project_id, name, hash) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, screen, projectId, name, hash);
  res.status(201).json(db.prepare('SELECT id, screen, project_id, name, hash FROM saved_filters WHERE id = ?').get(lastInsertRowid));
});

router.delete('/saved-filters/:id', (req, res) => {
  const { changes } = db.prepare('DELETE FROM saved_filters WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!changes) return notFound(res);
  res.status(204).end();
});

export default router;
