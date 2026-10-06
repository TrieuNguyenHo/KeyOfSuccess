import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { TeamPills } from '../../components/Controls.jsx';
import { tr } from '../../i18n.js';

// Only Managers create projects; they pick any number of owning teams (none = department-wide).
export default function CreateProjectModal({ onCreate, onClose }) {
  const [name, setName] = useState('');
  const [teams, setTeams] = useState([]);
  const [teamIds, setTeamIds] = useState([]);
  const [addTeams, setAddTeams] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/teams').then(setTeams).catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onCreate({
        name: name.trim(),
        team_ids: teamIds,
        add_team: teamIds.length > 0 && addTeams,
      });
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-header">
          <h2>{tr('Tạo project')}</h2>
          <span className="grow" />
          <button type="button" className="icon-btn" onClick={onClose} title={tr('Đóng')}>
            ✕
          </button>
        </div>

        <label className="form-field">
          <span>{tr('Tên project')}</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('Ví dụ: Campaign Tết 2027')} />
        </label>

        <div className="form-field">
          <span>{tr('Team phụ trách')}</span>
          <TeamPills teams={teams} selected={teamIds} onChange={setTeamIds} />
          <span className="muted small">
            {tr('Chọn nhiều team nếu cùng phụ trách. Manager và Leader của các team này có toàn quyền trên task.')}
          </span>
        </div>

        {teamIds.length > 0 && (
          <label className="checkbox">
            <input type="checkbox" checked={addTeams} onChange={(e) => setAddTeams(e.target.checked)} />
            {teamIds.length > 1 ? tr('Thêm mọi người trong các team đã chọn vào project') : tr('Thêm cả team vào project')}
          </label>
        )}

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="link-btn" onClick={onClose}>
            {tr('Huỷ')}
          </button>
          <button className="btn primary" disabled={busy || !name.trim()}>
            {tr('Tạo project')}
          </button>
        </div>
      </form>
    </div>
  );
}
