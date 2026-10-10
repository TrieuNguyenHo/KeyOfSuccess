import { useContext, useState } from 'react';
import { api } from '../../api.js';
import { Avatar } from '../../components/Avatar.jsx';
import { CurrentUser } from '../../components/CurrentUser.js';
import { askConfirm, askText } from '../../components/Dialog.jsx';
import { useFetched } from '../../components/hooks.js';
import { tr } from '../../i18n.js';
import { PeopleList, personLine } from './ChatParts.jsx';

// Who is in a conversation. A group's owner renames it and takes people out; anyone in it adds people or leaves.
// Project and team chats follow the project's access and the team. act(fn) runs a request, then reloads; onLeft()
// after leaving.
export default function ChatMembers({ chat, act, onLeft, onError }) {
  const me = useContext(CurrentUser);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const people = useFetched(adding ? '/chats/people' : null);
  const group = chat.kind === 'group';
  const inGroup = new Set(chat.members.map((m) => m.id));

  async function rename() {
    const title = await askText({ title: tr('Đổi tên nhóm'), label: tr('Tên nhóm'), initial: chat.title });
    if (title) act(() => api(`/chats/${chat.id}`, { method: 'PATCH', body: { title } }));
  }

  async function remove(member) {
    const ok = await askConfirm({
      title: tr('Bỏ {name} khỏi nhóm?', { name: member.name }),
      message: tr('Người này sẽ không đọc được tin nhắn của nhóm nữa.'),
      confirmLabel: tr('Bỏ khỏi nhóm'),
      danger: true,
    });
    if (ok) act(() => api(`/chats/${chat.id}/members/${member.id}`, { method: 'DELETE' }));
  }

  async function leave() {
    const ok = await askConfirm({
      title: tr('Rời nhóm "{name}"?', { name: chat.title }),
      message:
        (chat.is_owner && chat.members.length > 1 ? tr('Quyền quản lý nhóm chuyển cho người vào nhóm sớm nhất. ') : '') +
        (chat.members.length === 1 ? tr('Bạn là người cuối cùng: nhóm và tin nhắn sẽ bị xoá. ') : '') +
        tr('Bạn sẽ không đọc được tin nhắn của nhóm nữa.'),
      confirmLabel: tr('Rời nhóm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/chats/${chat.id}/members/${me.id}`, { method: 'DELETE' });
      onLeft();
    } catch (e) {
      onError(e.message);
    }
  }

  async function add() {
    await act(() => api(`/chats/${chat.id}/members`, { method: 'POST', body: { user_ids: [...selected] } }));
    setAdding(false);
    setSelected(new Set());
  }

  const toggle = (p) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      return next;
    });

  return (
    <div className="chat-members">
      {chat.kind === 'project' && <p className="muted small">{tr('Ai mở được hoạt động này đều ở trong chat; ai không còn mở được hoạt động thì không đọc được nữa.')}</p>}
      {chat.kind === 'team' && <p className="muted small">{tr('Mọi người thuộc team đều ở trong chat; ai rời team thì không đọc được nữa.')}</p>}
      {group && (
        <div className="chat-members-actions">
          <button className="btn small" onClick={() => setAdding((a) => !a)}>
            {adding ? tr('Huỷ') : tr('+ Thêm người')}
          </button>
          {chat.is_owner && (
            <button className="btn small" onClick={rename}>
              {tr('Đổi tên nhóm')}
            </button>
          )}
          <button className="btn small danger" onClick={leave}>
            {tr('Rời nhóm')}
          </button>
        </div>
      )}
      {adding ? (
        <>
          <PeopleList people={people.filter((p) => !inGroup.has(p.id))} selected={selected} onPick={toggle} />
          <div className="chat-members-actions">
            <button className="btn primary small" disabled={!selected.size} onClick={add}>
              {tr('Thêm {count} người', { count: selected.size })}
            </button>
          </div>
        </>
      ) : (
        <ul className="chat-list">
          {chat.members.map((m) => (
            <li key={m.id} className="chat-row static">
              <Avatar name={m.name} userId={m.id} small />
              <span className="chat-row-main">
                <span className="chat-row-top">
                  <span className="ellipsis chat-row-name">{m.name}</span>
                  {m.owner && <span className="tag owner">{tr('Quản lý nhóm')}</span>}
                  {!m.at_work && <span className="tag">{tr('Không nhận tin')}</span>}
                </span>
                <span className="muted small ellipsis">{personLine(m)}</span>
              </span>
              {group && chat.is_owner && m.id !== me.id && (
                <button className="icon-btn danger" onClick={() => remove(m)} title={tr('Bỏ khỏi nhóm')} aria-label={tr('Bỏ {name} khỏi nhóm', { name: m.name })}>
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
