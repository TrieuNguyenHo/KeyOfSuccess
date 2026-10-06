import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { PROJECT_COLORS, ROLES, STATUSES, isManager } from '../../utils.js';
import { TeamPills } from '../../components/Controls.jsx';
import { askConfirm, askText } from '../../components/Dialog.jsx';
import { ProfilePopover } from '../profile/ProfilePage.jsx';
import TeamModal from './TeamModal.jsx';
import { tr } from '../../i18n.js';

export default function AdminPage({ user, onChanged }) {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [newTeam, setNewTeam] = useState('');
  const [channels, setChannels] = useState([]);
  const [newChannel, setNewChannel] = useState('');
  const [filter, setFilter] = useState('all');
  // Teams picked by clicking their chips; none picked shows everyone.
  const [teamFilter, setTeamFilter] = useState([]);
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [u, t, c] = await Promise.all([api('/admin/users'), api('/teams'), api('/channels')]);
    setUsers(u);
    setTeams(t);
    setChannels(c);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  async function act(fn) {
    try {
      await fn();
      setError('');
    } catch (e) {
      setError(e.message);
    }
    await load().catch(() => {});
    onChanged();
  }

  const updateUser = (u, patch) => act(() => api(`/admin/users/${u.id}`, { method: 'PATCH', body: patch }));

  const toggleTeam = (id) => setTeamFilter((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const inTeams = teamFilter.length ? users.filter((u) => u.team_ids.some((id) => teamFilter.includes(id))) : users;
  const pendingCount = inTeams.filter((u) => u.status === 'pending').length;
  const shown = filter === 'pending' ? inTeams.filter((u) => u.status === 'pending') : inTeams;
  const editingTeam = teams.find((t) => t.id === editingTeamId);

  return (
    <div className="project">
      <header className="project-header">
        <h1>{tr('Quản lý người dùng')}</h1>
      </header>

      {error && (
        <div className="error banner" onClick={() => setError('')}>
          {error} {tr('(bấm để ẩn)')}
        </div>
      )}

      <div className="list admin">
        <section className="admin-card">
          <div className="section-header">
            <h2>Teams</h2>
            <span className="grow" />
            {teamFilter.length > 0 && (
              <button className="link-btn" onClick={() => setTeamFilter([])}>
                {tr('Bỏ lọc')}
              </button>
            )}
          </div>
          <p className="muted card-sub">{tr('Bấm vào team để lọc danh sách người dùng; không chọn team nào là xem tất cả.')}</p>
          <div className="team-chips">
            {teams.map((t) => (
              <span key={t.id} className={`team-chip ${teamFilter.includes(t.id) ? 'active' : ''}`}>
                <button
                  className="team-chip-toggle"
                  onClick={() => toggleTeam(t.id)}
                  aria-pressed={teamFilter.includes(t.id)}
                  title={tr('Lọc người dùng theo team này')}
                >
                  <b>{t.name}</b>
                  <span className="muted">{tr('{count} người', { count: t.member_count })}</span>
                </button>
                <button className="icon-btn" title={tr('Sửa team, thêm thành viên')} onClick={() => setEditingTeamId(t.id)}>
                  ✎
                </button>
                <button
                  className="icon-btn danger"
                  title={tr('Xoá team')}
                  onClick={async () =>
                    (await askConfirm({ title: tr('Xoá team "{name}"?', { name: t.name }), confirmLabel: tr('Xoá team'), danger: true })) &&
                    act(() => api(`/teams/${t.id}`, { method: 'DELETE' }))
                  }
                >
                  ✕
                </button>
              </span>
            ))}
            <form
              className="member-form"
              onSubmit={(e) => {
                e.preventDefault();
                const name = newTeam.trim();
                if (!name) return;
                setNewTeam('');
                act(() => api('/teams', { method: 'POST', body: { name } }));
              }}
            >
              <input placeholder={tr('Tên team mới')} value={newTeam} onChange={(e) => setNewTeam(e.target.value)} />
              <button className="btn primary">{tr('Thêm team')}</button>
            </form>
          </div>
        </section>

        <section className="admin-card">
          <div className="section-header">
            <h2>{tr('Kênh')}</h2>
          </div>
          <p className="muted card-sub">
            {tr('Danh sách kênh dùng chung cả phòng để gắn lên task (Facebook, TikTok, SEO…). Bấm chấm màu để đổi màu.')}
          </p>
          <div className="team-chips">
            {channels.map((c) => (
              <span key={c.id} className="team-chip">
                <button
                  className="channel-color"
                  title={tr('Đổi màu')}
                  aria-label={tr('Đổi màu kênh {name}', { name: c.name })}
                  onClick={() => {
                    const color = PROJECT_COLORS[(PROJECT_COLORS.indexOf(c.color) + 1) % PROJECT_COLORS.length];
                    act(() => api(`/channels/${c.id}`, { method: 'PATCH', body: { color } }));
                  }}
                >
                  <span className="dot" style={{ background: c.color }} />
                </button>
                <span className="channel-chip-name">
                  <b>{c.name}</b>
                  <span className="muted">{tr('{count} task', { count: c.task_count })}</span>
                </span>
                <button
                  className="icon-btn"
                  title={tr('Đổi tên kênh')}
                  onClick={async () => {
                    const name = await askText({ title: tr('Đổi tên kênh'), label: tr('Tên kênh'), initial: c.name });
                    if (name) act(() => api(`/channels/${c.id}`, { method: 'PATCH', body: { name } }));
                  }}
                >
                  ✎
                </button>
                <button
                  className="icon-btn danger"
                  title={tr('Xoá kênh')}
                  onClick={async () =>
                    (await askConfirm({
                      title: tr('Xoá kênh "{name}"?', { name: c.name }),
                      message: c.task_count
                        ? tr('Kênh đang gắn trên {task_count} task; nhãn sẽ bị gỡ khỏi các task đó. Không hoàn tác được.', { task_count: c.task_count })
                        : undefined,
                      confirmLabel: tr('Xoá kênh'),
                      danger: true,
                    })) && act(() => api(`/channels/${c.id}`, { method: 'DELETE' }))
                  }
                >
                  ✕
                </button>
              </span>
            ))}
            <form
              className="member-form"
              onSubmit={(e) => {
                e.preventDefault();
                const name = newChannel.trim();
                if (!name) return;
                setNewChannel('');
                act(() => api('/channels', { method: 'POST', body: { name } }));
              }}
            >
              <input placeholder={tr('Tên kênh mới')} value={newChannel} onChange={(e) => setNewChannel(e.target.value)} />
              <button className="btn primary">{tr('Thêm kênh')}</button>
            </form>
          </div>
        </section>

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
            // Only a Director changes a Director's account or gives the Director role.
            const locked = u.role === 'director' && user.role !== 'director';
            return (
              <div key={u.id} className="admin-row">
                <span className="cell">
                  {/* Click the avatar for the key facts of their profile. */}
                  <ProfilePopover user={u} />
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
                    .filter(([value]) => value !== 'director' || user.role === 'director' || locked)
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
      </div>

      {editingTeam && (
        <TeamModal
          key={editingTeam.id}
          team={editingTeam}
          user={user}
          onClose={() => setEditingTeamId(null)}
          onChanged={() => load().then(onChanged, (e) => setError(e.message))}
        />
      )}
    </div>
  );
}
