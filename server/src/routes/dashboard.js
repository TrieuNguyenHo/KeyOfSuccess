// The overview dashboard (Leaders and Managers) and each project's dashboard.
import express from 'express';
import { db } from '../db.js';
import { loadProject, taskScope } from '../lib/access.js';
import { badRequest, forbidden } from '../lib/http.js';
import { IN_TEAM, localDate } from '../lib/util.js';

const router = express.Router();

const TREND_DAYS = 14;
// A user's team names joined, for workload tables.
const TEAM_NAMES =
  "(SELECT group_concat(tm.name, ', ' ORDER BY tm.name) FROM user_teams ut JOIN teams tm ON tm.id = ut.team_id WHERE ut.user_id = u.id) AS team_name";
const DASHBOARD_FROM = 'FROM tasks t JOIN projects p ON p.id = t.project_id LEFT JOIN users u ON u.id = t.assignee_id';
// Per-group task counts over the alias t. due_date is a local calendar date; completed_at is UTC,
// like every SQLite datetime('now').
const DASHBOARD_COUNTS = `
    COALESCE(SUM(t.completed = 0), 0) AS open,
    COALESCE(SUM(t.completed = 0 AND t.due_date < date('now', 'localtime')), 0) AS overdue,
    COALESCE(SUM(t.completed = 0 AND t.due_date BETWEEN date('now', 'localtime')
      AND date('now', 'localtime', '+7 days')), 0) AS due_soon,
    COALESCE(SUM(t.completed = 1 AND t.completed_at >= datetime('now', '-7 days')), 0) AS done_7d`;

// Top-level tasks completed per local day over the last TREND_DAYS days, oldest first.
function completionTrend(where, params) {
  const doneByDay = Object.fromEntries(
    db
      .prepare(
        `SELECT date(t.completed_at, 'localtime') AS day, COUNT(*) AS done
         ${DASHBOARD_FROM} WHERE t.parent_id IS NULL AND t.completed = 1
           AND date(t.completed_at, 'localtime') > date('now', 'localtime', '-${TREND_DAYS} days') AND ${where}
         GROUP BY day`
      )
      .all(...params)
      .map((r) => [r.day, r.done])
  );
  return Array.from({ length: TREND_DAYS }, (_, i) => {
    const day = localDate(new Date(Date.now() - (TREND_DAYS - 1 - i) * 86400000));
    return { day, done: doneByDay[day] ?? 0 };
  });
}

// Progress per channel of the top-level tasks matching `where` (over t, p, u as in DASHBOARD_FROM): only the
// channels those tasks carry, by name; a task on several channels counts in each. no_channel: the untagged ones.
function channelBreakdown(where, params) {
  const counts = `${DASHBOARD_COUNTS}, COUNT(*) AS total, COALESCE(SUM(t.completed = 1), 0) AS done`;
  const channels = db
    .prepare(
      `SELECT c.id, c.name, c.color, ${counts}
       FROM task_channels tc JOIN channels c ON c.id = tc.channel_id JOIN tasks t ON t.id = tc.task_id
       JOIN projects p ON p.id = t.project_id LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.parent_id IS NULL AND ${where}
       GROUP BY c.id ORDER BY c.name`
    )
    .all(...params);
  const noChannel = db
    .prepare(
      `SELECT ${counts} ${DASHBOARD_FROM}
       WHERE t.parent_id IS NULL AND ${where} AND NOT EXISTS (SELECT 1 FROM task_channels tc WHERE tc.task_id = t.id)`
    )
    .get(...params);
  return { channels, no_channel: noChannel };
}

// Dashboard for Leaders (own team) and Managers (?all=1 or ?team=<id>): totals, workload per person,
// completions per day and progress per project. Uses the same scopes and permissions as /api/tasks.
router.get('/dashboard', (req, res) => {
  if (req.user.role === 'member') return forbidden(res);
  const scope = taskScope(req, res);
  if (!scope) return;
  const { where, params, userWhere, userParams } = scope;
  const from = DASHBOARD_FROM;
  const counts = DASHBOARD_COUNTS;

  const summary = db
    .prepare(
      `SELECT ${counts}, COALESCE(SUM(t.completed = 0 AND t.assignee_id IS NULL), 0) AS unassigned
       ${from} WHERE t.parent_id IS NULL AND ${where}`
    )
    .get(...params);

  // Starts from users, so people with nothing assigned still show up as free capacity.
  const people = db
    .prepare(
      `SELECT u.id, u.name, u.role, ${TEAM_NAMES}, ${counts},
         COALESCE(SUM(t.completed = 0 AND t.priority = 'high'), 0) AS high
       FROM users u
       LEFT JOIN tasks t ON t.assignee_id = u.id AND t.parent_id IS NULL
       WHERE u.status = 'active' AND u.role != 'root' AND ${userWhere}
       GROUP BY u.id
       ORDER BY open DESC, overdue DESC, u.name`
    )
    .all(...userParams);

  const trend = completionTrend(where, params);

  const projects = db
    .prepare(
      `SELECT p.id, p.name, p.color, ${counts}, COALESCE(SUM(t.completed = 1), 0) AS done
       ${from} WHERE t.parent_id IS NULL AND ${where}
       GROUP BY p.id
       ORDER BY open DESC, p.name`
    )
    .all(...params);

  res.json({ summary, people, trend, projects, ...channelBreakdown(where, params) });
});

