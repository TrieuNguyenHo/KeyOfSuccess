import { useState } from 'react';
import { api } from '../../api.js';
import { useFetched } from '../../components/hooks.js';
import { tr } from '../../i18n.js';

// Saves a project's statuses, requirements, tasks and subtasks as a template (a snapshot: later changes to the
// project do not reach it), new or over an existing one. For people who may create projects.
export default function SaveTemplateModal({ project, onClose }) {
  const templates = useFetched('/project-templates');
  const [name, setName] = useState(project.name);
  const [over, setOver] = useState(''); // '' = a new template, else the id of the template to save over
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function pickOver(value) {
    setOver(value);
    const template = templates.find((t) => String(t.id) === value);
    if (template) setName(template.name);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { name: name.trim(), ...(over && { template_id: Number(over) }) };
      setSaved(await api(`/projects/${project.id}/template`, { method: 'POST', body }));
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-header">
          <h2>{tr('Lưu làm mẫu')}</h2>
          <span className="grow" />
          <button type="button" className="icon-btn" onClick={onClose} title={tr('Đóng')}>
            ✕
          </button>
        </div>

        {saved ? (
          <>
            <p>
              {tr('Đã lưu mẫu "{name}": {requirements} dự án, {tasks} task. Chọn mẫu này khi tạo hoạt động mới.', {
                name: saved.name,
                requirements: saved.requirements,
                tasks: saved.tasks,
              })}
            </p>
            <div className="modal-actions">
              <button type="button" className="btn primary" onClick={onClose}>
                {tr('Đóng')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted small">
              {tr(
                'Mẫu giữ trạng thái, dự án, task, subtask (mô tả, ưu tiên, kênh, người làm, lặp lại) và khoảng cách giữa các hạn chót. Không giữ comment, file, lịch sử. Sửa hoạt động sau này không đổi mẫu, trừ khi lưu đè.'
              )}
            </p>
            {templates.length > 0 && (
              <label className="form-field">
                <span>{tr('Lưu thành')}</span>
                <select value={over} onChange={(e) => pickOver(e.target.value)}>
                  <option value="">{tr('Mẫu mới')}</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {tr('Lưu đè lên "{name}"', { name: t.name })}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="form-field">
              <span>{tr('Tên mẫu')}</span>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </label>
            {error && <div className="error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="link-btn" onClick={onClose}>
                {tr('Huỷ')}
              </button>
              <button className="btn primary" disabled={busy || !name.trim()}>
                {over ? tr('Lưu đè') : tr('Lưu mẫu')}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
