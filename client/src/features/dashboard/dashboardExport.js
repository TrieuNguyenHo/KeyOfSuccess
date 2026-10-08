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

// Chart colors match the dashboard in the light theme (client/src/styles/tokens.css): --overdue-mark,
// --neutral-mark, --brand, and --primary-tint over white for the meter track. Numbers on the bars are white on
// the dark fills and --ink on the light ones (white on the grey would be under 4.5:1).
const COLORS = { overdue: 'B42318', open: '8E8E93', brand: 'D85A30', track: 'FBEFEA', white: 'FFFFFF', ink: '2C2C2A' };

// Stacked bars per person, overdue then the rest of the open tasks, like the Workload card.
function workloadSheet(people, withTeam) {
  const first = withTeam ? 2 : 1;
  return {
    name: 'Workload',
    rows: [
      [tr('Người'), ...(withTeam ? ['Team'] : []), tr('Mở'), tr('Quá hạn'), tr('Còn hạn'), tr('7 ngày tới'), tr('Ưu tiên cao'), tr('Xong 7 ngày')],
      ...people.map((p) => [p.name, ...(withTeam ? [p.team_name ?? ''] : []), p.open, p.overdue, p.open - p.overdue, p.due_soon, p.high, p.done_7d]),
    ],
    chart: {
      type: 'bar',
      grouping: 'stacked',
      title: tr('Task đang mở'),
      cat: 0,
      series: [
        { col: first + 1, color: COLORS.overdue, label: COLORS.white },
        { col: first + 2, color: COLORS.open, label: COLORS.ink },
      ],
    },
  };
}

// done / total per item, drawn as full-width bars like the dashboard's meters.
function progressSheet(name, label, items) {
  return {
    name,
    rows: [
      [label, tr('Đã xong'), tr('Còn lại'), tr('Tổng'), tr('Hoàn thành (%)'), tr('Quá hạn')],
      ...items.map((i) => [i.name, i.done, i.total - i.done, i.total, percent(i.done, i.total), i.overdue ?? '']),
    ],
    chart: {
      type: 'bar',
      grouping: 'percentStacked',
      title: name,
      cat: 0,
      series: [
        { col: 1, color: COLORS.brand, label: COLORS.white },
        { col: 2, color: COLORS.track, label: COLORS.ink },
      ],
    },
  };
}

function channelSheet(channels, noChannel) {
  const rows = [...channels, ...(noChannel.total ? [{ name: tr('Chưa gắn kênh'), ...noChannel }] : [])];
  return progressSheet(tr('Theo kênh'), tr('Kênh'), rows);
}

const trendSheet = (trend) => ({
  name: tr('Hoàn thành mỗi ngày'),
  rows: [[tr('Ngày'), tr('Task hoàn thành')], ...trend.map((d) => [new Date(`${d.day}T00:00`), d.done])],
  chart: { type: 'column', title: tr('Hoàn thành mỗi ngày'), cat: 0, series: [{ col: 1, color: COLORS.brand, label: COLORS.ink }] },
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
    progressSheet(tr('Theo project'), 'Project', data.projects.map((p) => ({ ...p, total: p.open + p.done }))),
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
    progressSheet(tr('Theo requirement'), 'Requirement', data.requirements.map((r) => ({ ...r, name: r.title }))),
    channelSheet(data.channels, data.no_channel),
    workloadSheet(data.people, withTeam),
    trendSheet(data.trend),
    progressSheet(tr('Theo trạng thái'), tr('Trạng thái'), data.sections),
  ]);
}
