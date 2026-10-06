// Production readiness: start-up checks, the built frontend served by the API, daily backups.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './helpers.js';

const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'taskflow-deploy-'));
const dist = join(work, 'dist');
const backups = join(work, 'backups');
let server, api, boss;

before(async () => {
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>KeyOfSuccess</title>');
  writeFileSync(join(dist, 'assets', 'index-abc123.js'), 'console.log(1)');
  // A snapshot older than the kept ones and the leftover of an interrupted run, both cleaned up by the first backup.
  for (const old of ['2000-01-01', '2000-01-02.partial']) mkdirSync(join(backups, old), { recursive: true });
  server = await startServer({ CLIENT_DIST: dist, BACKUP_DIR: backups, BACKUP_KEEP_DAYS: '1' });
  api = server.api;
  boss = await api.manager();
});
after(async () => {
  await server.stop();
  rmSync(work, { recursive: true, force: true });
});

// Starts the API in production mode with `env` and returns how it exited (it should refuse to start).
function startProduction(env) {
  return spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/index.js'], {
    cwd: SERVER_DIR,
    env: { ...process.env, NODE_ENV: 'production', DB_PATH: join(work, 'prod.db'), API_PORT: '0', DEV_LOGIN: '', ...env },
    encoding: 'utf8',
    timeout: 20000,
  });
}

test('production refuses to start without a real JWT_SECRET and Google sign-in, or with DEV_LOGIN', () => {
  const missing = startProduction({ JWT_SECRET: 'short', GOOGLE_CLIENT_ID: '' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /JWT_SECRET phải dài ít nhất 32 ký tự/);
  assert.match(missing.stderr, /GOOGLE_CLIENT_ID chưa được đặt/);

  const dev = startProduction({ JWT_SECRET: 'x'.repeat(40), GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com', DEV_LOGIN: '1' });
  assert.equal(dev.status, 1);
  assert.match(dev.stderr, /DEV_LOGIN=1 không được bật/);
  assert.ok(!existsSync(join(work, 'prod.db')), 'nothing is written before the checks pass');
});

test('the built frontend is served next to the API', async () => {
  const base = server.url.replace(/\/api$/, '');
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /KeyOfSuccess/);
  assert.equal(page.headers.get('cache-control'), 'no-cache');
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(page.headers.get('x-powered-by'), null);

  const asset = await fetch(`${base}/assets/index-abc123.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('cache-control'), /immutable/);

  // API paths never fall back to the page.
  assert.equal((await api.get('/no-such-route', null)).status, 401);
  assert.equal((await api.get('/no-such-route', boss)).status, 404);
  assert.deepEqual((await api.get('/health', null)).body, { ok: true });
});

test('a daily snapshot of the database and the uploads is written at start-up; old ones are pruned', async () => {
  const names = readdirSync(backups);
  assert.equal(names.length, 1, `one snapshot kept, leftovers gone: ${names}`);
  assert.match(names[0], /^\d{4}-\d{2}-\d{2}$/);
  const snapshot = join(backups, names[0]);
  const copy = new DatabaseSync(join(snapshot, 'app.db'), { readOnly: true });
  assert.ok(copy.prepare("SELECT 1 FROM sqlite_master WHERE name = 'tasks'").get());
  copy.close();
  assert.ok(statSync(join(snapshot, 'uploads')).isDirectory());
});

test('npm run backup writes a snapshot with the uploads, reusing unchanged files', async () => {
  const project = (await api.project(boss, { name: 'Backup' })).id;
  const requirement = await api.requirement(boss, project, 'R');
  const section = (await api.get(`/projects/${project}`, boss)).body.sections[0].id;
  const task = await api.task(boss, { section, requirement, title: 'File' });
  const res = await fetch(`${server.url}/tasks/${task}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${boss.token}`, 'Content-Type': 'application/octet-stream', 'X-File-Name': 'a.txt' },
    body: 'hello',
  });
  assert.equal(res.status, 201);
  const [stored] = readdirSync(server.uploadDir);

  const run = (dir) =>
    spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/backup.js', dir], {
      cwd: SERVER_DIR,
      env: { ...process.env, NODE_ENV: 'test', DB_PATH: server.dbPath, JWT_SECRET: 'test-secret', DEV_LOGIN: '1' },
      encoding: 'utf8',
    });
  const manual = join(work, 'manual');
  const first = run(manual);
  assert.equal(first.status, 0, first.stderr);
  const [day] = readdirSync(manual);
  const file = join(manual, day, 'uploads', stored);
  assert.ok(existsSync(file));
  const copy = new DatabaseSync(join(manual, day, 'app.db'), { readOnly: true });
  assert.equal(copy.prepare('SELECT title FROM tasks WHERE id = ?').get(task).title, 'File');
  copy.close();

  // Next day's snapshot hard-links the file instead of copying it.
  const yesterday = join(manual, '2000-01-01');
  rmSync(yesterday, { recursive: true, force: true });
  renameSync(join(manual, day), yesterday);
  assert.equal(run(manual).status, 0);
  assert.equal(statSync(join(manual, day, 'uploads', stored)).ino, statSync(join(yesterday, 'uploads', stored)).ino);
});
