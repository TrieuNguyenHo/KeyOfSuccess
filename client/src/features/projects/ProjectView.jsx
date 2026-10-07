import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { EMPTY_FILTERS, coversTeams } from '../../utils.js';
import BoardView from './BoardView.jsx';
import CalendarView from './CalendarView.jsx';
import ListView from './ListView.jsx';
import MembersPanel from './MembersPanel.jsx';
import ProjectHeader from './ProjectHeader.jsx';
import TaskFilterBar, { matchesFilters } from './TaskFilterBar.jsx';
import RequirementsPanel from '../requirements/RequirementsPanel.jsx';
import { askConfirm, askText } from '../../components/Dialog.jsx';
import { ErrorBanner } from '../../components/Controls.jsx';
import { useAllTeams, useChannels } from '../../components/hooks.js';
import { tr } from '../../i18n.js';

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
  const canEditRequirements =
    canManage || coversTeams(user, 'requirements.manage', project.teams.map((t) => t.id));

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

  const visibleTasks = tasks.filter((t) => matchesFilters(t, filters));
  // New tasks go to the filtered requirement, else the first one; the add form lets people change it.
  const taskViewProps = {
    requirements,
    defaultRequirementId: Number(filters.requirement) || requirements[0]?.id,
    onOpenRequirements: () => setView('requirements'),
  };

  return (
    <div className="project">
      <ProjectHeader
        project={project}
        user={user}
        teams={teams}
        members={members}
        requirementCount={requirements.length}
        view={view}
        onView={setView}
        onRename={renameProject}
        onDelete={deleteProject}
        onChangeTeams={changeTeams}
        onShowMembers={() => setShowMembers(true)}
      />

      {view === 'requirements' ? (
        <>
          <ErrorBanner error={error} onClose={() => setError('')} />
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
          <TaskFilterBar
            filters={filters}
            setFilters={setFilters}
            requirements={requirements}
            teams={teams}
            channels={channels}
            members={members}
            sections={sections}
          />

          <ErrorBanner error={error} onClose={() => setError('')} />

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
