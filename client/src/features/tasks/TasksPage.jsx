import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import { daysFromToday, myTeamsLabel, todayStr } from '../../utils.js';
import CalendarView from '../projects/CalendarView.jsx';
import { Avatar } from '../../components/Avatar.jsx';
import { CheckButton, DueDate, PriorityTag, TaskTags } from '../../components/TaskParts.jsx';
import { useChannels } from '../../components/hooks.js';
import { tr } from '../../i18n.js';

const BUCKETS = [
  ['overdue', () => tr('Quá hạn')],
  ['today', () => tr('Hôm nay')],
  ['week', () => tr('7 ngày tới')],
  ['later', () => tr('Sau đó')],
  ['none', () => tr('Không có hạn')],
  ['done', () => tr('Đã xong')],
];

function bucketOf(task) {
  if (task.completed) return 'done';
  if (!task.due_date) return 'none';
  const today = todayStr();
  if (task.due_date < today) return 'overdue';
  if (task.due_date === today) return 'today';
  if (task.due_date <= daysFromToday(7)) return 'week';
  return 'later';
}

// Scope values: 'me', 'all', 'mine' (all of a Leader's teams), 'team:<id>', 'user:<id>'.
function scopeQuery(scope) {
  if (scope === 'me') return 'assignee=me';
  if (scope === 'all') return 'all=1';
  if (scope === 'mine') return 'mine=1';
  const [kind, id] = scope.split(':');
  return kind === 'team' ? `team=${id}` : `assignee=${id}`;
}

