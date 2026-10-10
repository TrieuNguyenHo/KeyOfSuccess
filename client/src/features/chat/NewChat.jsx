import { useState } from 'react';
import { useFetched } from '../../components/hooks.js';
import { tr } from '../../i18n.js';
import { PeopleList } from './ChatParts.jsx';

const roomsOf = (data) => (Array.isArray(data) ? { projects: [], teams: [] } : data); // useFetched starts with []

// "+ Tin nhắn mới": a person (one-to-one), a new group (name + people), or the chat of a project or team.
// onDirect(person), onGroup({ title, user_ids }), onRoom(kind, id), onCancel().
export default function NewChat({ onDirect, onGroup, onRoom, onCancel }) {
  const [tab, setTab] = useState('person');
  const people = useFetched('/chats/people');
  const rooms = roomsOf(useFetched(tab === 'room' ? '/chats/rooms' : null));
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState(new Set());

  const toggle = (p) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      return next;
    });

  return (
    <div className="chat-picker">
      <div className="chat-thread-head">
        <button className="link-btn chat-back" onClick={onCancel}>
          {tr('← Quay lại')}
        </button>
        <h2 className="grow">{tr('Tin nhắn mới')}</h2>
        <button className="icon-btn" onClick={onCancel} aria-label={tr('Đóng')}>
          ✕
        </button>
      </div>
      <div className="tabs chat-picker-tabs" role="tablist">
        {[
          ['person', tr('Một người')],
          ['group', tr('Nhóm mới')],
          ['room', tr('Hoạt động / Team')],
        ].map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'person' && <PeopleList people={people} onPick={onDirect} />}

      {tab === 'group' && (
        <>
          <form
            className="chat-group-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim() && selected.size) onGroup({ title: title.trim(), user_ids: [...selected] });
            }}
          >
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('Tên nhóm')} aria-label={tr('Tên nhóm')} maxLength={80} />
            <button className="btn primary small" disabled={!title.trim() || !selected.size}>
              {selected.size ? tr('Tạo nhóm ({count} người)', { count: selected.size }) : tr('Tạo nhóm')}
            </button>
          </form>
          <PeopleList people={people} selected={selected} onPick={toggle} />
        </>
      )}

      {tab === 'room' && (
        <ul className="chat-list">
          {rooms.teams.length > 0 && <li className="chat-list-label">{tr('Team của bạn')}</li>}
          {rooms.teams.map((t) => (
            <li key={`t${t.id}`}>
              <button className="chat-row" onClick={() => onRoom('team', t.id)}>
                <span className="chat-room-icon team" aria-hidden="true">
                  👥
                </span>
                <span className="ellipsis chat-row-name">{tr('Team {name}', { name: t.name })}</span>
              </button>
            </li>
          ))}
          {rooms.projects.length > 0 && <li className="chat-list-label">{tr('Hoạt động')}</li>}
          {rooms.projects.map((p) => (
            <li key={`p${p.id}`}>
              <button className="chat-row" onClick={() => onRoom('project', p.id)}>
                <span className="chat-room-icon" aria-hidden="true">
                  <span className="dot" style={{ background: p.color }} />
                </span>
                <span className="ellipsis chat-row-name">{p.name}</span>
              </button>
            </li>
          ))}
          {!rooms.teams.length && !rooms.projects.length && <li className="muted chat-note">{tr('Bạn chưa có team hay hoạt động nào.')}</li>}
        </ul>
      )}
    </div>
  );
}
