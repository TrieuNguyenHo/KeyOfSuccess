import { useCallback, useEffect, useRef, useState } from 'react';
import { api, onLiveChange } from '../../api.js';
import { FREQ_LABELS, PRIORITIES, WEEKDAYS, formatDate, recurrenceLabel, todayStr } from '../../utils.js';
import Attachments from '../comments/Attachments.jsx';
import CommentList, { CommentComposer } from '../comments/CommentList.jsx';
import TaskHistory from './TaskHistory.jsx';
import { askConfirm } from '../../components/Dialog.jsx';
import { AddTaskInline, ChannelTag, CheckButton, PriorityTag } from '../../components/TaskParts.jsx';
import { Avatar } from '../../components/Avatar.jsx';
import { Hint, TeamPills } from '../../components/Controls.jsx';
import { tr } from '../../i18n.js';

// How recurring tasks work, behind the "?" next to the repeat picker.
function RecurrenceHint() {
  return (
    <Hint label={tr('Task lặp lại dùng thế nào?')}>
      <b>{tr('Task lặp lại dùng thế nào?')}</b>
      <ul>
        <li>
          {tr('Chọn chu kỳ: hằng ngày (T2–T6), hằng tuần hoặc mỗi 2 tuần (chọn các thứ), hằng tháng (chọn ngày; tháng ngắn hơn thì lấy ngày cuối tháng).')}
        </li>
        <li>
          {tr('Khi task được đánh dấu xong (tick hoặc kéo vào Completed), app tự tạo')} <b>{tr('bản kế tiếp')}</b> {tr('ở trạng thái Planned, hạn chót là lần kế tiếp theo chu kỳ.')}
        </li>
        <li>
          {tr('Bản mới chép tên, mô tả, người làm, requirement, kênh, ưu tiên và subtask (chưa tick). Comments và file không được chép.')}
        </li>
        <li>{tr('Xong trễ thì bản mới lấy lần gần nhất từ hôm nay, không tạo task quá hạn sẵn.')}</li>
        <li>{tr('Task hằng ngày xong không báo cho Leader / Manager.')}</li>
        <li>
          {tr('Muốn dừng: chọn')} <b>{tr('Không lặp')}</b> {tr('trên bản đang mở. Task lặp có dấu ↻ cạnh hạn chót.')}
        </li>
      </ul>
    </Hint>
  );
}

