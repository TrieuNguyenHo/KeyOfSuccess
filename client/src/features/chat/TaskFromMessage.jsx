import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { fromMentionMarkup } from '../../components/Mentions.jsx';
import { useFetched } from '../../components/hooks.js';
import { tr } from '../../i18n.js';

const TITLE_MAX = 120;

// Makes a task from a chat message (v36): the project and requirement are picked, the title starts as the message's
// first line, the description holds its text and a link back to it, and its files are copied to the task. The task
// rules apply as anywhere: without full rights on tasks, the task is the user's own. onCreated(taskId) opens it.
export default function TaskFromMessage({ message, conversationId, onCreated, onClose }) {
  const text = fromMentionMarkup(message.body).text;
  const projects = useFetched('/projects');
  const [projectId, setProjectId] = useState('');
  const [detail, setDetail] = useState(null);
  const [requirementId, setRequirementId] = useState('');
  const [title, setTitle] = useState((text.split('\n')[0] || tr('Task từ tin nhắn')).slice(0, TITLE_MAX));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDetail(null);
    setRequirementId('');
    if (!projectId) return;
    api(`/projects/${projectId}`)
      .then((d) => {
        setDetail(d);
        if (d.requirements.length === 1) setRequirementId(String(d.requirements[0].id));
      })
      .catch((e) => setError(e.message));
  }, [projectId]);

  const canAdd = detail?.project.can_add_tasks;
  // New tasks go to the first status (Planned).
  const section = detail?.sections.find((s) => s.kind === 'todo') ?? detail?.sections[0];

  async function submit(e) {
    e.preventDefault();
    if (!canAdd || !requirementId || !title.trim() || busy) return;
    setBusy(true);
    try {
      const task = await api('/tasks', { method: 'POST', body: { section_id: section.id, requirement_id: Number(requirementId), title: title.trim() } });
      const link = `${window.location.origin}/#/chat/${conversationId}?message=${message.id}`;
      const description = [text, tr('Từ tin nhắn: {link}', { link })].filter(Boolean).join('\n\n');
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: { description } });
      if (message.attachments.length) await api(`/chat-messages/${message.id}/copy-files`, { method: 'POST', body: { task_id: task.id } });
      onCreated(task.id);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal chat-dialog" onClick={(e) => e.stopPropagation()} onSubmit={submit} aria-label={tr('Tạo task từ tin nhắn')}>
        <div className="modal-header">
          <h2>{tr('Tạo task từ tin nhắn')}</h2>
          <span className="grow" />
          <button type="button" className="icon-btn" onClick={onClose} aria-label={tr('Đóng')}>
            ✕
          </button>
        </div>
        <label className="form-field">
          <span>{tr('Hoạt động')}</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
            <option value="">{tr('Chọn hoạt động')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {detail && !canAdd && <p className="muted small">{tr('Bạn không thêm task được ở hoạt động này.')}</p>}
        {detail && canAdd && detail.requirements.length === 0 && <p className="muted small">{tr('Hoạt động chưa có dự án nào, cần tạo dự án trước khi thêm task.')}</p>}
        {detail && canAdd && detail.requirements.length > 0 && (
          <label className="form-field">
            <span>{tr('Dự án')}</span>
            <select value={requirementId} onChange={(e) => setRequirementId(e.target.value)} required>
              <option value="">{tr('Chọn dự án')}</option>
              {detail.requirements.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="form-field">
          <span>{tr('Tên task')}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} required />
        </label>
        <p className="muted small">
          {message.attachments.length
            ? tr('Mô tả task là nội dung tin nhắn kèm link quay về tin; {count} file của tin được chép vào task.', { count: message.attachments.length })
            : tr('Mô tả task là nội dung tin nhắn kèm link quay về tin.')}
          {detail && canAdd && !detail.project.task_admin && ` ${tr('Task sẽ được giao cho bạn.')}`}
        </p>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            {tr('Huỷ')}
          </button>
          <button className="btn primary" disabled={!canAdd || !requirementId || !title.trim() || busy}>
            {tr('Tạo task')}
          </button>
        </div>
      </form>
    </div>
  );
}
