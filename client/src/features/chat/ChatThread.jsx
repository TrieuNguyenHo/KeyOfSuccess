import { Fragment, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, onChatChange } from '../../api.js';
import { CurrentUser } from '../../components/CurrentUser.js';
import { askConfirm } from '../../components/Dialog.jsx';
import { MentionTextarea, fromMentionMarkup, toMentionMarkup } from '../../components/Mentions.jsx';
import { locale, tr } from '../../i18n.js';
import { CommentComposer } from '../comments/CommentList.jsx';
import { FileList } from '../comments/Attachments.jsx';
import ChatMembers from './ChatMembers.jsx';
import { ChatAvatar, chatTitle, personLine } from './ChatParts.jsx';

// How close to the bottom (px) still counts as reading the latest messages, so new ones scroll into view.
const STICK_PX = 80;
const MENTION_RE = /(@\[[^\]\n]{1,80}\]\(\d+\))/g;
const MENTION_PARTS = /^@\[([^\]\n]{1,80})\]\((\d+)\)$/;
const URL_RE = /(https?:\/\/[^\s<]+)/g;
// As on the server (lib/chat.js): a task's page, or any screen with its side panel open (?task=12).
const TASK_LINK = /#\/(?:task\/(\d+)|[^\s#]*[?&]task=(\d+))/;
const FLASH_MS = 1500;

export const parseTime = (s) => new Date(`${s.replace(' ', 'T')}Z`);
const dayOf = (s) => parseTime(s).toDateString();
const dayLabel = (s) => parseTime(s).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
const timeOf = (s) => parseTime(s).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

