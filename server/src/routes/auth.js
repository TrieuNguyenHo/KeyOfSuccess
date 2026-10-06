// Sign-in (public routes, before the token check).
import express from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { DEV_LOGIN, DIRECTOR_EMAILS, GOOGLE_CLIENT_ID, JWT_SECRET, MANAGER_EMAILS } from '../config.js';
import { db } from '../db.js';
import { badRequest, forbidden } from '../lib/http.js';
import { findUser, withProfile } from '../lib/users.js';

const router = express.Router();
const googleClient = new OAuth2Client();

const signToken = (u) => jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: '7d' });

router.get('/auth/config', (req, res) => res.json({ googleClientId: GOOGLE_CLIENT_ID, devLogin: DEV_LOGIN }));

// First sign-in creates a pending account that a Manager (or a Leader) must approve.
// An invited account still named after its email (the part before @, given when the inviter left the name
// empty) takes the name from Google; a name the inviter typed, or one already taken from Google, stays.
function signIn(res, { email, name, googleSub }) {
  email = email.trim().toLowerCase();
  const bootstrapRole = DIRECTOR_EMAILS.includes(email) ? 'director' : MANAGER_EMAILS.includes(email) ? 'manager' : null;
  const existing = db.prepare('SELECT id, name, google_sub FROM users WHERE email = ?').get(email);
  if (existing?.google_sub && googleSub && existing.google_sub !== googleSub) {
    return res.status(409).json({ error: 'Email này đã gắn với một tài khoản Google khác' });
  }

  let id = existing?.id;
  if (!id) {
    ({ lastInsertRowid: id } = db
      .prepare('INSERT INTO users (name, email, google_sub, role, status) VALUES (?, ?, ?, ?, ?)')
      .run(name?.trim() || email, email, googleSub ?? null, bootstrapRole ?? 'member', bootstrapRole ? 'active' : 'pending'));
  } else {
    db.prepare('UPDATE users SET google_sub = COALESCE(google_sub, ?) WHERE id = ?').run(googleSub ?? null, id);
    if (name?.trim() && existing.name === email.split('@')[0]) {
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name.trim(), id);
    }
    if (bootstrapRole) {
      db.prepare("UPDATE users SET role = ?, status = 'active' WHERE id = ? AND role != 'director'").run(bootstrapRole, id);
    }
  }

  const user = findUser(id);
  if (user.status === 'disabled') return forbidden(res, 'Tài khoản của bạn đã bị khoá');
  res.json({ token: signToken(user), user: withProfile(user) });
}

router.post('/auth/google', async (req, res, next) => {
  try {
    if (!GOOGLE_CLIENT_ID) return badRequest(res, 'Server chưa cấu hình đăng nhập Google');
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: req.body?.credential, audience: GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ error: 'Đăng nhập Google không hợp lệ' });
    }
    if (!payload.email_verified) return res.status(401).json({ error: 'Email Google chưa được xác minh' });
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

// Every route mounted after this requires a valid token. Pending users may only read /me.
export function requireUser(req, res, next) {
  let user;
  try {
    const { id } = jwt.verify(req.headers.authorization?.replace(/^Bearer /, ''), JWT_SECRET);
    user = findUser(id);
  } catch {
    // Treated as not signed in below.
  }
  if (!user || user.status === 'disabled') return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ' });
  if (user.status === 'pending' && req.path !== '/me') return forbidden(res, 'Tài khoản đang chờ Manager duyệt');
  req.user = user;
  next();
}

export default router;
