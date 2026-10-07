import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { PROJECT_COLORS, can, coversTeams, scopeOf } from '../../utils.js';
import { askConfirm, askText } from '../../components/Dialog.jsx';
import InviteUserCard from './InviteUserCard.jsx';
import TeamModal from './TeamModal.jsx';
import UsersCard from './UsersCard.jsx';
import { ErrorBanner } from '../../components/Controls.jsx';
import { tr } from '../../i18n.js';

export default function AdminPage({ user, onChanged }) {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [newTeam, setNewTeam] = useState('');
  const [channels, setChannels] = useState([]);
  const [newChannel, setNewChannel] = useState('');
  // Teams picked by clicking their chips; none picked shows everyone.
  const [teamFilter, setTeamFilter] = useState([]);
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [error, setError] = useState('');

  // The screen opens for any administration right (canAdminister); each card needs its own.
  const manageUsers = can(user, 'users.manage');
  const manageTeams = can(user, 'teams.manage');

  const load = useCallback(async () => {
    const [u, t, c] = await Promise.all([manageUsers ? api('/admin/users') : [], api('/teams'), api('/channels')]);
    setUsers(u);
    setTeams(t);
    setChannels(c);
  }, [manageUsers]);

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
  const revokeInvite = (u) => act(() => api(`/admin/users/${u.id}`, { method: 'DELETE' }));

  const toggleTeam = (id) => setTeamFilter((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  // A Manager with users.manage 'team' works with their own teams only (the server lists only their people);
  // without users.manage, teams.manage decides which teams show.
  const teamScope = scopeOf(user, manageUsers ? 'users.manage' : 'teams.manage');
  const myTeams = teamScope === 'all' ? teams : teams.filter((t) => user.team_ids.includes(t.id));
  const inTeams = teamFilter.length ? users.filter((u) => u.team_ids.some((id) => teamFilter.includes(id))) : users;
  const editingTeam = teams.find((t) => t.id === editingTeamId);

  return (
    <div className="project">
      <header className="project-header">
        <h1>{tr('Quản trị')}</h1>
      </header>

      <ErrorBanner error={error} onClose={() => setError('')} />

      <div className="list admin">
        {(manageUsers || manageTeams) && (
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
            {manageUsers && (
              <p className="muted card-sub">{tr('Bấm vào team để lọc danh sách người dùng; không chọn team nào là xem tất cả.')}</p>
            )}
            <div className="team-chips">
              {myTeams.map((t) => (
                <span key={t.id} className={`team-chip ${teamFilter.includes(t.id) ? 'active' : ''}`}>
                  {manageUsers ? (
                    <button
                      className="team-chip-toggle"
                      onClick={() => toggleTeam(t.id)}
                      aria-pressed={teamFilter.includes(t.id)}
                      title={tr('Lọc người dùng theo team này')}
                    >
                      <b>{t.name}</b>
                      <span className="muted">{tr('{count} người', { count: t.member_count })}</span>
                    </button>
                  ) : (
                    <span className="channel-chip-name">
                      <b>{t.name}</b>
                      <span className="muted">{tr('{count} người', { count: t.member_count })}</span>
                    </span>
                  )}
                  {(coversTeams(user, 'teams.manage', [t.id]) || can(user, 'teams.members')) && (
                    <button className="icon-btn" title={tr('Sửa team, thêm thành viên')} onClick={() => setEditingTeamId(t.id)}>
                      ✎
                    </button>
                  )}
                  {scopeOf(user, 'teams.manage') === 'all' && (
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
                  )}
                </span>
              ))}
              {scopeOf(user, 'teams.manage') === 'all' && (
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
              )}
            </div>
          </section>
        )}

        {can(user, 'channels.manage') && (
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
        )}

        {manageUsers && (
          <>
            <InviteUserCard
              user={user}
              teams={myTeams}
              teamRequired={scopeOf(user, 'users.manage') !== 'all'}
              onInvited={() => load().then(onChanged, (e) => setError(e.message))}
            />
            <UsersCard
              user={user}
              users={inTeams}
              teams={myTeams}
              updateUser={updateUser}
              revokeInvite={revokeInvite}
              onReload={() => load().catch((e) => setError(e.message))}
            />
          </>
        )}
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
