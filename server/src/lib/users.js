import { db } from '../db.js';
import { isDirector, isManager } from './roles.js';

export const USER_SELECT = `SELECT u.id, u.name, u.email, u.role, u.status, u.language, u.invited_by, inv.name AS invited_by_name
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
// Profile fields (v20) are private: only the user (/api/me) and Managers (user administration) receive them,
// so they are added here rather than in USER_SELECT, which many responses about other people use.
const PROFILE_FIELDS = ['birthday', 'phone', 'job_title', 'bio', 'gender', 'created_at', 'avatar'];
export const withProfile = (user) =>
  user && { ...user, ...db.prepare(`SELECT ${PROFILE_FIELDS.join(', ')} FROM users WHERE id = ?`).get(user.id) };

export const nameOfUser = (id) => (id == null ? null : db.prepare('SELECT name FROM users WHERE id = ?').get(id)?.name ?? null);

export const shareTeam = (userId, otherId) =>
  Boolean(
    db
      .prepare('SELECT 1 FROM user_teams a JOIN user_teams b ON b.team_id = a.team_id WHERE a.user_id = ? AND b.user_id = ?')
      .get(userId, otherId)
  );

// Someone's profile with their personal details, for the people allowed to read them (decided 2026-10-06): the user,
// Directors, Managers, and the Leaders of any team the user belongs to, except that a Manager's profile is for
// Managers and Directors only, and a Director's for Directors only. Anyone else gets 404 (GET /api/users/:id/profile).
export const canReadProfile = (me, user) =>
  me.id === user.id ||
  isDirector(me) ||
  (isManager(me) && !isDirector(user)) ||
  (me.role === 'leader' && !isManager(user) && shareTeam(me.id, user.id));

// Managers and Directors watch everyone; Leaders watch the people in any of their teams.
export const canWatchUser = (me, userId) => isManager(me) || (me.role === 'leader' && shareTeam(me.id, userId));

// Validates a team_ids array: returns the distinct ids sorted, or null if it is not an array of existing teams.
export function parseTeamIds(value) {
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.map(Number))].sort((a, b) => a - b);
  const exists = db.prepare('SELECT 1 FROM teams WHERE id = ?');
  return ids.every((id) => Number.isInteger(id) && exists.get(id)) ? ids : null;
}
