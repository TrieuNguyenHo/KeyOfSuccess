import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { myTeamsLabel, watchesAll } from '../../utils.js';
import { Avatar } from '../../components/Avatar.jsx';
import { tr } from '../../i18n.js';

const dayLabel = (iso) => new Date(`${iso}T00:00`).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

export function StatTile({ label, value, icon }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">
        {icon && <span aria-hidden="true">{icon} </span>}
        {label}
      </div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

// Stacked bar: overdue (status red) then the rest of the open tasks (accent), scaled to the busiest person.
export function WorkloadBar({ person, max }) {
  if (!person.open) return <span className="muted">{tr('Đang trống')}</span>;
  const onTime = person.open - person.overdue;
  return (
    <span className="workload-bar" style={{ width: `${(person.open / max) * 100}%` }}>
      {person.overdue > 0 && <span className="seg overdue-seg" style={{ flexGrow: person.overdue }} />}
      {onTime > 0 && <span className="seg open-seg" style={{ flexGrow: onTime }} />}
    </span>
  );
}

export function CompletionTrend({ trend }) {
  const max = Math.max(...trend.map((d) => d.done));
  if (max === 0) return <p className="muted">{tr('Chưa có task nào được hoàn thành trong 14 ngày qua.')}</p>;
  const peak = trend.findLastIndex((d) => d.done === max);
  return (
    <div className="trend">
      <div className="trend-axis">
        <span>{max}</span>
        <span>0</span>
      </div>
      <div className="trend-plot">
        {trend.map((d, i) => (
          <div key={d.day} className="trend-col" data-tip={`${dayLabel(d.day)}: ${d.done} task`}>
            {i === peak && <span className="trend-peak">{d.done}</span>}
            <span className="trend-bar" style={{ height: `${(d.done / max) * 100}%` }} />
            <span className="trend-day">{dayLabel(d.day)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// "Theo kênh" card: done/total per channel (a task on two channels counts in both), then the untagged tasks.
export function ChannelProgress({ channels, noChannel, scopeLabel }) {
  const rows = [...channels, ...(noChannel.total ? [{ id: 'none', name: tr('Chưa gắn kênh'), ...noChannel }] : [])];
  return (
    <section className="admin-card">
      <h2>{tr('Theo kênh')}</h2>
      <p className="muted card-sub">
        {tr('Số task đã xong trên tổng số task {scope} theo từng kênh. Task gắn nhiều kênh được tính ở mỗi kênh.', { scope: scopeLabel })}
      </p>
      {rows.length === 0 && <p className="muted">{tr('Chưa có task nào.')}</p>}
      {rows.map((c) => (
        <div key={c.id} className="project-progress">
          <span className="cell">
            {c.color ? <span className="dot" style={{ background: c.color }} /> : <span className="dot empty-dot" />}
            <span className={`ellipsis ${c.color ? '' : 'muted'}`}>{c.name}</span>
          </span>
          <span className="meter" title={tr('{done}/{total} task đã xong', { done: c.done, total: c.total })}>
            <span style={{ width: `${c.total ? (c.done / c.total) * 100 : 0}%` }} />
          </span>
          <span className="num">
            {c.done}/{c.total}
          </span>
          <span className={`num small ${c.overdue ? 'overdue' : 'muted'}`}>{c.overdue ? tr('⚠ {overdue} quá hạn', { overdue: c.overdue }) : ''}</span>
        </div>
      ))}
    </section>
  );
}

export default function DashboardPage({ user, onOpenPerson }) {
  const watchAll = watchesAll(user);
  // 'all' (Manager), 'mine' (all of a Leader's teams) or 'team:<id>'.
  const [scope, setScope] = useState(watchAll ? 'all' : 'mine');
  const [teams, setTeams] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (watchAll) api('/teams').then(setTeams).catch(() => {});
  }, [watchAll]);

  useEffect(() => {
    setData(null);
    const query = scope === 'all' ? 'all=1' : scope === 'mine' ? 'mine=1' : `team=${scope.split(':')[1]}`;
    api(`/dashboard?${query}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [scope]);

  const maxOpen = data ? Math.max(1, ...data.people.map((p) => p.open)) : 1;
  const showTeam = scope === 'all' || (scope === 'mine' && user.teams.length > 1);

  return (
    <div className="project">
      <header className="project-header">
        <h1>Dashboard</h1>
        <span className="grow" />
        {watchAll ? (
          <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label={tr('Phạm vi')}>
            <option value="all">{tr('Cả phòng')}</option>
            {teams.map((t) => (
              <option key={t.id} value={`team:${t.id}`}>
                Team {t.name}
              </option>
            ))}
          </select>
        ) : user.teams.length > 1 ? (
          <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label={tr('Phạm vi')}>
            <option value="mine">{tr('Tất cả team của tôi')}</option>
            {user.teams.map((t) => (
              <option key={t.id} value={`team:${t.id}`}>
                Team {t.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="muted">{myTeamsLabel(user)}</span>
        )}
      </header>

      {error && (
        <div className="error banner" onClick={() => setError('')}>
          {error} {tr('(bấm để ẩn)')}
        </div>
      )}

      <div className="list dashboard">
        {!data ? (
          <p className="muted">{tr('Đang tải…')}</p>
        ) : (
          <>
            <div className="stat-row">
              <StatTile label={tr('Đang mở')} value={data.summary.open} />
              <StatTile label={tr('Quá hạn')} value={data.summary.overdue} icon="⚠" />
              <StatTile label={tr('Đến hạn trong 7 ngày')} value={data.summary.due_soon} />
              <StatTile label={tr('Hoàn thành 7 ngày qua')} value={data.summary.done_7d} icon="✓" />
              {showTeam && <StatTile label={tr('Chưa giao')} value={data.summary.unassigned} />}
            </div>

            <section className="admin-card">
              <div className="section-header">
                <h2>Workload</h2>
                <span className="grow" />
                <span className="legend">
                  <span className="swatch overdue-seg" /> {tr('Quá hạn')}
                  <span className="swatch open-seg" /> {tr('Còn hạn')}
                </span>
              </div>
              <p className="muted card-sub">{tr('Task đang mở theo từng người. Bấm vào một người để xem danh sách task.')}</p>
              <div className={`workload-row workload-head ${showTeam ? 'with-team' : ''}`}>
                <span>{tr('Người')}</span>
                {showTeam && <span>Team</span>}
                <span>{tr('Task đang mở')}</span>
                <span className="num">{tr('Mở')}</span>
                <span className="num">{tr('Quá hạn')}</span>
                <span className="num">{tr('7 ngày tới')}</span>
                <span className="num">{tr('Ưu tiên cao')}</span>
                <span className="num">{tr('Xong 7 ngày')}</span>
              </div>
              {data.people.map((p) => (
                <button
                  key={p.id}
                  className={`workload-row ${showTeam ? 'with-team' : ''}`}
                  onClick={() => onOpenPerson(p.id)}
                  title={tr('{name}: {open} đang mở, {overdue} quá hạn', { name: p.name, open: p.open, overdue: p.overdue })}
                >
                  <span className="cell">
                    <Avatar name={p.name} userId={p.id} small />
                    <span className="ellipsis">{p.name}</span>
                  </span>
                  {showTeam && <span className="muted ellipsis">{p.team_name ?? '—'}</span>}
                  <span className="bar-cell">
                    <WorkloadBar person={p} max={maxOpen} />
                  </span>
                  <span className="num">{p.open}</span>
                  <span className={`num ${p.overdue ? 'overdue' : ''}`}>{p.overdue}</span>
                  <span className="num">{p.due_soon}</span>
                  <span className="num">{p.high}</span>
                  <span className="num">{p.done_7d}</span>
                </button>
              ))}
              {data.people.length === 0 && <p className="muted">{tr('Chưa có ai trong phạm vi này.')}</p>}
            </section>

            <div className="dash-grid">
              <section className="admin-card">
                <h2>{tr('Hoàn thành mỗi ngày')}</h2>
                <p className="muted card-sub">{tr('Số task đánh dấu xong trong 14 ngày qua.')}</p>
                <CompletionTrend trend={data.trend} />
              </section>

              <section className="admin-card">
                <h2>{tr('Theo project')}</h2>
                <p className="muted card-sub">{tr('Tiến độ các task trong phạm vi đang xem.')}</p>
                {data.projects.length === 0 && <p className="muted">{tr('Chưa có task nào.')}</p>}
                {data.projects.map((p) => {
                  const total = p.open + p.done;
                  return (
                    <div key={p.id} className="project-progress">
                      <span className="cell">
                        <span className="dot" style={{ background: p.color }} />
                        <span className="ellipsis">{p.name}</span>
                      </span>
                      <span className="meter" title={tr('{done}/{total} task đã xong', { done: p.done, total })}>
                        <span style={{ width: `${total ? (p.done / total) * 100 : 0}%` }} />
                      </span>
                      <span className="num">
                        {p.done}/{total}
                      </span>
                      <span className={`num small ${p.overdue ? 'overdue' : 'muted'}`}>
                        {p.overdue ? tr('{overdue} quá hạn', { overdue: p.overdue }) : ''}
                      </span>
                    </div>
                  );
                })}
              </section>
            </div>

            <ChannelProgress channels={data.channels} noChannel={data.no_channel} scopeLabel={tr('trong phạm vi đang xem')} />
          </>
        )}
      </div>
    </div>
  );
}
