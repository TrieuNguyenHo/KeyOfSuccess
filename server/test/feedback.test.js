// Feedback on the app (v31): any company user sends it and sees only their own; root handles it (status, thread).
// The sender edits, deletes and changes its files only while it is 'sent'; root deletes any.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { listen, startServer, wait } from './helpers.js';

let server, api;
let root, boss, ann, bob, content;

before(async () => {
  server = await startServer();
  api = server.api;
  root = await api.root();
  boss = await api.manager();
  content = await api.team(boss, 'Content');
  ann = await api.approve(boss, 'ann', { team: content });
  bob = await api.approve(boss, 'bob', { team: content });
});
after(() => server.stop());

async function upload(as, path, name = 'shot.png') {
  const res = await fetch(`${server.url}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${as.token}`,
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent(name),
      'X-File-Type': 'image/png',
    },
    body: Buffer.from('png bytes'),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const send = async (as, body = {}) => {
  const res = await api.post('/feedback', as, { type: 'bug', title: 'Lỗi', body: 'Không lưu được', page: '#/my', ...body });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
};
const notificationsOf = async (as) => (await api.get('/notifications', as)).body;

test('a user sends feedback: status sent, page and browser recorded, root notified', async () => {
  const before = (await notificationsOf(root)).unread;
  const feedback = await send(ann, { title: 'Không lưu được task' });
  assert.equal(`${feedback.status}/${feedback.type}/${feedback.page}/${feedback.can_edit}`, 'sent/bug/#/my/true');
  assert.ok(feedback.user_agent, 'the browser is recorded');
  assert.equal(feedback.user_name, 'ann');
  const forRoot = await notificationsOf(root);
  assert.equal(forRoot.unread, before + 1);
  assert.equal(`${forRoot.items[0].type}/${forRoot.items[0].feedback_title}`, 'feedback_new/Không lưu được task');
  assert.ok(forRoot.pendingFeedback >= 1);
});

test('fields are checked', async () => {
  for (const body of [{ type: 'x' }, { title: ' ' }, { body: '' }, { title: 'x'.repeat(201) }]) {
    assert.equal((await api.post('/feedback', ann, { type: 'idea', title: 'T', body: 'B', ...body })).status, 400, JSON.stringify(body));
  }
});

test('each user sees only their own feedback; root sees all of it', async () => {
  const mine = await send(bob, { title: 'Của Bob' });
  assert.ok(!(await api.get('/feedback', ann)).body.some((f) => f.id === mine.id));
  assert.equal((await api.get(`/feedback/${mine.id}`, ann)).status, 404);
  assert.equal((await api.patch(`/feedback/${mine.id}`, ann, { type: 'bug', title: 'x', body: 'y' })).status, 404);
  assert.equal((await api.delete(`/feedback/${mine.id}`, ann)).status, 404);
  assert.equal((await api.post(`/feedback/${mine.id}/messages`, ann, { body: 'hi' })).status, 404);
  assert.equal((await api.get(`/feedback/${mine.id}`, boss)).status, 404, 'not even a Manager');
  assert.ok((await api.get('/feedback', root)).body.some((f) => f.id === mine.id));
  assert.equal((await api.get(`/feedback/${mine.id}`, root)).body.user_email, 'bob@t.test');
});

test('the sender edits and deletes only while it is sent', async () => {
  const feedback = await send(ann);
  const edited = await api.patch(`/feedback/${feedback.id}`, ann, { type: 'idea', title: 'Đề xuất', body: 'Thêm lọc' });
  assert.equal(`${edited.status}/${edited.body.type}/${edited.body.title}`, '200/idea/Đề xuất');
  assert.equal((await api.patch(`/feedback/${feedback.id}/status`, root, { status: 'received' })).status, 200);
  const late = await api.patch(`/feedback/${feedback.id}`, ann, { type: 'idea', title: 'x', body: 'y' });
  assert.equal(late.status, 403);
  assert.match(late.body.error, /đã được tiếp nhận/);
  assert.equal((await api.delete(`/feedback/${feedback.id}`, ann)).status, 403);
  assert.equal((await api.get(`/feedback/${feedback.id}`, ann)).body.can_edit, false);

  const other = await send(ann);
  assert.equal((await api.delete(`/feedback/${other.id}`, ann)).status, 204);
  assert.equal((await api.get(`/feedback/${other.id}`, ann)).status, 404);
});

test('root moves the status freely, the sender is notified, history is kept; rejected needs a reason', async () => {
  const feedback = await send(ann);
  assert.equal((await api.patch(`/feedback/${feedback.id}/status`, ann, { status: 'done' })).status, 403);
  assert.equal((await api.patch(`/feedback/${feedback.id}/status`, root, { status: 'nope' })).status, 400);
  const unread = (await notificationsOf(ann)).unread;
  assert.equal((await api.patch(`/feedback/${feedback.id}/status`, root, { status: 'done' })).status, 200, 'skipping steps is fine');
  assert.equal((await api.patch(`/feedback/${feedback.id}/status`, root, { status: 'in_progress' })).status, 200, 'so is going back');
  const forAnn = await notificationsOf(ann);
  assert.equal(forAnn.unread, unread + 2);
  assert.equal(`${forAnn.items[0].type}/${forAnn.items[0].excerpt}`, 'feedback_status/in_progress');

  const reasonless = await api.patch(`/feedback/${feedback.id}/status`, root, { status: 'rejected' });
  assert.equal(reasonless.status, 400);
  const rejected = await api.patch(`/feedback/${feedback.id}/status`, root, { status: 'rejected', note: 'Trùng với feedback khác' });
  assert.equal(rejected.body.status, 'rejected');
  assert.deepEqual(
    rejected.body.events.map((e) => `${e.from_status}>${e.to_status}`),
    ['sent>done', 'done>in_progress', 'in_progress>rejected']
  );
  const reason = rejected.body.messages.at(-1);
  assert.equal(`${reason.body}/${reason.from_root}`, 'Trùng với feedback khác/1');
});

test('the thread: sender and root write, each side is notified, author edits, author or root deletes', async () => {
  const feedback = await send(ann);
  const rootUnread = (await notificationsOf(root)).unread;
  const question = await api.post(`/feedback/${feedback.id}/messages`, ann, { body: 'Bổ sung: lỗi trên iPad' });
  assert.equal(question.status, 201);
  assert.equal((await notificationsOf(root)).unread, rootUnread + 1);
  const annUnread = (await notificationsOf(ann)).unread;
  const answer = await api.post(`/feedback/${feedback.id}/messages`, root, { body: 'Bạn dùng iPad đời nào?' });
  const forAnn = await notificationsOf(ann);
  assert.equal(forAnn.unread, annUnread + 1);
  assert.equal(`${forAnn.items[0].type}/${forAnn.items[0].excerpt}`, 'feedback_message/Bạn dùng iPad đời nào?');

  assert.equal((await api.post(`/feedback/${feedback.id}/messages`, ann, { body: ' ' })).status, 400);
  assert.equal((await api.patch(`/feedback-messages/${answer.body.id}`, ann, { body: 'x' })).status, 403);
  const edited = await api.patch(`/feedback-messages/${question.body.id}`, ann, { body: 'Bổ sung: iPad Air' });
  assert.ok(edited.body.edited_at);
  assert.equal((await api.delete(`/feedback-messages/${answer.body.id}`, ann)).status, 403);
  assert.equal((await api.delete(`/feedback-messages/${question.body.id}`, root)).status, 204);
  assert.equal((await api.get(`/feedback/${feedback.id}`, ann)).body.messages.length, 1);
  assert.equal((await api.get(`/feedback-messages/${answer.body.id}`, bob)).status, 404, 'no such route for reading');
  assert.equal((await api.patch(`/feedback-messages/${answer.body.id}`, bob, { body: 'x' })).status, 404);
});

test('files: the sender attaches while sent; message files by their author; root reaches feedback files only', async () => {
  const feedback = await send(ann);
  const shot = await upload(ann, `/feedback/${feedback.id}/attachments`);
  assert.equal(`${shot.status}/${shot.body.feedback_id}`, `201/${feedback.id}`);
  assert.equal((await upload(bob, `/feedback/${feedback.id}/attachments`)).status, 404);
  const download = await fetch(`${server.url}/attachments/${shot.body.id}`, { headers: { Authorization: `Bearer ${root.token}` } });
  assert.equal(download.status, 200);
  await download.body?.cancel();
  assert.equal((await api.get(`/attachments/${shot.body.id}`, bob)).status, 404);

  const message = await api.post(`/feedback/${feedback.id}/messages`, root, { body: '', with_files: true });
  const reply = await upload(root, `/feedback-messages/${message.body.id}/attachments`, 'fix.png');
  assert.equal(reply.status, 201);
  assert.equal((await upload(ann, `/feedback-messages/${message.body.id}/attachments`)).status, 403);
  const shown = (await api.get(`/feedback/${feedback.id}`, ann)).body;
  assert.deepEqual(shown.attachments.map((a) => a.name), ['shot.png'], "the feedback's own files leave the thread's out");
  assert.deepEqual(shown.messages[0].attachments.map((a) => a.name), ['fix.png']);
  assert.equal((await api.delete(`/attachments/${reply.body.id}`, ann)).status, 403);

  await api.patch(`/feedback/${feedback.id}/status`, root, { status: 'received' });
  assert.equal((await upload(ann, `/feedback/${feedback.id}/attachments`)).status, 403);
  assert.equal((await api.delete(`/attachments/${shot.body.id}`, ann)).status, 403);

  // Root deletes the feedback: its files leave the disk with it.
  const stored = readdirSync(server.uploadDir).length;
  assert.equal((await api.delete(`/feedback/${feedback.id}`, root)).status, 204);
  assert.equal(readdirSync(server.uploadDir).length, stored - 2);
});

test("root's task attachments stay closed, and root sends no feedback", async () => {
  const project = await api.project(boss, { name: 'P', team_ids: [] });
  const requirement = await api.requirement(boss, project.id);
  const section = await api.firstSection(boss, project.id);
  const task = await api.task(boss, { section, requirement });
  const file = await upload(boss, `/tasks/${task}/attachments`, 'task.png');
  assert.equal((await api.get(`/attachments/${file.body.id}`, root)).status, 404);
  assert.equal((await api.delete(`/attachments/${file.body.id}`, root)).status, 404);
  assert.equal((await api.post('/feedback', root, { type: 'bug', title: 'x', body: 'y' })).status, 403);
  const feedback = await send(ann);
  assert.equal((await api.patch(`/feedback/${feedback.id}`, root, { type: 'bug', title: 'x', body: 'y' })).status, 403);
});

test('list filters for root, and live events reach the sender and root only', async () => {
  const idea = await send(bob, { type: 'idea' });
  const ideas = (await api.get('/feedback?type=idea', root)).body;
  assert.ok(ideas.length && ideas.every((f) => f.type === 'idea'));
  assert.ok((await api.get('/feedback?status=sent', root)).body.every((f) => f.status === 'sent'));

  const bobStream = listen(server.url, bob);
  const annStream = listen(server.url, ann);
  const rootStream = listen(server.url, root);
  while (!bobStream.isOpen() || !annStream.isOpen() || !rootStream.isOpen()) await wait(20);
  await api.post(`/feedback/${idea.id}/messages`, root, { body: 'Cảm ơn' });
  await wait(100);
  await Promise.all([bobStream.close(), annStream.close(), rootStream.close()]);
  assert.ok(bobStream.events.includes('feedback') && bobStream.events.includes('notification'));
  assert.ok(rootStream.events.includes('feedback'));
  assert.ok(!annStream.events.includes('feedback'));
});
