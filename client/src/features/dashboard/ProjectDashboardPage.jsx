import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Avatar } from '../../components/Avatar.jsx';
import { ChannelProgress, CompletionTrend, StatTile, WorkloadBar } from './DashboardPage.jsx';
import { tr } from '../../i18n.js';
import { exportProject } from './dashboardExport.js';

// done/total meter row, shared by the requirement and section cards.
function ProgressRow({ label, done, total, overdue, onClick }) {
  return (
    <div className="project-progress">
      <span className="cell">
        {onClick ? (
          <button className="crumb" onClick={onClick} title={tr('Mở trang chi tiết dự án')}>
            {label}
          </button>
        ) : (
          <span className="ellipsis">{label}</span>
        )}
      </span>
      <span className="meter" title={tr('{done}/{total} task đã xong', { done, total })}>
        <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </span>
      <span className="num">
        {done}/{total}
      </span>
      <span className={`num small ${overdue ? 'overdue' : 'muted'}`}>{overdue ? tr('⚠ {overdue} quá hạn', { overdue }) : ''}</span>
    </div>
  );
}

// Dashboard of one project, opened from the Dashboard sub-menu. The team filter keeps only tasks
// assigned to people of that team.
export default function ProjectDashboardPage({ projectId, onOpenProject, onOpenRequirement }) {
  const [teamId, setTeamId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/projects/${projectId}/dashboard${teamId ? `?team=${teamId}` : ''}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [projectId, teamId]);

  if (!data) return <div className="center muted">{error || tr('Đang tải…')}</div>;
  const { project, teams, summary, requirements, sections, people, trend } = data;
  const showTeam = !teamId;
  const maxOpen = Math.max(1, ...people.map((p) => p.open));
  const percent = summary.total ? Math.round((summary.done / summary.total) * 100) : 0;

  return (
    <div className="project">
      <header className="project-header">
        <span className="dot lg" style={{ background: project.color }} />
        <h1>{project.name}</h1>
        <span className="muted">Dashboard</span>
        <span className="grow" />
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label={tr('Lọc theo team')}>
          <option value="">{tr('Mọi team')}</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          className="btn small"
          onClick={() => exportProject(data, teamId ? `Team ${teams.find((t) => String(t.id) === teamId)?.name ?? ''}` : tr('Mọi team'), showTeam)}
        >
          {tr('Xuất Excel')}
        </button>
        <button className="link-btn" onClick={() => onOpenProject(project.id)}>
          {tr('Mở hoạt động →')}
        </button>
      </header>

      <div className="list dashboard">
        {error && (
          <div className="error" onClick={() => setError('')}>
            {error} {tr('(bấm để ẩn)')}
          </div>
        )}
        <div className="stat-row">
          <StatTile label={tr('Hoàn thành')} value={`${percent}%`} />
          <StatTile label={tr('Đang mở')} value={summary.open} />
          <StatTile label={tr('Quá hạn')} value={summary.overdue} icon="⚠" />
          <StatTile label={tr('Đến hạn trong 7 ngày')} value={summary.due_soon} />
          <StatTile label={tr('Hoàn thành 7 ngày qua')} value={summary.done_7d} icon="✓" />
          {showTeam && <StatTile label={tr('Chưa giao')} value={summary.unassigned} />}
        </div>

        <section className="admin-card">
          <h2>{tr('Theo dự án')}</h2>
          <p className="muted card-sub">{tr('Tiến độ task của từng dự án. Bấm tên để mở dự án.')}</p>
          {requirements.length === 0 && <p className="muted">{tr('Hoạt động chưa có dự án.')}</p>}
          {requirements.map((r) => (
            <ProgressRow
              key={r.id}
              label={r.title}
              done={r.done}
              total={r.total}
              overdue={r.overdue}
              onClick={() => onOpenRequirement(project.id, r.id)}
            />
          ))}
        </section>

        <ChannelProgress channels={data.channels} noChannel={data.no_channel} scopeLabel={tr('của hoạt động')} />

        <section className="admin-card">
          <div className="section-header">
            <h2>Workload</h2>
            <span className="grow" />
            <span className="legend">
              <span className="swatch overdue-seg" /> {tr('Quá hạn')}
              <span className="swatch open-seg" /> {tr('Còn hạn')}
            </span>
          </div>
          <p className="muted card-sub">{tr('Task đang mở của từng người trong hoạt động này.')}</p>
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
          {people.map((p) => (
            <div key={p.id} className={`workload-row static ${showTeam ? 'with-team' : ''}`} title={tr('{name}: {open} đang mở, {overdue} quá hạn', { name: p.name, open: p.open, overdue: p.overdue })}>
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
            </div>
          ))}
          {people.length === 0 && (
            <p className="muted">{teamId ? tr('Không có ai của team này trong hoạt động.') : tr('Hoạt động chưa có thành viên.')}</p>
          )}
        </section>

        <div className="dash-grid">
          <section className="admin-card">
            <h2>{tr('Hoàn thành mỗi ngày')}</h2>
            <p className="muted card-sub">{tr('Số task của hoạt động đánh dấu xong trong 14 ngày qua.')}</p>
            <CompletionTrend trend={trend} />
          </section>

          <section className="admin-card">
            <h2>{tr('Theo trạng thái')}</h2>
            <p className="muted card-sub">{tr('Số task đã xong trên tổng số task ở từng cột của Board.')}</p>
            {sections.map((s) => (
              <ProgressRow key={s.id} label={s.name} done={s.done} total={s.total} />
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
