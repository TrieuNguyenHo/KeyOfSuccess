// Who may open and change projects and tasks.
import { db } from '../db.js';
import { forbidden, notFound } from './http.js';
import { coversTeams, scopeOf } from './permissions.js';
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

// Columns for task lists, over the alias t: subtasks (done / all) and comments.
export const TASK_COUNTS = `(SELECT COUNT(*) FROM tasks s WHERE s.parent_id = t.id) AS subtask_count,
  (SELECT COUNT(*) FROM tasks s WHERE s.parent_id = t.id AND s.completed = 1) AS subtask_done,
  (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) AS comment_count`;

export const isMember = (projectId, userId) =>
  Boolean(db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId));

// Project roles (v30, decided 2026-10-07): a role set by hand for one member of one project wins over the team rules,
// in both directions; without one, the team rules decide. 'admin' manages the project (not deleting it) and has full
// task rights; 'member' works on their own tasks and may be assigned, even from another team; 'viewer' views and
// comments.
export const PROJECT_ROLES = ['admin', 'member', 'viewer'];
const ROLE_ACCESS = { admin: 'manage', member: 'edit', viewer: 'view' };
const roleOfMember = (projectId, userId) =>
  db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId)?.role ?? null;
// No role applies to the owner, nor to whoever manages every project (projects.manage 'all', the Director by default).
export const roleFixed = (user, project) => user.id === project.owner_id || scopeOf(user, 'projects.manage') === 'all';
// The role set by hand that applies to this user in this project, or null when the team rules decide.
export const projectRole = (user, project) => (roleFixed(user, project) ? null : roleOfMember(project.id, user.id));

// By the team rules: 'manage' for the owner, or projects.manage covering the project (rename, delete, members).
// 'edit' for project members (tasks, sections). 'view' for projects.view covering the project (read and comment).
// A department-wide project (no teams) is covered only by an 'all' scope.
function teamAccess(user, project) {
  const teamIds = project.teams.map((t) => t.id);
  if (project.owner_id === user.id || coversTeams(user, scopeOf(user, 'projects.manage'), teamIds)) return 'manage';
  if (isMember(project.id, user.id)) return 'edit';
  if (coversTeams(user, scopeOf(user, 'projects.view'), teamIds)) return 'view';
  return null;
}
export function projectAccess(user, project) {
  const role = projectRole(user, project);
  return role ? ROLE_ACCESS[role] : teamAccess(user, project);
}
const ACCESS_RANK = { view: 1, edit: 2, manage: 3 };
export const canEdit = (access) => ACCESS_RANK[access] >= ACCESS_RANK.edit;

// Full rights on a project's tasks (create, edit, assign, delete, sections), from tasks.admin: 'all' on every project,
// 'team' on the projects one of the user's teams takes part in. A department-wide project (no teams) counts every
// team, for those who can open it. A project role decides instead: only 'admin' has them.
export function isTaskAdmin(user, project) {
  const role = projectRole(user, project);
  return role ? role === 'admin' : teamTaskAdmin(user, project);
}
function teamTaskAdmin(user, project) {
  const scope = scopeOf(user, 'tasks.admin');
  if (scope !== 'team') return scope === 'all';
  if (!project.teams.length) return Boolean(teamAccess(user, project));
  return project.teams.some((t) => user.team_ids.includes(t.id));
}
// What the team rules alone give a member of the project, in project-role words, for the members list.
export function teamRoleOf(user, project) {
  if (teamAccess(user, project) === 'manage' || teamTaskAdmin(user, project)) return 'admin';
  return canBeAssignedByTeam(user.id, project) ? 'member' : 'viewer';
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
  const loaded = { ...project, access, role: projectRole(req.user, project), task_admin: isTaskAdmin(req.user, project) };
  return { ...loaded, can_edit_requirements: canEditRequirements(req.user, loaded) };
}

// Requirements are written by whoever manages the project and by requirements.manage covering it; with a project
// role, by its 'admin' only. `project` comes from loadProject (it carries `access`).
export function canEditRequirements(user, project) {
  const role = projectRole(user, project);
  if (role) return role === 'admin';
  return project.access === 'manage' || coversTeams(user, scopeOf(user, 'requirements.manage'), project.teams.map((t) => t.id));
}

