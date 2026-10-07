import { api } from '../../api.js';
import { AddTaskInline, CheckButton } from '../../components/TaskParts.jsx';
import { tr } from '../../i18n.js';

// A top-level task's subtasks: ticked by whoever may edit the task, deleted by task admins.
// act(fn) runs a change and reloads the task.
export default function Subtasks({ taskId, subtasks, readOnly, isAdmin, act }) {
  return (
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
  );
}
