// Teams, their members (Managers, and Leaders for their own teams) and the people one may watch.
import express from 'express';
import { db, transaction } from '../db.js';
import { badRequest, forbidden, managerOnly, notFound } from '../lib/http.js';
import { USER_SELECT, findUser, withUserTeams } from '../lib/users.js';
import { EMAIL_RE, placeholders } from '../lib/util.js';

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

router.post('/teams', managerOnly, (req, res) => {
  const name = req.body?.name?.trim();
  if (!name) return badRequest(res, 'Cần nhập tên team');
  if (db.prepare('SELECT 1 FROM teams WHERE name = ?').get(name)) return res.status(409).json({ error: 'Tên team đã tồn tại' });
  const { lastInsertRowid } = db.prepare('INSERT INTO teams (name) VALUES (?)').run(name);
  res.status(201).json(db.prepare('SELECT * FROM teams WHERE id = ?').get(lastInsertRowid));
});

router.patch('/teams/:id', managerOnly, (req, res) => {
  const name = req.body?.name?.trim();
  if (!name) return badRequest(res, 'Cần nhập tên team');
  if (db.prepare('SELECT 1 FROM teams WHERE name = ? AND id != ?').get(name, req.params.id)) {
    return res.status(409).json({ error: 'Tên team đã tồn tại' });
  }
  const { changes } = db.prepare('UPDATE teams SET name = ? WHERE id = ?').run(name, req.params.id);
  if (!changes) return notFound(res);
  res.json(db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id));
});

router.delete('/teams/:id', managerOnly, (req, res) => {
  if (db.prepare('SELECT 1 FROM user_teams WHERE team_id = ?').get(req.params.id)) {
    return badRequest(res, 'Team vẫn còn người, hãy chuyển họ sang team khác trước');
  }
  const { changes } = db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.id);
  if (!changes) return notFound(res);
  res.status(204).end();
});

// ---------- Team members (Managers, and Leaders for their own teams) ----------

// Loads a team the user may manage: any team for Managers, their own teams for Leaders.
function loadManagedTeam(req, res) {
  const team = db.prepare('SELECT id, name FROM teams WHERE id = ?').get(req.params.id);
  const me = req.user;
  if (!team || (me.role !== 'manager' && !(me.role === 'leader' && me.team_ids.includes(team.id)))) {
    notFound(res);
    return null;
  }
  return team;
}

// Whom this user may add to the team. Leaders: Members with no team who are active or signed up themselves
// and wait for approval. Managers: anyone not disabled and not in the team, except a Member who already has
// a team (Members belong to one team; move them in the user table).
function canAddToTeam(me, user, teamId) {
  if (user.status === 'disabled' || user.team_ids.includes(teamId)) return false;
  if (me.role === 'manager') return user.role !== 'member' || user.team_ids.length === 0;
  return user.role === 'member' && user.team_ids.length === 0 && (user.status === 'active' || user.invited_by == null);
}

// The team's members plus the people the user may add (candidates), for the team editors.
router.get('/teams/:id/members', (req, res) => {
  const team = loadManagedTeam(req, res);
  if (!team) return;
  const users = db.prepare(`${USER_SELECT} ORDER BY u.name`).all().map(withUserTeams);
  res.json({
    team,
    members: users.filter((u) => u.team_ids.includes(team.id)),
    candidates: users.filter((u) => canAddToTeam(req.user, u, team.id)),
  });
});

// Adds someone to the team. A pending account is approved at the same time, except that only a Manager
// approves people invited by a Leader.
router.post('/teams/:id/members', (req, res) => {
  const team = loadManagedTeam(req, res);
  if (!team) return;
  const me = req.user;
  const user = findUser(req.body?.user_id);
  if (!user) return notFound(res);
  if (user.status === 'pending' && user.invited_by != null && me.role !== 'manager') {
    return forbidden(res, 'Người do Leader mời phải chờ Manager duyệt');
  }
  if (!canAddToTeam(me, user, team.id)) {
    return badRequest(res, me.role === 'manager' ? 'Member chỉ thuộc một team' : 'Chỉ thêm được người chưa có team');
  }
  transaction(() => {
    db.prepare('INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)').run(user.id, team.id);
    if (user.status === 'pending') db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(user.id);
  });
  res.status(201).json(findUser(user.id));
});

// Takes someone out of the team. Leaders only remove Members (who are left without a team);
// a Leader keeps at least one team.
router.delete('/teams/:id/members/:userId', (req, res) => {
  const team = loadManagedTeam(req, res);
  if (!team) return;
  const me = req.user;
  const user = findUser(req.params.userId);
  if (!user || !user.team_ids.includes(team.id)) return notFound(res);
  if (me.role !== 'manager' && user.role !== 'member') return forbidden(res, 'Leader chỉ bỏ được Member khỏi team');
  if (user.role === 'leader' && user.team_ids.length === 1) return badRequest(res, 'Leader phải thuộc ít nhất một team');
  db.prepare('DELETE FROM user_teams WHERE user_id = ? AND team_id = ?').run(user.id, team.id);
  res.status(204).end();
});

// Invites an email that has no account into the team (nothing is emailed). A Manager's invitation is active
// at once; a Leader's waits for a Manager's approval.
router.post('/teams/:id/invite', (req, res) => {
  const team = loadManagedTeam(req, res);
  if (!team) return;
  const me = req.user;
  const email = req.body?.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return badRequest(res, 'Email không hợp lệ');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'Email này đã có tài khoản, hãy thêm người đó từ danh sách' });
  }
  const name = req.body?.name?.trim() || email.split('@')[0];
  const status = me.role === 'manager' ? 'active' : 'pending';
  const id = transaction(() => {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO users (name, email, role, status, invited_by) VALUES (?, ?, 'member', ?, ?)")
      .run(name, email, status, me.id);
    db.prepare('INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)').run(lastInsertRowid, team.id);
    return lastInsertRowid;
  });
  res.status(201).json(findUser(id));
});

// The people this user may watch: everyone for Managers, the people of their teams for Leaders.
router.get('/people', (req, res) => {
  const me = req.user;
  const base = `${USER_SELECT} WHERE u.status = 'active'`;
  let rows = [];
  if (me.role === 'manager') rows = db.prepare(`${base} ORDER BY u.name`).all();
  if (me.role === 'leader') {
    rows = db
      .prepare(`${base} AND u.id IN (SELECT user_id FROM user_teams WHERE team_id IN (${placeholders(me.team_ids)})) ORDER BY u.name`)
      .all(...me.team_ids);
  }
  res.json(rows.map(withUserTeams));
});

export default router;
