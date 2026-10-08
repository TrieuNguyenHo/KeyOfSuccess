import { useCallback, useEffect, useState } from 'react';
import { api, onFeedbackChange } from '../../api.js';
import { FEEDBACK_STATUSES, FEEDBACK_TYPES } from '../../utils.js';
import { ErrorBanner } from '../../components/Controls.jsx';
import FeedbackDetail from './FeedbackDetail.jsx';
import FeedbackList from './FeedbackList.jsx';
import { tr } from '../../i18n.js';

// Root's inbox of everyone's feedback, filtered by status and type; openId shows one, onOpen(id | null) switches.
export default function FeedbackInbox({ openId, onOpen }) {
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const query = new URLSearchParams({ ...(status && { status }), ...(type && { type }) }).toString();
    return api(`/feedback${query ? `?${query}` : ''}`)
      .then(setItems)
      .catch((e) => setError(e.message));
  }, [status, type]);
  useEffect(() => {
    if (openId) return undefined;
    load();
    return onFeedbackChange(load);
  }, [openId, load]);

  if (openId) return <FeedbackDetail feedbackId={openId} handler onBack={() => onOpen(null)} onDeleted={() => onOpen(null)} />;

  return (
    <>
      <ErrorBanner error={error} onClose={() => setError('')} />
      <section className="admin-card">
        <div className="section-header feedback-filters">
          <div className="tabs" role="tablist" aria-label={tr('Lọc theo trạng thái')}>
            {[['', tr('Tất cả')], ...Object.entries(FEEDBACK_STATUSES)].map(([key, label]) => (
              <button key={key || 'all'} role="tab" aria-selected={status === key} className={status === key ? 'active' : ''} onClick={() => setStatus(key)}>
                {label}
              </button>
            ))}
          </div>
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label={tr('Lọc theo loại')}>
            <option value="">{tr('Mọi loại')}</option>
            {Object.entries(FEEDBACK_TYPES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {items ? (
          <FeedbackList items={items} withSender empty={tr('Không có feedback nào.')} onOpen={onOpen} />
        ) : (
          <p className="muted">{tr('Đang tải…')}</p>
        )}
      </section>
    </>
  );
}
