// TaskFlow API. Routes live in routes/ (one file per feature), shared rules and helpers in lib/.
import express from 'express';
import { PORT } from './config.js';
import { purgeTaskEvents } from './lib/history.js';
import { MAX_UPLOAD_MB, sweepUploads } from './lib/uploads.js';
import admin from './routes/admin.js';
import attachments from './routes/attachments.js';
import auth, { requireUser } from './routes/auth.js';
import channels from './routes/channels.js';
import comments from './routes/comments.js';
import dashboard from './routes/dashboard.js';
import me from './routes/me.js';
import notifications from './routes/notifications.js';
import projects from './routes/projects.js';
import requirements from './routes/requirements.js';
import sections from './routes/sections.js';
import tasks from './routes/tasks.js';
import teams from './routes/teams.js';

const app = express();
app.use(express.json());

app.use('/api', auth);
// Every route mounted below requires a valid token.
app.use('/api', requireUser);
for (const router of [me, teams, channels, admin, projects, sections, requirements, tasks, comments, attachments, dashboard, notifications]) {
  app.use('/api', router);
}

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: `File vượt quá ${MAX_UPLOAD_MB} MB` });
  console.error(err);
  res.status(500).json({ error: 'Lỗi server' });
});

// Housekeeping: task history older than 30 days (at startup, then daily), and files whose row is gone.
purgeTaskEvents();
setInterval(purgeTaskEvents, 24 * 60 * 60 * 1000).unref();
sweepUploads();

app.listen(PORT, () => console.log(`API đang chạy tại http://localhost:${PORT}`));
