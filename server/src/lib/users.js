import { db, transaction } from '../db.js';
import { outranks, permissionsOf, scopeOf } from './permissions.js';
import { isRoot } from './roles.js';

// joined: 0 while an invited person has not signed in yet (v25).
export const USER_SELECT = `SELECT u.id, u.name, u.email, u.role, u.status, u.language, u.invited_by, inv.name AS invited_by_name,
  (u.joined_at IS NOT NULL) AS joined
  FROM users u LEFT JOIN users inv ON inv.id = u.invited_by`;
// Users carry their teams (user_teams) as `teams`, their ids as `team_ids`, and the names joined as `team_name`.
export function withUserTeams(user) {
  if (!user) return user;
  const teams = db
    .prepare('SELECT tm.id, tm.name FROM user_teams ut JOIN teams tm ON tm.id = ut.team_id WHERE ut.user_id = ? ORDER BY tm.name')
    .all(user.id);
  return { ...user, teams, team_ids: teams.map((t) => t.id), team_name: teams.map((t) => t.name).join(', ') || null };
}
export const findUser = (id) => withUserTeams(db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(id));
// Every active account (root included), as findUser() returns them, for rules checked person by person.
export const activeUsers = () => db.prepare("SELECT id FROM users WHERE status = 'active'").all().map((r) => findUser(r.id));
// SQL condition over `u` (users): the people at work in the company, i.e. active, invitation accepted (v25), not root.
export const AT_WORK = "u.status = 'active' AND u.role != 'root' AND u.joined_at IS NOT NULL";
// Profile fields (v20) are private: only the user (/api/me) and Managers (user administration) receive them,
// so they are added here rather than in USER_SELECT, which many responses about other people use.
const PROFILE_FIELDS = ['birthday', 'phone', 'job_title', 'bio', 'gender', 'created_at', 'avatar'];
export const withProfile = (user) =>
  user && { ...user, ...db.prepare(`SELECT ${PROFILE_FIELDS.join(', ')} FROM users WHERE id = ?`).get(user.id) };

// The signed-in user's own account: profile plus what their role may do ({ key: scope }), which the client follows.
export const asMe = (user) => user && { ...withProfile(user), permissions: permissionsOf(user) };

export const nameOfUser = (id) => (id == null ? null : db.prepare('SELECT name FROM users WHERE id = ?').get(id)?.name ?? null);

export const shareTeam = (userId, otherId) =>
  Boolean(
    db
      .prepare('SELECT 1 FROM user_teams a JOIN user_teams b ON b.team_id = a.team_id WHERE a.user_id = ? AND b.user_id = ?')
      .get(userId, otherId)
  );

// Teams scope over a person: 'all', or 'team' when they share one of the user's teams.
const coversPerson = (me, scope, userId) => scope === 'all' || (scope === 'team' && shareTeam(me.id, userId));

// Someone's profile with their personal details, for the user and for people.profiles covering them, never for
// someone of a lower role level (a Manager's profile is not for Leaders, a Director's not for Managers). Root reads
// nobody's. Anyone else gets 404 (GET /api/users/:id/profile).
export const canReadProfile = (me, user) =>
  me.id === user.id || (!isRoot(me) && !outranks(user, me) && coversPerson(me, scopeOf(me, 'people.profiles'), user.id));

// Whose tasks a user watches (people.watch): everyone, or the people of their teams.
export const canWatchUser = (me, userId) => coversPerson(me, scopeOf(me, 'people.watch'), userId);

// Invitations: the account is created at once (nothing is emailed) and counts as joined from its first sign-in (v25).
export const emailTaken = (email) => Boolean(db.prepare('SELECT 1 FROM users WHERE email = ?').get(email));
export const EMAIL_TAKEN = 'Email này đã có tài khoản, hãy thêm người đó từ danh sách';
// Creates an invited account (in `teamId` when given; without a name, the part of the email before @) and returns its id.
export function createInvitedUser({ email, name, role, status, invitedBy, teamId = null }) {
  return transaction(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (name, email, role, status, invited_by) VALUES (?, ?, ?, ?, ?)')
      .run(name?.trim() || email.split('@')[0], email, role, status, invitedBy);
    if (teamId != null) db.prepare('INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)').run(lastInsertRowid, teamId);
    return lastInsertRowid;
  });
}

// Validates a team_ids array: returns the distinct ids sorted, or null if it is not an array of existing teams.
export function parseTeamIds(value) {
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.map(Number))].sort((a, b) => a - b);
  const exists = db.prepare('SELECT 1 FROM teams WHERE id = ?');
  return ids.every((id) => Number.isInteger(id) && exists.get(id)) ? ids : null;
}
