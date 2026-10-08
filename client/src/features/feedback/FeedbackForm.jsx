import { useRef, useState } from 'react';
import { api, uploadFile } from '../../api.js';
import { FEEDBACK_TYPES } from '../../utils.js';
import { uploadable } from '../comments/Attachments.jsx';
import { tr } from '../../i18n.js';

// Sends a new feedback (with files: 📎, drag and drop or a pasted screenshot) or edits one (`feedback` given; its
// files are managed on the feedback itself). `page` is the screen the user came from, recorded with a new feedback.
// onSaved(feedback) gets the server's answer.
export default function FeedbackForm({ feedback, page, onSaved, onCancel, onError }) {
  const [type, setType] = useState(feedback?.type ?? 'bug');
  const [title, setTitle] = useState(feedback?.title ?? '');
  const [body, setBody] = useState(feedback?.body ?? '');
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const input = useRef(null);
  const valid = title.trim() && body.trim();

  const add = (list) => {
    const ok = uploadable(list, onError);
    if (ok.length) setFiles((current) => [...current, ...ok]);
  };

  async function save(e) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      const fields = { type, title: title.trim(), body: body.trim() };
      let saved;
      if (feedback) saved = await api(`/feedback/${feedback.id}`, { method: 'PATCH', body: fields });
      else {
        saved = await api('/feedback', { method: 'POST', body: { ...fields, page } });
        for (const file of files) await uploadFile(`/feedback/${saved.id}/attachments`, file);
      }
      onSaved(saved);
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className={`feedback-form ${dragOver ? 'drag-over' : ''}`}
      onSubmit={save}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      onPaste={(e) => {
        if (feedback || !e.clipboardData.files.length || e.clipboardData.getData('text/plain')) return;
        e.preventDefault();
        add(e.clipboardData.files);
      }}
      onDragOver={(e) => {
        if (feedback || ![...e.dataTransfer.types].includes('Files')) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setDragOver(false)}
      onDrop={(e) => {
        if (feedback || !e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragOver(false);
        add(e.dataTransfer.files);
      }}
    >
      <div className="tabs" role="radiogroup" aria-label={tr('Loại feedback')}>
        {Object.entries(FEEDBACK_TYPES).map(([key, label]) => (
          <button key={key} type="button" role="radio" aria-checked={type === key} className={type === key ? 'active' : ''} onClick={() => setType(key)}>
            {label}
          </button>
        ))}
      </div>
      <label>
        {tr('Tiêu đề')}
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus placeholder={tr('Tóm tắt trong một câu')} />
      </label>
      <label>
        {tr('Nội dung')}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          maxLength={10000}
          placeholder={
            type === 'bug'
              ? tr('Bạn đã làm gì, app hiện ra gì, bạn mong đợi điều gì?')
              : tr('Bạn muốn app có gì, và vì sao?')
          }
        />
      </label>
      {!feedback && (
        <div className="feedback-files">
          {files.length > 0 && (
            <ul className="pending-files">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="pending-file">
                  <span aria-hidden="true">📎</span>
                  <span className="ellipsis">{f.name}</span>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setFiles((list) => list.filter((_, j) => j !== i))}
                    aria-label={tr('Bỏ {name}', { name: f.name })}
                    title={tr('Bỏ file này')}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="link-btn" onClick={() => input.current.click()}>
            {tr('📎 Đính kèm ảnh chụp màn hình hoặc file')}
          </button>
          <span className="muted small">{tr('Dán ảnh (Ctrl+V) hoặc kéo thả file vào đây cũng được.')}</span>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              add(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}
      <div className="feedback-form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          {tr('Huỷ')}
        </button>
        <button className="btn primary" disabled={!valid || saving}>
          {feedback ? tr('Lưu') : tr('Gửi feedback')}
        </button>
      </div>
    </form>
  );
}
