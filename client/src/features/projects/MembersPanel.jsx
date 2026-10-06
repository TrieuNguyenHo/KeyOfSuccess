import { useState } from 'react';
import { api } from '../../api.js';
import { Avatar } from '../../components/Avatar.jsx';
import { askConfirm } from '../../components/Dialog.jsx';
import { tr } from '../../i18n.js';

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

  async function remove(member) {
    const self = member.id === currentUser.id;
    const ok = await askConfirm(
      self
        ? { title: tr('Rời khỏi project "{name}"?', { name: project.name }), confirmLabel: tr('Rời project'), danger: true }
        : {
            title: tr('Xoá {name} khỏi project?', { name: member.name }),
            message: tr('Task đang giao cho họ sẽ chuyển thành chưa giao.'),
            confirmLabel: tr('Xoá khỏi project'),
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
                {m.id === project.owner_id ? (
                  <span className="tag owner">Owner</span>
                ) : (
                  (canManage || self) && (
                    <button className="link-btn danger" onClick={() => remove(m)}>
                      {self ? tr('Rời project') : tr('Xoá')}
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ul>

        {!canManage && (
          <p className="muted small">{tr('Chỉ owner hoặc Leader của team mới thêm/xoá thành viên, đổi tên hoặc xoá project.')}</p>
        )}
      </div>
    </div>
  );
}
