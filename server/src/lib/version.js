// The deployed version (client/dist/version.json, written by deploy/update.sh), or null when the app was not deployed
// through the scripts (development, tests).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLIENT_DIST } from '../config.js';

let deployed = null;
try {
  deployed = JSON.parse(readFileSync(join(CLIENT_DIST, 'version.json'), 'utf8'));
} catch {
  // No version to report.
}

export const deployedVersion = () => deployed;
