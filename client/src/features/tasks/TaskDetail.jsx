import { useCallback, useEffect, useRef, useState } from 'react';
import { api, onLiveChange } from '../../api.js';
import Attachments from '../comments/Attachments.jsx';
import CommentList, { CommentComposer } from '../comments/CommentList.jsx';
import { askConfirm } from '../../components/Dialog.jsx';
import { useFetched } from '../../components/hooks.js';
import { tr } from '../../i18n.js';
import Subtasks from './Subtasks.jsx';
import TaskFields from './TaskFields.jsx';
import TaskHistory from './TaskHistory.jsx';

// Shown as a side panel (quick look) or, with `page`, as a full page with the fields in a side column.
// onOpenPage opens the full page from the panel; onOpenProject / onOpenRequirement follow the breadcrumb;
// onOpenTask opens another task the same way (the next occurrence of a recurring task).
export default function TaskDetail({
  taskId,
  page = false,
  onClose,
  onChanged,
  onOpenPage,
  onOpenTask,
  onOpenProject,
  onOpenRequirement,
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // People who can see this task, i.e. who can be tagged in its comments.
  const mentionable = useFetched(`/tasks/${taskId}/mentionable`);

  // The data last loaded, so a live reload can tell whether the title or description is being edited.
  const dataRef = useRef(null);

  const load = useCallback(async () => {
    const d = await api(`/tasks/${taskId}`);
    dataRef.current = d;
    setData(d);
    setTitle(d.task.title);
    setDescription(d.task.description ?? '');
  }, [taskId]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  // Someone else changed something in this task's project (the task, its subtasks or comments, a requirement
  // name…): reload, but keep a title or description the user has started editing. A task that was deleted or
  // is no longer visible keeps showing with the server's error above it.
  useEffect(
    () =>
      onLiveChange(async (change) => {
        const prev = dataRef.current;
        if (change.project_id !== prev?.task.project_id) return;
        try {
          const d = await api(`/tasks/${taskId}`);
          dataRef.current = d;
          setData(d);
          setTitle((t) => (t === prev.task.title ? d.task.title : t));
          setDescription((v) => (v === (prev.task.description ?? '') ? d.task.description ?? '' : v));
        } catch (e) {
          setError(e.message);
        }
      }),
    [taskId]
  );

  async function act(fn) {
    try {
      await fn();
      setError('');
    } catch (e) {
      setError(e.message);
    }
    await load().catch(() => {});
    onChanged();
  }

  const update = (patch) => act(() => api(`/tasks/${taskId}`, { method: 'PATCH', body: patch }));

  async function remove() {
    const ok = await askConfirm({
      title: tr('Xoá task này?'),
      message: tr('Các subtask và comments của task cũng sẽ bị xoá.'),
      confirmLabel: tr('Xoá task'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/tasks/${taskId}`, { method: 'DELETE' });
      onChanged();
      onClose();
    } catch (e) {
      setError(e.message);
    }
  }

  const closeButton = page ? (
    <button className="link-btn" onClick={onClose}>
      {tr('← Quay lại')}
    </button>
  ) : (
    <button className="icon-btn" onClick={onClose} title={tr('Đóng')}>
      ✕
    </button>
  );

  if (!data) {
    return (
      <div className={page ? 'task-page' : 'detail'}>
        {closeButton}
        <p className="muted">{error || tr('Đang tải…')}</p>
      </div>
    );
  }

  const { task, next_task, subtasks, comments, assignees, requirements, channels, attachments } = data;
  // 'admin': Managers and Leaders of a team in the project. 'edit': the assignee, who cannot reassign or delete.
  // 'view': read and comment only.
  const readOnly = task.access === 'view';
  const isAdmin = task.access === 'admin';
  const openRequirement = () => onOpenRequirement(task.project_id, task.requirement_id);

  const topBar = (
    <div className="detail-top">
      {readOnly ? (
        <span className={`tag ${task.completed ? 'status-active' : 'status-pending'}`}>
          {task.completed ? tr('✓ Đã xong') : tr('Chưa xong')}
        </span>
      ) : (
        <button className={`complete-btn ${task.completed ? 'on' : ''}`} onClick={() => update({ completed: !task.completed })}>
          {task.completed ? tr('✓ Đã xong') : tr('✓ Đánh dấu xong')}
        </button>
      )}
      <span className="grow" />
      {!page && (
        <button className="icon-btn" onClick={() => onOpenPage(taskId)} title={tr('Mở toàn trang')}>
          ⤢
        </button>
      )}
      {isAdmin && (
        <button className="icon-btn danger" onClick={remove} title={tr('Xoá task')}>
          🗑
        </button>
      )}
      {!page && closeButton}
    </div>
  );

  // Project › Requirement, each opening its own page. Subtasks have no requirement.
  const breadcrumb = (
    <div className="detail-project">
      <span className="dot" style={{ background: task.project_color }} />
      <button className="crumb" onClick={() => onOpenProject(task.project_id)} title={tr('Mở project')}>
        {task.project_name}
      </button>
      {task.requirement_id && (
        <>
          <span aria-hidden="true">›</span>
          <button className="crumb" onClick={openRequirement} title={tr('Mở trang chi tiết requirement')}>
            {task.requirement_title}
          </button>
        </>
      )}
      {readOnly && <span className="tag readonly">{tr('Chỉ xem · comment được')}</span>}
    </div>
  );

  const titleField = readOnly ? (
    <h2 className="detail-title static">{task.title}</h2>
  ) : (
    <input
      className="detail-title"
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      onBlur={() => (title.trim() && title !== task.title ? update({ title }) : setTitle(task.title))}
    />
  );

  const fields = (
    <TaskFields
      task={task}
      nextTask={next_task}
      assignees={assignees}
      requirements={requirements}
      channels={channels}
      readOnly={readOnly}
      isAdmin={isAdmin}
      update={update}
      openRequirement={openRequirement}
      onOpenTask={onOpenTask}
    />
  );

  const content = (
    <>
      <h3>{tr('Mô tả')}</h3>
      {readOnly ? (
        <p className="description-static">{task.description || <span className="muted">{tr('Không có mô tả.')}</span>}</p>
      ) : (
        <textarea
          className="description"
          value={description}
          placeholder={tr('Thêm mô tả cho task…')}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== (task.description ?? '') && update({ description })}
        />
      )}

      <Attachments
        files={attachments}
        uploadPath={`/tasks/${taskId}/attachments`}
        canDeleteAll={isAdmin}
        act={act}
        onError={setError}
      />

      {!task.parent_id && <Subtasks taskId={taskId} subtasks={subtasks} readOnly={readOnly} isAdmin={isAdmin} act={act} />}

      <h3>Comments</h3>
      <CommentList
        comments={comments}
        kind="comments"
        mentionable={mentionable}
        empty={tr('Chưa có comments.')}
        act={act}
        canDeleteFiles={isAdmin}
        onError={setError}
      />
      <CommentComposer
        kind="comments"
        createPath={`/tasks/${taskId}/comments`}
        mentionable={mentionable}
        placeholder={tr('Gõ @ để nhắc ai đó, dán ảnh hoặc bấm 📎 để đính kèm')}
        act={act}
        onError={setError}
      />

      <TaskHistory taskId={taskId} reloadKey={data} />
    </>
  );

  if (page) {
    return (
      <div className="task-page">
        <div className="page-top">
          {closeButton}
          {breadcrumb}
        </div>
        <div className="task-page-grid">
          <div className="task-page-main">
            {error && <div className="error">{error}</div>}
            {titleField}
            {content}
          </div>
          <aside className="admin-card task-page-side">
            {topBar}
            {fields}
          </aside>
        </div>
      </div>
    );
  }

  return (
    <aside className="detail">
      {topBar}
      {breadcrumb}
      {error && <div className="error">{error}</div>}
      {titleField}
      {fields}
      {content}
    </aside>
  );
}
