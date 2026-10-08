import { useState } from 'react';
import { api } from '../../api.js';
import { SearchBox } from '../../components/Controls.jsx';
import { useFetched } from '../../components/hooks.js';
import { tr } from '../../i18n.js';
import { ChatAvatar, chatTitle, fold } from './ChatParts.jsx';

// Sends a message on to other conversations (v36): one "Gửi" per conversation, which turns into "Đã gửi" so several can
// get it. The copy says only that it was forwarded, never from where.
export default function ForwardDialog({ message, onClose, onError }) {
  const chats = useFetched('/chats');
  const [query, setQuery] = useState('');
  const [sent, setSent] = useState(new Set());
  const shown = chats.filter((c) => c.can_send && fold(chatTitle(c)).includes(fold(query.trim())));

  async function send(chat) {
    try {
      await api(`/chat-messages/${message.id}/forward`, { method: 'POST', body: { conversation_id: chat.id } });
      setSent((s) => new Set(s).add(chat.id));
    } catch (e) {
      onError(e.message);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal chat-dialog" role="dialog" aria-modal="true" aria-label={tr('Chuyển tiếp tin nhắn')} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{tr('Chuyển tiếp tin nhắn')}</h2>
          <span className="grow" />
          <button type="button" className="icon-btn" onClick={onClose} aria-label={tr('Đóng')}>
            ✕
          </button>
        </div>
        <SearchBox value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('Tìm cuộc trò chuyện')} label={tr('Tìm cuộc trò chuyện')} wide />
        <ul className="chat-list chat-dialog-list">
          {shown.map((c) => (
            <li key={c.id} className="chat-row static">
              <ChatAvatar chat={c} />
              <span className="ellipsis grow chat-row-name">{chatTitle(c)}</span>
              {sent.has(c.id) ? (
                <span className="muted small">{tr('Đã gửi ✓')}</span>
              ) : (
                <button className="btn small primary" onClick={() => send(c)}>
                  {tr('Gửi')}
                </button>
              )}
            </li>
          ))}
          {shown.length === 0 && <li className="muted chat-note">{tr('Không có cuộc trò chuyện nào.')}</li>}
        </ul>
        <p className="muted small">{tr('Người nhận chỉ thấy "Đã chuyển tiếp", không thấy tin từ cuộc nào. Ảnh và file đi kèm cũng được gửi.')}</p>
      </div>
    </div>
  );
}
