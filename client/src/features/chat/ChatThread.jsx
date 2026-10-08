import { Fragment, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, onChatChange } from '../../api.js';
import { Avatar } from '../../components/Avatar.jsx';
import { CurrentUser } from '../../components/CurrentUser.js';
import { askConfirm } from '../../components/Dialog.jsx';
import { locale, tr } from '../../i18n.js';
import { CommentComposer } from '../comments/CommentList.jsx';
import { FileList } from '../comments/Attachments.jsx';

// How close to the bottom (px) still counts as reading the latest messages, so new ones scroll into view.
const STICK_PX = 80;
const URL_RE = /(https?:\/\/[^\s<]+)/g;

export const parseTime = (s) => new Date(`${s.replace(' ', 'T')}Z`);
const dayOf = (s) => parseTime(s).toDateString();
const dayLabel = (s) => parseTime(s).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
const timeOf = (s) => parseTime(s).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

// The text of a message, links clickable (opened in a new tab, never with this app's window).
function MessageText({ body }) {
  return (
    <div className="chat-text">
      {body.split(URL_RE).map((part, i) =>
        i % 2 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          part
        )
      )}
    </div>
  );
}

// The latest page from the server replaces what it covers; older messages loaded before stay.
const merge = (old, fresh) => (fresh.length ? [...old.filter((m) => m.id < fresh[0].id), ...fresh] : []);

