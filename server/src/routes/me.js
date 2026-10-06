// The signed-in user's account, profiles and profile pictures.
import express from 'express';
import { randomBytes } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { UPLOAD_DIR, db } from '../db.js';
import { badRequest, notFound } from '../lib/http.js';
import { rawUpload } from '../lib/uploads.js';
import { canReadProfile, findUser, withProfile } from '../lib/users.js';
import { localDate } from '../lib/util.js';

const router = express.Router();

router.get('/me', (req, res) => res.json(withProfile(req.user)));

router.get('/users/:id/profile', (req, res) => {
  const user = findUser(req.params.id);
  if (!user || !canReadProfile(req.user, user)) return notFound(res);
  res.json(withProfile(user));
});

const GENDERS = ['male', 'female', 'other', 'undisclosed'];
const PHONE_RE = /^\+?[0-9 ().-]{6,20}$/;
// A real calendar date between 1900 and today.
function validBirthday(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value && value >= '1900-01-01' && value <= localDate(new Date());
}

// The signed-in user edits their own account. Body: any of { language: 'vi' | 'en' (the interface language, kept
// with the account so it follows the user to every device), name, birthday, phone, job_title, bio, gender }.
// '' or null clears an optional field; the display name cannot be cleared.
router.patch('/me', (req, res) => {
  const body = req.body ?? {};
  const text = (v) => (v == null ? null : String(v).trim() || null);
  const set = {};
  if (body.language !== undefined) {
    if (!['vi', 'en'].includes(body.language)) return badRequest(res, 'Ngôn ngữ không hợp lệ');
    set.language = body.language;
  }
  if (body.name !== undefined) {
    const name = text(body.name);
    if (!name) return badRequest(res, 'Tên hiển thị không được để trống');
    if (name.length > 80) return badRequest(res, 'Tên hiển thị tối đa 80 ký tự');
    set.name = name;
  }
  if (body.birthday !== undefined) {
    const birthday = text(body.birthday);
    if (birthday && !validBirthday(birthday)) return badRequest(res, 'Ngày sinh không hợp lệ');
    set.birthday = birthday;
  }
  if (body.phone !== undefined) {
    const phone = text(body.phone);
    if (phone && !PHONE_RE.test(phone)) return badRequest(res, 'Số điện thoại không hợp lệ');
    set.phone = phone;
  }
  if (body.job_title !== undefined) {
    const title = text(body.job_title);
    if (title?.length > 80) return badRequest(res, 'Chức danh tối đa 80 ký tự');
    set.job_title = title;
  }
  if (body.bio !== undefined) {
    const bio = text(body.bio);
    if (bio?.length > 500) return badRequest(res, 'Giới thiệu tối đa 500 ký tự');
    set.bio = bio;
  }
  if (body.gender !== undefined) {
    const gender = body.gender || null;
    if (gender && !GENDERS.includes(gender)) return badRequest(res, 'Giới tính không hợp lệ');
    set.gender = gender;
  }
  const fields = Object.keys(set);
  if (!fields.length) return badRequest(res, 'Không có gì để lưu');
  db.prepare(`UPDATE users SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(
    ...fields.map((f) => set[f]),
    req.user.id
  );
  res.json(withProfile(findUser(req.user.id)));
});

// ---------- Profile pictures ----------
// The client crops and shrinks the picture (256 px square) before sending it the same way as attachments.
// Everyone signed in sees everyone's picture, fetched with the token like attachments.
const AVATAR_MAX_BYTES = 1024 * 1024;
// The type comes from the bytes themselves, never from what the client claims.
function imageType(bytes) {
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length > 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}
const AVATAR_MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

function removeAvatarFile(name) {
  if (name) rmSync(join(UPLOAD_DIR, name), { force: true });
}

router.post('/me/avatar', rawUpload, (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return badRequest(res, 'File trống hoặc không đọc được');
  if (req.body.length > AVATAR_MAX_BYTES) return badRequest(res, 'Ảnh đại diện tối đa 1 MB');
  const type = imageType(req.body);
  if (!type) return badRequest(res, 'Ảnh đại diện phải là PNG, JPG hoặc WebP');
  const name = `avatar-${randomBytes(12).toString('hex')}.${type}`;
  writeFileSync(join(UPLOAD_DIR, name), req.body);
  const old = db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.user.id).avatar;
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(name, req.user.id);
  removeAvatarFile(old);
  res.status(201).json(withProfile(findUser(req.user.id)));
});

router.delete('/me/avatar', (req, res) => {
  const old = db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.user.id).avatar;
  db.prepare('UPDATE users SET avatar = NULL WHERE id = ?').run(req.user.id);
  removeAvatarFile(old);
  res.json(withProfile(findUser(req.user.id)));
});

// Who has a picture: { userId: version }. The version changes with every upload, for the client's cache.
router.get('/avatars', (req, res) => {
  const rows = db.prepare("SELECT id, avatar FROM users WHERE avatar IS NOT NULL AND status != 'disabled'").all();
  res.json(Object.fromEntries(rows.map((r) => [r.id, r.avatar])));
});

router.get('/avatars/:userId', (req, res) => {
  const row = db.prepare("SELECT avatar FROM users WHERE id = ? AND status != 'disabled'").get(req.params.userId);
  const type = row?.avatar?.split('.').pop();
  if (!AVATAR_MIME[type]) return notFound(res);
  // The URL carries the version (?v=), so a picture never changes behind it.
  res.set({ 'Content-Type': AVATAR_MIME[type], 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
  res.sendFile(join(UPLOAD_DIR, row.avatar), (err) => err && !res.headersSent && notFound(res));
});

export default router;
