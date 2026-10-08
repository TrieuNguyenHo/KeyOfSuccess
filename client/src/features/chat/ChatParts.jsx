import { useState } from 'react';
import { Avatar } from '../../components/Avatar.jsx';
import { SearchBox } from '../../components/Controls.jsx';
import { tr } from '../../i18n.js';

// Accent-insensitive, so "duc" finds "Đức".
const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

export const personLine = (p) => [p.role_name, p.team_name].filter(Boolean).join(' · ');

// What a conversation is called: the other person, the group's name, the project, or "Team <name>".
export function chatTitle(chat) {
  if (chat.kind === 'direct') return chat.other?.name ?? tr('Người dùng đã xoá');
  if (chat.kind === 'team') return tr('Team {name}', { name: chat.title });
  return chat.title;
}

// The picture of a conversation: the person; a project's color; a team or group mark.
export function ChatAvatar({ chat }) {
  if (chat.kind === 'direct') return <Avatar name={chat.other?.name ?? '?'} userId={chat.other?.id} small />;
  if (chat.kind === 'project') {
    return (
      <span className="chat-room-icon" aria-hidden="true">
        <span className="dot" style={{ background: chat.project.color }} />
      </span>
    );
  }
  return (
    <span className={`chat-room-icon ${chat.kind}`} aria-hidden="true">
      {chat.kind === 'team' ? '👥' : chat.title.trim().charAt(0).toUpperCase()}
    </span>
  );
}

// A searchable list of people. With `selected` (a Set of ids) each row is a checkbox and onPick toggles it;
// without, a click picks the person.
export function PeopleList({ people, selected, onPick }) {
  const [query, setQuery] = useState('');
  const shown = people.filter((p) => fold(`${p.name} ${p.team_name ?? ''}`).includes(fold(query.trim())));
  return (
    <>
      <div className="chat-picker-search">
        <SearchBox value={query} onChange={setQuery} placeholder={tr('Tìm theo tên hoặc team')} label={tr('Tìm người')} wide />
      </div>
      <ul className="chat-list">
        {shown.map((p) => (
          <li key={p.id}>
            <button
              className={`chat-row ${selected?.has(p.id) ? 'active' : ''}`}
              onClick={() => onPick(p)}
              {...(selected && { role: 'checkbox', 'aria-checked': selected.has(p.id) })}
            >
              {selected && <span className={`chat-check ${selected.has(p.id) ? 'on' : ''}`} aria-hidden="true" />}
              <Avatar name={p.name} userId={p.id} small />
              <span className="chat-row-main">
                <span className="ellipsis chat-row-name">{p.name}</span>
                <span className="muted small ellipsis">{personLine(p)}</span>
              </span>
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="muted chat-note">{tr('Không tìm thấy ai.')}</li>}
      </ul>
    </>
  );
}
