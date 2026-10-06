// Profile pictures (v21): the user uploads or removes their own; everyone signed in sees everyone's; the type comes
// from the bytes; old files are removed; the uploads sweep keeps pictures.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { startServer } from './helpers.js';

let server, api, boss, mem;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  const team = await api.team(boss, 'Content');
  mem = await api.approve(boss, 'mem', { team });
});
after(() => server.stop());

const upload = (as, bytes, type = 'image/png') =>
  fetch(`${server.url}/me/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${as.token}`, 'Content-Type': 'application/octet-stream', 'X-File-Name': 'a', 'X-File-Type': type },
    body: bytes,
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
const picture = (as, userId) => fetch(`${server.url}/avatars/${userId}`, { headers: { Authorization: `Bearer ${as.token}` } });
const avatarFiles = () => readdirSync(server.uploadDir).filter((f) => f.startsWith('avatar-'));

test('nobody has a picture at first', async () => {
  assert.deepEqual((await api.get('/avatars', mem)).body, {});
  assert.equal((await picture(boss, mem.id)).status, 404);
  assert.equal((await api.get('/me', mem)).body.avatar, null);
});

test('the user uploads a picture that everyone signed in can see', async () => {
  const res = await upload(mem, PNG);
  assert.equal(res.status, 201);
  assert.match(res.body.avatar, /^avatar-[0-9a-f]+\.png$/);
  assert.deepEqual((await api.get('/avatars', boss)).body, { [mem.id]: res.body.avatar });
  const r = await picture(boss, mem.id);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.match(r.headers.get('cache-control'), /immutable/);
  assert.ok(Buffer.from(await r.arrayBuffer()).equals(PNG));
  assert.equal((await fetch(`${server.url}/avatars/${mem.id}`)).status, 401, 'not without signing in');
});

test('a new picture replaces the old one and its file', async () => {
  const before = (await api.get('/me', mem)).body.avatar;
  const res = await upload(mem, JPG, 'image/jpeg');
  assert.match(res.body.avatar, /\.jpg$/);
  assert.notEqual(res.body.avatar, before, 'a new version for caches');
  assert.ok(!existsSync(`${server.uploadDir}/${before}`));
  assert.deepEqual(avatarFiles(), [res.body.avatar]);
  assert.equal((await picture(boss, mem.id)).headers.get('content-type'), 'image/jpeg');
});

test('only real PNG / JPG / WebP pictures up to 1 MB are accepted, whatever type is claimed', async () => {
  assert.equal((await upload(mem, Buffer.from('<svg onload=alert(1)>'), 'image/png')).status, 400);
  assert.equal((await upload(mem, Buffer.from('GIF89a......'), 'image/gif')).status, 400);
  assert.equal((await upload(mem, Buffer.alloc(0))).status, 400);
  const big = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(1024 * 1024)]);
  assert.equal((await upload(mem, big)).status, 400);
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(40)]);
  assert.equal((await upload(boss, webp, 'image/webp')).status, 201);
});

test('clearing up deleted tasks keeps the pictures', async () => {
  const project = await api.project(boss, { name: 'P' });
  const section = await api.firstSection(boss, project.id);
  const requirement = await api.requirement(boss, project.id);
  const task = await api.task(boss, { section, requirement });
  assert.equal((await api.delete(`/tasks/${task}`, boss)).status, 204); // runs the uploads sweep
  assert.equal(avatarFiles().length, 2);
});

test('the user removes their picture', async () => {
  const name = (await api.get('/me', mem)).body.avatar;
  assert.equal((await api.delete('/me/avatar', mem)).body.avatar, null);
  assert.ok(!existsSync(`${server.uploadDir}/${name}`));
  assert.equal((await picture(boss, mem.id)).status, 404);
  assert.ok(!(mem.id in (await api.get('/avatars', boss)).body));
});

test('locked accounts show no picture', async () => {
  await upload(mem, PNG);
  await api.patch(`/admin/users/${mem.id}`, boss, { status: 'disabled' });
  assert.ok(!(mem.id in (await api.get('/avatars', boss)).body));
  assert.equal((await picture(boss, mem.id)).status, 404);
});
