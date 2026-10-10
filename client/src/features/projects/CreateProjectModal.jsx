import { useContext, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { TeamPills } from '../../components/Controls.jsx';
import { CurrentUser } from '../../components/CurrentUser.js';
import { askConfirm, askText } from '../../components/Dialog.jsx';
import { useAllTeams } from '../../components/hooks.js';
import { formatDate, scopeOf, shiftDay } from '../../utils.js';
import { tr } from '../../i18n.js';

// Only Managers create projects; they pick any number of owning teams (none = department-wide). With
// projects.change_teams 'team' they pick among their own teams, at least one. A project may start from a template
// (v39): its due dates are placed from the day picked as the start (first due date) or the launch (last one).
export default function CreateProjectModal({ onCreate, onClose }) {
  const user = useContext(CurrentUser);
  const ownTeamsOnly = scopeOf(user, 'projects.change_teams') === 'team';
  const [name, setName] = useState('');
  const allTeams = useAllTeams();
  const teams = ownTeamsOnly ? allTeams.filter((t) => user.team_ids.includes(t.id)) : allTeams;
  const [teamIds, setTeamIds] = useState([]);
  const [addTeams, setAddTeams] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [anchor, setAnchor] = useState('start'); // 'start' | 'end' (launch)
  const [anchorDate, setAnchorDate] = useState('');

  const loadTemplates = () =>
    api('/project-templates')
      .then(setTemplates)
      .catch(() => {});
  useEffect(() => {
    loadTemplates();
  }, []);
  const template = templates.find((t) => String(t.id) === templateId);
  const needsDate = template?.span != null;
  // The first and last due dates the chosen day gives.
  const first = needsDate && anchorDate ? (anchor === 'end' ? shiftDay(anchorDate, -template.span) : anchorDate) : null;
  const last = first && shiftDay(first, template.span);

  async function renameTemplate() {
    const name = await askText({ title: tr('Đổi tên mẫu'), label: tr('Tên mẫu'), initial: template.name });
    if (!name) return;
    try {
      await api(`/project-templates/${template.id}`, { method: 'PATCH', body: { name } });
      loadTemplates();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteTemplate() {
    const ok = await askConfirm({
      title: tr('Xoá mẫu "{name}"?', { name: template.name }),
      message: tr('Các hoạt động đã tạo từ mẫu này không bị ảnh hưởng.'),
      confirmLabel: tr('Xoá'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/project-templates/${template.id}`, { method: 'DELETE' });
      setTemplateId('');
      loadTemplates();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onCreate({
        name: name.trim(),
        team_ids: teamIds,
        add_team: teamIds.length > 0 && addTeams,
        ...(template && { template_id: template.id, anchor, anchor_date: anchorDate || undefined }),
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
          <h2>{tr('Tạo hoạt động')}</h2>
          <span className="grow" />
          <button type="button" className="icon-btn" onClick={onClose} title={tr('Đóng')}>
            ✕
          </button>
        </div>

        <label className="form-field">
          <span>{tr('Tên hoạt động')}</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('Ví dụ: Campaign Tết 2027')} />
        </label>

        {templates.length > 0 && (
          <div className="form-field">
            <span>{tr('Bắt đầu từ')}</span>
            <div className="template-pick">
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">{tr('Hoạt động trống')}</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {tr('Mẫu: {name}', { name: t.name })}
                  </option>
                ))}
              </select>
              {template && (
                <>
                  <button type="button" className="icon-btn" onClick={renameTemplate} title={tr('Đổi tên mẫu')}>
                    ✎
                  </button>
                  <button type="button" className="icon-btn danger" onClick={deleteTemplate} title={tr('Xoá mẫu')}>
                    🗑
                  </button>
                </>
              )}
            </div>
            {template && (
              <span className="muted small">
                {tr('{requirements} project, {tasks} task, {subtasks} subtask', {
                  requirements: template.requirements,
                  tasks: template.tasks,
                  subtasks: template.subtasks,
                })}
                {template.source_project_name && ` · ${tr('lưu từ {name}', { name: template.source_project_name })}`}
              </span>
            )}
          </div>
        )}

        {needsDate && (
          <div className="form-field">
            <span>{tr('Đặt hạn chót theo')}</span>
            <div className="template-anchor">
              <div className="tabs" role="group" aria-label={tr('Đặt hạn chót theo')}>
                <button type="button" className={anchor === 'start' ? 'active' : ''} onClick={() => setAnchor('start')}>
                  {tr('Ngày bắt đầu')}
                </button>
                <button type="button" className={anchor === 'end' ? 'active' : ''} onClick={() => setAnchor('end')}>
                  {tr('Ngày ra mắt')}
                </button>
              </div>
              <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} aria-label={tr('Ngày')} />
            </div>
            <span className="muted small">
              {first
                ? tr('Task đầu tiên đến hạn {first}, task cuối cùng {last}.', { first: formatDate(first), last: formatDate(last) })
                : anchor === 'start'
                  ? tr('Task có hạn sớm nhất rơi vào ngày này, các task khác giữ khoảng cách như trong mẫu.')
                  : tr('Task có hạn muộn nhất rơi vào ngày này (vd. ngày chạy chiến dịch), các task khác tính ngược lại.')}
            </span>
          </div>
        )}

        <div className="form-field">
          <span>{tr('Team phụ trách')}</span>
          <TeamPills teams={teams} selected={teamIds} onChange={setTeamIds} noneLabel={ownTeamsOnly ? null : undefined} />
          <span className="muted small">
            {tr('Chọn nhiều team nếu cùng phụ trách. Manager và Leader của các team này có toàn quyền trên task.')}
          </span>
        </div>

        {teamIds.length > 0 && (
          <label className="checkbox">
            <input type="checkbox" checked={addTeams} onChange={(e) => setAddTeams(e.target.checked)} />
            {teamIds.length > 1 ? tr('Thêm mọi người trong các team đã chọn vào hoạt động') : tr('Thêm cả team vào hoạt động')}
          </label>
        )}

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="link-btn" onClick={onClose}>
            {tr('Huỷ')}
          </button>
          <button
            className="btn primary"
            disabled={busy || !name.trim() || (ownTeamsOnly && teamIds.length === 0) || (needsDate && !anchorDate)}
          >
            {tr('Tạo hoạt động')}
          </button>
        </div>
      </form>
    </div>
  );
}
