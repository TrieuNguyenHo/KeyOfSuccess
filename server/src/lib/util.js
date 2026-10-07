// Small SQL and date helpers used across the API.
import { db } from '../db.js';

// "?, ?, ?" for an IN list; "NULL" for an empty one, which matches nothing.
export const placeholders = (ids) => ids.map(() => '?').join(', ') || 'NULL';
// SQL condition "this user id is in team ?".
export const IN_TEAM = 'IN (SELECT user_id FROM user_teams WHERE team_id = ?)';

// The position after the last row of `table` whose `column` is `value` (rows are ordered by position).
// table and column are always constants of the code, never user input.
export const nextPosition = (table, column, value) =>
  db.prepare(`SELECT COALESCE(MAX(position), 0) AS max FROM ${table} WHERE ${column} = ?`).get(value).max + 1;

// Replaces the rows of a link table (project_teams, user_teams, task_channels) that belong to one owner.
export function replaceLinks(table, ownerColumn, ownerId, otherColumn, otherIds) {
  db.prepare(`DELETE FROM ${table} WHERE ${ownerColumn} = ?`).run(ownerId);
  const insert = db.prepare(`INSERT INTO ${table} (${ownerColumn}, ${otherColumn}) VALUES (?, ?)`);
  otherIds.forEach((id) => insert.run(ownerId, id));
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const nowStamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
export const localDate = (d) => d.toLocaleDateString('sv-SE'); // YYYY-MM-DD in the server's timezone
