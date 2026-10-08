// Project templates (v39): saved from a project by whoever may create projects, then used to create projects with the
// same statuses, requirements, tasks and subtasks, their due dates placed from a start or launch date.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';

let server, api;
let boss, lead, memA, design, source, templateId, channel;
const ids = {};

before(async () => {
  server = await startServer();
  api = server.api;
  boss = await api.manager();
  const content = await api.team(boss, 'Content');
  design = await api.team(boss, 'Design');
  lead = await api.approve(boss, 'lead', { role: 'leader', team: content });
  memA = await api.approve(boss, 'memA', { team: content });
  await api.patch(`/admin/users/${boss.id}`, boss, { team_ids: [content, design] });
  source = (await api.project(boss, { name: 'Tết 2027', team_ids: [content] })).id;
  for (const email of ['lead@t.test', 'mema@t.test']) await api.post(`/projects/${source}/members`, boss, { email });
  const r1 = await api.requirement(boss, source, 'Landing page', 'Trang đích');
  const r2 = await api.requirement(boss, source, 'Social');
  const review = (await api.post(`/projects/${source}/sections`, boss, { name: 'Review' })).body.id;
  const sections = (await api.get(`/projects/${source}`, boss)).body.sections;
  const status = (kind) => sections.find((s) => s.kind === kind).id;
  channel = (await api.post('/channels', boss, { name: 'Facebook', color: '#1877f2' })).body.id;
  const gone = (await api.post('/channels', boss, { name: 'Zalo', color: '#0068ff' })).body.id;

  const task = async (title, section, requirement, patch) => {
    const id = await api.task(boss, { section, requirement, title });
    await api.patch(`/tasks/${id}`, boss, patch);
    return id;
  };
  ids.banner = await task('Banner', status('todo'), r1, {
    assignee_id: memA.id,
    due_date: '2026-11-02',
    priority: 'high',
    description: 'Kích thước 1200x628',
    channel_ids: [channel, gone],
  });
  ids.sub = (await api.post('/tasks', boss, { parent_id: ids.banner, title: 'Ảnh nền' })).body.id;
  await api.patch(`/tasks/${ids.sub}`, boss, { due_date: '2026-11-03', completed: true });
  ids.post = await task('Bài đăng', review, r2, { assignee_id: lead.id, due_date: '2026-11-10' });
  ids.done = await task('Kế hoạch', status('todo'), r2, { due_date: '2026-11-05', completed: true });
  ids.weekly = await task('Báo cáo tuần', status('doing'), r2, { due_date: '2026-11-06', recurrence: { freq: 'weekly', days: [5] } });
  await api.post(`/tasks/${ids.banner}/comments`, memA, { body: 'Đã xong bản nháp' });
  await api.delete(`/channels/${gone}`, boss);
});
after(() => server.stop());

const templates = async (as = boss) => (await api.get('/project-templates', as)).body;
async function projectFrom(body) {
  const res = await api.post('/projects', boss, { name: 'Mới', team_ids: [], ...body });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const { body: data } = await api.get(`/projects/${res.body.id}`, boss);
  const byTitle = Object.fromEntries(data.tasks.map((t) => [t.title, t]));
  return { id: res.body.id, data, byTitle };
}

test('only people who may create projects see, save or change templates', async () => {
  assert.equal((await api.get('/project-templates', memA)).status, 403);
  assert.equal((await api.post(`/projects/${source}/template`, memA, { name: 'x' })).status, 403);
  assert.equal((await api.post(`/projects/${source}/template`, boss, { name: '  ' })).status, 400);
});

test('saving a project as a template keeps its structure and the span of its due dates', async () => {
  const res = await api.post(`/projects/${source}/template`, boss, { name: 'Chiến dịch Tết' });
  assert.equal(res.status, 201);
  templateId = res.body.id;
  const [t] = await templates();
  assert.deepEqual(
    [t.name, t.requirements, t.tasks, t.subtasks, t.span, t.source_project_name],
    ['Chiến dịch Tết', 2, 4, 1, 8, 'Tết 2027']
  );
});

