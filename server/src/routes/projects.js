// Projects and their members.
import express from 'express';
import { db, transaction } from '../db.js';
import {
  assigneeTeamsIn,
  canBeAssigned,
  canEdit,
  findProject,
  isMember,
  loadProject,
  membersOf,
  projectAccess,
  withTeams,
} from '../lib/access.js';
import { channelsByTask } from '../lib/channels.js';
import { badRequest, forbidden, managerOnly, notFound } from '../lib/http.js';
import { requirementsOf } from '../lib/requirements.js';
import { DEFAULT_STATUSES } from '../lib/statuses.js';
import { sweepUploads } from '../lib/uploads.js';
import { parseTeamIds } from '../lib/users.js';
import { IN_TEAM, placeholders } from '../lib/util.js';
import { isManager } from '../lib/roles.js';

const router = express.Router();

function setProjectTeams(projectId, teamIds) {
  db.prepare('DELETE FROM project_teams WHERE project_id = ?').run(projectId);
  const insert = db.prepare('INSERT INTO project_teams (project_id, team_id) VALUES (?, ?)');
  teamIds.forEach((teamId) => insert.run(projectId, teamId));
}

// Every project the user can open, each with its access level and teams, for the grouped sidebar.
router.get('/projects', (req, res) => {
  const me = req.user;
  const rows = db
    .prepare(
      `SELECT p.* FROM projects p
       WHERE ? IN ('manager', 'director') OR p.owner_id = ?
         OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = ?)
         OR (? = 'leader' AND EXISTS (SELECT 1 FROM project_teams pt WHERE pt.project_id = p.id
               AND pt.team_id IN (SELECT team_id FROM user_teams WHERE user_id = ?)))
       ORDER BY p.created_at, p.id`
    )
    .all(me.role, me.id, me.id, me.role, me.id);
  res.json(
    rows.map((row) => {
      const project = withTeams(row);
      return { ...project, access: projectAccess(me, project) };
    })
  );
});

// Only Managers create projects. Body { name, color, team_ids, add_team }: any teams (none = department-wide);
// add_team makes everyone in those teams a member.
router.post('/projects', managerOnly, (req, res) => {
  const me = req.user;
  const body = req.body ?? {};
  const name = body.name?.trim();
  if (!name) return badRequest(res, 'Cần nhập tên project');
  const teamIds = parseTeamIds(body.team_ids ?? []);
  if (!teamIds) return badRequest(res, 'Danh sách team không hợp lệ');

  const id = transaction(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO projects (name, color, owner_id) VALUES (?, ?, ?)')
      .run(name, body.color || '#4573d2', me.id);
    setProjectTeams(lastInsertRowid, teamIds);
    db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?)').run(lastInsertRowid, me.id);
    if (body.add_team) {
      const addTeam = db.prepare(
        `INSERT OR IGNORE INTO project_members (project_id, user_id)
         SELECT ?, u.id FROM users u WHERE u.id ${IN_TEAM} AND u.status = 'active'`
      );
      teamIds.forEach((teamId) => addTeam.run(lastInsertRowid, teamId));
    }
    const insertSection = db.prepare('INSERT INTO sections (project_id, name, position, kind) VALUES (?, ?, ?, ?)');
    DEFAULT_STATUSES.forEach(([kind, name], i) => insertSection.run(lastInsertRowid, name, i + 1, kind));
    return lastInsertRowid;
  });
  const project = findProject(id);
  res.status(201).json({ ...project, access: projectAccess(me, project) });
});

