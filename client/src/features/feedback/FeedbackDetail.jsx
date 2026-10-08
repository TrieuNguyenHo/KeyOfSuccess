import { useCallback, useEffect, useState } from 'react';
import { api, onFeedbackChange } from '../../api.js';
import { FEEDBACK_STATUSES, formatDateTime } from '../../utils.js';
import Attachments, { FileList } from '../comments/Attachments.jsx';
import CommentList, { CommentComposer } from '../comments/CommentList.jsx';
import { askConfirm } from '../../components/Dialog.jsx';
import { ErrorBanner } from '../../components/Controls.jsx';
import FeedbackForm from './FeedbackForm.jsx';
import { StatusTag, TypeTag } from './FeedbackList.jsx';
import { tr } from '../../i18n.js';

// Root's box for moving a feedback to another status, with an optional note for the thread ('rejected' needs one).
function StatusForm({ feedback, act }) {
  const [status, setStatus] = useState(feedback.status);
  const [note, setNote] = useState('');
  const needsNote = status === 'rejected' && !note.trim();
  const unchanged = status === feedback.status && !note.trim();
  useEffect(() => setStatus(feedback.status), [feedback.status]);

  return (
    <form
      className="feedback-status-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (needsNote || unchanged) return;
        act(async () => {
          await api(`/feedback/${feedback.id}/status`, { method: 'PATCH', body: { status, note: note.trim() } });
          setNote('');
        });
      }}
    >
      <label>
        {tr('Trạng thái')}
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {Object.entries(FEEDBACK_STATUSES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="grow">
        {status === 'rejected' ? tr('Lý do (bắt buộc, người gửi sẽ thấy)') : tr('Ghi chú cho người gửi (không bắt buộc)')}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={10000} />
      </label>
      <button className="btn primary" disabled={needsNote || unchanged}>
        {tr('Cập nhật')}
      </button>
    </form>
  );
}

// One feedback for its sender or root (handler): the text, files, status history and the thread between them.
// The sender edits or deletes it while it is 'sent'; root changes its status and deletes any.
export default function FeedbackDetail({ feedbackId, handler, onBack, onDeleted }) {
  const [feedback, setFeedback] = useState(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    () =>
      api(`/feedback/${feedbackId}`)
        .then(setFeedback)
        .catch((e) => setError(e.message)),
    [feedbackId]
  );
  useEffect(() => {
    load();
    return onFeedbackChange((change) => change.feedback_id === feedbackId && load());
  }, [feedbackId, load]);

  async function act(request) {
    try {
      await request();
      setError('');
    } catch (e) {
      setError(e.message);
    }
    await load();
  }

  async function remove() {
    const ok = await askConfirm({
      title: tr('Xoá feedback này?'),
      message: tr('Nội dung, file và trao đổi của feedback này sẽ bị xoá. Không hoàn tác được.'),
      confirmLabel: tr('Xoá'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/feedback/${feedbackId}`, { method: 'DELETE' });
      onDeleted();
    } catch (e) {
      setError(e.message);
    }
  }

  if (!feedback) {
    return (
      <div className="feedback-detail">
        <button className="link-btn" onClick={onBack}>
          {tr('← Quay lại')}
        </button>
        <p className="muted">{error || tr('Đang tải…')}</p>
      </div>
    );
  }

  return (
    <div className="feedback-detail">
      <button className="link-btn" onClick={onBack}>
        {tr('← Quay lại')}
      </button>
      <ErrorBanner error={error} onClose={() => setError('')} />

      <section className="admin-card">
        {editing ? (
          <FeedbackForm
            feedback={feedback}
            onSaved={() => {
              setEditing(false);
              load();
            }}
            onCancel={() => setEditing(false)}
            onError={setError}
          />
        ) : (
          <>
            <div className="feedback-head">
              <TypeTag type={feedback.type} />
              <h2 className="grow">{feedback.title}</h2>
              <StatusTag status={feedback.status} />
            </div>
            <p className="muted small">
              {handler && `${feedback.user_name ?? tr('Người dùng đã xoá')} (${feedback.user_email ?? '—'}) · `}
              {tr('Gửi lúc {time}', { time: formatDateTime(feedback.created_at) })}
            </p>
            <p className="feedback-body">{feedback.body}</p>
            {(feedback.can_edit || handler) && (
              <div className="feedback-actions">
                {feedback.can_edit && (
                  <button className="btn small" onClick={() => setEditing(true)}>
                    {tr('Sửa')}
                  </button>
                )}
                <button className="btn small danger" onClick={remove}>
                  {tr('Xoá')}
                </button>
                {feedback.can_edit && (
                  <span className="muted small">{tr('Sửa / xoá được cho tới khi feedback được tiếp nhận.')}</span>
                )}
              </div>
            )}
          </>
        )}

        {feedback.can_edit ? (
          <Attachments
            files={feedback.attachments}
            uploadPath={`/feedback/${feedback.id}/attachments`}
            canDeleteAll={false}
            act={act}
            onError={setError}
          />
        ) : (
          feedback.attachments.length > 0 && <FileList files={feedback.attachments} canDeleteAll={handler} locked act={act} onError={setError} />
        )}

        <details className="feedback-tech">
          <summary className="muted small">{tr('Thông tin kỹ thuật')}</summary>
          <dl>
            <dt>{tr('Màn hình')}</dt>
            <dd>{feedback.page || '—'}</dd>
            <dt>{tr('Phiên bản app')}</dt>
            <dd>{feedback.app_version || '—'}</dd>
            <dt>{tr('Trình duyệt')}</dt>
            <dd>{feedback.user_agent || '—'}</dd>
          </dl>
        </details>
      </section>

      {handler && (
        <section className="admin-card">
          <h3>{tr('Xử lý')}</h3>
          <StatusForm feedback={feedback} act={act} />
        </section>
      )}

      <section className="admin-card">
        <h3>{tr('Lịch sử trạng thái')}</h3>
        <ol className="feedback-history">
          <li>
            <StatusTag status="sent" /> <span className="muted small">{formatDateTime(feedback.created_at)}</span>
          </li>
          {feedback.events.map((e) => (
            <li key={e.id}>
              <StatusTag status={e.to_status} />{' '}
              <span className="muted small">
                {formatDateTime(e.created_at)} · {e.user_name ?? tr('Người dùng đã xoá')}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="admin-card">
        <h3>{tr('Trao đổi')}</h3>
        <CommentList
          comments={feedback.messages}
          kind="feedback-messages"
          mentionable={[]}
          empty={handler ? tr('Chưa có trao đổi nào.') : tr('Chưa có trao đổi nào. Quản trị hệ thống sẽ trả lời ở đây.')}
          act={act}
          canDeleteFiles={handler}
          canDeleteAny={handler}
          tagOf={(m) => (m.from_root ? tr('Quản trị hệ thống') : null)}
          onError={setError}
        />
        <CommentComposer
          kind="feedback-messages"
          createPath={`/feedback/${feedback.id}/messages`}
          mentionable={[]}
          placeholder={handler ? tr('Trả lời người gửi, dán ảnh hoặc bấm 📎 để đính kèm') : tr('Bổ sung thông tin, dán ảnh hoặc bấm 📎 để đính kèm')}
          act={act}
          onError={setError}
        />
      </section>
    </div>
  );
}
