// Editing and deleting comments and requirement feedback; files attached to tasks and requirements.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { startServer } from './helpers.js';

let server, api;
let boss, lead, memA, memB, outsider, project, requirement, task;

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  const content = await api.team(boss, 'Content');
  const design = await api.team(boss, 'Design');
  lead = await api.approve(boss, 'lead', { role: 'leader', team: content });
  memA = await api.approve(boss, 'memA', { team: content });
  memB = await api.approve(boss, 'memB', { team: content });
  outsider = await api.approve(boss, 'outsider', { team: design });
  project = (await api.project(boss, { name: 'Tet', team_ids: [content] })).id;
  for (const email of ['mema@t.test', 'memb@t.test']) await api.post(`/projects/${project}/members`, boss, { email });
  requirement = await api.requirement(boss, project, 'Landing');
  task = await api.task(lead, { section: await api.firstSection(boss, project), requirement, title: 'Banner' });
});
after(() => server.stop());

const comment = async (as, body, path = `/tasks/${task}/comments`) => (await api.post(path, as, { body })).body;

// ---------- Comments ----------

test('the author edits a comment, which is marked as edited', async () => {
  const c = await comment(memA, 'first draft');
  assert.equal(c.edited_at, null);
  const res = await api.patch(`/comments/${c.id}`, memA, { body: 'final' });
  assert.equal(res.status, 200);
  assert.equal(res.body.body, 'final');
  assert.ok(res.body.edited_at);
  assert.equal((await api.get(`/tasks/${task}`, memB)).body.comments.find((x) => x.id === c.id).body, 'final');
});

test('nobody else edits a comment, not even a Manager; empty text and hidden tasks are refused', async () => {
  const c = await comment(memA, 'mine');
  for (const user of [memB, lead, boss]) assert.equal((await api.patch(`/comments/${c.id}`, user, { body: 'x' })).status, 403);
  assert.equal((await api.patch(`/comments/${c.id}`, memA, { body: '  ' })).status, 400);
  assert.equal((await api.patch(`/comments/${c.id}`, outsider, { body: 'x' })).status, 404);
  assert.equal((await api.patch('/comments/999999', memA, { body: 'x' })).status, 404);
});

test('an edit notifies only people it newly mentions', async () => {
  // memB follows the task (they commented on it), so earlier comments told them already.
  await api.post('/notifications/read', memB, {});
  const c = await comment(memA, `@[memB](${memB.id}) xem`);
  assert.equal(await api.unread(memB), 1);
  // lead follows the task too, so the comment itself reached them; only the edit's mention counts from here.
  await api.post('/notifications/read', lead, {});
  await api.patch(`/comments/${c.id}`, memA, { body: `@[memB](${memB.id}) xem lại @[lead](${lead.id})` });
  assert.equal(await api.unread(memB), 1);
  assert.equal(await api.unread(lead), 1);
  // Someone who cannot see the task is not tagged.
  const res = await api.patch(`/comments/${c.id}`, memA, { body: `@[outsider](${outsider.id}) hi` });
  assert.equal(res.body.body, '@outsider hi');
  assert.equal(await api.unread(outsider), 0);
});

test('the author or a Manager deletes a comment; others cannot', async () => {
  const a = await comment(memA, 'delete me');
  const b = await comment(memA, 'boss deletes me');
  assert.equal((await api.delete(`/comments/${a.id}`, memB)).status, 403);
  assert.equal((await api.delete(`/comments/${a.id}`, lead)).status, 403);
  assert.equal((await api.delete(`/comments/${a.id}`, memA)).status, 204);
  assert.equal((await api.delete(`/comments/${b.id}`, boss)).status, 204);
  const ids = (await api.get(`/tasks/${task}`, memA)).body.comments.map((x) => x.id);
  assert.ok(!ids.includes(a.id) && !ids.includes(b.id));
});

test('requirement feedback follows the same rules', async () => {
  const path = `/requirements/${requirement}/comments`;
  const c = await comment(memB, 'góp ý', path);
  assert.equal((await api.patch(`/requirement-comments/${c.id}`, memB, { body: 'góp ý mới' })).body.body, 'góp ý mới');
  assert.equal((await api.patch(`/requirement-comments/${c.id}`, boss, { body: 'x' })).status, 403);
  assert.equal((await api.delete(`/requirement-comments/${c.id}`, memA)).status, 403);
  assert.equal((await api.delete(`/requirement-comments/${c.id}`, outsider)).status, 404);
  assert.equal((await api.delete(`/requirement-comments/${c.id}`, boss)).status, 204);
  assert.equal((await api.get(path, memA)).body.length, 0);
});

