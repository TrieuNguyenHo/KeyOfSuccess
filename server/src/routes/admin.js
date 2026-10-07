// User administration (users.manage; root for roles, status and teams).
import express from 'express';
import { db, transaction } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/http.js';
import { can, levelOf, mergeOwnTeams, outranks, roleExists, scopeOf } from '../lib/permissions.js';
import { isRoot } from '../lib/roles.js';
import {
  EMAIL_TAKEN,
  USER_SELECT,
  canReadProfile,
  createInvitedUser,
  emailTaken,
  findUser,
  parseTeamIds,
  withProfile,
  withUserTeams,
} from '../lib/users.js';
import { EMAIL_RE, replaceLinks } from '../lib/util.js';

const router = express.Router();

const STATUSES = ['pending', 'active', 'disabled'];
const userAdminOnly = (req, res, next) => (can(req.user, 'users.manage') || isRoot(req.user) ? next() : forbidden(res));
// With the profile when the caller may read it (see canReadProfile(); root reads nobody's).
const asSeenBy = (me, user) => (canReadProfile(me, user) ? withProfile(withUserTeams(user)) : withUserTeams(user));
// How far the caller's user management reaches: 'all' (root too) or 'team' (users.manage).
const userScope = (me) => (isRoot(me) ? 'all' : scopeOf(me, 'users.manage'));
// 'team' covers the people of the caller's own teams and those with no team yet (self sign-ups, people to place),
// leaving out anyone of a higher role level.
const coversUser = (me, user) =>
  userScope(me) === 'all' ||
  (!outranks(user, me) && (user.team_ids.length === 0 || user.team_ids.some((id) => me.team_ids.includes(id))));

// The people the caller manages (everyone with 'all'); root accounts are not part of the company and never listed.
router.get('/admin/users', userAdminOnly, (req, res) => {
  res.json(
    db
      .prepare(`${USER_SELECT} WHERE u.role != 'root' ORDER BY u.status = 'pending' DESC, u.name`)
      .all()
      .map(withUserTeams)
      .filter((u) => coversUser(req.user, u))
      .map((u) => asSeenBy(req.user, u))
  );
});

router.patch('/admin/users/:id', userAdminOnly, (req, res) => {
  const target = findUser(req.params.id);
  // Root accounts are changed only through ROOT_EMAILS.
  if (!target || isRoot(target) || !coversUser(req.user, target)) return notFound(res);
  const body = req.body ?? {};
  // team_ids replaces the user's teams; the single team_id form is kept for one-team edits. With a 'team' scope only
  // the caller's own teams change; the user's other teams stay.
  let teamIds = target.team_ids;
  if (body.team_ids !== undefined) teamIds = parseTeamIds(body.team_ids);
  else if (body.team_id !== undefined) teamIds = parseTeamIds(body.team_id ? [body.team_id] : []);
  if (!teamIds) return badRequest(res, 'Team không tồn tại');
  teamIds = mergeOwnTeams(req.user, userScope(req.user), target.team_ids, teamIds);
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
    replaceLinks('user_teams', 'user_id', target.id, 'team_id', teamIds);
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
  // With a 'team' scope, people are invited into one of the caller's own teams.
  if (userScope(req.user) !== 'all' && !req.user.team_ids.includes(teamId)) return forbidden(res, 'Chỉ chọn được team của bạn');
  if (emailTaken(email)) return conflict(res, EMAIL_TAKEN);
  const id = createInvitedUser({ email, name: req.body.name, role, status: 'active', invitedBy: req.user.id, teamId });
  res.status(201).json(asSeenBy(req.user, findUser(id)));
});

// Revokes an invitation nobody accepted: deletes the account, which has never signed in. For the inviter, and for
// users.manage / root on accounts they manage, not above their own level.
router.delete('/admin/users/:id', (req, res) => {
  const target = findUser(req.params.id);
  if (!target || isRoot(target)) return notFound(res);
  const mayRevoke =
    target.invited_by === req.user.id ||
    ((can(req.user, 'users.manage') || isRoot(req.user)) && coversUser(req.user, target) && !outranks(target, req.user));
  if (!mayRevoke) return forbidden(res);
  if (target.joined) return badRequest(res, 'Người này đã tham gia, chỉ khoá được tài khoản');
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  res.status(204).end();
});

export default router;
