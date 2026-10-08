// Excel export of the overview and project dashboards: exactly the data on screen (same scope and team
// filter), one sheet per card.
import { downloadXlsx } from '../../xlsx.js';
import { todayStr } from '../../utils.js';
import { locale, tr } from '../../i18n.js';

const percent = (done, total) => (total ? Math.round((done / total) * 100) : 0);

function infoSheet(title, scope, stats) {
  return {
    name: tr('Tổng quan'),
    rows: [
      [tr('Chỉ số'), tr('Giá trị')],
      ['Dashboard', title],
      [tr('Phạm vi'), scope],
      [tr('Xuất lúc'), new Date().toLocaleString(locale())],
      ...stats,
    ],
  };
}

function workloadSheet(people, withTeam) {
  return {
    name: 'Workload',
    rows: [
      [tr('Người'), ...(withTeam ? ['Team'] : []), tr('Mở'), tr('Quá hạn'), tr('7 ngày tới'), tr('Ưu tiên cao'), tr('Xong 7 ngày')],
      ...people.map((p) => [p.name, ...(withTeam ? [p.team_name ?? ''] : []), p.open, p.overdue, p.due_soon, p.high, p.done_7d]),
    ],
  };
}

const progressRows = (label, items) => [
  [label, tr('Đã xong'), tr('Tổng'), tr('Hoàn thành (%)'), tr('Quá hạn')],
  ...items.map((i) => [i.name, i.done, i.total, percent(i.done, i.total), i.overdue ?? '']),
];

function channelSheet(channels, noChannel) {
  const rows = [...channels, ...(noChannel.total ? [{ name: tr('Chưa gắn kênh'), ...noChannel }] : [])];
  return { name: tr('Theo kênh'), rows: progressRows(tr('Kênh'), rows) };
}

const trendSheet = (trend) => ({
  name: tr('Hoàn thành mỗi ngày'),
  rows: [[tr('Ngày'), tr('Task hoàn thành')], ...trend.map((d) => [d.day, d.done])],
});

const fileName = (title) => `Dashboard - ${title.replace(/[\\/:*?"<>|]/g, ' ').trim()} - ${todayStr()}.xlsx`;

export function exportOverview(data, scopeLabel, withTeam) {
  const s = data.summary;
  downloadXlsx(fileName(scopeLabel), [
    infoSheet(tr('Tổng quan'), scopeLabel, [
      [tr('Đang mở'), s.open],
      [tr('Quá hạn'), s.overdue],
      [tr('Đến hạn trong 7 ngày'), s.due_soon],
      [tr('Hoàn thành 7 ngày qua'), s.done_7d],
      ...(withTeam ? [[tr('Chưa giao'), s.unassigned]] : []),
    ]),
    workloadSheet(data.people, withTeam),
    { name: tr('Theo project'), rows: progressRows('Project', data.projects.map((p) => ({ ...p, total: p.open + p.done }))) },
    trendSheet(data.trend),
    channelSheet(data.channels, data.no_channel),
  ]);
}

export function exportProject(data, teamLabel, withTeam) {
  const s = data.summary;
  downloadXlsx(fileName(data.project.name), [
    infoSheet(data.project.name, teamLabel, [
      [tr('Hoàn thành (%)'), percent(s.done, s.total)],
      [tr('Tổng số task'), s.total],
      [tr('Đang mở'), s.open],
      [tr('Quá hạn'), s.overdue],
      [tr('Đến hạn trong 7 ngày'), s.due_soon],
      [tr('Hoàn thành 7 ngày qua'), s.done_7d],
      ...(withTeam ? [[tr('Chưa giao'), s.unassigned]] : []),
    ]),
    { name: tr('Theo requirement'), rows: progressRows('Requirement', data.requirements.map((r) => ({ ...r, name: r.title }))) },
    channelSheet(data.channels, data.no_channel),
    workloadSheet(data.people, withTeam),
    trendSheet(data.trend),
    { name: tr('Theo trạng thái'), rows: progressRows(tr('Trạng thái'), data.sections) },
  ]);
}
