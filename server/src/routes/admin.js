// User administration (users.manage; root for roles, status and teams).
import express from 'express';
import { db, transaction } from '../db.js';
import { badRequest, forbidden, notFound } from '../lib/http.js';
import { can, levelOf, outranks, roleExists } from '../lib/permissions.js';
import { isRoot } from '../lib/roles.js';
import { USER_SELECT, canReadProfile, findUser, parseTeamIds, withProfile, withUserTeams } from '../lib/users.js';
import { EMAIL_RE } from '../lib/util.js';

const router = express.Router();

const STATUSES = ['pending', 'active', 'disabled'];
const userAdminOnly = (req, res, next) => (can(req.user, 'users.manage') || isRoot(req.user) ? next() : forbidden(res));
// With the profile when the caller may read it (see canReadProfile(); root reads nobody's).
const asSeenBy = (me, user) => (canReadProfile(me, user) ? withProfile(withUserTeams(user)) : withUserTeams(user));

// Everyone in the company; root accounts are not part of it and never listed.
router.get('/admin/users', userAdminOnly, (req, res) => {
  res.json(
    db
      .prepare(`${USER_SELECT} WHERE u.role != 'root' ORDER BY u.status = 'pending' DESC, u.name`)
      .all()
      .map((u) => asSeenBy(req.user, u))
  );
});

router.patch('/admin/users/:id', userAdminOnly, (req, res) => {
  const target = findUser(req.params.id);
  // Root accounts are changed only through ROOT_EMAILS.
  if (!target || isRoot(target)) return notFound(res);
  const body = req.body ?? {};
  // team_ids replaces the user's teams; the single team_id form is kept for one-team edits.
  let teamIds = target.team_ids;
  if (body.team_ids !== undefined) teamIds = parseTeamIds(body.team_ids);
  else if (body.team_id !== undefined) teamIds = parseTeamIds(body.team_id ? [body.team_id] : []);
  if (!teamIds) return badRequest(res, 'Team không tồn tại');
  const next = { role: body.role ?? target.role, status: body.status ?? target.status };
  if (!roleExists(next.role) || !STATUSES.includes(next.status)) return badRequest(res, 'Vai trò hoặc trạng thái không hợp lệ');
  // Nobody changes the account of, or gives, a role above their own level (root stands above every role).
  if (outranks(target, req.user) || levelOf(next.role) > levelOf(req.user.role)) {
    return forbidden(res, 'Không đổi được tài khoản có vai trò cao hơn bạn');
  }
  if (target.id === req.user.id && (next.role !== target.role || next.status !== 'active')) {
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
  res.json(asSeenBy(req.user, findUser(target.id)));
});

// Invites someone who has never signed in: creates their account already active. Sign-in matches accounts by email,
// so their first Google sign-in with that email lands straight in the app. No email is sent.
// Body { email, name?, role? (default 'member', not above the inviter's level), team_id? (required for Members and
// Leaders, who belong to a team) }. For users.manage and root (System configuration).
router.post('/admin/users', userAdminOnly, (req, res) => {
  const email = req.body?.email?.trim().toLowerCase();
  const role = req.body?.role ?? 'member';
  const teamId = req.body?.team_id == null || req.body.team_id === '' ? null : Number(req.body.team_id);
  if (!email || !EMAIL_RE.test(email)) return badRequest(res, 'Email không hợp lệ');
  if (!roleExists(role)) return badRequest(res, 'Vai trò hoặc trạng thái không hợp lệ');
  if (levelOf(role) > levelOf(req.user.role)) return forbidden(res, 'Không đổi được tài khoản có vai trò cao hơn bạn');
  if (teamId != null || role === 'member' || role === 'leader') {
    if (!db.prepare('SELECT 1 FROM teams WHERE id = ?').get(teamId)) return badRequest(res, 'Team không tồn tại');
  }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'Email này đã có tài khoản, hãy thêm người đó từ danh sách' });
  }
  const name = req.body?.name?.trim() || email.split('@')[0];
  const id = transaction(() => {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO users (name, email, role, status, invited_by) VALUES (?, ?, ?, 'active', ?)")
      .run(name, email, role, req.user.id);
    if (teamId != null) db.prepare('INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)').run(lastInsertRowid, teamId);
    return lastInsertRowid;
  });
  res.status(201).json(asSeenBy(req.user, findUser(id)));
});

// Revokes an invitation nobody accepted: deletes the account, which has never signed in. For the inviter, and for
// users.manage / root on accounts not above their own level.
router.delete('/admin/users/:id', (req, res) => {
  const target = findUser(req.params.id);
  if (!target || isRoot(target)) return notFound(res);
  const mayRevoke =
    target.invited_by === req.user.id || ((can(req.user, 'users.manage') || isRoot(req.user)) && !outranks(target, req.user));
  if (!mayRevoke) return forbidden(res);
  if (target.joined) return badRequest(res, 'Người này đã tham gia, chỉ khoá được tài khoản');
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  res.status(204).end();
});

export default router;
