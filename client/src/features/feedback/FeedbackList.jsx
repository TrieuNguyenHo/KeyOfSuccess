import { FEEDBACK_STATUSES, FEEDBACK_TYPES, formatDateTime } from '../../utils.js';
import { tr } from '../../i18n.js';

export const StatusTag = ({ status }) => <span className={`tag fb-status fb-${status}`}>{FEEDBACK_STATUSES[status]}</span>;
export const TypeTag = ({ type }) => <span className="tag fb-type">{FEEDBACK_TYPES[type]}</span>;

// Feedback rows, latest activity first; withSender adds who sent each one (root's inbox).
export default function FeedbackList({ items, withSender, empty, onOpen }) {
  if (!items.length) return <p className="muted">{empty}</p>;
  return (
    <ul className="feedback-list">
      {items.map((f) => (
        <li key={f.id}>
          <button className="feedback-row" onClick={() => onOpen(f.id)}>
            <TypeTag type={f.type} />
            <span className="feedback-row-main">
              <span className="ellipsis feedback-row-title">{f.title}</span>
              <span className="muted small ellipsis">
                {withSender && `${f.user_name ?? tr('Người dùng đã xoá')} · `}
                {tr('Cập nhật {time}', { time: formatDateTime(f.updated_at) })}
                {f.message_count > 0 && ` · 💬 ${f.message_count}`}
              </span>
            </span>
            <StatusTag status={f.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}