// One project's dashboard, for anyone who can open the project (it shows nothing the board does not):
// totals, progress per requirement and per section, workload of members and assignees, completion trend.
// ?team=<id> keeps only tasks assigned to people of that team, and only those people.
router.get('/projects/:id/dashboard', (req, res) => {
  const project = loadProject(req, res, req.params.id);
  if (!project) return;
  const id = project.id;
  const teamId = req.query.team ? Number(req.query.team) : null;
  if (Number.isNaN(teamId)) return badRequest(res, 'Team không hợp lệ');
  // Added to every task condition (and to LEFT JOINs, so empty requirements and sections still show).
  const byTeam = teamId ? ` AND t.assignee_id ${IN_TEAM}` : '';
  const teamParams = teamId ? [teamId] : [];
  const inProject = `(u.id IN (SELECT user_id FROM project_members WHERE project_id = ?)
    OR u.id IN (SELECT assignee_id FROM tasks WHERE project_id = ?))`;

  const summary = db
    .prepare(
      `SELECT ${DASHBOARD_COUNTS}, COUNT(*) AS total, COALESCE(SUM(t.completed = 1), 0) AS done,
         COALESCE(SUM(t.completed = 0 AND t.assignee_id IS NULL), 0) AS unassigned
       FROM tasks t WHERE t.parent_id IS NULL AND t.project_id = ?${byTeam}`
    )
    .get(id, ...teamParams);

  const requirements = db
    .prepare(
      `SELECT r.id, r.title, ${DASHBOARD_COUNTS}, COUNT(t.id) AS total, COALESCE(SUM(t.completed = 1), 0) AS done
       FROM requirements r LEFT JOIN tasks t ON t.requirement_id = r.id AND t.parent_id IS NULL${byTeam}
       WHERE r.project_id = ? GROUP BY r.id ORDER BY r.position, r.id`
    )
    .all(...teamParams, id);

  const sections = db
    .prepare(
      `SELECT s.id, s.name, COUNT(t.id) AS total, COALESCE(SUM(t.completed = 1), 0) AS done
       FROM sections s LEFT JOIN tasks t ON t.section_id = s.id AND t.parent_id IS NULL${byTeam}
       WHERE s.project_id = ? GROUP BY s.id ORDER BY s.position`
    )
    .all(...teamParams, id);

  // Members with nothing assigned still show as free capacity; assignees who left the project still count.
  const people = db
    .prepare(
      `SELECT u.id, u.name, ${TEAM_NAMES}, ${DASHBOARD_COUNTS},
         COALESCE(SUM(t.completed = 0 AND t.priority = 'high'), 0) AS high
       FROM users u
       LEFT JOIN tasks t ON t.assignee_id = u.id AND t.project_id = ? AND t.parent_id IS NULL
       WHERE ${inProject}${teamId ? ` AND u.id ${IN_TEAM}` : ''}
       GROUP BY u.id
       ORDER BY open DESC, overdue DESC, u.name`
    )
    .all(id, id, id, ...teamParams);

  // Filter choices: the teams of everyone above, whatever the current filter.
  const teams = db
    .prepare(
      `SELECT DISTINCT tm.id, tm.name FROM users u JOIN user_teams ut ON ut.user_id = u.id JOIN teams tm ON tm.id = ut.team_id
       WHERE ${inProject} ORDER BY tm.name`
    )
    .all(id, id);

  const trend = completionTrend(`t.project_id = ?${byTeam}`, [id, ...teamParams]);
  const byChannel = channelBreakdown(`t.project_id = ?${byTeam}`, [id, ...teamParams]);
  res.json({ project, teams, summary, requirements, sections, people, trend, ...byChannel });
});

export default router;
