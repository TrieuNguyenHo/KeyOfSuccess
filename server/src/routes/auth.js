// Sign-in (public routes, before the token check).
import express from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { DEV_LOGIN, DIRECTOR_EMAILS, GOOGLE_CLIENT_ID, JWT_SECRET, MANAGER_EMAILS, ROOT_EMAILS } from '../config.js';
import { db, makeRoot } from '../db.js';
import { badRequest, conflict, forbidden, unauthorized } from '../lib/http.js';
import { isRoot } from '../lib/roles.js';
import { asMe, findUser } from '../lib/users.js';

const router = express.Router();
const googleClient = new OAuth2Client();

const signToken = (u) => jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: '7d' });
// A root account whose email was taken out of ROOT_EMAILS no longer gets in.
const revokedRoot = (user) => isRoot(user) && !ROOT_EMAILS.includes(user.email);

router.get('/auth/config', (req, res) => res.json({ googleClientId: GOOGLE_CLIENT_ID, devLogin: DEV_LOGIN }));

// First sign-in creates a pending account that a Manager (or a Leader) must approve.
// An invited account still named after its email (the part before @, given when the inviter left the name
// empty) takes the name from Google; a name the inviter typed, or one already taken from Google, stays.
function signIn(res, { email, name, googleSub }) {
  email = email.trim().toLowerCase();
  const bootstrapRole = ROOT_EMAILS.includes(email)
    ? 'root'
    : DIRECTOR_EMAILS.includes(email)
      ? 'director'
      : MANAGER_EMAILS.includes(email)
        ? 'manager'
        : null;
  const existing = db.prepare('SELECT id, name, google_sub FROM users WHERE email = ?').get(email);
  if (existing?.google_sub && googleSub && existing.google_sub !== googleSub) {
    return conflict(res, 'Email này đã gắn với một tài khoản Google khác');
  }

  let id = existing?.id;
  if (!id) {
    ({ lastInsertRowid: id } = db
      .prepare("INSERT INTO users (name, email, google_sub, role, status, joined_at) VALUES (?, ?, ?, ?, ?, datetime('now'))")
      .run(name?.trim() || email, email, googleSub ?? null, bootstrapRole ?? 'member', bootstrapRole ? 'active' : 'pending'));
  } else {
    // The first sign-in of an invited account is how they accept the invitation.
    db.prepare("UPDATE users SET google_sub = COALESCE(google_sub, ?), joined_at = COALESCE(joined_at, datetime('now')) WHERE id = ?").run(
      googleSub ?? null,
      id
    );
    if (name?.trim() && existing.name === email.split('@')[0]) {
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name.trim(), id);
    }
    if (bootstrapRole === 'root') makeRoot(email);
    else if (bootstrapRole) {
      db.prepare("UPDATE users SET role = ?, status = 'active' WHERE id = ? AND role NOT IN ('director', 'root')").run(bootstrapRole, id);
    }
  }

  const user = findUser(id);
  if (revokedRoot(user)) return forbidden(res, 'Tài khoản root này đã bị thu hồi');
  if (user.status === 'disabled') return forbidden(res, 'Tài khoản của bạn đã bị khoá');
  res.json({ token: signToken(user), user: asMe(user) });
}

router.post('/auth/google', async (req, res, next) => {
  try {
    if (!GOOGLE_CLIENT_ID) return badRequest(res, 'Server chưa cấu hình đăng nhập Google');
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: req.body?.credential, audience: GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch {
      return unauthorized(res, 'Đăng nhập Google không hợp lệ');
    }
    if (!payload.email_verified) return unauthorized(res, 'Email Google chưa được xác minh');
    signIn(res, { email: payload.email, name: payload.name, googleSub: payload.sub });
  } catch (err) {
    next(err);
  }
});

if (DEV_LOGIN) {
  router.post('/auth/dev', (req, res) => {
    const email = req.body?.email?.trim();
    if (!email) return badRequest(res, 'Cần nhập email');
    signIn(res, { email, name: req.body.name });
  });
}

// Root accounts only configure the system: their own account, the list of people with their roles and the teams to
// place them in, roles and what each may do. The company's work (projects, tasks, dashboards, notifications…) stays closed to them.
const ROOT_ROUTES = [
  ['GET', /^\/me$/],
  ['PATCH', /^\/me$/],
  ['GET', /^\/admin\/users$/],
  ['POST', /^\/admin\/users$/],
  ['PATCH', /^\/admin\/users\/\d+$/],
  ['DELETE', /^\/admin\/users\/\d+$/],
  ['GET', /^\/teams$/],
  ['GET', /^\/roles$/],
  ['POST', /^\/admin\/roles$/],
  ['PATCH', /^\/admin\/roles\/[\w-]+$/],
  ['DELETE', /^\/admin\/roles\/[\w-]+$/],
  ['GET', /^\/admin\/permissions$/],
  ['PATCH', /^\/admin\/permissions$/],
  ['POST', /^\/admin\/permissions\/reset$/],
  ['GET', /^\/avatars(\/\d+)?$/],
];

// Every route mounted after this requires a valid token. Pending users may only read /me.
export function requireUser(req, res, next) {
  let user;
  try {
    const { id } = jwt.verify(req.headers.authorization?.replace(/^Bearer /, ''), JWT_SECRET);
    user = findUser(id);
  } catch {
    // Treated as not signed in below.
  }
  if (!user || user.status === 'disabled' || revokedRoot(user)) return unauthorized(res, 'Phiên đăng nhập không hợp lệ');
  if (user.status === 'pending' && req.path !== '/me') return forbidden(res, 'Tài khoản đang chờ Manager duyệt');
  if (isRoot(user) && !ROOT_ROUTES.some(([method, path]) => method === req.method && path.test(req.path))) {
    return forbidden(res, 'Tài khoản root chỉ dùng để cấu hình hệ thống');
  }
  req.user = user;
  next();
}

export default router;
