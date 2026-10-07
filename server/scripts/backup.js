// Manual backup: npm run backup [-- <folder>]. Writes (or replaces) today's snapshot, the same as the daily
// automatic one: <folder>/<YYYY-MM-DD>/app.db + uploads/. Folder: the argument, else BACKUP_DIR, else server/data/backups.
import { dirname, join, resolve } from 'node:path';
import { BACKUP_DIR } from '../src/config.js';
import { backupNow } from '../src/lib/backup.js';
import { dbPath } from '../src/db.js';

const dir = process.argv[2] ? resolve(process.argv[2]) : BACKUP_DIR || join(dirname(dbPath), 'backups');
console.log(`Đã sao lưu vào ${backupNow({ dir, force: true })}`);
