// Small SQL and date helpers used across the API.

// "?, ?, ?" for an IN list; "NULL" for an empty one, which matches nothing.
export const placeholders = (ids) => ids.map(() => '?').join(', ') || 'NULL';
// SQL condition "this user id is in team ?".
export const IN_TEAM = 'IN (SELECT user_id FROM user_teams WHERE team_id = ?)';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const nowStamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
export const localDate = (d) => d.toLocaleDateString('sv-SE'); // YYYY-MM-DD in the server's timezone
