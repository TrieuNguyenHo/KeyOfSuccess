// Projects and their members.
import express from 'express';
import { db, transaction } from '../db.js';
import {
  TASK_COUNTS,
  assigneeTeamsIn,
  canBeAssigned,
  canEdit,
  findProject,
  PROJECT_ROLES,
  isMember,
  loadProject,
  membersOf,
  projectAccess,
  roleFixed,
  teamRoleOf,
  withTeams,
} from '../lib/access.js';
import { channelsByTask } from '../lib/channels.js';
import { pushChange, pushNotifications } from '../lib/live.js';
import { badRequest, conflict, forbidden, notFound, requirePermission } from '../lib/http.js';
import { requirementsOf } from '../lib/requirements.js';
import { DEFAULT_STATUSES } from '../lib/statuses.js';
import { addDays, fillFromTemplate } from '../lib/templates.js';
import { sweepUploads } from '../lib/uploads.js';
import { AT_WORK, findUser, parseTeamIds } from '../lib/users.js';
import { IN_TEAM, placeholders, replaceLinks } from '../lib/util.js';
import { can, mergeOwnTeams, outranks, scopeOf } from '../lib/permissions.js';

const router = express.Router();

const setProjectTeams = (projectId, teamIds) => replaceLinks('project_teams', 'project_id', projectId, 'team_id', teamIds);

// Every project the user can open, each with its access level and teams, for the grouped sidebar.
router.get('/projects', (req, res) => {
  const me = req.user;
  const rows = db.prepare('SELECT p.* FROM projects p ORDER BY p.created_at, p.id').all();
  res.json(
    rows
      .map((row) => {
        const project = withTeams(row);
        return { ...project, access: projectAccess(me, project) };
      })
      .filter((p) => p.access)
  );
});

// Only projects.create creates projects. Body { name, color, team_ids, add_team }: any teams (none = department-wide);
// add_team makes everyone in those teams a member.
router.post('/projects', requirePermission('projects.create'), (req, res) => {
  const me = req.user;
  const body = req.body ?? {};
  const name = body.name?.trim();
  if (!name) return badRequest(res, 'Cần nhập tên hoạt động');
  const teamIds = parseTeamIds(body.team_ids ?? []);
  if (!teamIds) return badRequest(res, 'Danh sách team không hợp lệ');
  // With projects.change_teams 'team', the project belongs to one or more of the creator's own teams.
  if (scopeOf(me, 'projects.change_teams') === 'team' && (!teamIds.length || teamIds.some((id) => !me.team_ids.includes(id)))) {
    return forbidden(res, 'Chỉ chọn được team của bạn');
  }
  // From a template (v39): its due dates are placed from anchor_date, as the start (the first due date) or, with
  // anchor 'end', as the launch (the last one).
  let template = null;
  let start = null;
  if (body.template_id != null) {
    const row = db.prepare('SELECT data FROM project_templates WHERE id = ?').get(body.template_id);
    if (!row) return badRequest(res, 'Không tìm thấy mẫu');
    template = JSON.parse(row.data);
    if (template.span != null) {
      const day = String(body.anchor_date ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(new Date(`${day}T00:00:00Z`).getTime())) {
        return badRequest(res, 'Cần chọn ngày để đặt hạn chót cho các task');
      }
      start = body.anchor === 'end' ? addDays(day, -template.span) : day;
    }
  }

  let notified = [];
  const id = transaction(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO projects (name, color, owner_id) VALUES (?, ?, ?)')
      .run(name, body.color || '#4573d2', me.id);
    setProjectTeams(lastInsertRowid, teamIds);
    db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?)').run(lastInsertRowid, me.id);
    if (body.add_team) {
      const addTeam = db.prepare(
        `INSERT OR IGNORE INTO project_members (project_id, user_id)
         SELECT ?, u.id FROM users u WHERE u.id ${IN_TEAM} AND u.status = 'active' AND u.joined_at IS NOT NULL`
      );
      teamIds.forEach((teamId) => addTeam.run(lastInsertRowid, teamId));
    }
    const insertSection = db.prepare('INSERT INTO sections (project_id, name, position, kind) VALUES (?, ?, ?, ?)');
    DEFAULT_STATUSES.forEach(([kind, name], i) => insertSection.run(lastInsertRowid, name, i + 1, kind));
    if (template) notified = fillFromTemplate(lastInsertRowid, template, start, me);
    return lastInsertRowid;
  });
  pushNotifications(notified);
  const project = findProject(id);
  res.status(201).json({ ...project, access: projectAccess(me, project) });
});

