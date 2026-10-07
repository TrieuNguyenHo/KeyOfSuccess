import { useRef, useState } from 'react';
import { STATUSES, roleLabel } from '../../utils.js';
import { Avatar } from '../../components/Avatar.jsx';
import { TeamPills } from '../../components/Controls.jsx';
import { askConfirm } from '../../components/Dialog.jsx';
import { levelIn, roleIn, useRoles } from '../../components/hooks.js';
import { ProfilePopover } from '../profile/ProfilePage.jsx';
import { tr } from '../../i18n.js';

// The people of the company with their status, role and teams, for users.manage (Administration) and for root
// (System configuration). Nobody changes the account of, or gives, a role above their own level. Invited people who
// have not signed in yet show as such, and their invitation can be revoked (the account is deleted). The All / Pending
// tabs reload the list (onReload), so they show sign-ups and changes made elsewhere since the screen opened.
export default function UsersCard({ user, users, teams, updateUser, revokeInvite, onReload }) {
  const [filter, setFilter] = useState('all');
  // The card keeps the height it had when the Pending tab was picked: a short (or empty) list would otherwise shrink
  // the page and make the browser jump up. Back on All, it sizes to its content again.
  const [minHeight, setMinHeight] = useState(null);
  const card = useRef(null);
  const roles = useRoles();
  const isRoot = user.role === 'root';
  const myLevel = levelIn(roles, user.role);
  const pendingCount = users.filter((u) => u.status === 'pending').length;
  const shown = filter === 'pending' ? users.filter((u) => u.status === 'pending') : users;
  const showTab = (tab) => {
    setMinHeight(tab === 'pending' ? card.current?.offsetHeight ?? null : null);
    setFilter(tab);
    onReload();
  };

  return (
    <section className="admin-card" ref={card} style={minHeight ? { minHeight } : undefined}>
      <div className="section-header">
        <h2>{tr('Người dùng')}</h2>
        <span className="grow" />
        <div className="tabs">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => showTab('all')}>
            {tr('Tất cả ({count})', { count: users.length })}
          </button>
          <button className={filter === 'pending' ? 'active' : ''} onClick={() => showTab('pending')}>
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
        const locked = levelIn(roles, u.role) > myLevel;
        // The team rule of their role (v27): one team at most (Member), at least one (Leader), or any (Manager).
        const rule = roleIn(roles, u.role);
        // Roles that may have no team and any number of them get the "Tất cả team" pill (Managers, Directors).
        const anyTeams = rule.min_teams === 0 && rule.max_teams == null;
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
              {!u.joined && <span className="muted small invited-by">{tr('Đã mời, chưa tham gia')}</span>}
              {(u.status === 'pending' || !u.joined) && u.invited_by_name && (
                <span className="muted small invited-by">{tr('{name} mời', { name: u.invited_by_name })}</span>
              )}
            </span>
            <select
              value={u.role}
              disabled={self || locked}
              onChange={(e) => {
                const role = e.target.value;
                // A one-team role (Member) keeps only the first of their teams.
                const oneTeam = roleIn(roles, role).max_teams === 1 && u.team_ids.length > 1;
                updateUser(u, oneTeam ? { role, team_ids: u.team_ids.slice(0, 1) } : { role });
              }}
            >
              {roles
                .filter((r) => r.level <= myLevel || r.key === u.role)
                .map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name}
                  </option>
                ))}
            </select>
            {locked ? (
              <span className="muted">{u.team_name ?? tr('Chưa có team')}</span>
            ) : (
              // The same pill picker for every role. Most roles may belong to several teams (a Leader to at least
              // one); a one-team role (Member): picking a team moves them there, unpicking it leaves them without one.
              <details className="team-picker">
                <summary title={tr('Chọn các team')}>
                  {anyTeams && teams.length > 0 && u.team_ids.length === teams.length
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
                    allLabel={anyTeams ? tr('Tất cả team') : undefined}
                    onChange={(ids) => {
                      if (rule.max_teams === 1) {
                        const added = ids.find((id) => !u.team_ids.includes(id));
                        updateUser(u, { team_ids: added ? [added] : [] });
                      } else if (ids.length > 0) updateUser(u, { team_ids: ids });
                    }}
                  />
                  {rule.min_teams > 0 && (
                    <span className="muted small">{tr('{name} phụ trách tất cả team được chọn, ít nhất một team.', { name: roleLabel(u) })}</span>
                  )}
                  {rule.max_teams === 1 && (
                    <span className="muted small">{tr('{name} thuộc một team: chọn team khác để chuyển.', { name: roleLabel(u) })}</span>
                  )}
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
              {u.status === 'active' && !self && !locked && u.joined && (
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
              {!u.joined && !locked && (
                <button
                  className="link-btn danger"
                  onClick={async () =>
                    (await askConfirm({
                      title: tr('Huỷ lời mời {email}?', { email: u.email }),
                      message: tr('Tài khoản chưa dùng này sẽ bị xoá. Bạn mời lại được sau.'),
                      confirmLabel: tr('Huỷ lời mời'),
                      danger: true,
                    })) && revokeInvite(u)
                  }
                >
                  {tr('Huỷ lời mời')}
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
