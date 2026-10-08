import { useState } from 'react';
import { formatDate, formatDateTime } from '../../utils.js';
import { Avatar } from '../../components/Avatar.jsx';
import { tr } from '../../i18n.js';

// The morning reminder (due_digest): its counts, without the zeros. On a Friday the next work day is Monday.
function digestText({ overdue, today, soon, day, until }) {
  const nextIsMonday = (new Date(`${until}T00:00`) - new Date(`${day}T00:00`)) / 86400000 > 1;
  return [
    overdue && tr('{n} task quá hạn', { n: overdue }),
    today && tr('{n} task đến hạn hôm nay', { n: today }),
    soon && (nextIsMonday ? tr('{n} task đến hạn thứ Hai', { n: soon }) : tr('{n} task đến hạn ngày mai', { n: soon })),
  ]
    .filter(Boolean)
    .join(', ');
}

// What a notification says. The actor and the task are in bold; a comment or mention adds its start below.
function NotificationText({ n }) {
  const actor = <b>{n.actor_name ?? tr('Ai đó')}</b>;
  const task = <b>{n.task_title}</b>;
  const quote = n.excerpt && <span className="notif-excerpt">“{n.excerpt}”</span>;
  switch (n.type) {
    case 'due_digest':
      return (
        <span>
          <b>{tr('Nhắc hạn chót')}</b>: {digestText(JSON.parse(n.excerpt))}
        </span>
      );
    case 'assigned':
      return (
        <span>
          {actor} {tr('đã giao cho bạn task')} {task}
        </span>
      );
    case 'mention':
      return (
        <>
          <span>
            {actor} {tr('đã nhắc bạn trong')} {n.task_id ? 'task' : 'requirement'} <b>{n.task_title ?? n.requirement_title}</b>
          </span>
          {quote}
        </>
      );
    case 'comment':
      return (
        <>
          <span>
            {actor} {tr('đã comment trong task')} {task}
          </span>
          {quote}
        </>
      );
    case 'task_due':
      return n.excerpt ? (
        <span>
          {actor} {tr('đã đổi hạn chót của')} {task} {tr('thành')} <b>{formatDate(n.excerpt)}</b>
        </span>
      ) : (
        <span>
          {actor} {tr('đã bỏ hạn chót của')} {task}
        </span>
      );
    case 'task_assignee':
      return n.excerpt ? (
        <span>
          {actor} {tr('đã giao')} {task} {tr('cho')} <b>{n.excerpt}</b>
        </span>
      ) : (
        <span>
          {actor} {tr('đã bỏ người làm của')} {task}
        </span>
      );
    case 'task_status':
      return (
        <span>
          {actor} {tr('đã chuyển')} {task} {tr('sang')} <b>{n.excerpt}</b>
        </span>
      );
    case 'task_reopened':
      return (
        <span>
          {actor} {tr('đã mở lại')} {task}
        </span>
      );
    default: // task_completed, task_done
      return (
        <span>
          {actor} {tr('đã hoàn thành')} {task}
        </span>
      );
  }
}

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
                {n.type === 'due_digest' ? (
                  <span className="notif-icon" aria-hidden="true">
                    ⏰
                  </span>
                ) : (
                  <Avatar name={n.actor_name ?? '?'} userId={n.actor_id} small />
                )}
                <span className="notif-text">
                  <NotificationText n={n} />
                  <span className="muted small">
                    {n.project_name ? `${n.project_name} · ` : ''}
                    {formatDateTime(n.created_at)}
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