// mode 'my': the signed-in user's tasks. mode 'team': Leaders watch their teams, Managers everyone.
// layout: 'list' or 'calendar'; onScopeChange / onLayoutChange keep the choice in the URL.
// initialChannel / onChannelChange: the channel filter, also kept in the URL.
export default function TasksPage({
  user,
  mode,
  initialScope,
  initialLayout = 'list',
  onScopeChange,
  onLayoutChange,
  initialChannel = '',
  onChannelChange,
  refreshKey,
  onOpenTask,
}) {
  const watching = mode === 'team';
  const [scope, setScope] = useState(
    initialScope ?? (watching ? (user.role === 'manager' ? 'all' : 'mine') : 'me')
  );
  const [people, setPeople] = useState([]);
  const [teams, setTeams] = useState([]);
  const [allTasks, setTasks] = useState(null);
  const channels = useChannels();
  const [channel, setChannel] = useState(initialChannel);
  const tasks = channel ? allTasks?.filter((t) => t.channels.some((c) => c.id === Number(channel))) : allTasks;
  const [showDone, setShowDone] = useState(false);
  const [layout, setLayout] = useState(initialLayout);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!watching) return;
    api('/people').then(setPeople).catch(() => {});
    if (user.role === 'manager') api('/teams').then(setTeams).catch(() => {});
  }, [watching, user.role]);

  const load = useCallback(
    () =>
      api(`/tasks?${scopeQuery(scope)}`)
        .then(setTasks)
        .catch((e) => setError(e.message)),
    [scope]
  );

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function toggle(task) {
    try {
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: { completed: !task.completed } });
    } catch (e) {
      setError(e.message);
    }
    load();
  }

  const title = !watching ? tr('Task của tôi') : user.role === 'manager' ? tr('Theo dõi công việc') : myTeamsLabel(user);
  // Team names next to people when they may come from several teams.
  const showPeopleTeams = user.role === 'manager' || user.teams.length > 1;
  const counts = Object.fromEntries(BUCKETS.map(([key]) => [key, 0]));
  tasks?.forEach((t) => counts[bucketOf(t)]++);
  const showAssignee = scope !== 'me' && !scope.startsWith('user:');

  return (
    <div className="project">
      <header className="project-header">
        <h1>{title}</h1>
        <span className="grow" />
        {watching && (
          <select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              onScopeChange(e.target.value);
            }}
          >
            {user.role === 'manager' ? (
              <>
                <option value="all">{tr('Tất cả task')}</option>
                {teams.map((t) => (
                  <option key={t.id} value={`team:${t.id}`}>
                    Team {t.name}
                  </option>
                ))}
              </>
            ) : (
              <>
                <option value="mine">{user.teams.length > 1 ? tr('Tất cả team của tôi') : tr('Cả {p0}', { p0: myTeamsLabel(user) })}</option>
                {user.teams.length > 1 &&
                  user.teams.map((t) => (
                    <option key={t.id} value={`team:${t.id}`}>
                      Team {t.name}
                    </option>
                  ))}
              </>
            )}
            <optgroup label={tr('Theo người')}>
              {people.map((p) => (
                <option key={p.id} value={`user:${p.id}`}>
                  {p.name}
                  {showPeopleTeams && p.team_name ? ` · ${p.team_name}` : ''}
                </option>
              ))}
            </optgroup>
          </select>
        )}
      </header>

      <div className="toolbar stats">
        <span className="stat overdue-stat">
          {tr('Quá hạn')} <b>{counts.overdue}</b>
        </span>
        <span className="stat">
          {tr('Hôm nay')} <b>{counts.today}</b>
        </span>
        <span className="stat">
          {tr('Chưa xong')} <b>{(tasks?.length ?? 0) - counts.done}</b>
        </span>
        <span className="stat">
          {tr('Đã xong')} <b>{counts.done}</b>
        </span>
        <span className="grow" />
        {channels.length > 0 && (
          <select
            value={channel}
            onChange={(e) => {
              setChannel(e.target.value);
              onChannelChange(e.target.value);
            }}
            aria-label={tr('Lọc theo kênh')}
          >
            <option value="">{tr('Mọi kênh')}</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <label className="checkbox">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> {tr('Hiện task đã xong')}
        </label>
        <div className="tabs">
          {[
            ['list', tr('Danh sách')],
            ['calendar', tr('Lịch')],
          ].map(([value, label]) => (
            <button
              key={value}
              className={layout === value ? 'active' : ''}
              onClick={() => {
                setLayout(value);
                onLayoutChange(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="error banner" onClick={() => setError('')}>
          {error} {tr('(bấm để ẩn)')}
        </div>
      )}

      {layout === 'calendar' && tasks ? (
        <CalendarView
          tasks={tasks.filter((t) => showDone || !t.completed)}
          canEditTask={(t) => Boolean(t.can_edit)}
          onOpen={onOpenTask}
          onMoveDate={async (task, dueDate) => {
            setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, due_date: dueDate } : t)));
            try {
              await api(`/tasks/${task.id}`, { method: 'PATCH', body: { due_date: dueDate } });
            } catch (e) {
              setError(e.message);
            }
            load();
          }}
          showProject
        />
      ) : (
      <div className="list">
        {!tasks ? (
          <p className="muted">{tr('Đang tải…')}</p>
        ) : (
          <>
            <div className={`list-row list-head ${showAssignee ? 'with-assignee' : 'personal'}`}>
              <span>{tr('Tên task')}</span>
              <span>Project</span>
              {showAssignee && <span>{tr('Người làm')}</span>}
              <span>{tr('Hạn chót')}</span>
              <span>{tr('Ưu tiên')}</span>
            </div>
            {BUCKETS.filter(([key]) => key !== 'done' || showDone).map(([key, label]) => {
              const rows = tasks.filter((t) => bucketOf(t) === key);
              if (!rows.length) return null;
              return (
                <section key={key} className="list-section">
                  <div className="section-header">
                    <span className={`section-name ${key === 'overdue' ? 'overdue' : ''}`}>{label()}</span>
                    <span className="muted">{rows.length}</span>
                  </div>
                  {rows.map((t) => (
                    <div
                      key={t.id}
                      className={`list-row ${showAssignee ? 'with-assignee' : 'personal'}`}
                      onClick={() => onOpenTask(t.id)}
                    >
                      <span className={`list-title ${t.completed ? 'done' : ''}`}>
                        <CheckButton checked={Boolean(t.completed)} disabled={!t.can_edit} onClick={() => toggle(t)} />
                        <span className="ellipsis">{t.title}</span>
                        <TaskTags task={t} />
                        {t.subtask_count > 0 && (
                          <small className="muted">
                            ☑ {t.subtask_done}/{t.subtask_count}
                          </small>
                        )}
                        {t.comment_count > 0 && <small className="muted">💬 {t.comment_count}</small>}
                      </span>
                      <span className="cell">
                        <span className="dot" style={{ background: t.project_color }} />
                        <span className="project-cell">
                          <span className="ellipsis">{t.project_name}</span>
                          {t.requirement_title && <span className="muted small ellipsis">{t.requirement_title}</span>}
                        </span>
                      </span>
                      {showAssignee && (
                        <span className="cell">
                          {t.assignee_name ? (
                            <>
                              <Avatar name={t.assignee_name} userId={t.assignee_id} small />
                              <span className="ellipsis">{t.assignee_name}</span>
                            </>
                          ) : (
                            <span className="muted">{tr('Chưa giao')}</span>
                          )}
                        </span>
                      )}
                      <span>
                        <DueDate task={t} empty="—" />
                      </span>
                      <span>
                        <PriorityTag value={t.priority} />
                      </span>
                    </div>
                  ))}
                </section>
              );
            })}
            {tasks.length - (showDone ? 0 : counts.done) === 0 && (
              <p className="center-text muted">{showDone ? tr('Không có task nào. 🎉') : tr('Không có task nào đang mở. 🎉')}</p>
            )}
          </>
        )}
      </div>
      )}
    </div>
  );
}
