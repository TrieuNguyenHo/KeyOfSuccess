import { useCallback, useEffect, useState } from 'react';
import { api, onLiveChange } from '../../api.js';
import Attachments from '../comments/Attachments.jsx';
import CommentList, { CommentComposer } from '../comments/CommentList.jsx';
import { askConfirm } from '../../components/Dialog.jsx';
import { Avatar } from '../../components/Avatar.jsx';
import { CheckButton, DueDate } from '../../components/TaskParts.jsx';
import { tr } from '../../i18n.js';

function Progress({ done, total }) {
  return (
    <span className="req-progress" title={tr('{done}/{total} task đã xong', { done, total })}>
      <span className="meter">
        <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </span>
      <span className="muted small">
        {tr('{done}/{total} task', { done, total })}
      </span>
    </span>
  );
}

// Files attached to a requirement (briefs, references). Reloads itself on live changes to the requirement.
function RequirementFiles({ requirementId, canEdit }) {
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(
    () =>
      api(`/requirements/${requirementId}/attachments`)
        .then(setFiles)
        .catch((e) => setError(e.message)),
    [requirementId]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => onLiveChange((change) => change.requirement_id === requirementId && load()), [requirementId, load]);

  async function act(fn) {
    try {
      await fn();
      setError('');
    } catch (e) {
      setError(e.message);
    }
    await load();
  }

  return (
    <>
      {error && <div className="error">{error}</div>}
      <Attachments
        files={files}
        uploadPath={`/requirements/${requirementId}/attachments`}
        canDeleteAll={canEdit}
        act={act}
        onError={setError}
      />
    </>
  );
}

// canEdit: requirement editors, who may also delete files others sent with their feedback.
function RequirementComments({ requirementId, canEdit, onChanged }) {
  const [comments, setComments] = useState([]);
  // People who can open the project, i.e. who can be tagged in this requirement's feedback.
  const [mentionable, setMentionable] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/requirements/${requirementId}/mentionable`)
      .then(setMentionable)
      .catch(() => {});
  }, [requirementId]);

  const load = useCallback(
    () =>
      api(`/requirements/${requirementId}/comments`)
        .then(setComments)
        .catch((e) => setError(e.message)),
    [requirementId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // New feedback from someone else shows up without reopening the requirement.
  useEffect(() => onLiveChange((change) => change.requirement_id === requirementId && load()), [requirementId, load]);

  async function act(fn) {
    try {
      await fn();
      setError('');
    } catch (err) {
      setError(err.message);
    }
    await load();
    onChanged();
  }

  return (
    <>
      <h3>
        Comments <span className="muted">{comments.length}</span>
      </h3>
      {error && <div className="error">{error}</div>}
      <CommentList
        comments={comments}
        kind="requirement-comments"
        mentionable={mentionable}
        empty={tr('Chưa có comments.')}
        act={act}
        canDeleteFiles={canEdit}
        onError={setError}
      />
      <CommentComposer
        kind="requirement-comments"
        createPath={`/requirements/${requirementId}/comments`}
        mentionable={mentionable}
        placeholder={tr('Gõ @ để nhắc ai đó, dán ảnh hoặc bấm 📎 để đính kèm')}
        act={act}
        onError={setError}
      />
    </>
  );
}

// One requirement: brief, its tasks, feedback. Used in the Requirements tab and on the requirement page.
// onOpenPage is only passed by the tab (the page has no link to itself); onDeleted runs after a delete.
export function RequirementDetail({
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
          <Progress done={requirement.done_count} total={requirement.task_count} />
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
          <CheckButton checked={Boolean(t.completed)} disabled onClick={() => {}} />
          <span className={`ellipsis grow ${t.completed ? 'done' : ''}`}>{t.title}</span>
          {t.assignee_name && <Avatar name={t.assignee_name} userId={t.assignee_id} small />}
          <DueDate task={t} plainClass="muted small" />
        </button>
      ))}

      <RequirementComments requirementId={requirement.id} canEdit={canEdit} onChanged={onChanged} />
    </section>
  );
}

// Requirements tab: the list on the left, the selected requirement on the right.
// canEdit = owner, a Leader of the project's teams, or any Manager.
export default function RequirementsPanel({
  project,
  requirements,
  tasks,
  canEdit,
  initialRequirementId,
  onChanged,
  onOpenTask,
  onShowOnBoard,
  onOpenRequirementPage,
}) {
  const [selectedId, setSelectedId] = useState(initialRequirementId ?? requirements[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  // A requirement just created opens straight in edit mode.
  const [createdId, setCreatedId] = useState(null);
  const [error, setError] = useState('');

  // Keep a valid selection when requirements are added or deleted.
  const selected = requirements.find((r) => r.id === selectedId) ?? requirements[0] ?? null;

  async function addRequirement(e) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    try {
      const created = await api(`/projects/${project.id}/requirements`, { method: 'POST', body: { title } });
      setError('');
      setNewTitle('');
      setAdding(false);
      setSelectedId(created.id);
      setCreatedId(created.id);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="requirements-tab">
      <section className="admin-card req-list">
        <div className="section-header">
          <h2>
            Requirements <span className="muted">{requirements.length}</span>
          </h2>
          <span className="grow" />
          {canEdit && !adding && (
            <button className="link-btn" onClick={() => setAdding(true)}>
              {tr('+ Thêm')}
            </button>
          )}
        </div>
        {error && (
          <div className="error" onClick={() => setError('')}>
            {error} {tr('(bấm để ẩn)')}
          </div>
        )}
        {adding && (
          <form className="member-form" onSubmit={addRequirement}>
            <input
              autoFocus
              value={newTitle}
              placeholder={tr('Tiêu đề requirement')}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
            />
            <button className="btn primary">{tr('Thêm')}</button>
          </form>
        )}
        {requirements.length === 0 && !adding && (
          <p className="muted">
            {canEdit
              ? tr('Project chưa có requirement. Tạo requirement đầu tiên rồi mới thêm được task.')
              : tr('Project chưa có requirement. Owner, Leader của team phụ trách hoặc Manager sẽ tạo requirement.')}
          </p>
        )}
        <ul className="req-items">
          {requirements.map((r) => (
            <li key={r.id}>
              <button
                className={`req-item ${selected?.id === r.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedId(r.id);
                  setCreatedId(null);
                }}
              >
                <span className="req-item-title">{r.title}</span>
                <Progress done={r.done_count} total={r.task_count} />
                {r.comment_count > 0 && <span className="muted small">💬 {r.comment_count}</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <RequirementDetail
          // Remount per requirement so edit mode and the draft never leak between them.
          key={selected.id}
          requirement={selected}
          tasks={tasks}
          canEdit={canEdit}
          initialEditing={createdId === selected.id}
          onChanged={onChanged}
          onOpenTask={onOpenTask}
          onShowOnBoard={onShowOnBoard}
          onOpenPage={onOpenRequirementPage}
        />
      )}
    </div>
  );
}
