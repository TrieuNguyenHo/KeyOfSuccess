// Demo data for trying the interface (npm run seed:demo; npm run seed:demo -- --remove takes it all out again).
// Everything it adds is marked: people have an @demo.test email, activities (projects in the code) start with
// "[Demo] ". Rows are written straight into the database, so nobody gets notifications. Tasks are spread from July to
// December 2026 around today, some done (on time or late), some overdue, so reports, the Timeline and the
// dashboards have something to show. Run it on a backup-able dev database, never in production.
import { db, transaction } from '../src/db.js';
import { localDate } from '../src/lib/util.js';

const PREFIX = '[Demo] ';
const DOMAIN = '@demo.test';

function remove() {
  transaction(() => {
    const projects = db.prepare('DELETE FROM projects WHERE name LIKE ?').run(`${PREFIX}%`).changes;
    const users = db.prepare('DELETE FROM users WHERE email LIKE ?').run(`%${DOMAIN}`).changes;
    console.log(`Đã xoá ${projects} hoạt động demo và ${users} người demo.`);
  });
}

if (process.argv.includes('--remove')) {
  remove();
  process.exit(0);
}
if (db.prepare('SELECT 1 FROM projects WHERE name LIKE ?').get(`${PREFIX}%`)) {
  console.log('Đã có dữ liệu demo. Chạy với --remove để xoá trước.');
  process.exit(1);
}

// A fixed seed, so two runs give the same data.
let seed = 20261010;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
const day = (base, n) => {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDate(d);
};
const stamp = (date, hour = 9) => `${date} ${String(hour).padStart(2, '0')}:${String(between(0, 59)).padStart(2, '0')}:00`;
const TODAY = localDate(new Date());

const teamId = (name) => db.prepare('SELECT id FROM teams WHERE name = ?').get(name)?.id;
const TEAMS = ['Content', 'Design', 'Social', 'Marketing', 'Brand'].map((name) => ({ name, id: teamId(name) })).filter((t) => t.id);
if (TEAMS.length < 2) {
  console.log('Cần ít nhất 2 trong các team Content, Design, Social, Marketing, Brand.');
  process.exit(1);
}

const PEOPLE = [
  ['Phạm Thu Hà', 'Content', 'leader', 'Content Lead'],
  ['Nguyễn Quốc Bảo', 'Content', 'member', 'Copywriter'],
  ['Trần Mai Linh', 'Content', 'member', 'Content Writer'],
  ['Lê Hoàng Nam', 'Design', 'leader', 'Art Director'],
  ['Võ Minh Thư', 'Design', 'member', 'Graphic Designer'],
  ['Đặng Tuấn Kiệt', 'Design', 'member', 'Video Editor'],
  ['Bùi Ngọc Ánh', 'Social', 'member', 'Social Executive'],
  ['Hoàng Gia Huy', 'Social', 'member', 'Community Manager'],
  ['Ngô Thanh Tâm', 'Marketing', 'leader', 'Performance Lead'],
  ['Phan Đức Long', 'Marketing', 'member', 'Ads Specialist'],
  ['Đỗ Khánh Vy', 'Brand', 'member', 'Brand Executive'],
  ['Lý Hải Đăng', 'Brand', 'member', 'Event Executive'],
];