router.get('/projects/:id', (req, res) => {
  const project = loadProject(req, res, req.params.id);
  if (!project) return;
  const sections = db.prepare('SELECT * FROM sections WHERE project_id = ? ORDER BY position').all(project.id);
  const tasks = db
    .prepare(
      `SELECT t.*, u.name AS assignee_name, ${TASK_COUNTS}
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
    members: membersWithRoles(req.user, project),
    sections,
    tasks: tasks.map((t) => ({
      ...t,
      assignee_teams: t.assignee_id == null ? [] : assigneeTeamsIn(project, teamsOf(t.assignee_id)),
      channels: channels.get(t.id) ?? [],
    })),
    requirements: requirementsOf(project.id),
  });
});

// Name and color need 'manage' access; changing the owning teams (team_ids) needs projects.change_teams.
router.patch('/projects/:id', (req, res) => {
  const body = req.body ?? {};
  const changesTeams = body.team_ids !== undefined;
  const changesDetails = body.name !== undefined || body.color !== undefined;
  const project = loadProject(req, res, req.params.id, changesDetails ? 'manage' : 'view');
  if (!project) return;
  if (changesTeams && !can(req.user, 'projects.change_teams')) return forbidden(res, 'Chỉ Manager mới đổi được team của hoạt động');

  const name = body.name?.trim() ?? project.name;
  if (!name) return badRequest(res, 'Cần nhập tên hoạt động');
  const changeScope = scopeOf(req.user, 'projects.change_teams');
  let teamIds = changesTeams ? parseTeamIds(body.team_ids) : null;
  if (changesTeams && !teamIds) return badRequest(res, 'Danh sách team không hợp lệ');
  // With 'team', only the user's own teams are added or removed; the project's other teams stay, and it keeps a team.
  if (teamIds) teamIds = mergeOwnTeams(req.user, changeScope, project.teams.map((t) => t.id), teamIds);
  if (teamIds && changeScope === 'team' && !teamIds.length) return forbidden(res, 'Chỉ chọn được team của bạn');
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
  // The project role 'admin' manages the project but does not delete it.
  if (project.role === 'admin') return forbidden(res, 'Admin của hoạt động không xoá được hoạt động');
  db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
  sweepUploads();
  res.status(204).end();
});

// ---------- Project members ----------

// The members with their project role (null: the team rules decide), what the team rules alone give them (team_role),
// whether a role can apply to them at all (fixed: the owner, whoever manages every project) and whether `me` may
// set it: whoever manages the project, for others not above their own role level.
function membersWithRoles(me, project) {
  return membersOf(project).map((m) => {
    const user = findUser(m.id);
    const fixed = roleFixed(user, project);
    return {
      ...m,
      role: fixed ? null : m.role,
      team_role: teamRoleOf(user, project),
      fixed,
      can_set_role: project.access === 'manage' && !fixed && m.id !== me.id && !outranks(user, me),
    };
  });
}

router.post('/projects/:id/members', (req, res) => {
  const project = loadProject(req, res, req.params.id, 'manage');
  if (!project) return;
  const email = req.body?.email?.trim().toLowerCase();
  if (!email) return badRequest(res, 'Cần nhập email');
  const user = db.prepare(`SELECT u.id, u.name, u.email FROM users u WHERE u.email = ? AND ${AT_WORK}`).get(email);
  if (!user) return notFound(res, 'Chưa có tài khoản đang hoạt động nào dùng email này');
  if (isMember(project.id, user.id)) return conflict(res, 'Người này đã là thành viên');
  db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?)').run(project.id, user.id);
  res.status(201).json(user);
});

// Sets a member's project role: { role: 'admin' | 'member' | 'viewer' | null } (null: back to the team rules).
// Needs 'manage' access; never for the owner, whoever manages every project, oneself, or a higher role level.
router.patch('/projects/:id/members/:userId', (req, res) => {
  const project = loadProject(req, res, req.params.id, 'manage');
  if (!project) return;
  const userId = Number(req.params.userId);
  if (!isMember(project.id, userId)) return notFound(res);
  const role = req.body?.role ?? null;
  if (role !== null && !PROJECT_ROLES.includes(role)) return badRequest(res, 'Vai trò trong hoạt động không hợp lệ');
  const user = findUser(userId);
  if (roleFixed(user, project)) return badRequest(res, 'Không đặt vai trò cho owner hay người quản lý mọi hoạt động');
  if (userId === req.user.id) return badRequest(res, 'Bạn không tự đổi vai trò của mình trong hoạt động');
  if (outranks(user, req.user)) return forbidden(res, 'Không đổi được vai trò của người có vai trò cao hơn bạn');
  db.prepare('UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?').run(role, project.id, userId);
  pushChange(req, { project_id: project.id });
  res.json(membersWithRoles(req.user, project).find((m) => m.id === userId));
});

// The owner or team Leader can remove anyone except the owner; a member can only remove themselves (leave).
router.delete('/projects/:id/members/:userId', (req, res) => {
  const project = loadProject(req, res, req.params.id);
  if (!project) return;
  const userId = Number(req.params.userId);
  if (userId === project.owner_id) return badRequest(res, 'Không thể xoá owner khỏi hoạt động');
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
