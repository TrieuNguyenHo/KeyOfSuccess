import { useCallback, useContext, useEffect, useState } from 'react';
import { api, onChatChange } from '../../api.js';
import { ErrorBanner, SearchBox } from '../../components/Controls.jsx';
import { CurrentUser } from '../../components/CurrentUser.js';
import { locale, tr } from '../../i18n.js';
import { askNotifyPermission, notifyPermission } from '../../chatAlerts.js';
import { ChatAvatar, chatTitle, previewOf } from './ChatParts.jsx';
import ChatThread, { parseTime } from './ChatThread.jsx';
import NewChat from './NewChat.jsx';

const SEARCH_DELAY_MS = 300;
const SEARCH_MIN = 2;

// Today: the time; earlier: the day.
function shortTime(s) {
  const d = parseTime(s);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' });
}

// "Tin nhắn" (#/chat, #/chat/4): one-to-one conversations (v32), groups, project and team chats (v33). Private to
// their members. Unread messages count on the menu, never in the bell. onOpen(id | null, messageId?) moves between
// conversations (at a message: a search result); onRead() refreshes the menu count after a conversation is read;
// onOpenTask(id) opens a linked task. focusMessageId: the message the open conversation shows (from the URL).
export default function ChatPage({ conversationId, focusMessageId, onOpen, onRead, onOpenTask }) {
  const me = useContext(CurrentUser);
  const [chats, setChats] = useState(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const [permission, setPermission] = useState(notifyPermission);
  // Search (v36): accent-insensitive, in every conversation or only the open one; results replace the list.
  const [query, setQuery] = useState('');
  const [onlyHere, setOnlyHere] = useState(false);
  const [results, setResults] = useState(null);
  useEffect(() => {
    const q = query.trim();
    if (q.length < SEARCH_MIN) {
      setResults(null);
      return undefined;
    }
    const scope = onlyHere && conversationId ? `&conversation=${conversationId}` : '';
    const timer = setTimeout(
      () =>
        api(`/chats/search?q=${encodeURIComponent(q)}${scope}`)
          .then(setResults)
          .catch((e) => setError(e.message)),
      SEARCH_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [query, onlyHere, conversationId]);

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

  const open = (id, messageId) => {
    setPicking(false);
    onOpen(id, messageId);
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
        <span className="grow" />
        {permission === 'default' && (
          <button className="btn small" onClick={() => askNotifyPermission().then(setPermission)}>
            {tr('🔔 Bật thông báo trên máy tính')}
          </button>
        )}
      </header>
      <ErrorBanner error={error} onClose={() => setError('')} />
      <div className={`chat ${conversationId || picking ? 'chat-open' : ''}`}>
        <aside className="chat-side" aria-label={tr('Các cuộc trò chuyện')}>
          <div className="chat-side-head">
            <button className="btn primary small" onClick={() => setPicking(true)}>
              {tr('+ Tin nhắn mới')}
            </button>
            <SearchBox value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('Tìm tin nhắn')} label={tr('Tìm tin nhắn')} wide />
            {query.trim().length >= SEARCH_MIN && conversationId && (
              <label className="chat-search-scope muted small">
                <input type="checkbox" checked={onlyHere} onChange={(e) => setOnlyHere(e.target.checked)} />
                {tr('Chỉ trong cuộc đang mở')}
              </label>
            )}
          </div>
          {results && (
            <ul className="chat-list">
              {results.map((m) => (
                <li key={m.id}>
                  <button className="chat-row" onClick={() => open(m.conversation_id, m.id)}>
                    <ChatAvatar chat={m.conversation} />
                    <span className="chat-row-main">
                      <span className="chat-row-top">
                        <span className="ellipsis grow chat-row-name">{chatTitle(m.conversation)}</span>
                        <span className="muted small">{shortTime(m.created_at)}</span>
                      </span>
                      <span className="chat-row-last">
                        <span className="ellipsis grow">
                          {m.user_id === me.id ? tr('Bạn: {text}', { text: m.body }) : `${m.user_name ?? tr('Người dùng đã xoá')}: ${m.body}`}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {results.length === 0 && <li className="muted chat-note">{tr('Không tìm thấy tin nhắn nào.')}</li>}
            </ul>
          )}
          {!results && !chats && <p className="muted chat-note">{tr('Đang tải…')}</p>}
          {!results && chats?.length === 0 && <p className="muted chat-note">{tr('Chưa có tin nhắn nào.')}</p>}
          <ul className="chat-list" hidden={Boolean(results)}>
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
                      {c.pinned_chat && (
                        <span className="muted small" title={tr('Đã ghim')} aria-label={tr('Đã ghim')}>
                          📌
                        </span>
                      )}
                      {c.muted && (
                        <span className="muted small" title={tr('Đã tắt thông báo')} aria-label={tr('Đã tắt thông báo')}>
                          🔕
                        </span>
                      )}
                      {c.last_message_at && <span className="muted small">{shortTime(c.last_message_at)}</span>}
                    </span>
                    <span className="chat-row-last">
                      <span className="ellipsis grow">{previewOf(c, me)}</span>
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
              focusMessageId={focusMessageId}
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
