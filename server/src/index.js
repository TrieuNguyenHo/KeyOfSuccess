// K.S Management API (KeyOfSuccess before 2026-10-10). Routes live in routes/ (one file per feature), shared rules and helpers in lib/.
// When the frontend is built (client/dist), it is served here too, so production is a single process.
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CLIENT_DIST, HOST, PORT } from './config.js';
import { scheduleBackups } from './lib/backup.js';
import { purgeMessages } from './lib/chat.js';
import { purgeTaskEvents } from './lib/history.js';
import { seedPermissions } from './lib/permissions.js';
import { scheduleDueDigests } from './lib/reminders.js';
import { scheduleWeeklyReports } from './lib/reports.js';
import { MAX_UPLOAD_MB, sweepUploads } from './lib/uploads.js';
import admin from './routes/admin.js';
import attachments from './routes/attachments.js';
import auth, { requireUser } from './routes/auth.js';
import channels from './routes/channels.js';
import chat from './routes/chat.js';
import comments from './routes/comments.js';
import dashboard from './routes/dashboard.js';
import feedback from './routes/feedback.js';
import health from './routes/health.js';
import me from './routes/me.js';
import notifications from './routes/notifications.js';
import permissions from './routes/permissions.js';
import projects from './routes/projects.js';
import reports from './routes/reports.js';
import savedFilters from './routes/savedFilters.js';
import requirements from './routes/requirements.js';
import sections from './routes/sections.js';
import tasks from './routes/tasks.js';
import teams from './routes/teams.js';
import templates from './routes/templates.js';

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
  next();
});
app.use(express.json());

app.use('/api', health, auth);
// Every route mounted below requires a valid token.
app.use('/api', requireUser);
for (const router of [me, teams, channels, admin, permissions, projects, sections, requirements, tasks, comments, attachments, dashboard, notifications, feedback, chat, templates, savedFilters, reports]) {
  app.use('/api', router);
}

// The built frontend: hashed assets are cached for good, index.html never (so a new build shows up at once).
// Screens live in the URL hash, so every other non-API path gets index.html.
if (existsSync(join(CLIENT_DIST, 'index.html'))) {
  app.use(
    express.static(CLIENT_DIST, {
      index: false,
      setHeaders: (res, path) =>
        res.set('Cache-Control', path.startsWith(join(CLIENT_DIST, 'assets')) ? 'public, max-age=31536000, immutable' : 'no-cache'),
    })
  );
  app.get(/^(?!\/api(\/|$))/, (req, res) => res.set('Cache-Control', 'no-cache').sendFile(join(CLIENT_DIST, 'index.html')));
}

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: `File vượt quá ${MAX_UPLOAD_MB} MB` });
  console.error(err);
  res.status(500).json({ error: 'Lỗi server' });
});

// Every role holds every permission; new ones start with their default.
seedPermissions();

// Housekeeping, at startup then daily: task history older than 30 days, chat messages older than 6 months, and files
// whose row is gone.
function housekeeping() {
  purgeTaskEvents();
  purgeMessages();
  sweepUploads();
}
housekeeping();
setInterval(housekeeping, 24 * 60 * 60 * 1000).unref();
scheduleBackups();
scheduleDueDigests();
scheduleWeeklyReports();

app.listen(PORT, HOST, () => console.log(`API đang chạy tại http://${HOST ?? 'localhost'}:${PORT}`));
