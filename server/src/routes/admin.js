// User administration (Managers).
import express from 'express';
import { db, transaction } from '../db.js';
import { badRequest, managerOnly, notFound } from '../lib/http.js';
import { USER_SELECT, findUser, parseTeamIds, withProfile, withUserTeams } from '../lib/users.js';
import { EMAIL_RE } from '../lib/util.js';

const router = express.Router();

const ROLES = ['manager', 'leader', 'member'];
const STATUSES = ['pending', 'active', 'disabled'];

router.get('/admin/users', managerOnly, (req, res) => {
  // Managers also read everyone's profile (view only).
  res.json(
    db
      .prepare(`${USER_SELECT} ORDER BY u.status = 'pending' DESC, u.name`)
      .all()
      .map((u) => withProfile(withUserTeams(u)))
  );
});

router.patch('/admin/users/:id', managerOnly, (req, res) => {
  const target = findUser(req.params.id);
  if (!target) return notFound(res);
  const body = req.body ?? {};
  // team_ids replaces the user's teams; the single team_id form is kept for one-team edits.
  let teamIds = target.team_ids;
  if (body.team_ids !== undefined) teamIds = parseTeamIds(body.team_ids);
  else if (body.team_id !== undefined) teamIds = parseTeamIds(body.team_id ? [body.team_id] : []);
  if (!teamIds) return badRequest(res, 'Team không tồn tại');
  const next = { role: body.role ?? target.role, status: body.status ?? target.status };
  if (!ROLES.includes(next.role) || !STATUSES.includes(next.status)) return badRequest(res, 'Vai trò hoặc trạng thái không hợp lệ');
  if (target.id === req.user.id && (next.role !== 'manager' || next.status !== 'active')) {
    return badRequest(res, 'Không thể tự hạ quyền hoặc khoá chính mình');
  }
  if (next.role === 'leader' && teamIds.length === 0) return badRequest(res, 'Leader phải thuộc ít nhất một team');
  if (next.role === 'member' && teamIds.length > 1) return badRequest(res, 'Member chỉ thuộc một team');
  transaction(() => {
    db.prepare('UPDATE users SET role = ?, status = ? WHERE id = ?').run(next.role, next.status, target.id);
    db.prepare('DELETE FROM user_teams WHERE user_id = ?').run(target.id);
    const insert = db.prepare('INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)');
    teamIds.forEach((teamId) => insert.run(target.id, teamId));
  });
  res.json(withProfile(findUser(target.id)));
});

// Invites someone who has never signed in: creates their account already active, in a team. Sign-in matches
// accounts by email, so their first Google sign-in with that email lands straight in the app. No email is sent.
router.post('/admin/users', managerOnly, (req, res) => {
  const email = req.body?.email?.trim().toLowerCase();
  const teamId = Number(req.body?.team_id);
  if (!email || !EMAIL_RE.test(email)) return badRequest(res, 'Email không hợp lệ');
  if (!db.prepare('SELECT 1 FROM teams WHERE id = ?').get(teamId)) return badRequest(res, 'Team không tồn tại');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'Email này đã có tài khoản, hãy thêm người đó từ danh sách' });
  }
  const name = req.body?.name?.trim() || email.split('@')[0];
  const id = transaction(() => {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO users (name, email, role, status, invited_by) VALUES (?, ?, 'member', 'active', ?)")
      .run(name, email, req.user.id);
    db.prepare('INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)').run(lastInsertRowid, teamId);
    return lastInsertRowid;
  });
  res.status(201).json(findUser(id));
});

export default router;