// A link to a task the reader can see becomes a chip with its name (a click opens it); any other link opens in a new
// tab, never with this app's window.
function LinkPart({ url, tasks, onOpenTask }) {
  const match = TASK_LINK.exec(url);
  const task = match && tasks.find((t) => t.id === Number(match[1] ?? match[2]));
  if (task) {
    return (
      <button type="button" className={`chat-task ${task.completed ? 'done' : ''}`} onClick={() => onOpenTask(task.id)} title={task.project_name}>
        <span className="dot" style={{ background: task.project_color }} aria-hidden="true" />
        <span className="ellipsis">{task.title}</span>
        {task.completed && <span aria-label={tr('Đã xong')}>✓</span>}
      </button>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {url}
    </a>
  );
}

// A message's text: @mentions as tags (the reader's own highlighted), links clickable, task links as chips.
function MessageText({ body, tasks, onOpenTask, meId }) {
  return (
    <div className="chat-text">
      {body.split(MENTION_RE).map((part, i) => {
        const mention = MENTION_PARTS.exec(part);
        if (mention) {
          return (
            <span key={i} className={`mention ${Number(mention[2]) === meId ? 'me' : ''}`}>
              @{mention[1]}
            </span>
          );
        }
        return (
          <Fragment key={i}>
            {part.split(URL_RE).map((piece, j) => (j % 2 ? <LinkPart key={j} url={piece} tasks={tasks} onOpenTask={onOpenTask} /> : piece))}
          </Fragment>
        );
      })}
    </div>
  );
}

// The latest page from the server replaces what it covers; older messages loaded before stay.
const merge = (old, fresh) => (fresh.length ? [...old.filter((m) => m.id < fresh[0].id), ...fresh] : []);

// One conversation: messages oldest first (older ones on request); the author edits or deletes theirs, anyone answers
// one; files go with a message. Reading it marks it read (while the tab is visible). onChanged() after a change (the
// list reorders), onRead() after marking read, onLeft() after leaving a group, onOpenTask(id) for a linked task.
export default function ChatThread({ conversationId, onBack, onChanged, onRead, onLeft, onOpenTask, onError }) {
  const me = useContext(CurrentUser);
  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(null); // { id, text, mentions, hasFiles }
  const [replyTo, setReplyTo] = useState(null);
  const [showMembers, setShowMembers] = useState(false);
  const [flash, setFlash] = useState(null);
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
  }, [messages, showMembers]);

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
    const body = toMentionMarkup(editing.text.trim(), editing.mentions);
    if (!body && !editing.hasFiles) return;
    await act(() => api(`/chat-messages/${editing.id}`, { method: 'PATCH', body: { body } }));
    setEditing(null);
  }

  async function remove(m) {
    const ok = await askConfirm({
      title: tr('Xoá tin nhắn này?'),
      message:
        (m.attachments.length ? tr('{length} file kèm theo cũng bị xoá. ', { length: m.attachments.length }) : '') +
        tr('Mọi người sẽ thấy "Tin nhắn đã bị xoá". Không hoàn tác được.'),
      confirmLabel: tr('Xoá'),
      danger: true,
    });
    if (ok) act(() => api(`/chat-messages/${m.id}`, { method: 'DELETE' }));
  }

  const toggleMute = () => act(() => api(`/chats/${conversationId}/mute`, { method: 'POST', body: { muted: !chat.muted } }));

  // Scrolls to an answered message when it is loaded, and flashes it.
  function jumpTo(id) {
    const el = document.getElementById(`chat-msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlash(id);
    setTimeout(() => setFlash(null), FLASH_MS);
  }

  if (missing && !chat) return <p className="muted chat-empty">{tr('Không tìm thấy cuộc trò chuyện này.')}</p>;
  if (!chat) return <p className="muted chat-empty">{tr('Đang tải…')}</p>;

  const direct = chat.kind === 'direct';
  const mentionable = direct ? [] : chat.members.filter((m) => m.id !== me.id && m.at_work);
  const lastOwn = messages.findLast((m) => m.user_id === me.id && !m.deleted_at);
  let subtitle = direct && chat.other ? personLine(chat.other) : '';
  if (chat.kind === 'group') subtitle = tr('Nhóm · {count} người', { count: chat.members.length });
  if (chat.kind === 'project') subtitle = tr('Chat project · {count} người', { count: chat.members.length });
  if (chat.kind === 'team') subtitle = tr('Chat team · {count} người', { count: chat.members.length });

  return (
    <div className="chat-thread">
      <div className="chat-thread-head">
        <button className="link-btn chat-back" onClick={onBack}>
          {tr('← Quay lại')}
        </button>
        <ChatAvatar chat={chat} />
        <div className="grow chat-thread-who">
          <h2 className="ellipsis">{chatTitle(chat)}</h2>
          {subtitle && <span className="muted small ellipsis">{subtitle}</span>}
        </div>
        <button
          className="icon-btn"
          onClick={toggleMute}
          aria-pressed={chat.muted}
          title={chat.muted ? tr('Bật lại thông báo') : tr('Tắt thông báo (vẫn báo khi có người nhắc tới bạn)')}
          aria-label={chat.muted ? tr('Bật lại thông báo') : tr('Tắt thông báo')}
        >
          {chat.muted ? '🔕' : '🔔'}
        </button>
        {!direct && (
          <button className={`btn small ${showMembers ? 'primary' : ''}`} onClick={() => setShowMembers((s) => !s)} aria-expanded={showMembers}>
            {tr('Thành viên')}
          </button>
        )}
      </div>

      {showMembers ? (
        <ChatMembers chat={chat} act={act} onLeft={onLeft} onError={onError} />
      ) : (
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
            const prev = messages[i - 1];
            const newDay = !prev || dayOf(prev.created_at) !== dayOf(m.created_at);
            // In a group, project or team, the sender's name heads each run of their messages.
            const showName = !direct && !own && (newDay || prev.user_id !== m.user_id);
            return (
              <Fragment key={m.id}>
                {newDay && <div className="chat-day">{dayLabel(m.created_at)}</div>}
                <div id={`chat-msg-${m.id}`} className={`chat-msg ${own ? 'own' : ''} ${flash === m.id ? 'flash' : ''}`}>
                  {showName && <span className="chat-sender">{m.user_name ?? tr('Người dùng đã xoá')}</span>}
                  <div className={`chat-bubble ${m.deleted_at ? 'deleted' : ''}`}>
                    {m.reply && (
                      <button type="button" className="chat-quote" onClick={() => jumpTo(m.reply.id)}>
                        <b>{m.reply.user_name ?? tr('Người dùng đã xoá')}</b>
                        <span className="ellipsis">{m.reply.deleted ? tr('Tin nhắn đã bị xoá') : m.reply.body || tr('📎 File')}</span>
                      </button>
                    )}
                    {m.deleted_at ? (
                      tr('Tin nhắn đã bị xoá')
                    ) : editing?.id === m.id ? (
                      <form
                        className="chat-edit"
                        onSubmit={(e) => {
                          e.preventDefault();
                          saveEdit();
                        }}
                        onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                      >
                        <MentionTextarea
                          value={editing.text}
                          onChange={(text) => setEditing((ed) => ({ ...ed, text }))}
                          users={mentionable}
                          mentions={editing.mentions}
                          onMentionsChange={(mentions) => setEditing((ed) => ({ ...ed, mentions }))}
                          enterSends
                        />
                        <span className="chat-edit-buttons">
                          <button type="button" className="btn small" onClick={() => setEditing(null)}>
                            {tr('Huỷ')}
                          </button>
                          <button className="btn small primary">{tr('Lưu')}</button>
                        </span>
                      </form>
                    ) : (
                      m.body && <MessageText body={m.body} tasks={m.tasks} onOpenTask={onOpenTask} meId={me.id} />
                    )}
                    {m.attachments.length > 0 && <FileList files={m.attachments} act={act} onError={onError} compact />}
                  </div>
                  <div className="chat-meta muted small">
                    <span title={parseTime(m.created_at).toLocaleString(locale())}>{timeOf(m.created_at)}</span>
                    {m.edited_at && !m.deleted_at && <span> {tr('· đã sửa')}</span>}
                    {direct && m.id === lastOwn?.id && chat.other_last_read_id >= m.id && <span> {tr('· Đã xem')}</span>}
                    {!m.deleted_at && editing?.id !== m.id && (
                      <span className="chat-actions">
                        {chat.can_send && (
                          <button className="link-btn" onClick={() => setReplyTo(m)}>
                            {tr('Trả lời')}
                          </button>
                        )}
                        {own && (
                          <>
                            <button
                              className="link-btn"
                              onClick={() => setEditing({ id: m.id, hasFiles: m.attachments.length > 0, ...fromMentionMarkup(m.body) })}
                            >
                              {tr('Sửa')}
                            </button>
                            <button className="link-btn danger" onClick={() => remove(m)}>
                              {tr('Xoá')}
                            </button>
                          </>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
      )}

      {showMembers ? null : chat.can_send ? (
        <div className="chat-composer">
          {replyTo && (
            <div className="chat-replying">
              <span className="grow ellipsis">
                {tr('Trả lời {name}:', { name: replyTo.user_name ?? tr('Người dùng đã xoá') })}{' '}
                <span className="muted">{fromMentionMarkup(replyTo.body).text || tr('📎 File')}</span>
              </span>
              <button className="icon-btn" onClick={() => setReplyTo(null)} aria-label={tr('Bỏ trả lời')}>
                ✕
              </button>
            </div>
          )}
          <CommentComposer
            kind="chat-messages"
            createPath={`/chats/${conversationId}/messages`}
            mentionable={mentionable}
            placeholder={direct ? tr('Nhập tin nhắn… Enter để gửi, Shift+Enter để xuống dòng') : tr('Nhập tin nhắn… Gõ @ để nhắc ai đó')}
            act={async (request) => {
              await act(request);
              setReplyTo(null);
            }}
            onError={onError}
            enterSends
            extra={replyTo ? { reply_to_id: replyTo.id } : undefined}
          />
        </div>
      ) : (
        <p className="muted chat-closed">{tr('Người này hiện không nhận được tin nhắn. Các tin cũ vẫn ở đây.')}</p>
      )}
    </div>
  );
}
