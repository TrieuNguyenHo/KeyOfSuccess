// Small pieces of a task shown on board cards, list rows and the task panel.
import { useState } from 'react';
import { PRIORITIES, formatDate, isOverdue, recurrenceLabel } from '../utils.js';
import { tr } from '../i18n.js';
import { Avatar } from './Avatar.jsx';

export function CheckButton({ checked, onClick, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`check ${checked ? 'checked' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={checked ? tr('Đánh dấu chưa xong') : tr('Đánh dấu xong')}
    >
      ✓
    </button>
  );
}

export function PriorityTag({ value }) {
  if (!value) return null;
  return <span className={`tag priority-${value}`}>{PRIORITIES[value]}</span>;
}

// Overdue dates carry an icon as well as the status color, so they never rely on color alone.
// A recurring task's date ends with ↻ (its rule in the tooltip).
export function DueDate({ task, empty = null, plainClass = '' }) {
  if (!task.due_date) return empty;
  const repeat = task.recurrence && (
    <span className="repeat-icon" title={tr('Lặp lại: {p0}', { p0: recurrenceLabel(task.recurrence) })} aria-label={tr('Task lặp lại')}>
      {' '}
      ↻
    </span>
  );
  if (!isOverdue(task)) {
    return (
      <span className={plainClass}>
        {formatDate(task.due_date)}
        {repeat}
      </span>
    );
  }
  return (
    <span className="overdue" title={tr('Quá hạn')}>
      <span aria-hidden="true">⚠ </span>
      {formatDate(task.due_date)}
      {repeat}
    </span>
  );
}

export function TaskMeta({ task }) {
  return (
    <div className="task-meta">
      {task.assignee_name && <Avatar name={task.assignee_name} userId={task.assignee_id} small />}
      <DueDate task={task} plainClass="muted" />
      <PriorityTag value={task.priority} />
      <span className="grow" />
      {task.subtask_count > 0 && (
        <span className="muted" title="Subtasks">
          ☑ {task.subtask_done}/{task.subtask_count}
        </span>
      )}
      {task.comment_count > 0 && (
        <span className="muted" title="Comments">
          💬 {task.comment_count}
        </span>
      )}
    </div>
  );
}

// Quick-add for tasks and subtasks. Top-level tasks pass `requirements`: the form then asks which
// requirement the task belongs to, and without any requirement it points to the Requirements tab instead.
export function AddTaskInline({ onAdd, label = tr('+ Thêm task'), requirements, defaultRequirementId, onOpenRequirements }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [requirementId, setRequirementId] = useState(defaultRequirementId);

  if (requirements && requirements.length === 0) {
    return (
      <button type="button" className="add-task" onClick={onOpenRequirements}>
        {tr('+ Tạo requirement trước khi thêm task')}
      </button>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        className="add-task"
        onClick={() => {
          setRequirementId(defaultRequirementId);
          setOpen(true);
        }}
      >
        {label}
      </button>
    );
  }
  return (
    <form
      className="add-task-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) onAdd(title.trim(), requirementId);
        setTitle('');
      }}
      // Moving focus between the requirement select and the title keeps the form open.
      onBlur={(e) => !title.trim() && !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
    >
      {requirements && (
        <select
          value={requirementId ?? ''}
          onChange={(e) => setRequirementId(Number(e.target.value))}
          aria-label={tr('Requirement của task')}
        >
          {requirements.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      )}
      <input
        autoFocus
        value={title}
        placeholder={tr('Nhập tên rồi Enter, Esc để đóng')}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      />
    </form>
  );
}

// Small label naming a task's requirement on cards and rows.
// A task's tags on cards and list rows: its requirement, then its assignee's teams in the project
// (task.assignee_teams from the project view), so you see which team does it.
// Then its channels (Facebook, TikTok…), each with its color dot.
export function TaskTags({ task, requirements }) {
  const requirement = requirements?.find((r) => r.id === task.requirement_id);
  const teams = task.assignee_teams ?? [];
  const channels = task.channels ?? [];
  if (!requirement && !teams.length && !channels.length) return null;
  return (
    <span className="task-tags">
      {requirement && <span className="req-tag">{requirement.title}</span>}
      {teams.map((t) => (
        <span key={t.id} className="team-label" title={`Team ${t.name}`}>
          {t.name}
        </span>
      ))}
      {channels.map((c) => (
        <ChannelTag key={c.id} channel={c} />
      ))}
    </span>
  );
}

export function ChannelTag({ channel }) {
  return (
    <span className="channel-tag" title={tr('Kênh {name}', { name: channel.name })}>
      <span className="dot" style={{ background: channel.color }} aria-hidden="true" />
      {channel.name}
    </span>
  );
}

export function SectionHeader({ section, count, onRename, onDelete, readOnly }) {
  return (
    <div className="section-header">
      <span className="section-name">{section.name}</span>
      <span className="muted">{count}</span>
      <span className="grow" />
      {/* The built-in statuses (kind set: Planned, In-Progress, Completed, Pending) can be neither renamed nor deleted. */}
      {!readOnly && !section.kind && (
        <>
          <button type="button" className="icon-btn" onClick={() => onRename(section)} title={tr('Đổi tên trạng thái')}>
            ✎
          </button>
          <button type="button" className="icon-btn danger" onClick={() => onDelete(section)} title={tr('Xoá trạng thái')}>
            ✕
          </button>
        </>
      )}
    </div>
  );
}
