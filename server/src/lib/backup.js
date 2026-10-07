// Daily backups: BACKUP_DIR/<YYYY-MM-DD>/ holds app.db (VACUUM INTO, consistent while the app runs) and uploads/
// (every attached file and avatar). Uploaded files never change once written, so a file already in the
// previous snapshot is hard-linked rather than copied: each snapshot is complete on its own, and unchanged
// files take no extra space. A snapshot is written under a ".partial" name and renamed when complete.
import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { BACKUP_DIR, BACKUP_KEEP_DAYS } from '../config.js';
import { UPLOAD_DIR, db } from '../db.js';

const SNAPSHOT = /^\d{4}-\d{2}-\d{2}$/;
const localDate = (d = new Date()) => d.toLocaleDateString('sv-SE'); // YYYY-MM-DD in the server's time zone
const snapshots = (dir) => (existsSync(dir) ? readdirSync(dir).filter((n) => SNAPSHOT.test(n)).sort() : []);

// Writes today's snapshot unless it exists (or `force`, which replaces it). Returns its path, or null if skipped.
// `name` writes a named snapshot instead (deploy/update.sh: one before each deploy), which daily pruning leaves alone.
export function backupNow({ dir = BACKUP_DIR, force = false, name = localDate() } = {}) {
  if (!dir) return null;
  const target = join(dir, name);
  if (existsSync(target) && !force) return null;
  const previous = snapshots(dir).filter((n) => n !== name).pop();
  const partial = `${target}.partial`;
  rmSync(partial, { recursive: true, force: true });
  mkdirSync(join(partial, 'uploads'), { recursive: true });

  db.prepare('VACUUM INTO ?').run(join(partial, 'app.db'));
  for (const file of readdirSync(UPLOAD_DIR)) {
    const dest = join(partial, 'uploads', file);
    const old = previous && join(dir, previous, 'uploads', file);
    try {
      if (!old || !existsSync(old)) throw new Error('not in the previous snapshot');
      linkSync(old, dest);
    } catch {
      copyFileSync(join(UPLOAD_DIR, file), dest);
    }
  }

  rmSync(target, { recursive: true, force: true });
  renameSync(partial, target);
  pruneBackups(dir);
  return target;
}

// Keeps the newest BACKUP_KEEP_DAYS snapshots and drops leftovers of an interrupted run.
function pruneBackups(dir) {
  const all = snapshots(dir);
  const stale = [...all.slice(0, Math.max(0, all.length - BACKUP_KEEP_DAYS)), ...readdirSync(dir).filter((n) => n.endsWith('.partial'))];
  for (const n of stale) rmSync(join(dir, n), { recursive: true, force: true });
}

// At startup, then hourly: a new snapshot as soon as the date changes. A failed backup is logged, never fatal.
export function scheduleBackups() {
  if (!BACKUP_DIR) return;
  const run = () => {
    try {
      const path = backupNow();
      if (path) console.log(`Đã sao lưu database và file vào ${path}`);
    } catch (err) {
      console.error('Sao lưu thất bại:', err);
    }
  };
  run();
  setInterval(run, 60 * 60 * 1000).unref();
}
