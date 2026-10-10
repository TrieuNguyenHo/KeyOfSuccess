// Sections (the board's columns, "trạng thái" in the UI) are managed by task admins only, since deleting one
// deletes its tasks.
import express from 'express';
import { db } from '../db.js';
import { findSection, loadProject } from '../lib/access.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';
import { pushChange } from '../lib/live.js';
import { sweepUploads } from '../lib/uploads.js';
import { nextPosition } from '../lib/util.js';

const router = express.Router();

const BUILT_IN = 'Không đổi tên hay xoá được trạng thái mặc định (Planned, In-Progress, Completed, Pending)';
const SECTION_ADMINS = 'Chỉ Manager hoặc Leader của team tham gia hoạt động mới quản lý được trạng thái';
function loadSectionForAdmin(req, res) {
  const section = findSection(req.params.id);
  if (!section) {
    notFound(res);
    return null;
  }
  const project = loadProject(req, res, section.project_id);
  if (!project) return null;
  if (!project.task_admin) {
    forbidden(res, SECTION_ADMINS);
    return null;
  }
  return section;
}

router.post('/projects/:id/sections', (req, res) => {
  const project = loadProject(req, res, req.params.id);
  if (!project) return;
  if (!project.task_admin) return forbidden(res, SECTION_ADMINS);
  const name = req.body?.name?.trim();
  if (!name) return badRequest(res, 'Cần nhập tên trạng thái');
  const { lastInsertRowid } = db
    .prepare('INSERT INTO sections (project_id, name, position) VALUES (?, ?, ?)')
    .run(project.id, name, nextPosition('sections', 'project_id', project.id));
  pushChange(req, { project_id: project.id });
  res.status(201).json(findSection(lastInsertRowid));
});

router.patch('/sections/:id', (req, res) => {
  const section = loadSectionForAdmin(req, res);
  if (!section) return;
  if (section.kind) return badRequest(res, BUILT_IN);
  const name = req.body?.name?.trim();
  if (!name) return badRequest(res, 'Cần nhập tên trạng thái');
  db.prepare('UPDATE sections SET name = ? WHERE id = ?').run(name, section.id);
  pushChange(req, { project_id: section.project_id });
  res.json(findSection(section.id));
});

router.delete('/sections/:id', (req, res) => {
  const section = loadSectionForAdmin(req, res);
  if (!section) return;
  // The built-in statuses stay: the done tick and new tasks rely on them.
  if (section.kind) return badRequest(res, BUILT_IN);
  db.prepare('DELETE FROM sections WHERE id = ?').run(section.id);
  sweepUploads();
  pushChange(req, { project_id: section.project_id });
  res.status(204).end();
});

export default router;
