// Public health check for the reverse proxy or an uptime monitor: 200 when the database answers, with the deployed
// version (client/dist/version.json, written by deploy/update.sh) and the schema version.
import express from 'express';
import { db } from '../db.js';
import { deployedVersion } from '../lib/version.js';

const router = express.Router();

router.get('/health', (req, res) => {
  const { user_version: schema } = db.prepare('PRAGMA user_version').get();
  const deployed = deployedVersion();
  res.json({ ok: true, schema, ...(deployed && { version: deployed.version, commit: deployed.commit }) });
});

export default router;
