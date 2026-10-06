import { useState } from 'react';
import { formatDateTime } from '../../utils.js';
import { Avatar } from '../../components/Avatar.jsx';
import { tr } from '../../i18n.js';

export default function NotificationBell({ data, onOpen, onReadAll }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bell-wrap">
      <button className="icon-btn light bell" onClick={() => setOpen((o) => !o)} title={tr('Thông báo')}>
        🔔
        {data.unread > 0 && <span className="badge">{data.unread > 99 ? '99+' : data.unread}</span>}
      </button>
      {open && (
        <>
          <div className="click-away" onClick={() => setOpen(false)} />
          <div className="notif-panel">
            <div className="notif-head">
              <b>{tr('Thông báo')}</b>
              <span className="grow" />
              {data.unread > 0 && (
                <button className="link-btn" onClick={onReadAll}>
                  {tr('Đánh dấu đã đọc hết')}
                </button>
              )}
            </div>
            {data.items.length === 0 && <p className="muted notif-empty">{tr('Chưa có thông báo.')}</p>}
            {data.items.map((n) => (
              <button
                key={n.id}
                className={`notif ${n.read_at ? '' : 'unread'}`}
                onClick={() => {
                  setOpen(false);
                  onOpen(n);
                }}
              >
                <Avatar name={n.actor_name ?? '?'} userId={n.actor_id} small />
                <span className="notif-text">
                  {n.type === 'assigned' ? (
                    <span>
                      <b>{n.actor_name ?? tr('Ai đó')}</b> {tr('đã giao cho bạn task')} <b>{n.task_title}</b>
                    </span>
                  ) : n.type === 'mention' ? (
                    <>
                      <span>
                        <b>{n.actor_name ?? tr('Ai đó')}</b> {tr('đã nhắc bạn trong')} {n.task_id ? 'task' : 'requirement'}{' '}
                        <b>{n.task_title ?? n.requirement_title}</b>
                      </span>
                      {n.excerpt && <span className="notif-excerpt">“{n.excerpt}”</span>}
                    </>
                  ) : (
                    <span>
                      <b>{n.actor_name ?? tr('Ai đó')}</b> {tr('đã hoàn thành')} <b>{n.task_title}</b>
                    </span>
                  )}
                  <span className="muted small">
                    {n.project_name} · {formatDateTime(n.created_at)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
