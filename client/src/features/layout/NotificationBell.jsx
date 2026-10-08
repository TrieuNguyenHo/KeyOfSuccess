import { useState } from 'react';
import { FEEDBACK_STATUSES, formatDateTime } from '../../utils.js';
import { Avatar } from '../../components/Avatar.jsx';
import { tr } from '../../i18n.js';

// alignRight opens the panel leftwards, for a bell at the right of the screen (root's header).
export default function NotificationBell({ data, onOpen, onReadAll, alignRight = false }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`bell-wrap ${alignRight ? 'align-right' : ''}`}>
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
                  {n.type === 'feedback_new' ? (
                    <span>
                      <b>{n.actor_name ?? tr('Ai đó')}</b> {tr('đã gửi feedback')} <b>{n.feedback_title}</b>
                    </span>
                  ) : n.type === 'feedback_status' ? (
                    <span>
                      <b>{n.actor_name ?? tr('Ai đó')}</b> {tr('đã chuyển feedback')} <b>{n.feedback_title}</b> {tr('sang')}{' '}
                      <b>{FEEDBACK_STATUSES[n.excerpt] ?? n.excerpt}</b>
                    </span>
                  ) : n.type === 'feedback_message' ? (
                    <>
                      <span>
                        <b>{n.actor_name ?? tr('Ai đó')}</b> {tr('đã trả lời feedback')} <b>{n.feedback_title}</b>
                      </span>
                      {n.excerpt && <span className="notif-excerpt">“{n.excerpt}”</span>}
                    </>
                  ) : n.type === 'assigned' ? (
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
                    {n.project_name ?? 'Feedback'} · {formatDateTime(n.created_at)}
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