router.get('/projects/:id', (req, res) => {
  const project = loadProject(req, res, req.params.id);
  if (!project) return;
  const sections = db.prepare('SELECT * FROM sections WHERE project_id = ? ORDER BY position').all(project.id);
  const tasks = db
    .prepare(
      `SELECT t.*, u.name AS assignee_name,
         (SELECT COUNT(*) FROM tasks s WHERE s.parent_id = t.id) AS subtask_count,
         (SELECT COUNT(*) FROM tasks s WHERE s.parent_id = t.id AND s.completed = 1) AS subtask_done,
         (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) AS comment_count
       FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.project_id = ? AND t.parent_id IS NULL
       ORDER BY t.position`
    )
    .all(project.id);
  const assignees = [...new Set(tasks.map((t) => t.assignee_id).filter((id) => id != null))];
  const memberships = db
    .prepare(
      `SELECT ut.user_id, tm.id, tm.name FROM user_teams ut JOIN teams tm ON tm.id = ut.team_id
       WHERE ut.user_id IN (${placeholders(assignees)}) ORDER BY tm.name`
    )
    .all(...assignees);
  const teamsOf = (userId) => memberships.filter((m) => m.user_id === userId).map(({ id, name }) => ({ id, name }));
  const channels = channelsByTask(tasks.map((t) => t.id));
  res.json({
    // can_add_tasks: task admins, and members of the project's teams (for tasks of their own).
    project: { ...project, can_add_tasks: project.task_admin || (canEdit(project.access) && canBeAssigned(req.user.id, project)) },
    members: membersOf(project),
    sections,
    tasks: tasks.map((t) => ({
      ...t,
      assignee_teams: t.assignee_id == null ? [] : assigneeTeamsIn(project, teamsOf(t.assignee_id)),
      channels: channels.get(t.id) ?? [],
    })),
    requirements: requirementsOf(project.id),
  });
});

// Name and color need 'manage' access; changing the owning teams (team_ids) is for Managers only.
router.patch('/projects/:id', (req, res) => {
  const body = req.body ?? {};
  const changesTeams = body.team_ids !== undefined;
  const changesDetails = body.name !== undefined || body.color !== undefined;
  const project = loadProject(req, res, req.params.id, changesDetails ? 'manage' : 'view');
  if (!project) return;
  if (changesTeams && !isManager(req.user)) return forbidden(res, 'Chỉ Manager mới đổi được team của project');

  const name = body.name?.trim() ?? project.name;
  if (!name) return badRequest(res, 'Cần nhập tên project');
  const teamIds = changesTeams ? parseTeamIds(body.team_ids) : null;
  if (changesTeams && !teamIds) return badRequest(res, 'Danh sách team không hợp lệ');
  transaction(() => {
    db.prepare('UPDATE projects SET name = ?, color = ? WHERE id = ?').run(name, body.color ?? project.color, project.id);
    if (teamIds) setProjectTeams(project.id, teamIds);
  });
  const updated = findProject(project.id);
  res.json({ ...updated, access: projectAccess(req.user, updated) });
});

router.delete('/projects/:id', (req, res) => {
  const project = loadProject(req, res, req.params.id, 'manage');
  if (!project) return;
  db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
  sweepUploads();
  res.status(204).end();
});

// ---------- Project members ----------

router.post('/projects/:id/members', (req, res) => {
  const project = loadProject(req, res, req.params.id, 'manage');
  if (!project) return;
  const email = req.body?.email?.trim().toLowerCase();
  if (!email) return badRequest(res, 'Cần nhập email');
  const user = db.prepare("SELECT id, name, email FROM users WHERE email = ? AND status = 'active' AND role != 'root'").get(email);
  if (!user) return res.status(404).json({ error: 'Chưa có tài khoản đang hoạt động nào dùng email này' });
  if (isMember(project.id, user.id)) return res.status(409).json({ error: 'Người này đã là thành viên' });
  db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?)').run(project.id, user.id);
  res.status(201).json(user);
});

// The owner or team Leader can remove anyone except the owner; a member can only remove themselves (leave).
router.delete('/projects/:id/members/:userId', (req, res) => {
  const project = loadProject(req, res, req.params.id);
  if (!project) return;
  const userId = Number(req.params.userId);
  if (userId === project.owner_id) return badRequest(res, 'Không thể xoá owner khỏi project');
  if (project.access !== 'manage' && userId !== req.user.id) {
    return forbidden(res, 'Chỉ owner hoặc Leader của team mới làm được việc này');
  }
  if (!isMember(project.id, userId)) return notFound(res);
  transaction(() => {
    db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(project.id, userId);
    db.prepare('UPDATE tasks SET assignee_id = NULL WHERE project_id = ? AND assignee_id = ?').run(project.id, userId);
  });
  res.status(204).end();
});

export default router;
