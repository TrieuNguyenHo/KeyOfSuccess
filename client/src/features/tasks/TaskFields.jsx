import { PRIORITIES, formatDate, recurrenceLabel } from '../../utils.js';
import { Avatar } from '../../components/Avatar.jsx';
import { TeamPills } from '../../components/Controls.jsx';
import { ChannelTag, PriorityTag } from '../../components/TaskParts.jsx';
import { tr } from '../../i18n.js';
import RecurrenceField, { RecurrenceHint } from './RecurrenceField.jsx';

// The task's fields (the side column of the task page): requirement, channels, repeat rule and the link to the
// next occurrence (top-level tasks only), assignee, due date, priority. update(patch) saves a change.
// readOnly: view and comment only; isAdmin: task admins, who alone assign.
export default function TaskFields({
  task,
  nextTask,
  assignees,
  requirements,
  channels,
  readOnly,
  isAdmin,
  update,
  openRequirement,
  onOpenTask,
}) {
  return (
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
            <span className="muted small">{tr('Chưa có kênh nào; Manager thêm kênh trong Quản trị.')}</span>
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
          {nextTask && (
            <>
              <label>{tr('Bản kế tiếp')}</label>
              <button className="crumb" onClick={() => onOpenTask(nextTask.id)} title={tr('Mở bản kế tiếp của task lặp lại')}>
                {tr('↻ Hạn')} {formatDate(nextTask.due_date)} ↗
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
}
