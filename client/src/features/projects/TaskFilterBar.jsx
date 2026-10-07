import { EMPTY_FILTERS, daysFromToday, isOverdue, todayStr } from '../../utils.js';
import { SearchBox } from '../../components/Controls.jsx';
import { tr } from '../../i18n.js';

// The Board / List / Calendar filters (EMPTY_FILTERS when nothing is filtered; kept on the URL by the Workspace).
export function matchesFilters(task, filters) {
  // The team of the assignee, as the task's team tags show it.
  if (filters.team && !(task.assignee_teams ?? []).some((t) => t.id === Number(filters.team))) return false;
  if (filters.channel && !(task.channels ?? []).some((c) => c.id === Number(filters.channel))) return false;
  if (filters.requirement && task.requirement_id !== Number(filters.requirement)) return false;
  const q = filters.q.trim().toLowerCase();
  if (q && !task.title.toLowerCase().includes(q) && !(task.description ?? '').toLowerCase().includes(q)) return false;
  if (filters.assignee === 'none' && task.assignee_id != null) return false;
  if (filters.assignee && filters.assignee !== 'none' && task.assignee_id !== Number(filters.assignee)) return false;
  // "s<id>": one status, i.e. one board column (section).
  if (/^s\d+$/.test(filters.status) && task.section_id !== Number(filters.status.slice(1))) return false;
  if (filters.due === 'overdue' && !isOverdue(task)) return false;
  if (filters.due === 'week' && !(task.due_date && task.due_date >= todayStr() && task.due_date <= daysFromToday(7))) {
    return false;
  }
  if (filters.due === 'none' && task.due_date) return false;
  return true;
}

export default function TaskFilterBar({ filters, setFilters, requirements, teams, channels, members, sections }) {
  const setFilter = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });
  const filtering = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  return (
    <div className="toolbar">
      <select value={filters.requirement} onChange={setFilter('requirement')} aria-label={tr('Lọc theo requirement')}>
        <option value="">{tr('Mọi requirement')}</option>
        {requirements.map((r) => (
          <option key={r.id} value={r.id}>
            {r.title}
          </option>
        ))}
      </select>
      <select value={filters.team} onChange={setFilter('team')} aria-label={tr('Lọc theo team của người làm')}>
        <option value="">{tr('Mọi team')}</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            Team {t.name}
          </option>
        ))}
      </select>
      <select value={filters.channel} onChange={setFilter('channel')} aria-label={tr('Lọc theo kênh')}>
        <option value="">{tr('Mọi kênh')}</option>
        {channels.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select value={filters.assignee} onChange={setFilter('assignee')}>
        <option value="">{tr('Mọi người')}</option>
        <option value="none">{tr('Chưa giao')}</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <select value={filters.status} onChange={setFilter('status')}>
        <option value="all">{tr('Mọi trạng thái')}</option>
        {sections.map((s) => (
          <option key={s.id} value={`s${s.id}`}>
            {s.name}
          </option>
        ))}
      </select>
      <select value={filters.due} onChange={setFilter('due')}>
        <option value="all">{tr('Mọi hạn chót')}</option>
        <option value="overdue">{tr('Quá hạn')}</option>
        <option value="week">{tr('Trong 7 ngày tới')}</option>
        <option value="none">{tr('Không có hạn')}</option>
      </select>
      <SearchBox value={filters.q} onChange={setFilter('q')} placeholder={tr('Tìm task…')} label={tr('Tìm task')} />
      {filtering && (
        <button className="link-btn" onClick={() => setFilters(EMPTY_FILTERS)}>
          {tr('Xoá bộ lọc')}
        </button>
      )}
    </div>
  );
}
