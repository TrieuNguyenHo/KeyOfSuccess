import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Avatar } from '../../components/Avatar.jsx';
import { ErrorBanner } from '../../components/Controls.jsx';
import { formatDate, weekLabel } from '../../utils.js';
import { tr } from '../../i18n.js';
import { StatTile } from './DashboardPage.jsx';

// Weekly reports (v41, #/report, #/report/2026-10-05): taken at 8:00 on Monday for the week before and kept as they
// were. The department (people.watch 'all') and each team the reader may watch: tasks done that week (against the
// week before), how many late, what was overdue or due in the next 7 days then, and who was overloaded.

function Delta({ now, before }) {
  if (before == null) return null;
  const diff = now - before;
  return (
    <span className="muted small report-delta">
      {diff === 0 ? tr('bằng tuần trước') : diff > 0 ? tr('+{n} so với tuần trước', { n: diff }) : tr('−{n} so với tuần trước', { n: -diff })}
    </span>
  );
}

function Totals({ totals, before }) {
  return (
    <div className="stat-row">
      <div>
        <StatTile label={tr('Xong trong tuần')} value={totals.done} icon="✓" />
        <Delta now={totals.done} before={before} />
      </div>
      <StatTile label={tr('Xong trễ hạn')} value={totals.done_late} />
      <StatTile label={tr('Quá hạn lúc chốt')} value={totals.overdue} icon="⚠" />
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

export default function ReportPage({ week, onSelectWeek, onOpenPerson }) {
  const [weeks, setWeeks] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const shown = week ?? weeks?.[0];

  useEffect(() => {
    api('/reports')
      .then(setWeeks)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!shown) return;
    setData(null);
    api(`/reports/${shown}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [shown]);

  const person = (id) => data.people[id];
  return (
    <div className="project">
      <header className="project-header">
        <h1>{tr('Báo cáo tuần')}</h1>
        <span className="grow" />
        {weeks?.length > 0 && (
          <select value={shown} onChange={(e) => onSelectWeek(e.target.value)} aria-label={tr('Tuần')}>
            {weeks.map((w) => (
              <option key={w} value={w}>
                {tr('Tuần {range}', { range: weekLabel(w) })}
              </option>
            ))}
          </select>
        )}
      </header>
      <ErrorBanner error={error} onClose={() => setError('')} />

      <div className="list dashboard">
        {weeks?.length === 0 ? (
          <p className="muted">{tr('Chưa có báo cáo nào. Báo cáo đầu tiên được chốt lúc 8:00 sáng thứ Hai, cho tuần trước đó.')}</p>
        ) : !data ? (
          <p className="muted">{tr('Đang tải…')}</p>
        ) : (
          <>
            <p className="muted card-sub">
              {tr('Tuần {range}, số liệu chốt lúc 8:00 ngày {day}. Quá tải: từ {overdue} task quá hạn hoặc từ {soon} task đến hạn trong 7 ngày tới.', {
                range: weekLabel(data.week_start),
                day: formatDate(data.taken_on),
                overdue: data.thresholds.overdue,
                soon: data.thresholds.due_soon,
              })}
            </p>

            {data.all && (
              <section className="admin-card">
                <div className="section-header">
                  <h2>{tr('Toàn phòng')}</h2>
                </div>
                <Totals totals={data.all.totals} before={data.previous?.all} />
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
                  <Totals totals={t.totals} before={data.previous?.teams[t.id]} />
                  <PeopleTable people={t.people.map(person)} onOpenPerson={onOpenPerson} />
                </section>
              ))}
          </>
        )}
      </div>
    </div>
  );
}
