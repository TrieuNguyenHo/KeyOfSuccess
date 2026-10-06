import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { EMPTY_FILTERS, daysFromToday, isOverdue, todayStr } from '../../utils.js';
import BoardView from './BoardView.jsx';
import CalendarView from './CalendarView.jsx';
import ListView from './ListView.jsx';
import MembersPanel from './MembersPanel.jsx';
import RequirementsPanel from '../requirements/RequirementsPanel.jsx';
import { askConfirm, askText } from '../../components/Dialog.jsx';
import { Avatar } from '../../components/Avatar.jsx';
import { SearchBox, TeamPills, teamsLabel } from '../../components/Controls.jsx';
import { useAllTeams, useChannels } from '../../components/hooks.js';
import { tr } from '../../i18n.js';

function matchesFilters(task, filters) {
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

// initialTab / initialRequirementId let a notification open a requirement directly; with the board tab,
// initialRequirementId filters the board to that requirement instead. initialFilters come from the URL.
// onShownChange({ tab, filters }) reports what is shown, so the URL keeps it.
export default function ProjectView({
  projectId,
  user,
  refreshKey,
  initialTab = 'board',
  initialRequirementId,
  initialFilters,
  onOpenTask,
  onShownChange,
  onOpenRequirementPage,
  onProjectChanged,
  onProjectDeleted,
}) {
  const [data, setData] = useState(null);
  const [view, setView] = useState(initialTab);
  const [filters, setFilters] = useState(
    initialFilters ??
      (initialTab === 'board' && initialRequirementId ? { ...EMPTY_FILTERS, requirement: String(initialRequirementId) } : EMPTY_FILTERS)
  );
  const [showMembers, setShowMembers] = useState(false);
  const [error, setError] = useState('');
  const isManager = user.role === 'manager';

  // All teams: the Manager's team picker and the team-label filter.
  const teams = useAllTeams();
  const channels = useChannels();

  useEffect(() => {
    onShownChange({ tab: view, filters });
    // Only changes of what is shown matter, not a new callback identity.
  }, [view, filters]);

  const reload = useCallback(
    () =>
      api(`/projects/${projectId}`)
        .then(setData)
        .catch((e) => setError(e.message)),
    [projectId]
  );

  // refreshKey changes when the shared task panel edits something.
  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  async function act(fn) {
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
    await reload();
  }

  if (!data) return <div className="center muted">{error || tr('Đang tải…')}</div>;
  const { project, members, sections, tasks, requirements } = data;
  // 'manage' (owner or the team's Leader), 'edit' (member) or 'view' (Manager outside the project).
  const canManage = project.access === 'manage';
  // task_admin: a Manager or Leader of a team taking part in the project (full rights on tasks and sections).
  // Other members add tasks for themselves and edit only the tasks assigned to them.
  const taskAdmin = project.task_admin;
  const readOnly = !taskAdmin && project.access === 'view';
  const canEditTask = (task) => taskAdmin || (!readOnly && task.assignee_id === user.id);
  const canEditRequirements = canManage || isManager;

  const actions = {
    onOpen: onOpenTask,
    onToggle: (task) => act(() => api(`/tasks/${task.id}`, { method: 'PATCH', body: { completed: !task.completed } })),
    onAddTask: (sectionId, title, requirementId) =>
      act(() => api('/tasks', { method: 'POST', body: { section_id: sectionId, requirement_id: requirementId, title } })),
    onAddSection: async () => {
      const name = await askText({ title: tr('Thêm trạng thái'), label: tr('Tên trạng thái'), placeholder: tr('Ví dụ: Review'), confirmLabel: tr('Thêm') });
      if (name) act(() => api(`/projects/${projectId}/sections`, { method: 'POST', body: { name } }));
    },
    onRenameSection: async (section) => {
      const name = await askText({ title: tr('Đổi tên trạng thái'), label: tr('Tên trạng thái'), initial: section.name });
      if (name) act(() => api(`/sections/${section.id}`, { method: 'PATCH', body: { name } }));
    },
    onDeleteSection: async (section) => {
      const ok = await askConfirm({
        title: tr('Xoá trạng thái "{name}"?', { name: section.name }),
        message: tr('Toàn bộ task đang ở trạng thái này cũng sẽ bị xoá. Không hoàn tác được.'),
        confirmLabel: tr('Xoá trạng thái'),
        danger: true,
      });
      if (ok) act(() => api(`/sections/${section.id}`, { method: 'DELETE' }));
    },
    // Calendar drag: shows the new date at once, then saves it.
    onMoveDate: (task, dueDate) => {
      setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === task.id ? { ...t, due_date: dueDate } : t)) }));
      act(() => api(`/tasks/${task.id}`, { method: 'PATCH', body: { due_date: dueDate } }));
    },
    // Fractional positions: a moved task lands halfway between its new neighbours.
    onMove: (taskId, sectionId, beforeId) => {
      if (taskId === beforeId) return;
      const column = tasks.filter((t) => t.section_id === sectionId && t.id !== taskId);
      let position;
      const index = beforeId == null ? -1 : column.findIndex((t) => t.id === beforeId);
      if (index === -1) {
        position = column.length ? column[column.length - 1].position + 1 : 1;
      } else {
        const prev = column[index - 1];
        position = prev ? (prev.position + column[index].position) / 2 : column[index].position - 1;
      }
      // The server ticks a task moved into the done status and unticks one moved out; show it at once.
      const doneId = sections.find((s) => s.kind === 'done')?.id;
      setData((d) => ({
        ...d,
        tasks: d.tasks
          .map((t) =>
            t.id === taskId
              ? { ...t, section_id: sectionId, position, completed: doneId == null ? t.completed : Number(sectionId === doneId) }
              : t
          )
          .sort((a, b) => a.position - b.position),
      }));
      act(() => api(`/tasks/${taskId}`, { method: 'PATCH', body: { section_id: sectionId, position } }));
    },
  };

  async function renameProject() {
    const name = await askText({ title: tr('Đổi tên project'), label: tr('Tên project'), initial: project.name });
    if (!name) return;
    await act(() => api(`/projects/${projectId}`, { method: 'PATCH', body: { name } }));
    onProjectChanged();
  }

  async function changeTeams(teamIds) {
    await act(() => api(`/projects/${projectId}`, { method: 'PATCH', body: { team_ids: teamIds } }));
    onProjectChanged();
  }

  async function deleteProject() {
    const ok = await askConfirm({
      title: tr('Xoá project "{name}"?', { name: project.name }),
      message: tr('Toàn bộ requirement, trạng thái và task của project sẽ bị xoá. Không hoàn tác được.'),
      confirmLabel: tr('Xoá project'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/projects/${projectId}`, { method: 'DELETE' });
      onProjectDeleted();
    } catch (e) {
      setError(e.message);
    }
  }

  const setFilter = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });
  const visibleTasks = tasks.filter((t) => matchesFilters(t, filters));
  const filtering = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  // New tasks go to the filtered requirement, else the first one; the add form lets people change it.
  const taskViewProps = {
    requirements,
    defaultRequirementId: Number(filters.requirement) || requirements[0]?.id,
    onOpenRequirements: () => setView('requirements'),
  };

  return (
    <div className="project">
      <header className="project-header">
        {/* Two blocks that wrap as wholes on narrow screens: the name with its actions, then members and views. */}
        <div className="project-title">
          <span className="dot lg" style={{ background: project.color }} />
          <h1>{project.name}</h1>
          {isManager ? (
            <details className="team-picker">
              <summary title={tr('{p0} · bấm để đổi team phụ trách', { p0: teamsLabel(project.teams) })}>{teamsLabel(project.teams)} ▾</summary>
              <div className="team-picker-menu">
                <TeamPills teams={teams} selected={project.teams.map((t) => t.id)} onChange={changeTeams} />
              </div>
            </details>
          ) : (
            <span className="tag team-tag" title={teamsLabel(project.teams)}>
              {teamsLabel(project.teams)}
            </span>
          )}
          {canManage && (
            <>
              <button className="icon-btn" onClick={renameProject} title={tr('Đổi tên project')}>
                ✎
              </button>
              <button className="icon-btn danger" onClick={deleteProject} title={tr('Xoá project')}>
                🗑
              </button>
            </>
          )}
        </div>
        <div className="project-header-actions">
          <button className="members-btn" onClick={() => setShowMembers(true)} title={tr('Thành viên')}>
            <span className="avatar-stack">
              {members.slice(0, 4).map((m) => (
                <Avatar key={m.id} name={m.name} userId={m.id} small />
              ))}
            </span>
            {tr('{count} thành viên', { count: members.length })}
          </button>
          {/* Two groups: the requirements and calendar views, and the List / Board layouts of the task list. */}
          <div className="tab-groups">
            <div className="tabs" role="group" aria-label={tr('Requirements và lịch')}>
              <button className={view === 'requirements' ? 'active' : ''} onClick={() => setView('requirements')}>
                Requirements<span className="tab-count">{requirements.length}</span>
              </button>
              <button className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}>
                {tr('Lịch')}
              </button>
            </div>
            <div className="tabs" role="group" aria-label={tr('Kiểu xem task')}>
              <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
                List
              </button>
              <button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>
                Board
              </button>
            </div>
          </div>
        </div>
      </header>

      {view === 'requirements' ? (
        <>
          {error && (
            <div className="error banner" onClick={() => setError('')}>
              {error} {tr('(bấm để ẩn)')}
            </div>
          )}
          <RequirementsPanel
            project={project}
            requirements={requirements}
            tasks={tasks}
            canEdit={canEditRequirements}
            initialRequirementId={initialRequirementId}
            onChanged={reload}
            onOpenTask={onOpenTask}
            onOpenRequirementPage={onOpenRequirementPage}
            onShowOnBoard={(requirementId) => {
              setFilters({ ...EMPTY_FILTERS, requirement: String(requirementId) });
              setView('board');
            }}
          />
        </>
      ) : (
        <>
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

          {error && (
            <div className="error banner" onClick={() => setError('')}>
              {error} {tr('(bấm để ẩn)')}
            </div>
          )}

          {readOnly ? (
            <div className="readonly-banner">{tr('Bạn đang xem project này ở chế độ chỉ xem. Mở một task để comment.')}</div>
          ) : (
            !taskAdmin && (
              <div className="readonly-banner">
                {project.can_add_tasks
                  ? tr('Bạn thêm được task cho mình và sửa task được giao cho bạn. Giao việc, xoá task và sửa trạng thái do Manager hoặc Leader của team phụ trách làm.')
                  : tr('Bạn không thuộc team phụ trách project nên chỉ xem và comment; task chỉ giao cho người của team phụ trách. Cần làm việc ở đây thì nhờ Manager thêm team của bạn vào project.')}
              </div>
            )
          )}

          {view === 'calendar' ? (
            <CalendarView
              tasks={visibleTasks.filter((t) => !t.parent_id)}
              canEditTask={canEditTask}
              onOpen={onOpenTask}
              onMoveDate={actions.onMoveDate}
            />
          ) : view === 'board' ? (
            <BoardView
              sections={sections}
              tasks={visibleTasks}
              readOnly={!project.can_add_tasks}
              canManageSections={taskAdmin}
              canEditTask={canEditTask}
              {...taskViewProps}
              {...actions}
            />
          ) : (
            <ListView
              sections={sections}
              tasks={visibleTasks}
              readOnly={!project.can_add_tasks}
              canManageSections={taskAdmin}
              canEditTask={canEditTask}
              {...taskViewProps}
              {...actions}
            />
          )}
        </>
      )}

      {showMembers && (
        <MembersPanel
          project={project}
          members={members}
          currentUser={user}
          canManage={canManage}
          onClose={() => setShowMembers(false)}
          onChanged={reload}
          onLeft={onProjectDeleted}
        />
      )}
    </div>
  );
}