const ACTIVITIES = [
  {
    name: 'Ra mắt ghế massage K-Luxe', teams: ['Content', 'Design', 'Marketing'], color: '#D85A30',
    projects: ['Landing page ra mắt', 'Video giới thiệu sản phẩm', 'Chạy quảng cáo Facebook & TikTok', 'PR báo chí'],
  },
  {
    name: 'Black Friday 2026', teams: ['Marketing', 'Social', 'Design'], color: '#7a3e9d',
    projects: ['Kế hoạch ưu đãi', 'Bộ banner & key visual', 'Lịch đăng social', 'Email & Zalo OA'],
  },
  {
    name: 'Social tháng 10–11', teams: ['Social', 'Content'], color: '#2f7d5b',
    projects: ['Bài đăng Facebook', 'Clip TikTok ngắn', 'Livestream cuối tuần'],
  },
  {
    name: 'Sự kiện khai trương showroom Đà Nẵng', teams: ['Brand', 'Design'], color: '#b8860b',
    projects: ['Hậu cần sự kiện', 'Ấn phẩm in', 'Mời khách & KOL'],
  },
  {
    name: 'Nhận diện thương hiệu 2027', teams: ['Brand', 'Design', 'Content'], color: '#3a6ea5',
    projects: ['Brand guideline', 'Bộ ảnh sản phẩm', 'Thông điệp thương hiệu'],
  },
  {
    name: 'Chăm sóc khách hàng sau bán', teams: ['Content', 'Marketing'], color: '#8b5a2b',
    projects: ['Kịch bản tin nhắn', 'Khảo sát hài lòng', 'Chương trình khách hàng thân thiết'],
  },
];

const TASKS = [
  'Lên brief', 'Viết nội dung', 'Thiết kế bản nháp', 'Duyệt nội dung với Leader', 'Chỉnh sửa theo góp ý',
  'Chụp ảnh sản phẩm', 'Dựng video 30s', 'Viết caption', 'Lên lịch đăng', 'Đo hiệu quả tuần đầu',
  'Chuẩn bị ngân sách', 'Gửi báo giá nhà cung cấp', 'Kiểm tra tracking pixel', 'Làm báo cáo tổng kết',
  'Họp kick-off', 'Thiết kế banner 1200x628', 'Thiết kế story 1080x1920', 'Viết kịch bản livestream',
  'Liên hệ KOL', 'Soạn email gửi khách', 'Test A/B tiêu đề', 'Dịch sang tiếng Anh', 'In thử ấn phẩm',
];
const SUBTASKS = ['Bản nháp', 'Gửi duyệt', 'Sửa lần 1', 'Chốt file cuối', 'Đăng lên drive'];
const COMMENTS = [
  'Mình đã cập nhật bản mới, mọi người xem giúp nhé.', 'Phần này cần thêm số liệu tháng trước.',
  'Ok, duyệt bản này.', 'Deadline có lùi được 2 ngày không?', 'Đã gửi file lên drive chung.',
  'Nhớ kiểm tra lại logo theo guideline mới.', 'Khách hàng phản hồi tốt 👍',
];

