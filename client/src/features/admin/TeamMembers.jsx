import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { ROLES, STATUSES, can } from '../../utils.js';
import { Avatar } from '../../components/Avatar.jsx';
import { SearchBox } from '../../components/Controls.jsx';
import { askConfirm } from '../../components/Dialog.jsx';
import { levelIn, useRoles } from '../../components/hooks.js';
import { ProfilePopover } from '../profile/ProfilePage.jsx';
import { tr } from '../../i18n.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Members of one team with add / approve / invite / remove, for Managers (any team) and Leaders (own teams).
// The server decides who may be added (candidates); a Leader's invitation waits for a Manager.
export default function TeamMembers({ team, user, onChanged }) {
  // users.manage widens what may be done here (any person, invitations active at once).
  const isManager = can(user, 'users.manage');
  const roles = useRoles();
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(
    () =>
      api(`/teams/${team.id}/members`)
        .then(setData)
        .catch((e) => setError(e.message)),
    [team.id]
  );

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn, done) {
    try {
      await fn();
      setError('');
      setNotice(done ?? '');
    } catch (e) {
      setError(e.message);
      setNotice('');
    }
    await load();
    onChanged?.();
  }

  if (!data) return <p className="muted">{error || tr('Đang tải…')}</p>;

  const q = query.trim().toLowerCase();
  const matches = (u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  const suggestions = data.candidates.filter(matches);
  const known = [...data.members, ...data.candidates].find((u) => u.email.toLowerCase() === q);
  const canInvite = EMAIL_RE.test(q) && !known;
  // A Leader-invited account waits for a Manager; only Managers approve those.
  const waitsForManager = (u) => u.status === 'pending' && u.invited_by != null;

  function add(u) {
    const approving = u.status === 'pending';
    act(
      () => api(`/teams/${team.id}/members`, { method: 'POST', body: { user_id: u.id } }),
      approving ? tr('Đã duyệt {name} và thêm vào team.', { name: u.name }) : tr('Đã thêm {name} vào team.', { name: u.name })
    );
  }

  function invite(e) {
    e.preventDefault();
    if (!canInvite) return;
    const email = q;
    act(
      async () => {
        await api(`/teams/${team.id}/invite`, { method: 'POST', body: { email, name: inviteName.trim() } });
        setQuery('');
        setInviteName('');
      },
      isManager
        ? tr('Đã tạo tài khoản cho {email}. Gửi link app cho họ, đăng nhập Google bằng email này là vào được ngay.', { email })
        : tr('Đã mời {email}. Tài khoản chờ Manager duyệt; sau khi duyệt, họ đăng nhập Google bằng email này là vào được.', { email })
    );
  }

  async function remove(u) {
    const ok = await askConfirm({
      title: tr('Bỏ {name} khỏi team {name1}?', { name: u.name, name1: team.name }),
      message: u.role === 'member' ? tr('Họ sẽ thành "Chưa có team" cho tới khi được xếp vào team khác.') : undefined,
      confirmLabel: tr('Bỏ khỏi team'),
      danger: true,
    });
    if (ok) act(() => api(`/teams/${team.id}/members/${u.id}`, { method: 'DELETE' }), tr('Đã bỏ {name} khỏi team.', { name: u.name }));
  }

  const canRemove = (u) =>
    u.id !== user.id &&
    levelIn(roles, u.role) <= levelIn(roles, user.role) &&
    (isManager ? !(u.role === 'leader' && u.team_ids.length === 1) : u.role === 'member');

  return (
    <div className="team-members">
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <h3>{tr('Thêm thành viên')}</h3>
      <form className="member-form" onSubmit={invite} noValidate>
        <SearchBox
          wide
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isManager ? tr('Tìm người để thêm, hoặc nhập email để mời') : tr('Tìm người chưa có team, hoặc nhập email để mời')}
          label={tr('Tìm hoặc nhập email')}
        />
      </form>
      <ul className="member-list suggest-list">
        {suggestions.map((u) => (
          <li key={u.id}>
            <Avatar name={u.name} userId={u.id} small />
            <div className="grow user-info">
              <span className="ellipsis">{u.name}</span>
              <span className="muted small ellipsis">{u.team_name ? `${ROLES[u.role]} · ${u.team_name}` : u.email}</span>
            </div>
            {u.status !== 'active' && (
              <span className={`tag status-${u.status}`}>
                {waitsForManager(u) ? tr('Chờ duyệt · {p0} mời', { p0: u.invited_by_name ?? '' }) : STATUSES[u.status]}
              </span>
            )}
            <button className="btn small primary" onClick={() => add(u)}>
              {u.status === 'pending' ? tr('Duyệt và thêm') : tr('Thêm')}
            </button>
          </li>
        ))}
        {canInvite && (
          <li>
            <form className="invite-form" onSubmit={invite}>
              <div className="grow user-info">
                <span className="ellipsis">
                  {tr('Mời')} <b>{q}</b>
                </span>
                <span className="muted small">
                  {isManager
                    ? tr('Chưa có trong hệ thống. Tài khoản được tạo sẵn trong team này.')
                    : tr('Chưa có trong hệ thống. Tài khoản được tạo trong team này và chờ Manager duyệt.')}
                </span>
              </div>
              <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder={tr('Tên (không bắt buộc)')} />
              <button className="btn small primary">{tr('Mời')}</button>
            </form>
          </li>
        )}
        {known && data.members.includes(known) && <li className="muted small">{known.name} {tr('đã ở team này.')}</li>}
        {suggestions.length === 0 && !canInvite && !known && (
          <li className="muted small">
            {q ? tr('Không có ai khớp. Nhập đầy đủ email để mời người mới.') : tr('Không có ai để thêm. Nhập email để mời người mới.')}
          </li>
        )}
      </ul>

      <h3>
        {tr('Thành viên')} <span className="muted">{data.members.length}</span>
      </h3>
      <ul className="member-list">
        {data.members.map((u) => (
          <li key={u.id}>
            {/* Managers and the team's Leaders read members' profiles: click the avatar. */}
            <ProfilePopover user={u} />
            <div className="grow user-info">
              <span className="ellipsis">
                {u.name}
                {u.id === user.id && <span className="muted"> {tr('(bạn)')}</span>}
              </span>
              <span className="muted small ellipsis">{u.email}</span>
            </div>
            {u.status !== 'active' && (
              <span className={`tag status-${u.status}`}>
                {waitsForManager(u) ? tr('Chờ Manager duyệt') : STATUSES[u.status]}
              </span>
            )}
            <span className="muted small">{ROLES[u.role]}</span>
            {canRemove(u) && (
              <button className="link-btn danger" onClick={() => remove(u)}>
                {tr('Bỏ khỏi team')}
              </button>
            )}
          </li>
        ))}
        {data.members.length === 0 && <li className="muted small">{tr('Team chưa có ai.')}</li>}
      </ul>
    </div>
  );
}
