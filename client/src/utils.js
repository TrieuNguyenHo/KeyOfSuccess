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

// Label tables are getters, so each read is in the current language.
export const PRIORITIES = {
  get low() {
    return tr('Thấp');
  },
  get medium() {
    return tr('Trung bình');
  },
  get high() {
    return tr('Cao');
  },
};
export const ROLES = { director: 'Director', manager: 'Manager', leader: 'Leader', member: 'Member' };
// Manager-level rights (user administration, watching everyone…): Managers and Directors, who have them all.
export const isManager = (user) => user.role === 'manager' || user.role === 'director';
export const STATUSES = {
  get pending() {
    return tr('Chờ duyệt');
  },
  get active() {
    return tr('Đang hoạt động');
  },
  get disabled() {
    return tr('Đã khoá');
  },
};

export const GENDERS = {
  get male() {
    return tr('Nam');
  },
  get female() {
    return tr('Nữ');
  },
  get other() {
    return tr('Khác');
  },
  get undisclosed() {
    return tr('Không muốn nói');
  },
};

// Repeat rules of recurring tasks (tasks.recurrence, JSON): { freq: 'daily' } (Monday to Friday),
// { freq: 'weekly' | 'biweekly', days: [1..7] } (1 = Monday) or { freq: 'monthly', day: 1..31 }.
const weekday = (id, label) => ({
  id,
  get name() {
    return label();
  },
});
export const WEEKDAYS = [
  weekday(1, () => tr('T2')),
  weekday(2, () => tr('T3')),
  weekday(3, () => tr('T4')),
  weekday(4, () => tr('T5')),
  weekday(5, () => tr('T6')),
  weekday(6, () => tr('T7')),
  weekday(7, () => tr('CN')),
];
export const FREQ_LABELS = {
  get daily() {
    return tr('Hằng ngày (T2–T6)');
  },
  get weekly() {
    return tr('Hằng tuần');
  },
  get biweekly() {
    return tr('Mỗi 2 tuần');
  },
  get monthly() {
    return tr('Hằng tháng');
  },
};

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