// Repeat rule picker. A new weekly or monthly rule starts from the task's due date (else today); the server
// gives a task without a due date the rule's first day.
function RecurrenceField({ task, onChange }) {
  const rule = task.recurrence ? JSON.parse(task.recurrence) : null;
  const base = new Date(`${task.due_date ?? todayStr()}T00:00`);
  const startRule = (freq) => {
    if (!freq) return null;
    if (freq === 'daily') return { freq };
    if (freq === 'monthly') return { freq, day: base.getDate() };
    return { freq, days: rule?.days ?? [((base.getDay() + 6) % 7) + 1] };
  };
  return (
    <span className="recurrence-field">
      <span className="recurrence-row">
        <select value={rule?.freq ?? ''} onChange={(e) => onChange(startRule(e.target.value))} aria-label={tr('Lặp lại')}>
          <option value="">{tr('Không lặp')}</option>
          {Object.entries(FREQ_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <RecurrenceHint />
      </span>
      {(rule?.freq === 'weekly' || rule?.freq === 'biweekly') && (
        <TeamPills
          teams={WEEKDAYS}
          selected={rule.days}
          onChange={(days) => days.length > 0 && onChange({ ...rule, days })}
          label={tr('Các thứ trong tuần')}
          noneLabel={null}
          itemLabel={(d) => d.name}
        />
      )}
      {rule?.freq === 'monthly' && (
        <select value={rule.day} onChange={(e) => onChange({ ...rule, day: Number(e.target.value) })} aria-label={tr('Ngày trong tháng')}>
          {Array.from({ length: 31 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1 > 28 ? tr('Ngày {day} (tháng ngắn hơn: ngày cuối tháng)', { day: i + 1 }) : tr('Ngày {day}', { day: i + 1 })}
            </option>
          ))}
        </select>
      )}
      {rule && <span className="muted small">{tr('Đánh dấu xong thì app tạo bản kế tiếp.')}</span>}
    </span>
  );
}

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
  const [mentionable, setMentionable] = useState([]);

  useEffect(() => {
    api(`/tasks/${taskId}/mentionable`)
      .then(setMentionable)
      .catch(() => {});
  }, [taskId]);

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
    <div className="fields">
      {!task.parent_id && (
        <>
          <label>Requirement</label>
          {readOnly ? (
            <button className="crumb" onClick={openRequirement} title={tr('Mở trang chi tiết requirement')}>
              {task.requirement_title} ↗
            </button>
          ) : (
            <span className="cell">
              <select
                className="grow"
                value={task.requirement_id ?? ''}
                onChange={(e) => update({ requirement_id: Number(e.target.value) })}
                aria-label="Requirement"
              >
                {requirements.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
              <button className="icon-btn" onClick={openRequirement} title={tr('Mở trang chi tiết requirement')}>
                ↗
              </button>
            </span>
          )}

          <label>{tr('Kênh')}</label>
          {readOnly ? (
            <span className="task-tags">
              {task.channels.length ? task.channels.map((c) => <ChannelTag key={c.id} channel={c} />) : <span className="muted">{tr('Không có')}</span>}
            </span>
          ) : channels.length ? (
            <TeamPills
              teams={channels}
              selected={task.channels.map((c) => c.id)}
              onChange={(ids) => update({ channel_ids: ids })}
              label={tr('Kênh')}
              noneLabel={null}
              itemLabel={(c) => c.name}
            />
          ) : (
            <span className="muted small">{tr('Chưa có kênh nào; Manager thêm kênh trong Quản lý người dùng.')}</span>
          )}

          <label>{tr('Lặp lại')}</label>
          {readOnly ? (
            <span className="recurrence-row">
              <span>{task.recurrence ? recurrenceLabel(task.recurrence) : <span className="muted">{tr('Không')}</span>}</span>
              <RecurrenceHint />
            </span>
          ) : (
            <RecurrenceField task={task} onChange={(recurrence) => update({ recurrence })} />
          )}
          {next_task && (
            <>
              <label>{tr('Bản kế tiếp')}</label>
              <button className="crumb" onClick={() => onOpenTask(next_task.id)} title={tr('Mở bản kế tiếp của task lặp lại')}>
                {tr('↻ Hạn')} {formatDate(next_task.due_date)} ↗
              </button>
            </>
          )}
        </>
      )}

      <label>{tr('Người làm')}</label>
      {!isAdmin ? (
        <span className="cell">
          {task.assignee_name ? (
            <>
              <Avatar name={task.assignee_name} userId={task.assignee_id} small /> {task.assignee_name}
            </>
          ) : (
            <span className="muted">{tr('Chưa giao')}</span>
          )}
        </span>
      ) : (
        <select
          value={task.assignee_id ?? ''}
          onChange={(e) => update({ assignee_id: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">{tr('Chưa giao')}</option>
          <optgroup label={tr('Thành viên project')}>
            {assignees
              .filter((u) => u.is_member)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </optgroup>
          {assignees.some((u) => !u.is_member) && (
            <optgroup label={tr('Trong team phụ trách (sẽ được thêm vào project)')}>
              {assignees
                .filter((u) => !u.is_member)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </optgroup>
          )}
        </select>
      )}

      <label>{tr('Hạn chót')}</label>
      {readOnly ? (
        <span>{formatDate(task.due_date) || <span className="muted">{tr('Không có')}</span>}</span>
      ) : (
        <input type="date" value={task.due_date ?? ''} onChange={(e) => update({ due_date: e.target.value || null })} />
      )}

      <label>{tr('Ưu tiên')}</label>
      {readOnly ? (
        <span>{task.priority ? <PriorityTag value={task.priority} /> : <span className="muted">{tr('Không')}</span>}</span>
      ) : (
        <select value={task.priority ?? ''} onChange={(e) => update({ priority: e.target.value || null })}>
          <option value="">{tr('Không')}</option>
          {Object.entries(PRIORITIES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      )}
    </div>
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

      {!task.parent_id && (
        <>
          <h3>
            Subtasks{' '}
            <span className="muted">
              {subtasks.filter((s) => s.completed).length}/{subtasks.length}
            </span>
          </h3>
          {subtasks.map((s) => (
            <div key={s.id} className="subtask">
              <CheckButton
                checked={Boolean(s.completed)}
                disabled={readOnly}
                onClick={() => act(() => api(`/tasks/${s.id}`, { method: 'PATCH', body: { completed: !s.completed } }))}
              />
              <span className={`grow ${s.completed ? 'done' : ''}`}>{s.title}</span>
              {isAdmin && (
                <button
                  className="icon-btn danger"
                  title={tr('Xoá subtask')}
                  onClick={() => act(() => api(`/tasks/${s.id}`, { method: 'DELETE' }))}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <AddTaskInline
              label={tr('+ Thêm subtask')}
              onAdd={(t) => act(() => api('/tasks', { method: 'POST', body: { parent_id: taskId, title: t } }))}
            />
          )}
        </>
      )}

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
