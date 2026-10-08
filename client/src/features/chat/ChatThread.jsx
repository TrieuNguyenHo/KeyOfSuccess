import { Fragment, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, onChatChange } from '../../api.js';
import { Avatar } from '../../components/Avatar.jsx';
import { CurrentUser } from '../../components/CurrentUser.js';
import { askConfirm } from '../../components/Dialog.jsx';
import { MentionTextarea, fromMentionMarkup, toMentionMarkup } from '../../components/Mentions.jsx';
import { locale, tr } from '../../i18n.js';
import { CommentComposer } from '../comments/CommentList.jsx';
import { FileList, PREVIEW_TYPES } from '../comments/Attachments.jsx';
import ChatImages from './ChatMedia.jsx';
import ChatInfo from './ChatInfo.jsx';
import EmojiPicker from './EmojiPicker.jsx';
import { PollCard, PollDialog } from './ChatPoll.jsx';
import { ChatAvatar, EVERYONE_ID, REACTIONS, chatTitle, emojiOnly, personLine, systemText } from './ChatParts.jsx';
import ForwardDialog from './ForwardDialog.jsx';
import TaskFromMessage from './TaskFromMessage.jsx';

// How close to the bottom (px) still counts as reading the latest messages, so new ones scroll into view.
const STICK_PX = 80;
const MENTION_RE = /(@\[[^\]\n]{1,80}\]\(\d+\))/g;
const MENTION_PARTS = /^@\[([^\]\n]{1,80})\]\((\d+)\)$/;
const URL_RE = /(https?:\/\/[^\s<]+)/g;
// As on the server (lib/chat.js): a task's page, or any screen with its side panel open (?task=12).
const TASK_LINK = /#\/(?:task\/(\d+)|[^\s#]*[?&]task=(\d+))/;
const FLASH_MS = 1500;
const SEEN_SHOWN = 5; // read-by avatars under a message before "+N"
// What was typed and not sent, per conversation, kept while the app is open.
const drafts = new Map();

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
          const id = Number(mention[2]);
          // @tất cả (v36) mentions every reader.
          return (
            <span key={i} className={`mention ${id === meId || id === EVERYONE_ID ? 'me' : ''}`}>
              @{id === EVERYONE_ID ? tr('tất cả') : mention[1]}
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
// focusMessageId: a message to open the conversation at (a search result, a link from a task), flashed.
export default function ChatThread({ conversationId, focusMessageId, onBack, onChanged, onRead, onLeft, onOpenTask, onError }) {
  const me = useContext(CurrentUser);
  const [chat, setChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(null); // { id, text, mentions, hasFiles }
  const [replyTo, setReplyTo] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const [menuFor, setMenuFor] = useState(null); // the message whose "⋯" menu is open
  const [forwarding, setForwarding] = useState(null);
  const [tasking, setTasking] = useState(null); // the message a task is being made from
  const [polling, setPolling] = useState(false); // the "Tạo bình chọn" dialog
  const [muteMenu, setMuteMenu] = useState(false);
  const [flash, setFlash] = useState(null);
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  const [picking, setPicking] = useState(null); // the message whose reaction picker is open
  const [atBottom, setAtBottom] = useState(true);
  const [newBelow, setNewBelow] = useState(0); // others' messages that arrived while scrolled up
  const scroller = useRef(null);
  const stick = useRef(true);
  // The first message that was unread on opening (the "Tin chưa đọc" line), and whether to scroll to it.
  const unreadFrom = useRef(undefined);
  const jumpToUnread = useRef(false);
  const lastNewest = useRef(0);
  const fromBottom = useRef(null); // set while older messages load, to keep the view where it was
  const loadedOlder = useRef(false);
  const pendingFocus = useRef(focusMessageId ?? null); // a message to scroll to and flash once it is shown

  const load = useCallback(async () => {
    try {
      const opening = unreadFrom.current === undefined;
      // Opened at a message: the page around it rather than the latest one.
      const focus = opening ? pendingFocus.current : null;
      const [summary, page] = await Promise.all([
        api(`/chats/${conversationId}`),
        api(`/chats/${conversationId}/messages${focus ? `?around=${focus}` : ''}`),
      ]);
      if (opening) {
        const first = !focus && page.messages.find((m) => m.id > summary.last_read_id && m.user_id !== me.id);
        unreadFrom.current = first?.id ?? null;
        jumpToUnread.current = Boolean(first);
        if (focus) {
          loadedOlder.current = true;
          setHasMore(page.has_more);
        }
      }
      setChat(summary);
      setMessages((old) => (focus ? page.messages : merge(old, page.messages)));
      if (!loadedOlder.current) setHasMore(page.has_more);
    } catch (e) {
      setMissing(true);
      onError(e.message);
    }
  }, [conversationId, onError, me.id]);

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

  // Opening: to the first unread message when there is one, else to the bottom. Later: keep to the bottom while the
  // reader is there; scrolled up, count the others' new messages on the "↓" button instead.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const newest = messages.at(-1)?.id ?? 0;
    const target = pendingFocus.current && document.getElementById(`chat-msg-${pendingFocus.current}`);
    const divider = jumpToUnread.current && document.getElementById('chat-unread');
    if (target) {
      el.scrollTop += target.getBoundingClientRect().top - el.getBoundingClientRect().top - el.clientHeight / 3;
      const id = pendingFocus.current;
      pendingFocus.current = null;
      setFlash(id);
      setTimeout(() => setFlash(null), FLASH_MS);
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
      setAtBottom(stick.current);
    } else if (divider) {
      el.scrollTop += divider.getBoundingClientRect().top - el.getBoundingClientRect().top - 8;
      jumpToUnread.current = false;
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
      setAtBottom(stick.current);
    } else if (fromBottom.current != null) {
      el.scrollTop = el.scrollHeight - fromBottom.current;
      fromBottom.current = null;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
    } else if (lastNewest.current && newest > lastNewest.current) {
      const arrived = messages.filter((m) => m.id > lastNewest.current && m.user_id !== me.id).length;
      if (arrived) setNewBelow((n) => n + arrived);
    }
    lastNewest.current = newest;
  }, [messages, showInfo, me.id]);

  function scrollToBottom() {
    const el = scroller.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setNewBelow(0);
  }

  // One reaction per person: the same emoji again takes it back. Updated in place, so the view does not jump.
  async function react(m, emoji) {
    setPicking(null);
    try {
      replaceMessage(await api(`/chat-messages/${m.id}/reaction`, { method: 'POST', body: { emoji } }));
    } catch (e) {
      onError(e.message);
    }
  }

  const saveDraft = useCallback((draft) => drafts.set(conversationId, draft), [conversationId]);

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

  // Runs a request, then reloads the thread (scrolled to the latest, unless keepScroll) and the list.
  async function act(request, { keepScroll = false } = {}) {
    try {
      await request();
    } catch (e) {
      onError(e.message);
    }
    if (!keepScroll) stick.current = true;
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

  // hours: 1 or 8 (v37), null until turned back on, false to turn it back on.
  function mute(hours) {
    setMuteMenu(false);
    const body = hours === false ? { muted: false } : { muted: true, hours };
    act(() => api(`/chats/${conversationId}/mute`, { method: 'POST', body }), { keepScroll: true });
  }
  const togglePinned = () => act(() => api(`/chats/${conversationId}/pin`, { method: 'POST', body: { pinned: !chat.pinned_chat } }), { keepScroll: true });
  // A message changed by an action that returns it (a reaction, a vote): updated in place, so the view does not jump.
  const replaceMessage = (updated) => setMessages((list) => list.map((x) => (x.id === updated.id ? updated : x)));

  // The "⋯" menu, the reaction picker and the mute menu close on a click outside them and on Esc; their own buttons
  // (data-popup-toggle) still toggle them.
  const popupOpen = menuFor !== null || picking !== null || muteMenu;
  useEffect(() => {
    if (!popupOpen) return undefined;
    const close = () => {
      setMenuFor(null);
      setPicking(null);
      setMuteMenu(false);
    };
    const onPointerDown = (e) => {
      if (!e.target.closest('.chat-menu, .chat-react-picker, [data-popup-toggle]')) close();
    };
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [popupOpen]);

  // Scrolls to a message and flashes it; one not loaded yet comes with the page around it.
  async function jumpTo(id) {
    const el = document.getElementById(`chat-msg-${id}`);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setFlash(id);
      setTimeout(() => setFlash(null), FLASH_MS);
      return;
    }
    try {
      const page = await api(`/chats/${conversationId}/messages?around=${id}`);
      pendingFocus.current = id;
      loadedOlder.current = true;
      stick.current = false;
      setHasMore(page.has_more);
      setMessages(page.messages);
    } catch (e) {
      onError(e.message);
    }
  }

  // Another message to show in the open conversation (a search result clicked while it is open).
  useEffect(() => {
    if (focusMessageId && chat) jumpTo(focusMessageId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the target changes
  }, [focusMessageId]);

  const pin = (m, pinned) => act(() => api(`/chat-messages/${m.id}/pin`, { method: 'POST', body: { pinned } }), { keepScroll: true });

  if (missing && !chat) return <p className="muted chat-empty">{tr('Không tìm thấy cuộc trò chuyện này.')}</p>;
  if (!chat) return <p className="muted chat-empty">{tr('Đang tải…')}</p>;

  const direct = chat.kind === 'direct';
  const mentionable = direct ? [] : [{ id: EVERYONE_ID, name: tr('tất cả') }, ...chat.members.filter((m) => m.id !== me.id && m.at_work)];
  const lastOwn = messages.findLast((m) => m.user_id === me.id && !m.deleted_at && !m.kind);
  let subtitle = direct && chat.other ? personLine(chat.other) : '';
  if (chat.kind === 'group') subtitle = tr('Nhóm · {count} người', { count: chat.members.length });
  if (chat.kind === 'project') subtitle = tr('Chat project · {count} người', { count: chat.members.length });
  if (chat.kind === 'team') subtitle = tr('Chat team · {count} người', { count: chat.members.length });
  // In a group, project or team: each member's avatar under the last message they have read (not one of their own).
  const seenAt = new Map();
  if (!direct) {
    for (const member of chat.members) {
      if (member.id === me.id || member.last_read_id == null) continue;
      const target = messages.findLast((m) => m.id <= member.last_read_id && !m.kind);
      if (!target || target.user_id === member.id) continue;
      seenAt.set(target.id, [...(seenAt.get(target.id) ?? []), member]);
    }
  }
  const unreadLine = (m) =>
    m.id === unreadFrom.current && (
      <div id="chat-unread" className="chat-unread-divider">
        <span>{tr('Tin chưa đọc')}</span>
      </div>
    );

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
          onClick={togglePinned}
          aria-pressed={chat.pinned_chat}
          title={chat.pinned_chat ? tr('Bỏ ghim cuộc trò chuyện') : tr('Ghim cuộc trò chuyện lên đầu danh sách')}
          aria-label={chat.pinned_chat ? tr('Bỏ ghim cuộc trò chuyện') : tr('Ghim cuộc trò chuyện lên đầu danh sách')}
        >
          {chat.pinned_chat ? '📌' : '📍'}
        </button>
        <span className="chat-mute">
          <button
            className="icon-btn"
            data-popup-toggle
            onClick={() => {
              setMenuFor(null);
              setPicking(null);
              setMuteMenu((v) => !v);
            }}
            aria-expanded={muteMenu}
            title={
              chat.muted
                ? chat.muted_until
                  ? tr('Đã tắt thông báo tới {time}', { time: parseTime(chat.muted_until).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) })
                  : tr('Đã tắt thông báo')
                : tr('Tắt thông báo (vẫn báo khi có người nhắc tới bạn)')
            }
            aria-label={chat.muted ? tr('Đã tắt thông báo') : tr('Tắt thông báo')}
          >
            {chat.muted ? '🔕' : '🔔'}
          </button>
          {muteMenu && (
            <div className="chat-menu chat-mute-menu" role="menu">
              {chat.muted ? (
                <button role="menuitem" onClick={() => mute(false)}>
                  {tr('Bật lại thông báo')}
                </button>
              ) : (
                <>
                  <button role="menuitem" onClick={() => mute(1)}>
                    {tr('Tắt trong 1 giờ')}
                  </button>
                  <button role="menuitem" onClick={() => mute(8)}>
                    {tr('Tắt trong 8 giờ')}
                  </button>
                  <button role="menuitem" onClick={() => mute(null)}>
                    {tr('Tắt cho tới khi bật lại')}
                  </button>
                </>
              )}
            </div>
          )}
        </span>
        <button className={`btn small ${showInfo ? 'primary' : ''}`} onClick={() => setShowInfo((s) => !s)} aria-expanded={showInfo}>
          {tr('Thông tin')}
        </button>
      </div>

      {!showInfo && chat.pinned.length > 0 && (
        <div className="chat-pins">
          <div className="chat-pins-top">
            <button className="chat-pin" onClick={() => jumpTo(chat.pinned[0].id)} title={tr('Xem tin đã ghim')}>
              <span aria-hidden="true">📌</span>
              <span className="ellipsis">
                <b>{chat.pinned[0].user_name ?? tr('Người dùng đã xoá')}:</b> {chat.pinned[0].body || tr('📎 File')}
              </span>
            </button>
            {chat.pinned.length > 1 && (
              <button className="link-btn" onClick={() => setShowPins((v) => !v)} aria-expanded={showPins}>
                {showPins ? tr('Thu gọn') : tr('+{count} tin ghim', { count: chat.pinned.length - 1 })}
              </button>
            )}
          </div>
          {showPins &&
            chat.pinned.map((p) => (
              <div key={p.id} className="chat-pins-row">
                <button className="chat-pin" onClick={() => jumpTo(p.id)}>
                  <span className="ellipsis">
                    <b>{p.user_name ?? tr('Người dùng đã xoá')}:</b> {p.body || tr('📎 File')}
                  </span>
                </button>
                <span className="muted small">{tr('ghim bởi {name}', { name: p.pinned_by_name ?? tr('Người dùng đã xoá') })}</span>
                <button className="link-btn" onClick={() => pin(p, false)}>
                  {tr('Bỏ ghim')}
                </button>
              </div>
            ))}
        </div>
      )}

      {showInfo ? (
        <ChatInfo
          chat={chat}
          act={act}
          onLeft={onLeft}
          onJump={(id) => {
            setShowInfo(false);
            jumpTo(id);
          }}
          onError={onError}
        />
      ) : (
        <div className="chat-messages-wrap">
          <div
            className="chat-messages"
            ref={scroller}
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
              if (stick.current !== atBottom) setAtBottom(stick.current);
              if (stick.current) setNewBelow(0);
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
              if (m.kind === 'system') {
                return (
                  <Fragment key={m.id}>
                    {newDay && <div className="chat-day">{dayLabel(m.created_at)}</div>}
                    {unreadLine(m)}
                    <div className="chat-system" title={parseTime(m.created_at).toLocaleString(locale())}>
                      {systemText(m, me)}
                    </div>
                  </Fragment>
                );
              }
              // Someone else's run of messages starts with their avatar (and, in a group, project or team, their name);
              // the rest of the run keeps the avatar's space, so the bubbles line up.
              const runStart = !own && (newDay || prev.user_id !== m.user_id || Boolean(prev.kind));
              const showName = !direct && runStart;
              const images = m.attachments.filter((f) => PREVIEW_TYPES.includes(f.mime));
              const otherFiles = m.attachments.filter((f) => !PREVIEW_TYPES.includes(f.mime));
              const mediaOnly = images.length > 0 && !m.body && !m.reply && !otherFiles.length && editing?.id !== m.id;
            const bigEmoji =
              !m.deleted_at && !m.poll && !m.reply && !m.forwarded && !m.attachments.length && editing?.id !== m.id && emojiOnly(m.body);
              const myReaction = m.reactions?.find((r) => r.mine)?.emoji;
              const seen = seenAt.get(m.id) ?? [];
              return (
                <Fragment key={m.id}>
                  {newDay && <div className="chat-day">{dayLabel(m.created_at)}</div>}
                  {unreadLine(m)}
                  <div id={`chat-msg-${m.id}`} className={`chat-msg ${own ? 'own' : ''} ${flash === m.id ? 'flash' : ''}`}>
                    {!own && (
                      <span className={`chat-msg-avatar ${showName ? 'named' : ''}`}>
                        {runStart && <Avatar name={m.user_name ?? '?'} userId={m.user_id ?? undefined} />}
                      </span>
                    )}
                    <div className="chat-msg-main">
                      {showName && <span className="chat-sender">{m.user_name ?? tr('Người dùng đã xoá')}</span>}
                      <div className={`chat-bubble ${m.deleted_at ? 'deleted' : ''} ${mediaOnly ? 'media-only' : ''} ${m.poll ? 'poll-bubble' : ''} ${bigEmoji ? 'emoji-only' : ''}`}>
                        {m.forwarded ? <span className="chat-forwarded">{tr('↪ Đã chuyển tiếp')}</span> : null}
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
                        ) : m.poll ? (
                          <PollCard message={m} onChange={replaceMessage} onError={onError} />
                        ) : (
                          m.body && <MessageText body={m.body} tasks={m.tasks} onOpenTask={onOpenTask} meId={me.id} />
                        )}
                        {images.length > 0 && <ChatImages files={images} act={act} onError={onError} />}
                        {otherFiles.length > 0 && <FileList files={otherFiles} act={act} onError={onError} compact />}
                      </div>
                      {m.reactions?.length > 0 && (
                        <div className="chat-reactions">
                          {m.reactions.map((r) => (
                            <button
                              key={r.emoji}
                              type="button"
                              className={`chat-reaction ${r.mine ? 'mine' : ''}`}
                              onClick={() => react(m, r.mine ? null : r.emoji)}
                              title={r.names.join(', ')}
                              aria-pressed={r.mine}
                            >
                              {r.emoji} {r.count}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="chat-meta muted small">
                        <span title={parseTime(m.created_at).toLocaleString(locale())}>{timeOf(m.created_at)}</span>
                        {m.edited_at && !m.deleted_at && <span> {tr('· đã sửa')}</span>}
                        {m.pinned_at && <span title={tr('Đã ghim')}> · 📌</span>}
                        {direct && m.id === lastOwn?.id && chat.other_last_read_id >= m.id && <span> {tr('· Đã xem')}</span>}
                        {!m.deleted_at && editing?.id !== m.id && (
                          <span className="chat-actions">
                            <button
                              className="link-btn"
                              data-popup-toggle
                              onClick={() => {
                                setMenuFor(null);
                                setMuteMenu(false);
                                setPicking(picking === m.id ? null : m.id);
                              }}
                              aria-expanded={picking === m.id}
                              title={tr('Thả cảm xúc')}
                              aria-label={tr('Thả cảm xúc')}
                            >
                              😊
                            </button>
                            {chat.can_send && (
                              <button className="link-btn" onClick={() => setReplyTo(m)}>
                                {tr('Trả lời')}
                              </button>
                            )}
                            <button
                              className="link-btn"
                              data-popup-toggle
                              onClick={() => {
                                setPicking(null);
                                setMuteMenu(false);
                                setMenuFor(menuFor === m.id ? null : m.id);
                              }}
                              aria-expanded={menuFor === m.id}
                              title={tr('Thêm thao tác')}
                              aria-label={tr('Thêm thao tác')}
                            >
                              ⋯
                            </button>
                          </span>
                        )}
                      </div>
                      {picking === m.id && (
                        <div className="chat-react-picker" role="group" aria-label={tr('Thả cảm xúc')}>
                          {REACTIONS.map((emoji) => (
                            <button key={emoji} type="button" className={emoji === myReaction ? 'mine' : ''} onClick={() => react(m, emoji === myReaction ? null : emoji)}>
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                      {menuFor === m.id && (
                        <div className="chat-menu" role="menu">
                          <button
                            role="menuitem"
                            onClick={() => {
                              setMenuFor(null);
                              pin(m, !m.pinned_at);
                            }}
                          >
                            {m.pinned_at ? tr('Bỏ ghim') : tr('Ghim')}
                          </button>
                          {!m.poll && (
                            <button
                              role="menuitem"
                              onClick={() => {
                                setMenuFor(null);
                                setForwarding(m);
                              }}
                            >
                              {tr('Chuyển tiếp')}
                            </button>
                          )}
                          <button
                            role="menuitem"
                            onClick={() => {
                              setMenuFor(null);
                              setTasking(m);
                            }}
                          >
                            {tr('Tạo task')}
                          </button>
                          {own && (
                            <>
                              {!m.poll && (
                                <button
                                  role="menuitem"
                                  onClick={() => {
                                    setMenuFor(null);
                                    setEditing({ id: m.id, hasFiles: m.attachments.length > 0, ...fromMentionMarkup(m.body) });
                                  }}
                                >
                                  {tr('Sửa')}
                                </button>
                              )}
                              <button
                                role="menuitem"
                                className="danger"
                                onClick={() => {
                                  setMenuFor(null);
                                  remove(m);
                                }}
                              >
                                {tr('Xoá')}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      {seen.length > 0 && (
                        <div className="chat-seen" title={tr('Đã xem: {names}', { names: seen.map((u) => u.name).join(', ') })}>
                          {seen.slice(0, SEEN_SHOWN).map((u) => (
                            <Avatar key={u.id} name={u.name} userId={u.id} small />
                          ))}
                          {seen.length > SEEN_SHOWN && <span className="muted small">+{seen.length - SEEN_SHOWN}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
          {!atBottom && (
            <button className="chat-to-bottom" onClick={scrollToBottom} aria-label={tr('Xuống tin mới nhất')}>
              {newBelow ? tr('↓ {count} tin mới', { count: newBelow }) : '↓'}
            </button>
          )}
        </div>
      )}

      {showInfo ? null : chat.can_send ? (
        <div className="chat-composer">
          {!direct && (
            <div className="chat-composer-tools">
              <button type="button" className="link-btn" onClick={() => setPolling(true)}>
                {tr('📊 Bình chọn')}
              </button>
            </div>
          )}
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
            draft={drafts.get(conversationId)}
            onDraftChange={saveDraft}
            tools={(insert) => <EmojiPicker onPick={insert} />}
          />
        </div>
      ) : (
        <p className="muted chat-closed">{tr('Người này hiện không nhận được tin nhắn. Các tin cũ vẫn ở đây.')}</p>
      )}
      {forwarding && (
        <ForwardDialog
          message={forwarding}
          onClose={() => {
            setForwarding(null);
            onChanged();
          }}
          onError={onError}
        />
      )}
      {polling && (
        <PollDialog
          conversationId={conversationId}
          onCreated={() => {
            stick.current = true;
            load();
            onChanged();
          }}
          onClose={() => setPolling(false)}
        />
      )}
      {tasking && <TaskFromMessage message={tasking} conversationId={conversationId} onCreated={onOpenTask} onClose={() => setTasking(null)} />}
    </div>
  );
}
