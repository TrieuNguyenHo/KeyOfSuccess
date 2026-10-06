// Settings from the environment (server/.env in development).

// Not PORT: dev tools often set PORT for the frontend, which would collide with Vite.
export const PORT = process.env.API_PORT || 3001;
export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
// These emails always sign in as an active Manager, so the first Manager can bootstrap everyone else.
export const MANAGER_EMAILS = (process.env.MANAGER_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
// Sign in with any email, no Google involved. Local development only.
export const DEV_LOGIN = process.env.DEV_LOGIN === '1' && process.env.NODE_ENV !== 'production';

if (!process.env.JWT_SECRET) console.warn('JWT_SECRET chưa được đặt, đang dùng secret mặc định cho dev.');
if (!GOOGLE_CLIENT_ID && !DEV_LOGIN) console.warn('GOOGLE_CLIENT_ID chưa được đặt: chưa ai đăng nhập được.');
if (DEV_LOGIN) console.warn('DEV_LOGIN đang bật: đăng nhập bằng email bất kỳ không cần Google. KHÔNG dùng khi deploy.');
