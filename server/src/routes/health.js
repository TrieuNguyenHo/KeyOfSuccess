// Public health check for the reverse proxy or an uptime monitor: 200 when the database answers, with the deployed
// version (client/dist/version.json, written by deploy/update.sh) and the schema version.
import express from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLIENT_DIST } from '../config.js';
import { db } from '../db.js';

const router = express.Router();

let deployed = null;
try {
  deployed = JSON.parse(readFileSync(join(CLIENT_DIST, 'version.json'), 'utf8'));
} catch {
  // Not deployed through the scripts (development, tests): no version to report.
}

router.get('/health', (req, res) => {
  const { user_version: schema } = db.prepare('PRAGMA user_version').get();
  res.json({ ok: true, schema, ...(deployed && { version: deployed.version, commit: deployed.commit }) });
});

export default router;
