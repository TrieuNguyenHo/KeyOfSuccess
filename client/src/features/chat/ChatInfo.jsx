import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { formatDateTime } from '../../utils.js';
import { tr } from '../../i18n.js';
import { FileList } from '../comments/Attachments.jsx';
import ChatImages from './ChatMedia.jsx';
import ChatMembers from './ChatMembers.jsx';

// A conversation's details: its members (groups, project and team chats) and, like Zalo, the images, files and links
// sent in it (v36), each with a way back to its message (onJump(messageId)). act / onLeft / onError as in ChatMembers.
export default function ChatInfo({ chat, act, onLeft, onJump, onError }) {
  const direct = chat.kind === 'direct';
  const [tab, setTab] = useState(direct ? 'images' : 'members');
  const [media, setMedia] = useState(null);

  useEffect(() => {
    if (tab === 'members') return;
    api(`/chats/${chat.id}/media`)
      .then(setMedia)
      .catch((e) => onError(e.message));
  }, [tab, chat.id, onError]);

  const tabs = [
    ...(direct ? [] : [['members', tr('Thành viên')]]),
    ['images', tr('Ảnh')],
    ['files', 'File'],
    ['links', 'Link'],
  ];

  return (
    <div className="chat-info">
      <div className="tabs chat-picker-tabs" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'members' && <ChatMembers chat={chat} act={act} onLeft={onLeft} onError={onError} />}
      {tab !== 'members' && !media && <p className="muted chat-note">{tr('Đang tải…')}</p>}
      {tab === 'images' && media && (
        <div className="chat-gallery">
          {media.images.length ? <ChatImages files={media.images} act={act} onError={onError} /> : <p className="muted">{tr('Chưa có ảnh nào.')}</p>}
        </div>
      )}
      {tab === 'files' && media && (
        <div className="chat-gallery">
          {media.files.length ? <FileList files={media.files} act={act} onError={onError} /> : <p className="muted">{tr('Chưa có file nào.')}</p>}
        </div>
      )}
      {tab === 'links' && media && (
        <ul className="chat-list chat-links">
          {media.links.map((l, i) => (
            <li key={`${l.message_id}-${i}`} className="chat-row static">
              <span className="chat-row-main">
                <a className="ellipsis" href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.url}
                </a>
                <span className="muted small">
                  {l.user_name ?? tr('Người dùng đã xoá')} · {formatDateTime(l.created_at)}
                </span>
              </span>
              <button className="link-btn" onClick={() => onJump(l.message_id)}>
                {tr('Xem tin')}
              </button>
            </li>
          ))}
          {media.links.length === 0 && <li className="muted chat-note">{tr('Chưa có link nào.')}</li>}
        </ul>
      )}
    </div>
  );
}
