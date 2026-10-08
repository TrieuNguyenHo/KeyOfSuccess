// What each role may do (v24), set by root on the System configuration screen. A permission is held with a scope:
// 'none', 'team' (what concerns the holder's own teams) or 'all' (the whole department); permissions that have no
// team form take 'none' or 'all' only. The defaults are the rules decided with the user before v24, so a fresh
// database behaves exactly like the hard-coded rules did.
import { db } from '../db.js';
import { isRoot } from './roles.js';

const TEAM_SCOPES = ['none', 'team', 'all'];
const YES_NO = ['none', 'all'];

// defaults: [member, leader, manager, director]. Since v26 a Manager runs only their own teams (decided 2026-10-06);
// the Director alone sees the whole department.
export const PERMISSIONS = [
  // Opening projects one is not a member of (read + comment).
  { key: 'projects.view', scopes: TEAM_SCOPES, defaults: ['none', 'team', 'team', 'all'] },
  // Renaming, deleting and managing the members of projects one does not own.
  { key: 'projects.manage', scopes: TEAM_SCOPES, defaults: ['none', 'team', 'none', 'all'] },
  { key: 'projects.create', scopes: YES_NO, defaults: ['none', 'none', 'all', 'all'] },
  // Choosing a project's teams (when creating it, or later). 'team': only among one's own teams, at least one of them
  // (no department-wide project), leaving the project's other teams as they are.
  { key: 'projects.change_teams', scopes: TEAM_SCOPES, defaults: ['none', 'none', 'team', 'all'] },
  // Full rights on tasks: create, edit, assign, delete, statuses. 'team': projects one of the holder's teams takes
  // part in (a department-wide project when they can open it); 'all': every project, assigning anyone of its teams.
  { key: 'tasks.admin', scopes: TEAM_SCOPES, defaults: ['none', 'team', 'team', 'all'] },
  // Creating, editing and deleting requirements of projects one can open, besides those one manages.
  { key: 'requirements.manage', scopes: TEAM_SCOPES, defaults: ['none', 'none', 'team', 'all'] },
  // Watching other people's tasks (Work tracking, their tasks in view only) and the overview dashboard.
  { key: 'people.watch', scopes: TEAM_SCOPES, defaults: ['none', 'team', 'team', 'all'] },
  // Reading other people's personal details (never of someone of a higher role level).
  { key: 'people.profiles', scopes: TEAM_SCOPES, defaults: ['none', 'team', 'team', 'all'] },
  // User management: approve, lock, roles and teams of people (of a level not above one's own), invitations that are
  // active at once, approving people a Leader invited. 'team': the people of one's own teams and those with no team
  // yet, placed only in one's own teams (their other teams are left as they are).
  { key: 'users.manage', scopes: TEAM_SCOPES, defaults: ['none', 'none', 'team', 'all'] },
  // Members of teams: add people without a team, approve self sign-ups, invite (waiting for approval), remove Members.
  { key: 'teams.members', scopes: TEAM_SCOPES, defaults: ['none', 'team', 'team', 'all'] },
  // Teams themselves. 'team': rename one's own teams; creating and deleting teams needs 'all'.
  { key: 'teams.manage', scopes: TEAM_SCOPES, defaults: ['none', 'none', 'team', 'all'] },
  { key: 'channels.manage', scopes: YES_NO, defaults: ['none', 'none', 'all', 'all'] },
  { key: 'comments.delete_any', scopes: YES_NO, defaults: ['none', 'none', 'all', 'all'] },
  // Being told when a top-level task is completed: of the holder's teams, or of everyone.
  { key: 'notify.task_completed', scopes: TEAM_SCOPES, defaults: ['none', 'team', 'team', 'none'] },
  // Chat (v32): one-to-one messages with the other people at work who hold it too.
  { key: 'chat.use', scopes: YES_NO, defaults: ['all', 'all', 'all', 'all'] },
];
// The built-in roles, in the order of each permission's defaults.
const DEFAULT_ROLES = ['member', 'leader', 'manager', 'director'];
export const findPermission = (key) => PERMISSIONS.find((p) => p.key === key);

