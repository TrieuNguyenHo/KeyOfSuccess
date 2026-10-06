// Who may open and change projects and tasks.
import { db } from '../db.js';
import { forbidden, notFound } from './http.js';
import { isDirector, isManager } from './roles.js';
import { canWatchUser } from './users.js';
import { IN_TEAM, placeholders } from './util.js';

const teamsOf = (projectId) =>
  db
    .prepare(
      'SELECT tm.id, tm.name FROM project_teams pt JOIN teams tm ON tm.id = pt.team_id WHERE pt.project_id = ? ORDER BY tm.name'
    )
    .all(projectId);
// Projects carry their owning teams as `teams`; the legacy projects.team_id column is dropped from responses.
export const withTeams = ({ team_id, ...project }) => ({ ...project, teams: teamsOf(project.id) });
export const findProject = (id) => {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  return row && withTeams(row);
};
// node:sqlite cannot bind undefined; a missing id is simply no section (a task posted without one gets a 400).
export const findSection = (id) => (id == null ? undefined : db.prepare('SELECT * FROM sections WHERE id = ?').get(id));

export const findTask = (id) =>
  db
    .prepare(
      `SELECT t.*, u.name AS assignee_name, p.name AS project_name, p.color AS project_color,
         r.title AS requirement_title
       FROM tasks t JOIN projects p ON p.id = t.project_id LEFT JOIN users u ON u.id = t.assignee_id
       LEFT JOIN requirements r ON r.id = t.requirement_id
       WHERE t.id = ?`
    )
    .get(id);

export const isMember = (projectId, userId) =>
  Boolean(db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId));

// 'manage': Directors, the owner, or a Leader of any of the project's teams (rename, delete, members).
// 'edit': project members (tasks, sections). 'view': Managers, who read and comment on every project.
export function projectAccess(user, project) {
  if (isDirector(user) || project.owner_id === user.id) return 'manage';
  if (user.role === 'leader' && project.teams.some((t) => user.team_ids.includes(t.id))) return 'manage';
  if (isMember(project.id, user.id)) return 'edit';
  if (isManager(user)) return 'view';
  return null;
}
const ACCESS_RANK = { view: 1, edit: 2, manage: 3 };
export const canEdit = (access) => ACCESS_RANK[access] >= ACCESS_RANK.edit;

// Full rights on a project's tasks (create, edit, assign, delete, sections): Directors on every project, Managers and
// Leaders of a team that takes part in it. A department-wide project (no teams) counts every team, for those who can
// open it.
export function isTaskAdmin(user, project) {
  if (isDirector(user)) return true;
  if (user.role !== 'manager' && user.role !== 'leader') return false;
  if (!project.teams.length) return Boolean(projectAccess(user, project));
  return project.teams.some((t) => user.team_ids.includes(t.id));
}

// 'admin' for task admins. 'edit' for project members on the tasks assigned to them (no assigning, no deleting).
// 'view' (read + comment) for everyone else who can open the project and for whoever watches the assignee.
// Subtasks are judged on their parent task.
export function taskAccess(user, task) {
  const project = findProject(task.project_id);
  if (isTaskAdmin(user, project)) return 'admin';
  const access = projectAccess(user, project);
  const root = task.parent_id ? findTask(task.parent_id) : task;
  if (canEdit(access) && root.assignee_id === user.id) return 'edit';
  if (access) return 'view';
  if (root.assignee_id && canWatchUser(user, root.assignee_id)) return 'view';
  return null;
}

// Responds 404 when the task is invisible, so ids cannot be probed.
export function loadTask(req, res, taskId, need) {
  const task = findTask(taskId);
  const access = task && taskAccess(req.user, task);
  if (!access) {
    notFound(res);
    return null;
  }
  if (need === 'edit' && access === 'view') {
    forbidden(res, 'Bạn chỉ có quyền xem và comment task này');
    return null;
  }
  if (need === 'admin' && access !== 'admin') {
    forbidden(res, 'Chỉ Manager hoặc Leader của team tham gia project mới làm được việc này');
    return null;
  }
  return { ...task, access };
}

