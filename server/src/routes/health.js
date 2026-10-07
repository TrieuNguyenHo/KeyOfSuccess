// Public health check for the reverse proxy or an uptime monitor: 200 when the database answers.
import express from 'express';
import { db } from '../db.js';

const router = express.Router();

router.get('/health', (req, res) => {
  db.prepare('SELECT 1').get();
  res.json({ ok: true });
});

export default router;
