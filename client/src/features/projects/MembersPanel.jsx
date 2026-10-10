import { useState } from 'react';
import { api } from '../../api.js';
import { Avatar } from '../../components/Avatar.jsx';
import { askConfirm } from '../../components/Dialog.jsx';
import { tr } from '../../i18n.js';
import { PROJECT_ROLES } from '../../utils.js';

export default function MembersPanel({ project, members, currentUser, canManage, onClose, onChanged, onLeft }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  async function add(e) {
    e.preventDefault();
    try {
      await api(`/projects/${project.id}/members`, { method: 'POST', body: { email } });
      setEmail('');
      setError('');
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  // role null: back to the team rules.
  async function setRole(member, role) {
    try {
      await api(`/projects/${project.id}/members/${member.id}`, { method: 'PATCH', body: { role } });
      setError('');
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(member) {
    const self = member.id === currentUser.id;
    const ok = await askConfirm(
      self
        ? { title: tr('Rời khỏi hoạt động "{name}"?', { name: project.name }), confirmLabel: tr('Rời hoạt động'), danger: true }
        : {
            title: tr('Xoá {name} khỏi hoạt động?', { name: member.name }),
            message: tr('Task đang giao cho họ sẽ chuyển thành chưa giao.'),
            confirmLabel: tr('Xoá khỏi hoạt động'),
            danger: true,
          }
    );
    if (!ok) return;
    try {
      await api(`/projects/${project.id}/members/${member.id}`, { method: 'DELETE' });
      if (self) onLeft();
      else onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{tr('Thành viên · {name}', { name: project.name })}</h2>
          <span className="grow" />
          <button className="icon-btn" onClick={onClose} title={tr('Đóng')}>
            ✕
          </button>
        </div>

        {canManage && (
          <form className="member-form" onSubmit={add}>
            <input
              type="email"
              required
              placeholder={tr('Email của người đã có tài khoản')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn primary">{tr('Thêm')}</button>
          </form>
        )}
        {error && <div className="error">{error}</div>}

        <ul className="member-list">
          {members.map((m) => {
            const self = m.id === currentUser.id;
            return (
              <li key={m.id}>
                <Avatar name={m.name} userId={m.id} />
                <div className="grow">
                  <div>
                    {m.name}
                    {self && <span className="muted"> {tr('(bạn)')}</span>}
                  </div>
                  <div className="muted small">{m.email}</div>
                </div>
                <MemberRole member={m} onChange={(role) => setRole(m, role)} />
                {m.id === project.owner_id ? (
                  <span className="tag owner">Owner</span>
                ) : (
                  (canManage || self) && (
                    <button className="link-btn danger" onClick={() => remove(m)}>
                      {self ? tr('Rời hoạt động') : tr('Xoá')}
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ul>

        {!canManage && (
          <p className="muted small">{tr('Chỉ owner hoặc Leader của team mới thêm/xoá thành viên, đổi tên hoặc xoá hoạt động.')}</p>
        )}
        <p className="muted small">
          {tr(
            'Vai trò gán tay thắng luật theo team: Quản lý = toàn quyền task, sửa hoạt động và thành viên (không xoá hoạt động); Thành viên hoạt động = tự tạo task, sửa task của mình, được giao task kể cả khi ở team khác; Chỉ xem = xem và comment. "Theo team" = quyền tính theo team như bình thường.'
          )}
        </p>
      </div>
    </div>
  );
}

// A member's project role: a picker for whoever may set it (can_set_role from the server), otherwise its name.
// "Theo team" shows what the team rules give them; the owner and whoever manages every project have no role.
function MemberRole({ member, onChange }) {
  const byTeam = tr('Theo team · {role}', { role: PROJECT_ROLES[member.team_role] });
  if (member.fixed) return null;
  if (!member.can_set_role) {
    return <span className={`small ${member.role ? '' : 'muted'}`}>{member.role ? PROJECT_ROLES[member.role] : byTeam}</span>;
  }
  return (
    <select
      className="member-role"
      value={member.role ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      aria-label={tr('Vai trò của {name} trong hoạt động', { name: member.name })}
    >
      <option value="">{byTeam}</option>
      {Object.entries(PROJECT_ROLES).map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}