test('a project from a template starts on the chosen day with the same statuses, requirements and tasks', async () => {
  const { data, byTitle } = await projectFrom({ team_ids: [], template_id: templateId, anchor: 'start', anchor_date: '2026-12-01' });
  assert.deepEqual(
    data.sections.map((s) => s.name),
    ['Planned', 'In-Progress', 'Completed', 'Pending', 'Review']
  );
  assert.deepEqual(
    data.requirements.map((r) => `${r.title}|${r.description ?? ''}`),
    ['Landing page|Trang đích', 'Social|']
  );
  const banner = byTitle.Banner;
  assert.deepEqual(
    [banner.due_date, banner.priority, banner.description, banner.channels.map((c) => c.name)],
    ['2026-12-01', 'high', 'Kích thước 1200x628', ['Facebook']]
  );
  assert.equal(byTitle['Bài đăng'].due_date, '2026-12-09');
  assert.equal(data.sections.find((s) => s.id === byTitle['Bài đăng'].section_id).name, 'Review');
  // Done in the source, it starts again in Planned.
  const plan = byTitle['Kế hoạch'];
  assert.equal(`${plan.completed}|${plan.due_date}|${data.sections.find((s) => s.id === plan.section_id).name}`, '0|2026-12-04|Planned');
  assert.equal(JSON.parse(byTitle['Báo cáo tuần'].recurrence).freq, 'weekly');

  const detail = (await api.get(`/tasks/${banner.id}`, boss)).body;
  assert.deepEqual(
    detail.subtasks.map((s) => `${s.title}|${s.due_date}|${s.completed}`),
    ['Ảnh nền|2026-12-02|0']
  );
  assert.equal(detail.comments.length, 0);
});

test('with the launch date, the last due date falls on it', async () => {
  const { byTitle } = await projectFrom({ template_id: templateId, anchor: 'end', anchor_date: '2026-12-31' });
  assert.equal(byTitle['Bài đăng'].due_date, '2026-12-31');
  assert.equal(byTitle.Banner.due_date, '2026-12-23');
});

test('assignees who may take the new project’s tasks keep them, join it and are told; others are left out', async () => {
  const before = (await api.get('/notifications', memA)).body.items.filter((n) => n.type === 'assigned').length;
  const content = (await projectFrom({ template_id: templateId, anchor_date: '2026-12-01' })).byTitle;
  assert.equal(content.Banner.assignee_id, memA.id);
  const after = (await api.get('/notifications', memA)).body.items.filter((n) => n.type === 'assigned').length;
  assert.equal(after, before + 1);

  // A Design project: the Content people are no assignees there.
  const other = await projectFrom({ team_ids: [design], template_id: templateId, anchor_date: '2026-12-01' });
  assert.equal(other.byTitle.Banner.assignee_id, null);
  assert.ok(!other.data.members.some((m) => m.id === memA.id));
});

test('a template with due dates needs a valid date; an unknown template is refused', async () => {
  for (const anchor_date of [undefined, '2026-13-45', 'tomorrow']) {
    assert.equal((await api.post('/projects', boss, { name: 'X', template_id: templateId, anchor_date })).status, 400);
  }
  assert.equal((await api.post('/projects', boss, { name: 'X', template_id: 9999, anchor_date: '2026-12-01' })).status, 400);
});

test('a template is a snapshot: changing the project later leaves it as it was until saved over', async () => {
  await api.patch(`/tasks/${ids.banner}`, boss, { title: 'Banner mới' });
  let { byTitle } = await projectFrom({ template_id: templateId, anchor_date: '2026-12-01' });
  assert.ok(byTitle.Banner);
  const res = await api.post(`/projects/${source}/template`, boss, { name: 'Chiến dịch Tết v2', template_id: templateId });
  assert.equal(res.status, 200);
  assert.equal((await templates()).length, 1);
  ({ byTitle } = await projectFrom({ template_id: templateId, anchor_date: '2026-12-01' }));
  assert.ok(byTitle['Banner mới']);
});

test('a project without due dates makes a template that needs no date', async () => {
  const plain = (await api.project(boss, { name: 'Trống', team_ids: [] })).id;
  const r = await api.requirement(boss, plain, 'R');
  await api.task(boss, { section: await api.firstSection(boss, plain), requirement: r, title: 'Không hạn' });
  const t = (await api.post(`/projects/${plain}/template`, boss, { name: 'Không hạn' })).body;
  assert.equal(t.span, null);
  const { byTitle } = await projectFrom({ template_id: t.id });
  assert.equal(byTitle['Không hạn'].due_date, null);
});

test('templates are renamed and deleted', async () => {
  assert.equal((await api.patch(`/project-templates/${templateId}`, boss, { name: 'Tết' })).body.name, 'Tết');
  assert.equal((await api.patch(`/project-templates/${templateId}`, memA, { name: 'x' })).status, 403);
  assert.equal((await api.delete(`/project-templates/${templateId}`, boss)).status, 204);
  assert.equal((await api.delete(`/project-templates/${templateId}`, boss)).status, 404);
  assert.ok(!(await templates()).some((t) => t.id === templateId));
});
