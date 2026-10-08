// Settings from the environment (server/.env in development, the production server's own server/.env when deployed).
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

// Dates ("today", overdue, the 8:00 reminder of due dates) follow the company's clock, not the machine's: a VPS
// usually runs on UTC. TZ in server/.env overrides it.
process.env.TZ ||= 'Asia/Ho_Chi_Minh';

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
// Not PORT: dev tools often set PORT for the frontend, which would collide with Vite.
export const PORT = process.env.API_PORT || 3001;
// Behind a reverse proxy on the same machine, API_HOST=127.0.0.1 keeps the app off the network. Default: all interfaces.
export const HOST = process.env.API_HOST || undefined;
export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const emailList = (value) =>
  (value || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
// These emails are root: they only configure the system (who holds which role) and are not part of the company.
// Taking an email out revokes its root access at the next request.
export const ROOT_EMAILS = emailList(process.env.ROOT_EMAILS);
// These emails always sign in as an active Director, so the first Director can bootstrap everyone else.
export const DIRECTOR_EMAILS = emailList(process.env.DIRECTOR_EMAILS);
// These emails always sign in as an active Manager (a Director among them stays Director).
export const MANAGER_EMAILS = emailList(process.env.MANAGER_EMAILS);
// The role these lists give an email (root first, then Director, then Manager), or null.
export const envRoleOf = (email) =>
  ROOT_EMAILS.includes(email) ? 'root' : DIRECTOR_EMAILS.includes(email) ? 'director' : MANAGER_EMAILS.includes(email) ? 'manager' : null;
// Sign in with any email, no Google involved. Local development only.
export const DEV_LOGIN = process.env.DEV_LOGIN === '1' && !IS_PRODUCTION;
// The built frontend (npm run build). Served by the API when it exists, so production needs a single process.
export const CLIENT_DIST = resolve(process.env.CLIENT_DIST || join(SERVER_DIR, '..', 'client', 'dist'));
// Daily backups of the database and uploads (lib/backup.js). On by default in production (server/data/backups);
// elsewhere only when BACKUP_DIR is set. BACKUP_KEEP_DAYS daily snapshots are kept.
export const BACKUP_DIR = process.env.BACKUP_DIR
  ? resolve(process.env.BACKUP_DIR)
  : IS_PRODUCTION
    ? join(dirname(resolve(process.env.DB_PATH || join(SERVER_DIR, 'data', 'app.db'))), 'backups')
    : '';
export const BACKUP_KEEP_DAYS = Math.max(1, Number(process.env.BACKUP_KEEP_DAYS) || 14);

// Production refuses to start on settings that would be unsafe or leave nobody able to sign in.
if (IS_PRODUCTION) {
  const problems = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    problems.push('JWT_SECRET phải dài ít nhất 32 ký tự');
  }
  if (!GOOGLE_CLIENT_ID) problems.push('GOOGLE_CLIENT_ID chưa được đặt');
  if (process.env.DEV_LOGIN === '1') problems.push('DEV_LOGIN=1 không được bật khi deploy');
  if (problems.length) {
    console.error(`Không khởi động được (NODE_ENV=production):\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  if (!DIRECTOR_EMAILS.length && !MANAGER_EMAILS.length && !ROOT_EMAILS.length) {
    console.warn('DIRECTOR_EMAILS, MANAGER_EMAILS và ROOT_EMAILS đều trống: chỉ người đã có vai trò trong database mới duyệt được người mới.');
  }
} else {
  if (!process.env.JWT_SECRET) console.warn('JWT_SECRET chưa được đặt, đang dùng secret mặc định cho dev.');
  if (!GOOGLE_CLIENT_ID && !DEV_LOGIN) console.warn('GOOGLE_CLIENT_ID chưa được đặt: chưa ai đăng nhập được.');
  if (DEV_LOGIN) console.warn('DEV_LOGIN đang bật: đăng nhập bằng email bất kỳ không cần Google. KHÔNG dùng khi deploy.');
}
