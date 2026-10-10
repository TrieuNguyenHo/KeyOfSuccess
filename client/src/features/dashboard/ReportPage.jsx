import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Avatar } from '../../components/Avatar.jsx';
import { ErrorBanner } from '../../components/Controls.jsx';
import { formatDate, shiftDay, todayStr, weekLabel } from '../../utils.js';
import { locale, tr } from '../../i18n.js';
import { StatTile } from './DashboardPage.jsx';
import ReportCharts from './ReportCharts.jsx';

// Reports (#/report). Worked out when opened (2026-10-10) for a week (#/report/week/2026-10-05, the current one by
// default), a month (#/report/month/2026-10) or any range (#/report/range/2026-09-01/2026-09-20); or a weekly report
// taken at 8:00 on Monday for the week before and kept as it was (v41, #/report/2026-10-05). The department
// (people.watch 'all') and each team the reader may watch: tasks done in the range (against the range before), how
// many late, what was overdue or due in the next 7 days on its last day (today while it runs), and who was overloaded.

const mondayOf = (day) => shiftDay(day, -((new Date(`${day}T00:00`).getDay() + 6) % 7));
const monthOf = (day) => day.slice(0, 7);
const shiftMonth = (month, n) => {
  const d = new Date(`${month}-01T00:00`);
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const lastDayOf = (month) => shiftDay(`${shiftMonth(month, 1)}-01`, -1);
const monthLabel = (month) => {
  const text = new Date(`${month}-01T00:00`).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1); // "tháng 10 năm 2026" in Vietnamese
};
const rangeLabel = (from, to) => `${formatDate(from)} – ${formatDate(to)}`;

// The range a live report view shows (the current week when nothing is chosen).
function reportRange(view) {
  const today = todayStr();
  if (view.period === 'month') {
    const month = view.month ?? monthOf(today);
    return { from: `${month}-01`, to: lastDayOf(month) };
  }
  if (view.period === 'range' && view.from && view.to) return { from: view.from, to: view.to };
  const from = mondayOf(view.period === 'week' && view.from ? view.from : today);
  return { from, to: shiftDay(from, 6) };
}

function Delta({ now, before, saved }) {
  if (before == null) return null;
  const diff = now - before;
  let text;
  if (saved) text = diff === 0 ? tr('bằng tuần trước') : diff > 0 ? tr('+{n} so với tuần trước', { n: diff }) : tr('−{n} so với tuần trước', { n: -diff });
  else text = diff === 0 ? tr('bằng kỳ trước') : diff > 0 ? tr('+{n} so với kỳ trước', { n: diff }) : tr('−{n} so với kỳ trước', { n: -diff });
  return <span className="muted small report-delta">{text}</span>;
}

function Totals({ totals, before, saved }) {
  return (
    <div className="stat-row">
      <div>
        <StatTile label={saved ? tr('Xong trong tuần') : tr('Xong trong kỳ')} value={totals.done} icon="✓" />
        <Delta now={totals.done} before={before} saved={saved} />
      </div>
      <StatTile label={tr('Xong trễ hạn')} value={totals.done_late} />
      <StatTile label={saved ? tr('Quá hạn lúc chốt') : tr('Quá hạn')} value={totals.overdue} icon="⚠" />
      <StatTile label={tr('Đến hạn 7 ngày tới')} value={totals.due_soon} />
      <StatTile label={tr('Người quá tải')} value={totals.overloaded} icon="⚠" />
    </div>
  );
}

function PeopleTable({ people, onOpenPerson }) {
  const rows = [...people].sort((a, b) => b.overloaded - a.overloaded || b.overdue - a.overdue || b.open - a.open);
  return (
    <>
      <div className="workload-row workload-head report-grid">
        <span>{tr('Người')}</span>
        <span className="num">{tr('Xong')}</span>
        <span className="num">{tr('Trễ')}</span>
        <span className="num">{tr('Quá hạn')}</span>
        <span className="num">{tr('7 ngày tới')}</span>
        <span className="num">{tr('Đang mở')}</span>
      </div>
      {rows.map((p) => (
        <button key={p.id} className="workload-row report-grid" onClick={() => onOpenPerson(p.id)}>
          <span className="cell">
            <Avatar name={p.name} userId={p.id} small />
            <span className="ellipsis">{p.name}</span>
            {p.overloaded && <span className="tag overload-tag">⚠ {tr('Quá tải')}</span>}
          </span>
          <span className="num">{p.done}</span>
          <span className="num">{p.done_late}</span>
          <span className={`num ${p.overdue ? 'overdue' : ''}`}>{p.overdue}</span>
          <span className="num">{p.due_soon}</span>
          <span className="num">{p.open}</span>
        </button>
      ))}
    </>
  );
}

