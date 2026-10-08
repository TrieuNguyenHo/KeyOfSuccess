// Teams (teams.manage), their members (teams.members; users.manage adds the wider rights) and the people one may watch.
import express from 'express';
import { db, transaction } from '../db.js';
import { badRequest, conflict, forbidden, notFound, requireAllScope } from '../lib/http.js';
import { AT_WORK, EMAIL_TAKEN, USER_SELECT, createInvitedUser, emailTaken, findUser, withUserTeams } from '../lib/users.js';
import { EMAIL_RE, placeholders } from '../lib/util.js';
import { can, coversTeams, levelOf, outranks, scopeOf, singleTeam, teamLimitsError } from '../lib/permissions.js';

const router = express.Router();

router.get('/teams', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT t.*, (SELECT COUNT(*) FROM user_teams ut JOIN users u ON u.id = ut.user_id
                      WHERE ut.team_id = t.id AND u.status = 'active') AS member_count
         FROM teams t ORDER BY t.name`
      )
      .all()
  );
});

// Creating and deleting teams needs teams.manage 'all'; 'team' renames one's own teams.
// Someone who manages people of their own teams only (users.manage not 'all') joins the team they create (decided
// 2026-10-08), else they could neither see it on the Administration screen nor place anyone in it; their role's team
// rule still applies (a one-team role does not join).
router.post('/teams', requireAllScope('teams.manage'), (req, res) => {
  const me = req.user;
  const name = req.body?.name?.trim();
  if (!name) return badRequest(res, 'Cần nhập tên team');
  if (db.prepare('SELECT 1 FROM teams WHERE name = ?').get(name)) return conflict(res, 'Tên team đã tồn tại');
  const team = transaction(() => {
    const { lastInsertRowid } = db.prepare('INSERT INTO teams (name) VALUES (?)').run(name);
    if (scopeOf(me, 'users.manage') !== 'all' && !teamLimitsError(me.role, [...me.team_ids, lastInsertRowid])) {
      db.prepare('INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)').run(me.id, lastInsertRowid);
    }
    return db.prepare('SELECT * FROM teams WHERE id = ?').get(lastInsertRowid);
  });
  res.status(201).json(team);
});

router.patch('/teams/:id', (req, res) => {
  if (!coversTeams(req.user, scopeOf(req.user, 'teams.manage'), [Number(req.params.id)])) return forbidden(res);
  const name = req.body?.name?.trim();
  if (!name) return badRequest(res, 'Cần nhập tên team');
  if (db.prepare('SELECT 1 FROM teams WHERE name = ? AND id != ?').get(name, req.params.id)) {
    return conflict(res, 'Tên team đã tồn tại');
  }
  const { changes } = db.prepare('UPDATE teams SET name = ? WHERE id = ?').run(name, req.params.id);
  if (!changes) return notFound(res);
  res.json(db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id));
});

router.delete('/teams/:id', requireAllScope('teams.manage'), (req, res) => {
  if (db.prepare('SELECT 1 FROM user_teams WHERE team_id = ?').get(req.params.id)) {
    return badRequest(res, 'Team vẫn còn người, hãy chuyển họ sang team khác trước');
  }
  const { changes } = db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.id);
  if (!changes) return notFound(res);
  res.status(204).end();
});

// ---------- Team members (teams.members: every team, or the user's own teams) ----------

// Loads a team the user may manage the members of.
function loadManagedTeam(req, res) {
  const team = db.prepare('SELECT id, name FROM teams WHERE id = ?').get(req.params.id);
  const me = req.user;
  if (!team || !coversTeams(me, scopeOf(me, 'teams.members'), [team.id])) {
    notFound(res);
    return null;
  }
  return team;
}

// Whom this user may add to the team. Without users.manage (Leaders): people of a lower role level (Members) with no
// team who are active or signed up themselves and wait for approval. With users.manage (Managers): anyone not
// disabled and not in the team, except someone of a one-team role (Members) who already has a team (move them in the
// user table). Nobody changes the teams of someone of a higher role level.
function canAddToTeam(me, user, teamId) {
  if (user.status === 'disabled' || user.team_ids.includes(teamId)) return false;
  if (outranks(user, me)) return false;
  if (can(me, 'users.manage')) return !singleTeam(user.role) || user.team_ids.length === 0;
  return below(user, me) && user.team_ids.length === 0 && (user.status === 'active' || user.invited_by == null);
}
const below = (user, me) => levelOf(user.role) < levelOf(me.role);

// The team's members plus the people the user may add (candidates), for the team editors.
router.get('/teams/:id/members', (req, res) => {
  const team = loadManagedTeam(req, res);
  if (!team) return;
  const users = db.prepare(`${USER_SELECT} WHERE u.role != 'root' ORDER BY u.name`).all().map(withUserTeams);
  res.json({
    team,
    members: users.filter((u) => u.team_ids.includes(team.id)),
    candidates: users.filter((u) => canAddToTeam(req.user, u, team.id)),
  });
});

// Adds someone to the team. A pending account is approved at the same time, except that only users.manage
// approves people invited by a Leader.
router.post('/teams/:id/members', (req, res) => {
  const team = loadManagedTeam(req, res);
  if (!team) return;
  const me = req.user;
  const user = findUser(req.body?.user_id);
  if (!user) return notFound(res);
  if (user.status === 'pending' && user.invited_by != null && !can(me, 'users.manage')) {
    return forbidden(res, 'Người do Leader mời phải chờ Manager duyệt');
  }
  if (!canAddToTeam(me, user, team.id)) {
    return badRequest(res, can(me, 'users.manage') ? 'Member chỉ thuộc một team' : 'Chỉ thêm được người chưa có team');
  }
  transaction(() => {
    db.prepare('INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)').run(user.id, team.id);
    if (user.status === 'pending') db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(user.id);
  });
  res.status(201).json(findUser(user.id));
});

// Takes someone out of the team. Without users.manage, only people of a lower role level (Leaders remove Members,
// who are left without a team). Nobody is left with fewer teams than their role needs (a Leader keeps one).
router.delete('/teams/:id/members/:userId', (req, res) => {
  const team = loadManagedTeam(req, res);
  if (!team) return;
  const me = req.user;
  const user = findUser(req.params.userId);
  if (!user || !user.team_ids.includes(team.id)) return notFound(res);
  if (!can(me, 'users.manage') && !below(user, me)) return forbidden(res, 'Leader chỉ bỏ được Member khỏi team');
  if (outranks(user, me)) return forbidden(res, 'Không đổi được tài khoản có vai trò cao hơn bạn');
  const teamsError = teamLimitsError(user.role, user.team_ids.filter((id) => id !== team.id));
  if (teamsError) return badRequest(res, teamsError);
  db.prepare('DELETE FROM user_teams WHERE user_id = ? AND team_id = ?').run(user.id, team.id);
  res.status(204).end();
});

// Invites an email that has no account into the team (nothing is emailed). With users.manage the invitation is
// active at once; otherwise it waits for someone with users.manage to approve it.
router.post('/teams/:id/invite', (req, res) => {
  const team = loadManagedTeam(req, res);
  if (!team) return;
  const me = req.user;
  const email = req.body?.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return badRequest(res, 'Email không hợp lệ');
  if (emailTaken(email)) return conflict(res, EMAIL_TAKEN);
  const status = can(me, 'users.manage') ? 'active' : 'pending';
  const id = createInvitedUser({ email, name: req.body.name, role: 'member', status, invitedBy: me.id, teamId: team.id });
  res.status(201).json(findUser(id));
});

// The people this user may watch (people.watch): everyone, or the people of their teams.
router.get('/people', (req, res) => {
  const me = req.user;
  const base = `${USER_SELECT} WHERE ${AT_WORK}`;
  const watch = scopeOf(me, 'people.watch');
  let rows = [];
  if (watch === 'all') rows = db.prepare(`${base} ORDER BY u.name`).all();
  if (watch === 'team') {
    rows = db
      .prepare(`${base} AND u.id IN (SELECT user_id FROM user_teams WHERE team_id IN (${placeholders(me.team_ids)})) ORDER BY u.name`)
      .all(...me.team_ids);
  }
  res.json(rows.map(withUserTeams));
});

export default router;
