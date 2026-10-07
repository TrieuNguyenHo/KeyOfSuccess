import { can, scopeOf } from '../../utils.js';
import { Avatar } from '../../components/Avatar.jsx';
import { TeamPills, teamsLabel } from '../../components/Controls.jsx';
import { tr } from '../../i18n.js';

// A project's name with its teams (a picker for projects.change_teams) and, for 'manage' access, rename and delete;
// then its members and the view tabs.
export default function ProjectHeader({
  project,
  user,
  teams,
  members,
  requirementCount,
  view,
  onView,
  onRename,
  onDelete,
  onChangeTeams,
  onShowMembers,
}) {
  const changesTeams = can(user, 'projects.change_teams');
  const canManage = project.access === 'manage';
  return (
    <header className="project-header">
      {/* Two blocks that wrap as wholes on narrow screens: the name with its actions, then members and views. */}
      <div className="project-title">
        <span className="dot lg" style={{ background: project.color }} />
        <h1>{project.name}</h1>
        {changesTeams ? (
          <details className="team-picker">
            <summary title={tr('{p0} · bấm để đổi team phụ trách', { p0: teamsLabel(project.teams) })}>{teamsLabel(project.teams)} ▾</summary>
            <div className="team-picker-menu">
              {/* With projects.change_teams 'team', only the user's own teams are offered; the others stay. */}
              {scopeOf(user, 'projects.change_teams') === 'team' ? (
                <TeamPills
                  teams={teams.filter((t) => user.team_ids.includes(t.id))}
                  selected={project.teams.map((t) => t.id)}
                  onChange={onChangeTeams}
                  noneLabel={null}
                />
              ) : (
                <TeamPills teams={teams} selected={project.teams.map((t) => t.id)} onChange={onChangeTeams} />
              )}
            </div>
          </details>
        ) : (
          <span className="tag team-tag" title={teamsLabel(project.teams)}>
            {teamsLabel(project.teams)}
          </span>
        )}
        {canManage && (
          <>
            <button className="icon-btn" onClick={onRename} title={tr('Đổi tên project')}>
              ✎
            </button>
            <button className="icon-btn danger" onClick={onDelete} title={tr('Xoá project')}>
              🗑
            </button>
          </>
        )}
      </div>
      <div className="project-header-actions">
        <button className="members-btn" onClick={onShowMembers} title={tr('Thành viên')}>
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
            <button className={view === 'requirements' ? 'active' : ''} onClick={() => onView('requirements')}>
              Requirements<span className="tab-count">{requirementCount}</span>
            </button>
            <button className={view === 'calendar' ? 'active' : ''} onClick={() => onView('calendar')}>
              {tr('Lịch')}
            </button>
          </div>
          <div className="tabs" role="group" aria-label={tr('Kiểu xem task')}>
            <button className={view === 'list' ? 'active' : ''} onClick={() => onView('list')}>
              List
            </button>
            <button className={view === 'board' ? 'active' : ''} onClick={() => onView('board')}>
              Board
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
