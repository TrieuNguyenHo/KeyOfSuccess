import TeamMembers from './TeamMembers.jsx';
import { tr } from '../../i18n.js';

// Leaders manage the members of each of their teams: add people without a team, approve self sign-ups,
// invite new emails (waiting for a Manager) and remove Members.
// onChanged refreshes the menu's count of accounts waiting for approval.
export default function MyTeamsPage({ user, onChanged }) {
  return (
    <div className="project">
      <header className="project-header">
        <h1>{tr('Quản lý team')}</h1>
      </header>
      <div className="list admin">
        {user.teams.map((team) => (
          <section key={team.id} className="admin-card team-card">
            <h2>Team {team.name}</h2>
            <TeamMembers team={team} user={user} onChanged={onChanged} />
          </section>
        ))}
        {user.teams.length === 0 && <p className="muted">{tr('Bạn chưa thuộc team nào. Nhờ Manager xếp team cho bạn.')}</p>}
      </div>
    </div>
  );
}