// ---------- Attachments ----------

async function upload(as, path, { name, type = 'text/plain', bytes = Buffer.from('hello') }) {
  const res = await fetch(`${server.url}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${as.token}`,
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent(name),
      'X-File-Type': type,
    },
    body: bytes,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const download = (as, id) => fetch(`${server.url}/attachments/${id}`, { headers: { Authorization: `Bearer ${as.token}` } });
const storedFiles = () => readdirSync(server.uploadDir).length;

let png;

test('anyone who can see a task attaches files to it', async () => {
  png = await upload(memB, `/tasks/${task}/attachments`, { name: 'Banner Tết.png', type: 'image/png', bytes: Buffer.from([137, 80, 78, 71]) });
  assert.equal(png.status, 201);
  assert.equal(`${png.body.name}|${png.body.mime}|${png.body.size}|${png.body.user_name}`, 'Banner Tết.png|image/png|4|memB');
  // A Manager outside the project only views it, but can still attach, like commenting.
  assert.equal((await upload(boss, `/tasks/${task}/attachments`, { name: 'note.txt' })).status, 201);
  const { attachments } = (await api.get(`/tasks/${task}`, memA)).body;
  assert.deepEqual(attachments.map((a) => a.name), ['Banner Tết.png', 'note.txt']);
  assert.equal(storedFiles(), 2);
});

test('outsiders can neither attach nor download', async () => {
  assert.equal((await upload(outsider, `/tasks/${task}/attachments`, { name: 'x.txt' })).status, 404);
  const res = await download(outsider, png.body.id);
  assert.equal(res.status, 404);
  await res.body?.cancel();
});

test('a download returns the bytes; only plain images are served as themselves', async () => {
  const res = await download(memA, png.body.id);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [137, 80, 78, 71]);

  const html = await upload(memA, `/tasks/${task}/attachments`, { name: 'page.html', type: 'text/html', bytes: Buffer.from('<script>1</script>') });
  const res2 = await download(memA, html.body.id);
  assert.equal(res2.headers.get('content-type'), 'application/octet-stream');
  assert.match(res2.headers.get('content-disposition'), /^attachment;/);
  assert.equal(res2.headers.get('x-content-type-options'), 'nosniff');
  await res2.body?.cancel();
});

test('uploads are checked: empty files, files over 25 MB', async () => {
  assert.equal((await upload(memA, `/tasks/${task}/attachments`, { name: 'empty.txt', bytes: Buffer.alloc(0) })).status, 400);
  const big = await upload(memA, `/tasks/${task}/attachments`, { name: 'big.bin', bytes: Buffer.alloc(26 * 1024 * 1024) });
  assert.equal(big.status, 413);
  assert.match(big.body.error, /25 MB/);
});

test('the uploader or a task admin deletes a file, and it leaves the disk', async () => {
  const before = storedFiles();
  const file = await upload(memA, `/tasks/${task}/attachments`, { name: 'draft.txt' });
  assert.equal((await api.delete(`/attachments/${file.body.id}`, memB)).status, 403);
  assert.equal((await api.delete(`/attachments/${file.body.id}`, memA)).status, 204);
  assert.equal((await api.delete(`/attachments/${png.body.id}`, lead)).status, 204); // memB's file, Leader of the team
  assert.equal(storedFiles(), before - 1);
});

test("deleting a task removes its files from the disk", async () => {
  const doomed = await api.task(lead, { section: await api.firstSection(boss, project), requirement, title: 'Doomed' });
  await upload(memA, `/tasks/${doomed}/attachments`, { name: 'a.txt' });
  const before = storedFiles();
  await api.delete(`/tasks/${doomed}`, lead);
  assert.equal(storedFiles(), before - 1);
});

