import { useState } from 'react';
import { api } from '../../api.js';
import { levelIn, useRoles } from '../../components/hooks.js';
import { tr } from '../../i18n.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Members and Leaders belong to a team; Managers and Directors may have none.
const needsTeam = (role) => role === 'member' || role === 'leader';

// Creates the account of someone who has never signed in (POST /api/admin/users), with a role up to the inviter's
// level and a team. The account is active at once; nothing is emailed, the inviter sends the app link.
export default function InviteUserCard({ user, teams, onInvited }) {
  const roles = useRoles();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('member');
  const [teamId, setTeamId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const valid = EMAIL_RE.test(email.trim()) && (teamId || !needsTeam(role));

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    try {
      const created = await api('/admin/users', {
        method: 'POST',
        body: { email: email.trim(), name: name.trim(), role, team_id: teamId ? Number(teamId) : null },
      });
      setNotice(tr('Đã tạo tài khoản cho {email}. Gửi link app cho họ, đăng nhập Google bằng email này là vào được ngay.', { email: created.email }));
      setError('');
      setEmail('');
      setName('');
      onInvited();
    } catch (err) {
      setError(err.message);
      setNotice('');
    }
  }

  return (
    <section className="admin-card">
      <div className="section-header">
        <h2>{tr('Mời người dùng mới')}</h2>
      </div>
      <p className="muted card-sub">{tr('Tạo sẵn tài khoản cho email chưa có trong hệ thống. App không gửi email: bạn tự gửi link app cho họ.')}</p>
      <form className="invite-form" onSubmit={submit} noValidate>
        <input type="email" placeholder="Email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder={tr('Tên (không bắt buộc)')} aria-label={tr('Tên (không bắt buộc)')} value={name} onChange={(e) => setName(e.target.value)} />
        <select aria-label={tr('Vai trò')} value={role} onChange={(e) => setRole(e.target.value)}>
          {roles
            .filter((r) => r.level <= levelIn(roles, user.role))
            .map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
        </select>
        <select aria-label="Team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">{needsTeam(role) ? tr('Chọn team') : tr('Chưa có team')}</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button className="btn primary" disabled={!valid}>
          {tr('Mời')}
        </button>
      </form>
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}
    </section>
  );
}
