import { useState } from 'react';
import { api } from '../../api.js';
import { askConfirm } from '../../components/Dialog.jsx';
import { Avatar } from '../../components/Avatar.jsx';
import { CheckMark, DueDate } from '../../components/TaskParts.jsx';
import { tr } from '../../i18n.js';
import RequirementComments from './RequirementComments.jsx';
import RequirementFiles from './RequirementFiles.jsx';
import RequirementProgress from './RequirementProgress.jsx';

// One requirement: brief, its tasks, feedback. Used in the Requirements tab and on the requirement page.
// onOpenPage is only passed by the tab (the page has no link to itself); onDeleted runs after a delete.
export default function RequirementDetail({
  requirement,
  tasks,
  canEdit,
  initialEditing = false,
  onChanged,
  onOpenTask,
  onShowOnBoard,
  onOpenPage,
  onDeleted,
}) {
  const [editing, setEditing] = useState(initialEditing);
  const draftOf = () => ({ title: requirement.title, description: requirement.description ?? '' });
  const [draft, setDraft] = useState(draftOf);
  const [error, setError] = useState('');

  // Returns whether the call succeeded.
  async function act(fn) {
    try {
      await fn();
      setError('');
      onChanged();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  }

  async function save() {
    if (await act(() => api(`/requirements/${requirement.id}`, { method: 'PATCH', body: draft }))) setEditing(false);
  }

  async function remove() {
    const ok = await askConfirm({
      title: tr('Xoá requirement "{title}"?', { title: requirement.title }),
      message: tr('Comments của requirement này cũng sẽ bị xoá.'),
      confirmLabel: tr('Xoá requirement'),
      danger: true,
    });
    if (!ok) return;
    if (await act(() => api(`/requirements/${requirement.id}`, { method: 'DELETE' }))) onDeleted?.();
  }

  const requirementTasks = tasks.filter((t) => t.requirement_id === requirement.id);

  return (
    <section className="admin-card req-detail">
      {error && (
        <div className="error" onClick={() => setError('')}>
          {error} {tr('(bấm để ẩn)')}
        </div>
      )}
      {editing ? (
        <>
          <input
            className="detail-title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            aria-label={tr('Tiêu đề requirement')}
          />
          <textarea
            autoFocus
            className="requirements-input"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder={tr('Mục tiêu, phạm vi, tiêu chí hoàn thành, KPI…')}
          />
          <div className="modal-actions">
            <button className="link-btn" onClick={() => setEditing(false)}>
              {tr('Huỷ')}
            </button>
            <button className="btn primary" onClick={save}>
              {tr('Lưu')}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="section-header">
            <h2 className="req-title">{requirement.title}</h2>
            <span className="grow" />
            {onOpenPage && (
              <button className="link-btn" onClick={() => onOpenPage(requirement.id)} title={tr('Mở trang chi tiết requirement')}>
                {tr('Mở trang ↗')}
              </button>
            )}
            {canEdit && (
              <>
                <button
                  className="link-btn"
                  onClick={() => {
                    setDraft(draftOf());
                    setEditing(true);
                  }}
                >
                  {tr('Sửa')}
                </button>
                <button
                  className="link-btn danger"
                  onClick={remove}
                  disabled={requirement.task_count > 0}
                  title={requirement.task_count > 0 ? tr('Chuyển hoặc xoá hết task của requirement này trước khi xoá') : tr('Xoá requirement')}
                >
                  {tr('Xoá')}
                </button>
              </>
            )}
          </div>
          <RequirementProgress done={requirement.done_count} total={requirement.task_count} />
          {requirement.description ? (
            <p className="requirements">{requirement.description}</p>
          ) : (
            <p className="muted">{tr('Chưa có mô tả.')}{canEdit && tr(' Bấm "Sửa" để viết mục tiêu, phạm vi, tiêu chí hoàn thành.')}</p>
          )}
        </>
      )}

      <RequirementFiles requirementId={requirement.id} canEdit={canEdit} />

      <div className="section-header req-tasks-head">
        <h3>
          Task <span className="muted">{requirementTasks.length}</span>
        </h3>
        <span className="grow" />
        <button className="link-btn" onClick={() => onShowOnBoard(requirement.id)}>
          {tr('Xem trên Board →')}
        </button>
      </div>
      {requirementTasks.length === 0 && <p className="muted">{tr('Chưa có task nào. Thêm task từ Board hoặc List.')}</p>}
      {requirementTasks.map((t) => (
        <button key={t.id} className="req-task" onClick={() => onOpenTask(t.id)}>
          <CheckMark checked={Boolean(t.completed)} />
          <span className={`ellipsis grow ${t.completed ? 'done' : ''}`}>{t.title}</span>
          {t.assignee_name && <Avatar name={t.assignee_name} userId={t.assignee_id} small />}
          <DueDate task={t} plainClass="muted small" />
        </button>
      ))}

      <RequirementComments requirementId={requirement.id} canEdit={canEdit} onChanged={onChanged} />
    </section>
  );
}
