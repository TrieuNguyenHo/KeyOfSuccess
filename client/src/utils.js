import { locale, tr } from './i18n.js';

const pad = (n) => String(n).padStart(2, '0');
export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayStr = () => toDateStr(new Date());

export function daysFromToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export const isOverdue = (task) => !task.completed && task.due_date && task.due_date < todayStr();

export const formatDate = (s) =>
  s ? new Date(`${s}T00:00`).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

// SQLite datetime('now') is UTC without a timezone suffix.
export const formatDateTime = (s) => new Date(`${s.replace(' ', 'T')}Z`).toLocaleString(locale());

// Label tables are getters, so each read is in the current language: labels({ key: () => tr('…') }).
const labels = (table) =>
  Object.defineProperties({}, Object.fromEntries(Object.entries(table).map(([key, get]) => [key, { get, enumerable: true }])));
export const PRIORITIES = labels({
  low: () => tr('Thấp'),
  medium: () => tr('Trung bình'),
  high: () => tr('Cao'),
});
// A person's role as root named it (role_name from the server); root accounts have no role of the company.
export const roleLabel = (user) => user.role_name ?? (user.role === 'root' ? 'Root' : user.role);
// What the signed-in user's role may do (user.permissions from /api/me, set by root): the scope ('none' / 'team' /
// 'all') or whether they hold it at all. The server checks every request; these only shape the screens.
export const scopeOf = (user, key) => user.permissions?.[key] ?? 'none';
export const can = (user, key) => scopeOf(user, key) !== 'none';
// Whether a scoped permission covers something that concerns these teams.
export function coversTeams(user, key, teamIds) {
  const scope = scopeOf(user, key);
  return scope === 'all' || (scope === 'team' && teamIds.some((id) => user.team_ids.includes(id)));
}
// Watching everyone's work (people.watch 'all'): the department-wide screens instead of the user's own teams.
export const watchesAll = (user) => scopeOf(user, 'people.watch') === 'all';
export const STATUSES = labels({
  pending: () => tr('Chờ duyệt'),
  active: () => tr('Đang hoạt động'),
  disabled: () => tr('Đã khoá'),
});

export const GENDERS = labels({
  male: () => tr('Nam'),
  female: () => tr('Nữ'),
  other: () => tr('Khác'),
  undisclosed: () => tr('Không muốn nói'),
});

// Repeat rules of recurring tasks (tasks.recurrence, JSON): { freq: 'daily' } (Monday to Friday),
// { freq: 'weekly' | 'biweekly', days: [1..7] } (1 = Monday) or { freq: 'monthly', day: 1..31 }.
const weekday = (id, label) => Object.defineProperty({ id }, 'name', { get: label, enumerable: true });
export const WEEKDAYS = [
  weekday(1, () => tr('T2')),
  weekday(2, () => tr('T3')),
  weekday(3, () => tr('T4')),
  weekday(4, () => tr('T5')),
  weekday(5, () => tr('T6')),
  weekday(6, () => tr('T7')),
  weekday(7, () => tr('CN')),
];
export const FREQ_LABELS = labels({
  daily: () => tr('Hằng ngày (T2–T6)'),
  weekly: () => tr('Hằng tuần'),
  biweekly: () => tr('Mỗi 2 tuần'),
  monthly: () => tr('Hằng tháng'),
});

// A repeat rule in words (also for the rules stored in the task history).
export function recurrenceLabel(json) {
  if (!json) return '';
  const rule = JSON.parse(json);
  if (rule.freq === 'daily') return FREQ_LABELS.daily;
  if (rule.freq === 'monthly') return tr('Hằng tháng, ngày {day}', { day: rule.day });
  return `${FREQ_LABELS[rule.freq]}: ${rule.days.map((d) => WEEKDAYS[d - 1].name).join(', ')}`;
}

// "Team Content" for one team, "Team của tôi" for several (Leaders and Managers may have many).
export const myTeamsLabel = (user) => (user.teams.length === 1 ? `Team ${user.teams[0].name}` : tr('Team của tôi'));

export const PROJECT_COLORS = ['#4573d2', '#e8384f', '#fd9a00', '#62d26f', '#a862ea', '#20aaea', '#f06a6a', '#37c5ab'];

export function colorFor(name = '') {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 50%)`;
}

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

// The project Board/List filters when nothing is filtered (also the defaults left out of the URL).
export const EMPTY_FILTERS = { requirement: '', team: '', channel: '', q: '', assignee: '', status: 'all', due: 'all' };