transaction(() => {
  // People.
  const insertUser = db.prepare(
    "INSERT INTO users (name, email, role, status, job_title, joined_at, created_at) VALUES (?, ?, ?, 'active', ?, ?, ?)"
  );
  const joinTeam = db.prepare('INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)');
  const people = [];
  PEOPLE.forEach(([name, team, role, job], i) => {
    const t = TEAMS.find((x) => x.name === team);
    if (!t) return;
    const { lastInsertRowid } = insertUser.run(name, `demo${i + 1}${DOMAIN}`, role, job, stamp('2026-06-01'), stamp('2026-06-01'));
    joinTeam.run(lastInsertRowid, t.id);
    people.push({ id: Number(lastInsertRowid), team: t.id, role });
  });

  const channels = db.prepare('SELECT id FROM channels').all().map((c) => c.id);
  const ins = {
    project: db.prepare('INSERT INTO projects (name, color, owner_id, created_at) VALUES (?, ?, ?, ?)'),
    projectTeam: db.prepare('INSERT INTO project_teams (project_id, team_id) VALUES (?, ?)'),
    member: db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, added_at) VALUES (?, ?, ?)'),
    section: db.prepare('INSERT INTO sections (project_id, name, position, kind) VALUES (?, ?, ?, ?)'),
    requirement: db.prepare('INSERT INTO requirements (project_id, title, description, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    task: db.prepare(`INSERT INTO tasks (project_id, section_id, requirement_id, parent_id, title, description, assignee_id, due_date,
      start_date, priority, completed, completed_at, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    channel: db.prepare('INSERT OR IGNORE INTO task_channels (task_id, channel_id) VALUES (?, ?)'),
    follow: db.prepare('INSERT OR IGNORE INTO task_followers (task_id, user_id) VALUES (?, ?)'),
    comment: db.prepare('INSERT INTO comments (task_id, user_id, body, created_at) VALUES (?, ?, ?, ?)'),
    reqComment: db.prepare('INSERT INTO requirement_comments (requirement_id, user_id, body, created_at) VALUES (?, ?, ?, ?)'),
  };
  let taskCount = 0;

  for (const activity of ACTIVITIES) {
    const teams = activity.teams.map((n) => TEAMS.find((t) => t.name === n)).filter(Boolean);
    if (!teams.length) continue;
    const crew = people.filter((p) => teams.some((t) => t.id === p.team));
    const owner = crew.find((p) => p.role === 'leader') ?? crew[0];
    const created = day('2026-07-01', between(0, 30));
    const projectId = Number(ins.project.run(PREFIX + activity.name, activity.color, owner.id, stamp(created)).lastInsertRowid);
    for (const t of teams) ins.projectTeam.run(projectId, t.id);
    for (const p of crew) ins.member.run(projectId, p.id, stamp(created));
    const sections = {};
    [['Planned', 'todo'], ['In-Progress', 'doing'], ['Completed', 'done'], ['Pending', 'pending']].forEach(([name, kind], i) => {
      sections[kind] = Number(ins.section.run(projectId, name, i + 1, kind).lastInsertRowid);
    });

    activity.projects.forEach((title, r) => {
      const reqId = Number(
        ins.requirement.run(projectId, title, `Mục tiêu: ${title.toLowerCase()} đúng hạn, đúng guideline.`, r + 1, owner.id, stamp(created)).lastInsertRowid
      );
      if (rand() < 0.6) ins.reqComment.run(reqId, pick(crew).id, pick(COMMENTS), stamp(day(created, between(1, 20)), 14));
      const n = between(5, 8);
      for (let k = 0; k < n; k++) {
        const due = day('2026-07-20', between(0, 150)); // 20/07 → mid December
        const start = rand() < 0.75 ? day(due, -between(2, 14)) : null;
        const createdOn = [day(start ?? due, -between(3, 10)), created].sort().pop();
        let completedAt = null;
        if (due < TODAY ? rand() < 0.75 : due <= day(TODAY, 20) && rand() < 0.3) {
          const doneOn = day(due, between(-5, 4)); // late when after the due date
          if (doneOn <= TODAY && doneOn >= createdOn) completedAt = stamp(doneOn, between(8, 18));
        }
        const kind = completedAt ? 'done' : pick(['todo', 'todo', 'doing', 'doing', 'pending']);
        const assignee = rand() < 0.92 ? pick(crew).id : null;
        const id = Number(
          ins.task.run(projectId, sections[kind], reqId, null, `${pick(TASKS)} – ${title}`, rand() < 0.5 ? 'Chi tiết xem trong brief.' : null,
            assignee, due, start, pick(['low', 'medium', 'medium', 'high']), completedAt ? 1 : 0, completedAt, k + 1, owner.id,
            stamp(createdOn)).lastInsertRowid
        );
        taskCount++;
        if (channels.length && rand() < 0.5) ins.channel.run(id, pick(channels));
        ins.follow.run(id, owner.id);
        if (assignee) ins.follow.run(id, assignee);
        for (let c = between(0, 3); c > 0; c--) {
          const author = pick(crew).id;
          ins.comment.run(id, author, pick(COMMENTS), stamp(day(createdOn, between(0, 5)), between(8, 20)));
          ins.follow.run(id, author);
        }
        if (rand() < 0.35) {
          SUBTASKS.slice(0, between(2, 4)).forEach((sub, s) => {
            const done = completedAt || rand() < 0.4;
            ins.task.run(projectId, null, null, id, sub, null, assignee, null, null, null, done ? 1 : 0,
              done ? completedAt ?? stamp(TODAY) : null, s + 1, owner.id, stamp(createdOn));
          });
        }
      }
    });
  }
  console.log(`Đã thêm ${people.length} người demo, ${ACTIVITIES.length} hoạt động, ${taskCount} task (chưa tính subtask).`);
});