// Loads a project the user has at least `need` access to. Users who cannot see it get 404
// rather than 403, so they cannot probe which project ids exist.
export function loadProject(req, res, projectId, need = 'view') {
  const project = findProject(projectId);
  const access = project && projectAccess(req.user, project);
  if (!access) {
    notFound(res);
    return null;
  }
  if (ACCESS_RANK[access] < ACCESS_RANK[need]) {
    forbidden(
      res,
      need === 'manage' ? 'Chỉ owner hoặc Leader của team mới làm được việc này' : 'Bạn chỉ có quyền xem project này'
    );
    return null;
  }
  return { ...project, access, task_admin: isTaskAdmin(req.user, project) };
}

export const membersOf = (project) =>
  db
    .prepare(
      `SELECT u.id, u.name, u.email FROM project_members m JOIN users u ON u.id = m.user_id
       WHERE m.project_id = ? ORDER BY u.id = ? DESC, m.added_at, u.name`
    )
    .all(project.id, project.owner_id);

// Only people of the project's teams (of any team for a department-wide project) are given its tasks. Members from
// other teams still view and comment, but are not assigned and do not add tasks for themselves. Tasks assigned
// before this rule keep their assignee.
export function canBeAssigned(userId, project) {
  const teamIds = project.teams.map((t) => t.id);
  const inTeams = teamIds.length ? ` AND team_id IN (${placeholders(teamIds)})` : '';
  return Boolean(db.prepare(`SELECT 1 FROM user_teams WHERE user_id = ?${inTeams}`).get(userId, ...teamIds));
}

// The teams shown on a task for its assignee: those of the project's teams they belong to (all their teams for a
// department-wide project, or when an old assignee is in none of the project's teams).
export function assigneeTeamsIn(project, userTeams) {
  const projectTeams = project.teams.map((t) => t.id);
  const inProject = projectTeams.length ? userTeams.filter((t) => projectTeams.includes(t.id)) : userTeams;
  return inProject.length ? inProject : userTeams;
}

// Whom a task admin may assign the project's tasks to: themselves and the active people of their own teams that
// take part in the project (any own team for a department-wide project); themselves only if canBeAssigned().
// Directors count every team as their own, so they assign anyone of the project's teams.
// Assigning someone who is not yet a member makes them one (see PATCH /api/tasks/:id).
export function assignableBy(user, project) {
  const ownTeams = isDirector(user) ? db.prepare('SELECT id FROM teams').all().map((t) => t.id) : user.team_ids;
  const teamIds = project.teams.length ? project.teams.map((t) => t.id).filter((id) => ownTeams.includes(id)) : ownTeams;
  return db
    .prepare(
      `SELECT u.id, u.name, u.email,
         EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = ? AND m.user_id = u.id) AS is_member
       FROM users u
       WHERE u.status = 'active'
         AND (u.id = ? OR u.id IN (SELECT user_id FROM user_teams WHERE team_id IN (${placeholders(teamIds)})))
       ORDER BY is_member DESC, u.name`
    )
    .all(project.id, user.id, ...teamIds)
    .filter((u) => u.id !== user.id || canBeAssigned(user.id, project));
}

// Which tasks a cross-project view covers: ?all=1 (Managers), ?team=<id> (a Leader of that team or a Manager),
// ?mine=1 (all of a Leader's or Manager's own teams), otherwise ?assignee=me|<id>.
// Returns SQL filters over `t` (tasks) and `u` (the assignee), or sends 403.
export function taskScope(req, res) {
  const me = req.user;
  const { assignee, team, all, mine } = req.query;
  let allowed, scope;
  if (all) {
    allowed = isManager(me);
    scope = { where: '1 = 1', params: [], userWhere: '1 = 1', userParams: [] };
  } else if (team) {
    const teamId = Number(team);
    allowed = isManager(me) || (me.role === 'leader' && me.team_ids.includes(teamId));
    scope = { where: `t.assignee_id ${IN_TEAM}`, params: [teamId], userWhere: `u.id ${IN_TEAM}`, userParams: [teamId] };
  } else if (mine) {
    allowed = me.role !== 'member';
    const inMine = `IN (SELECT user_id FROM user_teams WHERE team_id IN (${placeholders(me.team_ids)}))`;
    scope = { where: `t.assignee_id ${inMine}`, params: me.team_ids, userWhere: `u.id ${inMine}`, userParams: me.team_ids };
  } else {
    const userId = !assignee || assignee === 'me' ? me.id : Number(assignee);
    allowed = userId === me.id || canWatchUser(me, userId);
    scope = { where: 't.assignee_id = ?', params: [userId], userWhere: 'u.id = ?', userParams: [userId] };
  }
  if (!allowed) {
    forbidden(res);
    return null;
  }
  return scope;
}
