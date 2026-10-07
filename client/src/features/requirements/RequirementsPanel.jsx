import { useState } from 'react';
import { api } from '../../api.js';
import { tr } from '../../i18n.js';
import RequirementDetail from './RequirementDetail.jsx';
import RequirementProgress from './RequirementProgress.jsx';

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
                <RequirementProgress done={r.done_count} total={r.task_count} />
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
