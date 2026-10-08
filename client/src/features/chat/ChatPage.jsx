import { useCallback, useContext, useEffect, useState } from 'react';
import { api, onChatChange } from '../../api.js';
import { ErrorBanner } from '../../components/Controls.jsx';
import { CurrentUser } from '../../components/CurrentUser.js';
import { locale, tr } from '../../i18n.js';
import { ChatAvatar, chatTitle } from './ChatParts.jsx';
import ChatThread, { parseTime } from './ChatThread.jsx';
import NewChat from './NewChat.jsx';

// Today: the time; earlier: the day.
function shortTime(s) {
  const d = parseTime(s);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' });
}

// The last message in the list: "Bạn: …" for the user's own; in a group, project or team, the sender's name.
function preview(chat, me) {
  const last = chat.last_message;
  if (!last) return '';
  if (last.deleted_at) return tr('Tin nhắn đã bị xoá');
  const text = last.body || (last.has_files ? tr('📎 File') : '');
  if (last.user_id === me.id) return tr('Bạn: {text}', { text });
  return chat.kind === 'direct' ? text : `${last.user_name ?? tr('Người dùng đã xoá')}: ${text}`;
}

// "Tin nhắn" (#/chat, #/chat/4): one-to-one conversations (v32), groups, project and team chats (v33). Private to
// their members. Unread messages count on the menu, never in the bell. onOpen(id | null) moves between conversations;
// onRead() refreshes the menu count after a conversation is read; onOpenTask(id) opens a linked task.
export default function ChatPage({ conversationId, onOpen, onRead, onOpenTask }) {
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

  const open = (id) => {
    setPicking(false);
    onOpen(id);
  };
  // Runs a request that returns a conversation, then opens it.
  const start = (request) =>
    request()
      .then((chat) => {
        load();
        open(chat.id);
      })
      .catch((e) => setError(e.message));

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
                  className={`chat-row ${c.id === conversationId ? 'active' : ''} ${c.unread && !c.muted ? 'unread' : ''}`}
                  onClick={() => open(c.id)}
                  aria-current={c.id === conversationId ? 'page' : undefined}
                >
                  <ChatAvatar chat={c} />
                  <span className="chat-row-main">
                    <span className="chat-row-top">
                      <span className="ellipsis grow chat-row-name">{chatTitle(c)}</span>
                      {c.muted && (
                        <span className="muted small" title={tr('Đã tắt thông báo')} aria-label={tr('Đã tắt thông báo')}>
                          🔕
                        </span>
                      )}
                      {c.last_message_at && <span className="muted small">{shortTime(c.last_message_at)}</span>}
                    </span>
                    <span className="chat-row-last">
                      <span className="ellipsis grow">{preview(c, me)}</span>
                      {c.mentioned && (
                        <span className="badge inline" title={tr('Có người nhắc tới bạn')} aria-label={tr('Có người nhắc tới bạn')}>
                          @
                        </span>
                      )}
                      {c.unread > 0 && (
                        <span className={`badge inline ${c.muted ? 'quiet' : ''}`} aria-label={tr('{count} tin chưa đọc', { count: c.unread })}>
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
            <NewChat
              onDirect={(person) => start(() => api('/chats/direct', { method: 'POST', body: { user_id: person.id } }))}
              onGroup={(body) => start(() => api('/chats/group', { method: 'POST', body }))}
              onRoom={(kind, id) => start(() => api(`/chats/${kind}/${id}`, { method: 'POST' }))}
              onCancel={() => setPicking(false)}
            />
          ) : conversationId ? (
            <ChatThread
              key={conversationId}
              conversationId={conversationId}
              onBack={() => onOpen(null)}
              onChanged={load}
              onLeft={() => {
                load();
                onOpen(null);
              }}
              onRead={() => {
                onRead();
                load();
              }}
              onOpenTask={onOpenTask}
              onError={setError}
            />
          ) : (
            <p className="muted chat-empty">{tr('Chọn một cuộc trò chuyện, hoặc bấm "+ Tin nhắn mới" để nhắn cho đồng nghiệp, tạo nhóm hay mở chat của project / team.')}</p>
          )}
        </section>
      </div>
    </div>
  );
}
