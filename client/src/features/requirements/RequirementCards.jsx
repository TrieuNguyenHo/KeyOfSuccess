import { useState } from 'react';
import { api } from '../../api.js';
import { Avatar } from '../../components/Avatar.jsx';
import { formatDate, isOverdue } from '../../utils.js';
import { tr } from '../../i18n.js';

// An activity's projects (requirements in the code) as cards, the first thing shown when the activity opens
// (decided 2026-10-10, replacing the list + detail tab). Each card: progress, overdue tasks, the span of dates, tasks
// per status and per person. A click opens the Board filtered to that project; "Chi tiết" opens its page
// (description, files, comments, edit, delete). canEdit = whoever may create projects here (canEditRequirements()).
const MAX_PEOPLE = 5;

function cardFigures(requirement, tasks, sections) {
  const own = tasks.filter((t) => t.requirement_id === requirement.id);
  const done = own.filter((t) => t.completed).length;
  const dates = own.flatMap((t) => [t.start_date, t.due_date]).filter(Boolean).sort();
  const people = new Map();
  let unassigned = 0;
  for (const t of own) {
    if (t.assignee_id == null) unassigned++;
    else {
      const entry = people.get(t.assignee_id) ?? people.set(t.assignee_id, { id: t.assignee_id, name: t.assignee_name, count: 0 }).get(t.assignee_id);
      entry.count++;
    }
  }
  return {
    total: own.length,
    done,
    overdue: own.filter(isOverdue).length,
    from: dates[0],
    to: dates.at(-1),
    statuses: sections.map((s) => ({ id: s.id, name: s.name, count: own.filter((t) => t.section_id === s.id).length })).filter((s) => s.count > 0),
    people: [...people.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    unassigned,
  };
}

function RequirementCard({ requirement, figures: f, onOpen, onDetails }) {
  const shown = f.people.slice(0, MAX_PEOPLE);
  const hidden = f.people.slice(MAX_PEOPLE);
  return (
    <article
      className="req-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      aria-label={tr('Mở Board của dự án {title}', { title: requirement.title })}
    >
      <div className="req-card-head">
        <h3 className="req-card-title">{requirement.title}</h3>
        <button
          className="link-btn req-card-details"
          onClick={(e) => {
            e.stopPropagation();
            onDetails();
          }}
        >
          {tr('Chi tiết ↗')}
        </button>
      </div>

      <div className="req-card-progress">
        <span className="meter">
          <span style={{ width: `${f.total ? (f.done / f.total) * 100 : 0}%` }} />
        </span>
        <span className="small">
          {tr('{done}/{total} task', { done: f.done, total: f.total })}
          {f.total > 0 && <span className="muted"> · {Math.round((f.done / f.total) * 100)}%</span>}
        </span>
      </div>

      {(f.overdue > 0 || f.from) && (
        <div className="req-card-meta small">
          {f.overdue > 0 && <span className="overdue">⚠ {tr('{n} quá hạn', { n: f.overdue })}</span>}
          {f.from && (
            <span className="muted" title={tr('Từ ngày bắt đầu sớm nhất tới hạn chót muộn nhất của các task')}>
              📅 {f.from === f.to ? formatDate(f.from) : `${formatDate(f.from)} – ${formatDate(f.to)}`}
            </span>
          )}
        </div>
      )}

      {f.total === 0 ? (
        <p className="muted small req-card-empty">{tr('Chưa có task.')}</p>
      ) : (
        <>
          <ul className="req-card-statuses" aria-label={tr('Task theo trạng thái')}>
            {f.statuses.map((s) => (
              <li key={s.id} className="tag">
                {s.name} <b>{s.count}</b>
              </li>
            ))}
          </ul>
          <ul className="req-card-people" aria-label={tr('Task theo người làm')}>
            {shown.map((p) => (
              <li key={p.id} title={tr('{name}: {count} task', { name: p.name, count: p.count })}>
                <Avatar name={p.name} userId={p.id} small />
                <span className="req-card-count">{p.count}</span>
              </li>
            ))}
            {hidden.length > 0 && (
              <li className="muted small" title={hidden.map((p) => `${p.name}: ${p.count}`).join('\n')}>
                +{hidden.length}
              </li>
            )}
            {f.unassigned > 0 && <li className="muted small">{tr('Chưa giao: {n}', { n: f.unassigned })}</li>}
          </ul>
        </>
      )}
    </article>
  );
}

export default function RequirementCards({ project, requirements, tasks, sections, canEdit, onChanged, onOpen, onDetails }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  async function add(e) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await api(`/projects/${project.id}/requirements`, { method: 'POST', body: { title: title.trim() } });
      setTitle('');
      setAdding(false);
      setError('');
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="req-cards-page">
      <div className="section-header">
        <h2>
          {tr('Các dự án')} <span className="muted">{requirements.length}</span>
        </h2>
        <span className="grow" />
        {canEdit && !adding && (
          <button className="btn primary small" onClick={() => setAdding(true)}>
            {tr('+ Thêm dự án')}
          </button>
        )}
      </div>
      {adding && (
        <form className="member-form req-card-add" onSubmit={add}>
          <input
            autoFocus
            value={title}
            placeholder={tr('Tiêu đề dự án')}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
          />
          <button className="btn primary" disabled={!title.trim()}>
            {tr('Thêm')}
          </button>
          <button type="button" className="link-btn" onClick={() => setAdding(false)}>
            {tr('Huỷ')}
          </button>
        </form>
      )}
      {error && (
        <div className="error" onClick={() => setError('')}>
          {error} {tr('(bấm để ẩn)')}
        </div>
      )}
      {requirements.length === 0 ? (
        <p className="muted">
          {canEdit
            ? tr('Hoạt động chưa có dự án. Tạo dự án đầu tiên rồi mới thêm được task.')
            : tr('Hoạt động chưa có dự án. Owner, Leader của team phụ trách hoặc Manager sẽ tạo dự án.')}
        </p>
      ) : (
        <div className="req-cards">
          {requirements.map((r) => (
            <RequirementCard
              key={r.id}
              requirement={r}
              figures={cardFigures(r, tasks, sections)}
              onOpen={() => onOpen(r.id)}
              onDetails={() => onDetails(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
