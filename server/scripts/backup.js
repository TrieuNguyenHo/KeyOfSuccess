// Manual backup: npm run backup [-- <folder>] [-- --name <label>]. Writes (or replaces) a snapshot,
// <folder>/<YYYY-MM-DD or label>/app.db + uploads/, the same as the daily automatic one.
// Folder: the argument, else BACKUP_DIR, else server/data/backups. Prints the snapshot's path on the last line.
import { dirname, join, resolve } from 'node:path';
import { BACKUP_DIR } from '../src/config.js';
import { backupNow } from '../src/lib/backup.js';
import { dbPath } from '../src/db.js';

const args = process.argv.slice(2);
const at = args.indexOf('--name');
const name = at >= 0 ? args.splice(at, 2)[1] : undefined;
if (at >= 0 && !/^[\w.-]+$/.test(name ?? '')) {
  console.error('--name: chỉ dùng chữ, số, dấu chấm, gạch ngang, gạch dưới');
  process.exit(1);
}
const dir = args[0] ? resolve(args[0]) : BACKUP_DIR || join(dirname(dbPath), 'backups');
console.log(backupNow({ dir, force: true, ...(name && { name }) }));
