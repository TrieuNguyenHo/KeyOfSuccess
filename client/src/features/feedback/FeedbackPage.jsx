import { useCallback, useEffect, useState } from 'react';
import { api, onFeedbackChange } from '../../api.js';
import { ErrorBanner } from '../../components/Controls.jsx';
import FeedbackDetail from './FeedbackDetail.jsx';
import FeedbackForm from './FeedbackForm.jsx';
import FeedbackList from './FeedbackList.jsx';
import { tr } from '../../i18n.js';

// "Feedback" (#/feedback, #/feedback/12) for every company user: their own feedback on the app and its answers.
// Root handles it on the System configuration screen. fromPage is the screen the user came from (sent with a new
// feedback); onOpen(id | null) moves between the list and one feedback.
export default function FeedbackPage({ feedbackId, fromPage, onOpen }) {
  const [items, setItems] = useState(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    () =>
      api('/feedback')
        .then(setItems)
        .catch((e) => setError(e.message)),
    []
  );
  useEffect(() => {
    if (feedbackId) return undefined;
    load();
    return onFeedbackChange(load);
  }, [feedbackId, load]);

  return (
    <div className="project">
      <header className="project-header">
        <h1>Feedback</h1>
        <span className="grow" />
        {!feedbackId && !writing && (
          <button className="btn primary small" onClick={() => setWriting(true)}>
            {tr('+ Gửi feedback')}
          </button>
        )}
      </header>
      <div className="list admin">
        {feedbackId ? (
          <FeedbackDetail feedbackId={feedbackId} onBack={() => onOpen(null)} onDeleted={() => onOpen(null)} />
        ) : (
          <>
            <ErrorBanner error={error} onClose={() => setError('')} />
            <section className="admin-card">
              <p className="muted card-sub">
                {tr(
                  'Báo lỗi hoặc đề xuất cho app. Chỉ bạn và quản trị hệ thống thấy feedback của bạn. Bạn sửa / xoá được cho tới khi feedback được tiếp nhận; sau đó hai bên trao đổi ở phần bên dưới feedback.'
                )}
              </p>
              {writing && (
                <FeedbackForm
                  page={fromPage}
                  onSaved={(saved) => {
                    setWriting(false);
                    onOpen(saved.id);
                  }}
                  onCancel={() => setWriting(false)}
                  onError={setError}
                />
              )}
            </section>
            <section className="admin-card">
              <h2>{tr('Feedback của tôi')}</h2>
              {items ? (
                <FeedbackList items={items} empty={tr('Bạn chưa gửi feedback nào.')} onOpen={onOpen} />
              ) : (
                <p className="muted">{tr('Đang tải…')}</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
