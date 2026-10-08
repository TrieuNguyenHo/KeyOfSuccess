import { useCallback, useContext, useEffect, useState } from 'react';
import { api, onChatChange } from '../../api.js';
import { Avatar } from '../../components/Avatar.jsx';
import { ErrorBanner, SearchBox } from '../../components/Controls.jsx';
import { CurrentUser } from '../../components/CurrentUser.js';
import { useFetched } from '../../components/hooks.js';
import { locale, tr } from '../../i18n.js';
import ChatThread, { parseTime } from './ChatThread.jsx';

// Accent-insensitive, so "duc" finds "Đức".
const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

// Today: the time; earlier: the day.
function shortTime(s) {
  const d = parseTime(s);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' });
}

function preview(chat, me) {
  const last = chat.last_message;
  if (!last) return '';
  if (last.deleted_at) return tr('Tin nhắn đã bị xoá');
  const text = last.body || (last.has_files ? tr('📎 File') : '');
  return last.user_id === me.id ? tr('Bạn: {text}', { text }) : text;
}

const personLine = (p) => [p.role_name, p.team_name].filter(Boolean).join(' · ');

// "Tin nhắn" (#/chat, #/chat/4): one-to-one conversations with the other people at work (v32). Private to their two
// members. Unread messages count on the menu, never in the bell. onOpen(id | null) moves between conversations;
// onRead() refreshes the menu count after a conversation is read.
export default function ChatPage({ conversationId, onOpen, onRead }) {
  const me = useContext(CurrentUser);
  const [chats, setChats] = useState(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    () =>
      api('/chats')
        .then(setChats)
        .catch((e) => setError(e.message)),
    []
  );
  useEffect(() => {
    load();
    return onChatChange(load);
  }, [load]);

  async function start(person) {
    try {
      const chat = await api('/chats/direct', { method: 'POST', body: { user_id: person.id } });
      setPicking(false);
      onOpen(chat.id);
    } catch (e) {
      setError(e.message);
    }
  }

  const open = (id) => {
    setPicking(false);
    onOpen(id);
  };

  return (
    <div className="project">
      <header className="project-header">
        <h1>{tr('Tin nhắn')}</h1>
      </header>
      <ErrorBanner error={error} onClose={() => setError('')} />
      <div className={`chat ${conversationId || picking ? 'chat-open' : ''}`}>
        <aside className="chat-side" aria-label={tr('Các cuộc trò chuyện')}>
          <div className="chat-side-head">
            <button className="btn primary small" onClick={() => setPicking(true)}>
              {tr('+ Tin nhắn mới')}
            </button>
          </div>
          {!chats && <p className="muted chat-note">{tr('Đang tải…')}</p>}
          {chats?.length === 0 && <p className="muted chat-note">{tr('Chưa có tin nhắn nào.')}</p>}
          <ul className="chat-list">
            {chats?.map((c) => (
              <li key={c.id}>
                <button
                  className={`chat-row ${c.id === conversationId ? 'active' : ''} ${c.unread ? 'unread' : ''}`}
                  onClick={() => open(c.id)}
                  aria-current={c.id === conversationId ? 'page' : undefined}
                >
                  <Avatar name={c.other?.name ?? '?'} userId={c.other?.id} small />
                  <span className="chat-row-main">
                    <span className="chat-row-top">
                      <span className="ellipsis grow chat-row-name">{c.other?.name ?? tr('Người dùng đã xoá')}</span>
                      {c.last_message_at && <span className="muted small">{shortTime(c.last_message_at)}</span>}
                    </span>
                    <span className="chat-row-last">
                      <span className="ellipsis grow">{preview(c, me)}</span>
                      {c.unread > 0 && (
                        <span className="badge inline" aria-label={tr('{count} tin chưa đọc', { count: c.unread })}>
                          {c.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <section className="chat-main">
          {picking ? (
            <PeoplePicker onPick={start} onCancel={() => setPicking(false)} />
          ) : conversationId ? (
            <ChatThread
              key={conversationId}
              conversationId={conversationId}
              onBack={() => onOpen(null)}
              onChanged={load}
              onRead={() => {
                onRead();
                load();
              }}
              onError={setError}
            />
          ) : (
            <p className="muted chat-empty">{tr('Chọn một cuộc trò chuyện, hoặc bấm "+ Tin nhắn mới" để nhắn cho đồng nghiệp.')}</p>
          )}
        </section>
      </div>
    </div>
  );
}

// The people at work this user can message.
function PeoplePicker({ onPick, onCancel }) {
  const people = useFetched('/chats/people');
  const [query, setQuery] = useState('');
  const shown = people.filter((p) => fold(`${p.name} ${p.team_name ?? ''}`).includes(fold(query.trim())));
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
      <div className="chat-picker-search">
        <SearchBox value={query} onChange={setQuery} placeholder={tr('Tìm theo tên hoặc team')} label={tr('Tìm người')} wide />
      </div>
      <ul className="chat-list">
        {shown.map((p) => (
          <li key={p.id}>
            <button className="chat-row" onClick={() => onPick(p)}>
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
    </div>
  );
}