// What is shown: ‹ › around a week or a month, two dates for a range, or the list of weekly reports kept.
function PeriodPicker({ view, range, weeks, onChange }) {
  const today = todayStr();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const period = view.week ? 'saved' : view.period ?? 'week';
  const month = monthOf(range.from);
  const periods = [
    ['week', tr('Tuần')],
    ['month', tr('Tháng')],
    ['range', tr('Khoảng ngày')],
    ...(weeks?.length ? [['saved', tr('Bản chốt thứ Hai')]] : []),
  ];
  const pick = (next) => {
    if (next === 'saved') onChange({ week: weeks[0] });
    else if (next === 'range') onChange({ period: 'range', from: range.from, to: range.to });
    else onChange({ period: next });
  };
  return (
    <div className="report-period">
      <div className="tabs" role="group" aria-label={tr('Xem báo cáo theo')}>
        {periods.map(([key, label]) => (
          <button key={key} className={period === key ? 'active' : ''} onClick={() => pick(key)}>
            {label}
          </button>
        ))}
      </div>
      {period === 'week' && (
        <div className="report-step">
          <button className="icon-btn" onClick={() => onChange({ period: 'week', from: shiftDay(range.from, -7) })} aria-label={tr('Tuần trước')}>
            ‹
          </button>
          <span>{tr('Tuần {range}', { range: weekLabel(range.from) })}</span>
          <button
            className="icon-btn"
            disabled={range.to >= today}
            onClick={() => onChange({ period: 'week', from: shiftDay(range.from, 7) })}
            aria-label={tr('Tuần sau')}
          >
            ›
          </button>
        </div>
      )}
      {period === 'month' && (
        <div className="report-step">
          <button className="icon-btn" onClick={() => onChange({ period: 'month', month: shiftMonth(month, -1) })} aria-label={tr('Tháng trước')}>
            ‹
          </button>
          <span>{monthLabel(month)}</span>
          <button
            className="icon-btn"
            disabled={range.to >= today}
            onClick={() => onChange({ period: 'month', month: shiftMonth(month, 1) })}
            aria-label={tr('Tháng sau')}
          >
            ›
          </button>
        </div>
      )}
      {period === 'range' && (
        <form
          className="report-step"
          onSubmit={(e) => {
            e.preventDefault();
            onChange({ period: 'range', from, to });
          }}
        >
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label={tr('Từ ngày')} required />
          <span aria-hidden="true">→</span>
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label={tr('Đến ngày')} required />
          <button className="btn primary small" disabled={!from || !to || from > to || (from === range.from && to === range.to)}>
            {tr('Xem')}
          </button>
        </form>
      )}
      {period === 'saved' && (
        <select value={view.week} onChange={(e) => onChange({ week: e.target.value })} aria-label={tr('Tuần')}>
          {weeks.map((w) => (
            <option key={w} value={w}>
              {tr('Tuần {range}', { range: weekLabel(w) })}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// view: { week } for a weekly report kept, else { period: 'week' | 'month' | 'range', from, month, to }.
export default function ReportPage({ view, onChange, onOpenPerson }) {
  const [weeks, setWeeks] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const saved = Boolean(view.week);
  const range = reportRange(view);
  const path = saved ? `/reports/${view.week}` : `/reports/range?from=${range.from}&to=${range.to}`;

  useEffect(() => {
    api('/reports')
      .then(setWeeks)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setData(null);
    api(path)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [path]);

  const person = (id) => data.people[id];
  return (
    <div className="project">
      <header className="project-header">
        <h1>{tr('Báo cáo')}</h1>
      </header>
      <PeriodPicker key={path} view={view} range={range} weeks={weeks} onChange={onChange} />
      <ErrorBanner error={error} onClose={() => setError('')} />

      <div className="list dashboard">
        {!data ? (
          <p className="muted">{tr('Đang tải…')}</p>
        ) : (
          <>
            <p className="muted card-sub report-sub">
              {saved
                ? tr('Tuần {range}, số liệu chốt lúc 8:00 ngày {day}. Quá tải: từ {overdue} task quá hạn hoặc từ {soon} task đến hạn trong 7 ngày tới.', {
                    range: weekLabel(data.week_start),
                    day: formatDate(data.taken_on),
                    overdue: data.thresholds.overdue,
                    soon: data.thresholds.due_soon,
                  })
                : tr('{range}, so với {previous}. Task đang mở, quá hạn và đến hạn 7 ngày tới tính tại {day}. Quá tải: từ {overdue} task quá hạn hoặc từ {soon} task đến hạn trong 7 ngày tới.', {
                    range: rangeLabel(data.from, data.to),
                    previous: rangeLabel(data.previous.from, data.previous.to),
                    day: data.as_of === todayStr() ? tr('hôm nay') : formatDate(data.as_of),
                    overdue: data.thresholds.overdue,
                    soon: data.thresholds.due_soon,
                  })}
            </p>

            {data.breakdown && <ReportCharts breakdown={data.breakdown} />}

            {data.all && (
              <section className="admin-card">
                <div className="section-header">
                  <h2>{tr('Toàn phòng')}</h2>
                </div>
                <Totals totals={data.all.totals} before={data.previous?.all} saved={saved} />
                <div className="workload-row workload-head report-grid">
                  <span>Team</span>
                  <span className="num">{tr('Xong')}</span>
                  <span className="num">{tr('Trễ')}</span>
                  <span className="num">{tr('Quá hạn')}</span>
                  <span className="num">{tr('7 ngày tới')}</span>
                  <span className="num">{tr('Quá tải')}</span>
                </div>
                {data.teams.map((t) => (
                  <div key={t.id} className="workload-row report-grid static">
                    <span className="ellipsis">Team {t.name}</span>
                    <span className="num">{t.totals.done}</span>
                    <span className="num">{t.totals.done_late}</span>
                    <span className={`num ${t.totals.overdue ? 'overdue' : ''}`}>{t.totals.overdue}</span>
                    <span className="num">{t.totals.due_soon}</span>
                    <span className="num">{t.totals.overloaded}</span>
                  </div>
                ))}
              </section>
            )}

            {data.teams
              .filter((t) => t.people.length > 0)
              .map((t) => (
                <section key={t.id} className="admin-card">
                  <div className="section-header">
                    <h2>Team {t.name}</h2>
                  </div>
                  <Totals totals={t.totals} before={data.previous?.teams[t.id]} saved={saved} />
                  <PeopleTable people={t.people.map(person)} onOpenPerson={onOpenPerson} />
                </section>
              ))}
          </>
        )}
      </div>
    </div>
  );
}