test('requirements take files too; their editors and the uploader delete them', async () => {
  const path = `/requirements/${requirement}/attachments`;
  const brief = await upload(memA, path, { name: 'brief.pdf', type: 'application/pdf' });
  assert.equal(brief.status, 201);
  const other = await upload(memB, path, { name: 'ref.pdf', type: 'application/pdf' });
  assert.deepEqual((await api.get(path, lead)).body.map((a) => a.name), ['brief.pdf', 'ref.pdf']);
  assert.equal((await api.get(path, outsider)).status, 404);
  assert.equal((await api.delete(`/attachments/${brief.body.id}`, memB)).status, 403);
  assert.equal((await api.delete(`/attachments/${brief.body.id}`, lead)).status, 204);
  assert.equal((await api.delete(`/attachments/${other.body.id}`, memB)).status, 204);
  assert.equal((await api.get(path, lead)).body.length, 0);
});

// ---------- Files sent with a comment ----------

test('a comment carries files; they are listed with it, not with the task', async () => {
  const c = await comment(memA, 'xem ảnh');
  const up = await upload(memA, `/comments/${c.id}/attachments`, { name: 'shot.png', type: 'image/png' });
  assert.equal(up.status, 201);
  assert.equal(up.body.comment_id, c.id);
  const { comments, attachments } = (await api.get(`/tasks/${task}`, memB)).body;
  assert.deepEqual(comments.find((x) => x.id === c.id).attachments.map((a) => a.name), ['shot.png']);
  assert.ok(!attachments.some((a) => a.name === 'shot.png'));
  // Anyone who sees the task downloads it; outsiders do not.
  const res = await download(memB, up.body.id);
  assert.equal(res.status, 200);
  await res.body?.cancel();
  const hidden = await download(outsider, up.body.id);
  assert.equal(hidden.status, 404);
  await hidden.body?.cancel();
});

test('a comment may be only files; then its text may be emptied, not before', async () => {
  assert.equal((await api.post(`/tasks/${task}/comments`, memA, { body: '' })).status, 400);
  const c = (await api.post(`/tasks/${task}/comments`, memA, { body: '', with_files: true })).body;
  assert.equal(c.body, '');
  assert.deepEqual(c.attachments, []);
  await upload(memA, `/comments/${c.id}/attachments`, { name: 'brief.pdf', type: 'application/pdf' });
  const plain = await comment(memA, 'text only');
  assert.equal((await api.patch(`/comments/${plain.id}`, memA, { body: '' })).status, 400);
  assert.equal((await api.patch(`/comments/${c.id}`, memA, { body: '' })).status, 200);
});

test("only the author adds files to a comment", async () => {
  const c = await comment(memA, 'mine');
  assert.equal((await upload(memB, `/comments/${c.id}/attachments`, { name: 'x.txt' })).status, 403);
  assert.equal((await upload(boss, `/comments/${c.id}/attachments`, { name: 'x.txt' })).status, 403);
  assert.equal((await upload(outsider, `/comments/${c.id}/attachments`, { name: 'x.txt' })).status, 404);
});

test("deleting a comment deletes its files from the disk", async () => {
  const c = await comment(memA, 'temp');
  await upload(memA, `/comments/${c.id}/attachments`, { name: 'a.txt' });
  await upload(memA, `/comments/${c.id}/attachments`, { name: 'b.txt' });
  const before = storedFiles();
  assert.equal((await api.delete(`/comments/${c.id}`, memA)).status, 204);
  assert.equal(storedFiles(), before - 2);
});

test('requirement feedback carries files too', async () => {
  const c = await comment(memB, '', `/requirements/${requirement}/comments`).catch(() => null);
  assert.equal(c?.id, undefined); // empty feedback without files is refused
  const f = (await api.post(`/requirements/${requirement}/comments`, memB, { body: 'kèm brief', with_files: true })).body;
  const up = await upload(memB, `/requirement-comments/${f.id}/attachments`, { name: 'brief.pdf', type: 'application/pdf' });
  assert.equal(up.body.requirement_comment_id, f.id);
  const list = (await api.get(`/requirements/${requirement}/comments`, lead)).body;
  assert.deepEqual(list.find((x) => x.id === f.id).attachments.map((a) => a.name), ['brief.pdf']);
  assert.ok(!(await api.get(`/requirements/${requirement}/attachments`, lead)).body.some((a) => a.name === 'brief.pdf'));
  assert.equal((await upload(lead, `/requirement-comments/${f.id}/attachments`, { name: 'x.txt' })).status, 403);
});
