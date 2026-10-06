import { useState } from 'react';
import { ROLES, STATUSES, isManager } from '../../utils.js';
import { Avatar } from '../../components/Avatar.jsx';
import { TeamPills } from '../../components/Controls.jsx';
import { askConfirm } from '../../components/Dialog.jsx';
import { ProfilePopover } from '../profile/ProfilePage.jsx';
import { tr } from '../../i18n.js';

// The people of the company with their status, role and teams, for Managers and Directors (User management) and for
// root (System configuration). Only a Director or root gives the Director role or changes a Director's account.
export default function UsersCard({ user, users, teams, updateUser }) {
  const [filter, setFilter] = useState('all');
  const isRoot = user.role === 'root';
  const grantsDirector = user.role === 'director' || isRoot;
  const pendingCount = users.filter((u) => u.status === 'pending').length;
  const shown = filter === 'pending' ? users.filter((u) => u.status === 'pending') : users;

  return (
    <section className="admin-card">
      <div className="section-header">
        <h2>{tr('Người dùng')}</h2>
        <span className="grow" />
        <div className="tabs">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            {tr('Tất cả ({count})', { count: users.length })}
          </button>
          <button className={filter === 'pending' ? 'active' : ''} onClick={() => setFilter('pending')}>
            {tr('Chờ duyệt ({count})', { count: pendingCount })}
          </button>
        </div>
      </div>

      <div className="admin-row admin-head">
        <span>{tr('Người dùng')}</span>
        <span>{tr('Trạng thái')}</span>
        <span>{tr('Vai trò')}</span>
        <span>Team</span>
        <span />
      </div>
      {shown.map((u) => {
        const self = u.id === user.id;
        const locked = u.role === 'director' && !grantsDirector;
        return (
          <div key={u.id} className="admin-row">
            <span className="cell">
              {/* Click the avatar for the key facts of their profile (root reads no one's personal details). */}
              {isRoot ? <Avatar name={u.name} userId={u.id} small /> : <ProfilePopover user={u} />}
              <span className="user-info">
                <span className="ellipsis">
                  {u.name}
                  {self && <span className="muted"> {tr('(bạn)')}</span>}
                </span>
                <span className="muted small ellipsis">{u.email}</span>
              </span>
            </span>
            <span>
              <span className={`tag status-${u.status}`}>{STATUSES[u.status]}</span>
              {u.status === 'pending' && u.invited_by_name && (
                <span className="muted small invited-by">{tr('{name} mời', { name: u.invited_by_name })}</span>
              )}
            </span>
            <select
              value={u.role}
              disabled={self || locked}
              onChange={(e) => {
                const role = e.target.value;
                // A Member keeps only one team: the first of a Leader's or Manager's teams.
                updateUser(u, role === 'member' && u.team_ids.length > 1 ? { role, team_ids: u.team_ids.slice(0, 1) } : { role });
              }}
            >
              {Object.entries(ROLES)
                .filter(([value]) => value !== 'director' || grantsDirector || locked)
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
            {u.role === 'member' ? (
              <select
                value={u.team_ids[0] ?? ''}
                onChange={(e) => updateUser(u, { team_ids: e.target.value ? [Number(e.target.value)] : [] })}
              >
                <option value="">{tr('Chưa có team')}</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : locked ? (
              <span className="muted">{u.team_name ?? tr('Chưa có team')}</span>
            ) : (
              // Leaders, Managers and Directors may belong to several teams; a Leader needs at least one.
              <details className="team-picker">
                <summary title={tr('Chọn các team')}>
                  {isManager(u) && teams.length > 0 && u.team_ids.length === teams.length
                    ? tr('Tất cả team')
                    : u.team_name ?? tr('Chưa có team')}{' '}
                  ▾
                </summary>
                <div className="team-picker-menu">
                  <TeamPills
                    teams={teams}
                    selected={u.team_ids}
                    label={tr('Team của {name}', { name: u.name })}
                    noneLabel={null}
                    allLabel={isManager(u) ? tr('Tất cả team') : undefined}
                    onChange={(ids) => ids.length > 0 && updateUser(u, { team_ids: ids })}
                  />
                  {u.role === 'leader' && <span className="muted small">{tr('Leader phụ trách tất cả team được chọn.')}</span>}
                </div>
              </details>
            )}
            <span className="admin-actions">
              {u.status === 'pending' && (
                <>
                  <button className="btn primary small" onClick={() => updateUser(u, { status: 'active' })}>
                    {tr('Duyệt')}
                  </button>
                  <button
                    className="link-btn danger"
                    onClick={async () =>
                      (await askConfirm({ title: tr('Từ chối {email}?', { email: u.email }), confirmLabel: tr('Từ chối'), danger: true })) &&
                      updateUser(u, { status: 'disabled' })
                    }
                  >
                    {tr('Từ chối')}
                  </button>
                </>
              )}
              {u.status === 'active' && !self && !locked && (
                <button
                  className="link-btn danger"
                  onClick={async () =>
                    (await askConfirm({ title: tr('Khoá tài khoản {name}?', { name: u.name }), confirmLabel: tr('Khoá'), danger: true })) &&
                    updateUser(u, { status: 'disabled' })
                  }
                >
                  {tr('Khoá')}
                </button>
              )}
              {u.status === 'disabled' && !locked && (
                <button className="link-btn" onClick={() => updateUser(u, { status: 'active' })}>
                  {tr('Mở khoá')}
                </button>
              )}
            </span>
          </div>
        );
      })}
      {shown.length === 0 && <p className="muted">{tr('Không có ai.')}</p>}
    </section>
  );
}
