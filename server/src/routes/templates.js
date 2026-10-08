// Project templates (v39): listed, saved from a project, renamed and deleted by whoever may create projects. Creating a
// project from one is POST /api/projects with template_id (routes/projects.js, lib/templates.js).
import express from 'express';
import { db } from '../db.js';
import { loadProject } from '../lib/access.js';
import { badRequest, notFound, requirePermission } from '../lib/http.js';
import { snapshotProject, summaryOf } from '../lib/templates.js';

const router = express.Router();
const NAME_MAX = 120;

const cleanName = (value) => String(value ?? '').trim().slice(0, NAME_MAX);
const findTemplate = (id) => db.prepare('SELECT * FROM project_templates WHERE id = ?').get(id);

function listItem(t) {
  const { data, ...rest } = t;
  return { ...rest, ...summaryOf(JSON.parse(data)) };
}

router.get('/project-templates', requirePermission('projects.create'), (req, res) => {
  const templates = db
    .prepare(
      `SELECT t.*, p.name AS source_project_name, u.name AS updated_by_name
       FROM project_templates t LEFT JOIN projects p ON p.id = t.source_project_id LEFT JOIN users u ON u.id = t.updated_by
       ORDER BY t.name COLLATE NOCASE, t.id`
    )
    .all();
  res.json(templates.map(listItem));
});

// Body { name, template_id? }: saves a project the user can open as a new template, or over template_id.
router.post('/projects/:id/template', requirePermission('projects.create'), (req, res) => {
  const project = loadProject(req, res, req.params.id);
  if (!project) return;
  const name = cleanName(req.body?.name);
  if (!name) return badRequest(res, 'Cần nhập tên mẫu');
  const data = JSON.stringify(snapshotProject(project.id));
  let id = req.body?.template_id;
  if (id != null) {
    if (!findTemplate(id)) return notFound(res, 'Không tìm thấy mẫu');
    db.prepare(
      `UPDATE project_templates SET name = ?, data = ?, source_project_id = ?, updated_by = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(name, data, project.id, req.user.id, id);
  } else {
    id = db
      .prepare('INSERT INTO project_templates (name, data, source_project_id, created_by, updated_by) VALUES (?, ?, ?, ?, ?)')
      .run(name, data, project.id, req.user.id, req.user.id).lastInsertRowid;
  }
  res.status(req.body?.template_id != null ? 200 : 201).json(listItem(findTemplate(id)));
});

router.patch('/project-templates/:id', requirePermission('projects.create'), (req, res) => {
  if (!findTemplate(req.params.id)) return notFound(res, 'Không tìm thấy mẫu');
  const name = cleanName(req.body?.name);
  if (!name) return badRequest(res, 'Cần nhập tên mẫu');
  db.prepare("UPDATE project_templates SET name = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?").run(
    name,
    req.user.id,
    req.params.id
  );
  res.json(listItem(findTemplate(req.params.id)));
});

router.delete('/project-templates/:id', requirePermission('projects.create'), (req, res) => {
  if (!findTemplate(req.params.id)) return notFound(res, 'Không tìm thấy mẫu');
  db.prepare('DELETE FROM project_templates WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