// One conversation: messages oldest first (older ones on request), the author edits or deletes theirs, files go with
// a message. Reading it marks it read (while the tab is visible). onChanged() after sending (the list reorders),
// onRead() after marking read.
export default function ChatThread({ conversationId, onBack, onChanged, onRead, onError }) {
  const me = useContext(CurrentUser);
  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(null); // { id, text }
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  const scroller = useRef(null);
  const stick = useRef(true);
  const fromBottom = useRef(null); // set while older messages load, to keep the view where it was
  const loadedOlder = useRef(false);

  const load = useCallback(async () => {
    try {
      const [summary, page] = await Promise.all([api(`/chats/${conversationId}`), api(`/chats/${conversationId}/messages`)]);
      setChat(summary);
      setMessages((old) => merge(old, page.messages));
      if (!loadedOlder.current) setHasMore(page.has_more);
    } catch (e) {
      setMissing(true);
      onError(e.message);
    }
  }, [conversationId, onError]);

  useEffect(() => {
    load();
    return onChatChange((change) => change.conversation_id === conversationId && load());
  }, [conversationId, load]);

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Seen once shown in a visible tab.
  const newest = messages.at(-1)?.id ?? 0;
  useEffect(() => {
    if (!chat || !visible || newest <= chat.last_read_id) return;
    setChat((c) => ({ ...c, last_read_id: newest }));
    api(`/chats/${conversationId}/read`, { method: 'POST' })
      .then(onRead)
      .catch(() => {});
  }, [chat, visible, newest, conversationId, onRead]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (fromBottom.current != null) {
      el.scrollTop = el.scrollHeight - fromBottom.current;
      fromBottom.current = null;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  async function loadOlder() {
    const el = scroller.current;
    try {
      const page = await api(`/chats/${conversationId}/messages?before=${messages[0].id}`);
      fromBottom.current = el.scrollHeight - el.scrollTop;
      loadedOlder.current = true;
      setHasMore(page.has_more);
      setMessages((old) => [...page.messages, ...old]);
    } catch (e) {
      onError(e.message);
    }
  }

  // Runs a request, then reloads the thread (scrolled to the latest) and the list.
  async function act(request) {
    try {
      await request();
    } catch (e) {
      onError(e.message);
    }
    stick.current = true;
    await load();
    onChanged();
  }

  async function saveEdit() {
    const body = editing.text.trim();
    const message = messages.find((m) => m.id === editing.id);
    if (!body && !message?.attachments.length) return;
    await act(() => api(`/chat-messages/${editing.id}`, { method: 'PATCH', body: { body } }));
    setEditing(null);
  }

  async function remove(m) {
    const ok = await askConfirm({
      title: tr('Xoá tin nhắn này?'),
      message:
        (m.attachments.length ? tr('{length} file kèm theo cũng bị xoá. ', { length: m.attachments.length }) : '') +
        tr('Người kia sẽ thấy "Tin nhắn đã bị xoá". Không hoàn tác được.'),
      confirmLabel: tr('Xoá'),
      danger: true,
    });
    if (ok) act(() => api(`/chat-messages/${m.id}`, { method: 'DELETE' }));
  }

  if (missing && !chat) return <p className="muted chat-empty">{tr('Không tìm thấy cuộc trò chuyện này.')}</p>;
  if (!chat) return <p className="muted chat-empty">{tr('Đang tải…')}</p>;

  const other = chat.other;
  const lastOwn = messages.findLast((m) => m.user_id === me.id && !m.deleted_at);
  return (
    <div className="chat-thread">
      <div className="chat-thread-head">
        <button className="link-btn chat-back" onClick={onBack}>
          {tr('← Quay lại')}
        </button>
        <Avatar name={other?.name ?? '?'} userId={other?.id} small />
        <div className="grow chat-thread-who">
          <h2 className="ellipsis">{other?.name ?? tr('Người dùng đã xoá')}</h2>
          {other && <span className="muted small ellipsis">{[other.role_name, other.team_name].filter(Boolean).join(' · ')}</span>}
        </div>
      </div>

      <div
        className="chat-messages"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
        }}
      >
        {hasMore && (
          <button className="link-btn chat-older" onClick={loadOlder}>
            {tr('Xem tin nhắn cũ hơn')}
          </button>
        )}
        {messages.length === 0 && <p className="muted chat-empty">{tr('Chưa có tin nhắn nào. Gửi lời chào đầu tiên!')}</p>}
        {messages.map((m, i) => {
          const own = m.user_id === me.id;
          const newDay = i === 0 || dayOf(messages[i - 1].created_at) !== dayOf(m.created_at);
          return (
            <Fragment key={m.id}>
              {newDay && <div className="chat-day">{dayLabel(m.created_at)}</div>}
              <div className={`chat-msg ${own ? 'own' : ''}`}>
                <div className={`chat-bubble ${m.deleted_at ? 'deleted' : ''}`}>
                  {m.deleted_at ? (
                    tr('Tin nhắn đã bị xoá')
                  ) : editing?.id === m.id ? (
                    <form
                      className="chat-edit"
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveEdit();
                      }}
                    >
                      <textarea
                        autoFocus
                        value={editing.text}
                        aria-label={tr('Sửa tin nhắn')}
                        onChange={(e) => setEditing((ed) => ({ ...ed, text: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setEditing(null);
                          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            saveEdit();
                          }
                        }}
                      />
                      <span className="chat-edit-buttons">
                        <button type="button" className="btn small" onClick={() => setEditing(null)}>
                          {tr('Huỷ')}
                        </button>
                        <button className="btn small primary">{tr('Lưu')}</button>
                      </span>
                    </form>
                  ) : (
                    m.body && <MessageText body={m.body} />
                  )}
                  {m.attachments.length > 0 && <FileList files={m.attachments} act={act} onError={onError} compact />}
                </div>
                <div className="chat-meta muted small">
                  <span title={parseTime(m.created_at).toLocaleString(locale())}>{timeOf(m.created_at)}</span>
                  {m.edited_at && !m.deleted_at && <span> {tr('· đã sửa')}</span>}
                  {m.id === lastOwn?.id && chat.other_last_read_id >= m.id && <span> {tr('· Đã xem')}</span>}
                  {own && !m.deleted_at && editing?.id !== m.id && (
                    <span className="chat-actions">
                      <button className="link-btn" onClick={() => setEditing({ id: m.id, text: m.body })}>
                        {tr('Sửa')}
                      </button>
                      <button className="link-btn danger" onClick={() => remove(m)}>
                        {tr('Xoá')}
                      </button>
                    </span>
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      {chat.can_send ? (
        <div className="chat-composer">
          <CommentComposer
            kind="chat-messages"
            createPath={`/chats/${conversationId}/messages`}
            mentionable={[]}
            placeholder={tr('Nhập tin nhắn… Enter để gửi, Shift+Enter để xuống dòng')}
            act={act}
            onError={onError}
            enterSends
          />
        </div>
      ) : (
        <p className="muted chat-closed">{tr('Người này hiện không nhận được tin nhắn. Các tin cũ vẫn ở đây.')}</p>
      )}
    </div>
  );
}
