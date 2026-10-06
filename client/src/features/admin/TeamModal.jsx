import { useState } from 'react';
import { api } from '../../api.js';
import TeamMembers from './TeamMembers.jsx';
import { tr } from '../../i18n.js';

// Manager's team editor: rename, then the members editor shared with the Leaders' team page.
export default function TeamModal({ team, user, onClose, onChanged }) {
  const [name, setName] = useState(team.name);
  const [error, setError] = useState('');

  async function rename(e) {
    e.preventDefault();
    const next = name.trim();
    if (!next || next === team.name) return;
    try {
      await api(`/teams/${team.id}`, { method: 'PATCH', body: { name: next } });
      setError('');
    } catch (err) {
      setError(err.message);
    }
    onChanged();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal team-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{tr('Sửa team')}</h2>
          <span className="grow" />
          <button className="icon-btn" onClick={onClose} title={tr('Đóng')}>
            ✕
          </button>
        </div>

        <form className="member-form" onSubmit={rename}>
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label={tr('Tên team')} />
          <button className="btn primary" disabled={!name.trim() || name.trim() === team.name}>
            {tr('Đổi tên')}
          </button>
        </form>
        {error && <div className="error">{error}</div>}

        <TeamMembers team={team} user={user} onChanged={onChanged} />
      </div>
    </div>
  );
}