// Fills in every permission a role lacks: the default for a built-in role, 'none' for one root added (it started as a
// copy of another role, so only permissions added since then are missing). Scopes root already set are kept. Runs at
// startup, so a permission added in a later version starts with its default.
export function seedPermissions() {
  const insert = db.prepare('INSERT OR IGNORE INTO role_permissions (role, permission, scope) VALUES (?, ?, ?)');
  for (const p of PERMISSIONS) DEFAULT_ROLES.forEach((role, i) => insert.run(role, p.key, p.defaults[i]));
  for (const { key } of db.prepare('SELECT key FROM roles WHERE builtin = 0').all()) {
    for (const p of PERMISSIONS) insert.run(key, p.key, 'none');
  }
}

// Gives a new role the scopes another role holds.
export function copyPermissions(from, to) {
  db.prepare('INSERT INTO role_permissions (role, permission, scope) SELECT ?, permission, scope FROM role_permissions WHERE role = ?').run(
    to,
    from
  );
}

// Puts a built-in role back on the default scopes (a role root added has no defaults).
export function resetPermissions(role) {
  const i = DEFAULT_ROLES.indexOf(role);
  const update = db.prepare('UPDATE role_permissions SET scope = ? WHERE role = ? AND permission = ?');
  PERMISSIONS.forEach((p) => update.run(p.defaults[i], role, p.key));
}

const scopeStmt = () => db.prepare('SELECT scope FROM role_permissions WHERE role = ? AND permission = ?');
// The scope a user holds a permission with. Root holds none: it only configures (see ROOT_ROUTES).
export function scopeOf(user, key) {
  if (isRoot(user)) return 'none';
  return scopeStmt().get(user.role, key)?.scope ?? 'none';
}
export const can = (user, key) => scopeOf(user, key) !== 'none';
// Whether a scope covers something that concerns these teams ('team': any of them is one of the user's teams).
// With a 'team' scope the user only adds or removes their own teams: of `requested`, their own teams count, and the
// teams of `current` that are not theirs stay. With 'all', `requested` as it is.
export function mergeOwnTeams(user, scope, current, requested) {
  if (scope === 'all') return requested;
  const mine = (id) => user.team_ids.includes(id);
  return [...new Set([...requested.filter(mine), ...current.filter((id) => !mine(id))])].sort((a, b) => a - b);
}
export const coversTeams = (user, scope, teamIds) =>
  scope === 'all' || (scope === 'team' && teamIds.some((id) => user.team_ids.includes(id)));

// All of a user's permissions, for the client: { key: scope }.
export const permissionsOf = (user) => Object.fromEntries(PERMISSIONS.map((p) => [p.key, scopeOf(user, p.key)]));

// Role levels: nobody changes the account of, gives the role of, or reads the profile of someone above their own
// level. Root stands above every role.
export function levelOf(role) {
  if (role === 'root') return Infinity;
  return db.prepare('SELECT level FROM roles WHERE key = ?').get(role)?.level ?? 0;
}
export const outranks = (target, me) => levelOf(target.role) > levelOf(me.role);
// The roles that can be given in the app (root cannot: it comes from ROOT_EMAILS).
export const findRole = (key) => db.prepare('SELECT * FROM roles WHERE key = ?').get(key);
export const roleExists = (key) => Boolean(findRole(key));

// How many teams the holders of a role belong to (v27): min_teams 0 or 1, max_teams 1 or null (no limit). Returns
// the error for a list of teams that breaks the role's rule, else null. Root has no teams.
export function teamLimitsError(roleKey, teamIds) {
  const role = findRole(roleKey);
  if (!role) return null;
  if (role.min_teams > 0 && teamIds.length < role.min_teams) return `${role.name} phải thuộc ít nhất một team`;
  if (role.max_teams != null && teamIds.length > role.max_teams) return `${role.name} chỉ thuộc một team`;
  return null;
}
// Roles whose holders belong to one team at most (Member by default): adding them to a team moves them there.
export const singleTeam = (roleKey) => findRole(roleKey)?.max_teams === 1;