export const membersOf = (project) =>
  db
    .prepare(
      `SELECT u.id, u.name, u.email, m.role FROM project_members m JOIN users u ON u.id = m.user_id
       WHERE m.project_id = ? ORDER BY u.id = ? DESC, m.added_at, u.name`
    )
    .all(project.id, project.owner_id);

// Only people of the project's teams (of any team for a department-wide project) are given its tasks. Members from
// other teams still view and comment, but are not assigned and do not add tasks for themselves. Tasks assigned
// before this rule keep their assignee. Invited people who have not signed in yet are not given tasks either.
// A project role decides instead: 'admin' and 'member' are given tasks wherever their teams are, 'viewer' never.
export function canBeAssigned(userId, project) {
  const role = roleOfMember(project.id, userId);
  if (role) return role !== 'viewer' && Boolean(db.prepare('SELECT 1 FROM users WHERE id = ? AND joined_at IS NOT NULL').get(userId));
  return canBeAssignedByTeam(userId, project);
}
function canBeAssignedByTeam(userId, project) {
  const teamIds = project.teams.map((t) => t.id);
  const inTeams = teamIds.length ? ` AND team_id IN (${placeholders(teamIds)})` : '';
  if (!db.prepare('SELECT 1 FROM users WHERE id = ? AND joined_at IS NOT NULL').get(userId)) return false;
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
// With tasks.admin 'all', every team counts as their own, so they assign anyone of the project's teams.
// Assigning someone who is not yet a member makes them one (see PATCH /api/tasks/:id).
// Project roles: an 'admin' by role assigns anyone of the project's teams; everyone assigns the members given the
// 'admin' or 'member' role (from any team), and nobody assigns a 'viewer'.
export function assignableBy(user, project) {
  const ownTeams =
    scopeOf(user, 'tasks.admin') === 'all' || projectRole(user, project) === 'admin'
      ? db.prepare('SELECT id FROM teams').all().map((t) => t.id)
      : user.team_ids;
  const teamIds = project.teams.length ? project.teams.map((t) => t.id).filter((id) => ownTeams.includes(id)) : ownTeams;
  return db
    .prepare(
      `SELECT u.id, u.name, u.email,
         EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = ? AND m.user_id = u.id) AS is_member
       FROM users u
       WHERE u.status = 'active' AND u.joined_at IS NOT NULL
         AND (u.id = ? OR u.id IN (SELECT user_id FROM user_teams WHERE team_id IN (${placeholders(teamIds)}))
           OR u.id IN (SELECT user_id FROM project_members WHERE project_id = ? AND role IN ('admin', 'member')))
         AND u.id NOT IN (SELECT user_id FROM project_members WHERE project_id = ? AND role = 'viewer')
       ORDER BY is_member DESC, u.name`
    )
    .all(project.id, user.id, ...teamIds, project.id, project.id)
    .filter((u) => u.id !== user.id || canBeAssigned(user.id, project));
}

// Which tasks a cross-project view covers, by people.watch: ?all=1 ('all'), ?team=<id> ('all', or 'team' for one of
// the user's teams), ?mine=1 (all of the user's own teams, any scope), otherwise ?assignee=me|<id>.
// Returns SQL filters over `t` (tasks) and `u` (the assignee), or sends 403.
export function taskScope(req, res) {
  const me = req.user;
  const { assignee, team, all, mine } = req.query;
  const watch = scopeOf(me, 'people.watch');
  let allowed, scope;
  if (all) {
    allowed = watch === 'all';
    scope = { where: '1 = 1', params: [], userWhere: '1 = 1', userParams: [] };
  } else if (team) {
    const teamId = Number(team);
    allowed = coversTeams(me, watch, [teamId]);
    scope = { where: `t.assignee_id ${IN_TEAM}`, params: [teamId], userWhere: `u.id ${IN_TEAM}`, userParams: [teamId] };
  } else if (mine) {
    allowed = watch !== 'none';
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
