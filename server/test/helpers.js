// Shared helpers for the API tests (node:test). Each test file starts its own server on a free port
// with a throw-away database, so tests never touch server/data/app.db and files can run in parallel.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANAGER_EMAIL = 'boss@t.test'; // bootstrapped as Manager through MANAGER_EMAILS
const DIRECTOR_EMAIL = 'chief@t.test'; // bootstrapped as Director through DIRECTOR_EMAILS
const ROOT_EMAIL = 'root@t.test'; // root through ROOT_EMAILS
// Generous: when the dev server restarts (node --watch) at the same time, two dozen test servers start slowly.
const START_TIMEOUT_MS = 30000;

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

// Starts the API with DEV_LOGIN (sign in by email) and returns { api, url, stop, output, uploadDir, dbPath }.
// server/.env is not loaded and the test settings override the shell's, e.g. GOOGLE_CLIENT_ID is empty.
// prepareDb(dbPath) runs before the server starts, e.g. to build a database of an older schema version.
// env overrides the test settings, e.g. to take an email out of ROOT_EMAILS.
export async function startServer({ prepareDb, env = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'taskflow-test-'));
  prepareDb?.(join(dir, 'test.db'));
  const port = await freePort();
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/index.js'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      GOOGLE_CLIENT_ID: '',
      API_PORT: String(port),
      DB_PATH: join(dir, 'test.db'),
      DEV_LOGIN: '1',
      MANAGER_EMAILS: MANAGER_EMAIL,
      DIRECTOR_EMAILS: DIRECTOR_EMAIL,
      ROOT_EMAILS: ROOT_EMAIL,
      ...env,
      JWT_SECRET: 'test-secret',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`API did not start:\n${output}`)), START_TIMEOUT_MS);
    const poll = setInterval(() => {
      if (output.includes('API đang chạy')) {
        clearInterval(poll);
        clearTimeout(timer);
        resolve();
      }
    }, 20);
    child.on('exit', (code) => {
      clearInterval(poll);
      clearTimeout(timer);
      reject(new Error(`API exited with code ${code}:\n${output}`));
    });
  });

  const url = `http://localhost:${port}/api`;
  return {
    url,
    api: makeApi(url),
    output: () => output,
    uploadDir: join(dir, 'uploads'), // where attached files are stored
    dbPath: join(dir, 'test.db'), // for tests that need to reach past the API (e.g. back-date rows)
    // Also fails the file if the API logged an error (an unhandled 500) while the tests ran.
    async stop() {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill();
      await exited;
      rmSync(dir, { recursive: true, force: true });
      assert.doesNotMatch(output, /Error/, `the API logged an error during the tests:\n${output}`);
    },
  };
}

// Requests return { status, body }. `as` is a user from api.user(), or null for anonymous calls.
function makeApi(url) {
  async function request(method, path, as, body) {
    const res = await fetch(url + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(as?.token && { Authorization: `Bearer ${as.token}` }),
        ...(as?.clientId && { 'X-Client-Id': as.clientId }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON bodies (none expected) stay as text.
    }
    return { status: res.status, body: data };
  }

  const api = {
    get: (path, as) => request('GET', path, as),
    post: (path, as, body = {}) => request('POST', path, as, body),
    patch: (path, as, body = {}) => request('PATCH', path, as, body),
    delete: (path, as) => request('DELETE', path, as),

    // Dev sign-in for name@t.test (creates the account on first use). Returns the raw response.
    signIn: (name) => request('POST', '/auth/dev', null, { email: `${name}@t.test`, name }),

    // Signs in and returns { id, name, role, status, team_id, token }.
    async user(name) {
      const res = await api.signIn(name);
      assert.equal(res.status, 200, `sign-in failed for ${name}: ${JSON.stringify(res.body)}`);
      return { ...res.body.user, token: res.body.token };
    },

    async manager() {
      return api.user('boss');
    },

    async director() {
      return api.user('chief');
    },

    async root() {
      return api.user('root');
    },

    async team(manager, name) {
      const res = await api.post('/teams', manager, { name });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      return res.body.id;
    },

    // Approves (activates) a user, optionally with a role and team. Returns the fresh user.
    async approve(manager, name, { role = 'member', team = null } = {}) {
      const user = await api.user(name);
      const res = await api.patch(`/admin/users/${user.id}`, manager, { status: 'active', role, team_id: team });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      return { ...user, ...res.body };
    },

    async project(owner, body) {
      const res = await api.post('/projects', owner, body);
      assert.equal(res.status, 201, JSON.stringify(res.body));
      return res.body;
    },

    async requirement(as, projectId, title = 'R', description) {
      const res = await api.post(`/projects/${projectId}/requirements`, as, { title, description });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      return res.body.id;
    },

    async firstSection(as, projectId) {
      return (await api.get(`/projects/${projectId}`, as)).body.sections[0].id;
    },

    async task(as, { section, requirement, title = 'Task' }) {
      const res = await api.post('/tasks', as, { section_id: section, requirement_id: requirement, title });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      return res.body.id;
    },

    unread: async (as) => (await api.get('/notifications', as)).body.unread,
  };
  return api;
}

// Opens GET /api/events like the browser does (fetch + bearer header). `events` collects the names of
// notification events, `changes` the parsed data of change events.
export function listen(url, user) {
  const controller = new AbortController();
  const events = [];
  const changes = [];
  let opened = false;
  const done = (async () => {
    try {
      const res = await fetch(`${url}/events`, {
        headers: { Authorization: `Bearer ${user.token}` },
        signal: controller.signal,
      });
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done: ended } = await reader.read();
        if (ended) return;
        if (value.includes('retry:')) opened = true;
        buffer += value;
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const name = /^event: (.+)$/m.exec(block)?.[1];
          if (name === 'change') changes.push(JSON.parse(/^data: (.+)$/m.exec(block)[1]));
          else if (name) events.push(name);
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') throw err;
    }
  })();
  return {
    events,
    changes,
    isOpen: () => opened,
    async close() {
      controller.abort();
      await done;
    },
  };
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
