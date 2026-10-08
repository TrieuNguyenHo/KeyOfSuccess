import { useContext, useRef, useState } from 'react';
import { api, uploadFile } from '../../api.js';
import { can, formatDateTime } from '../../utils.js';
import { FileList, MAX_MB, uploadable } from './Attachments.jsx';
import { askConfirm } from '../../components/Dialog.jsx';
import { Avatar } from '../../components/Avatar.jsx';
import { CommentBody, MentionTextarea, fromMentionMarkup, toMentionMarkup } from '../../components/Mentions.jsx';
import { CurrentUser } from '../../components/CurrentUser.js';
import { tr } from '../../i18n.js';

// A thread of task comments (kind 'comments'), requirement feedback (kind 'requirement-comments') or feedback
// messages (kind 'feedback-messages'). The author edits and deletes their own; a Manager deletes any (canDeleteAny
// overrides that). Files sent with a comment show under it; canDeleteFiles (task admins / requirement editors) may
// delete anyone's. tagOf(comment) may label the author. act(fn) runs a request, then reloads.
export default function CommentList({ comments, kind, mentionable, empty, act, canDeleteFiles, onError, canDeleteAny, tagOf }) {
  const me = useContext(CurrentUser);
  const deleteAny = canDeleteAny ?? can(me, 'comments.delete_any');
  const [editing, setEditing] = useState(null); // { id, text, mentions, hasFiles }

  async function save() {
    const body = toMentionMarkup(editing.text.trim(), editing.mentions);
    if (!body && !editing.hasFiles) return;
    await act(() => api(`/${kind}/${editing.id}`, { method: 'PATCH', body: { body } }));
    setEditing(null);
  }

  async function remove(c) {
    const ok = await askConfirm({
      title: tr('Xoá comment này?'),
      message:
        (c.user_id === me.id ? '' : tr('Nội dung của {p0} sẽ bị xoá. ', { p0: c.user_name ?? tr('người khác') })) +
        (c.attachments?.length ? tr('{length} file kèm theo cũng bị xoá. ', { length: c.attachments.length }) : '') +
        tr('Không hoàn tác được.'),
      confirmLabel: tr('Xoá'),
      danger: true,
    });
    if (ok) act(() => api(`/${kind}/${c.id}`, { method: 'DELETE' }));
  }

  return (
    <div className="comments">
      {comments.length === 0 && <p className="muted">{empty}</p>}
      {comments.map((c) => {
        const own = c.user_id === me.id;
        const files = c.attachments ?? [];
        return (
          <div key={c.id} className="comment">
            <Avatar name={c.user_name ?? '?'} userId={c.user_id} small />
            <div className="grow">
              <div className="comment-meta">
                <b>{c.user_name ?? tr('Người dùng đã xoá')}</b> {tagOf?.(c) && <span className="tag owner">{tagOf(c)}</span>}{' '}
                <span className="muted">
                  {formatDateTime(c.created_at)}
                  {c.edited_at && <span title={tr('Sửa lúc {p0}', { p0: formatDateTime(c.edited_at) })}> {tr('· đã sửa')}</span>}
                </span>
                {editing?.id !== c.id && (own || deleteAny) && (
                  <span className="comment-actions">
                    {own && (
                      <button
                        className="link-btn"
                        onClick={() => setEditing({ id: c.id, hasFiles: files.length > 0, ...fromMentionMarkup(c.body) })}
                      >
                        {tr('Sửa')}
                      </button>
                    )}
                    <button className="link-btn danger" onClick={() => remove(c)}>
                      {tr('Xoá')}
                    </button>
                  </span>
                )}
              </div>
              {editing?.id === c.id ? (
                <form
                  className="comment-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save();
                  }}
                  onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                >
                  <MentionTextarea
                    value={editing.text}
                    onChange={(text) => setEditing((ed) => ({ ...ed, text }))}
                    users={mentionable}
                    mentions={editing.mentions}
                    onMentionsChange={(mentions) => setEditing((ed) => ({ ...ed, mentions }))}
                  />
                  <span className="comment-edit-buttons">
                    <button type="button" className="btn" onClick={() => setEditing(null)}>
                      {tr('Huỷ')}
                    </button>
                    <button className="btn primary" disabled={!editing.text.trim() && !editing.hasFiles}>
                      {tr('Lưu')}
                    </button>
                  </span>
                </form>
              ) : (
                c.body && <CommentBody body={c.body} />
              )}
              {files.length > 0 && (
                <FileList files={files} canDeleteAll={canDeleteFiles} act={act} onError={onError} compact />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// The box for a new comment: text with @mentions, plus files (📎, drag and drop, or pasting a screenshot).
// The comment is posted to createPath, then its files to /<kind>/<id>/attachments. act(fn) runs it and reloads.
// enterSends as in MentionTextarea (chat messages); extra goes into the posted body (a chat answer's reply_to_id).
export function CommentComposer({ kind, createPath, mentionable, placeholder, act, onError, enterSends = false, extra }) {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState([]);
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const input = useRef(null);

  const add = (list) => {
    const ok = uploadable(list, onError);
    if (ok.length) setFiles((current) => [...current, ...ok]);
  };

  function send(e) {
    e.preventDefault();
    const body = toMentionMarkup(text.trim(), mentions);
    const sending = files;
    if (!body && !sending.length) return;
    setText('');
    setMentions([]);
    setFiles([]);
    act(async () => {
      const comment = await api(createPath, { method: 'POST', body: { body, with_files: sending.length > 0, ...extra } });
      for (const file of sending) await uploadFile(`/${kind}/${comment.id}/attachments`, file);
    });
  }

  return (
    <form
      className={`comment-form ${dragOver ? 'drag-over' : ''}`}
      onSubmit={send}
      // A pasted screenshot becomes a file; pasted text stays text.
      onPaste={(e) => {
        if (!e.clipboardData.files.length || e.clipboardData.getData('text/plain')) return;
        e.preventDefault();
        add(e.clipboardData.files);
      }}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes('Files')) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setDragOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragOver(false);
        add(e.dataTransfer.files);
      }}
    >
      <MentionTextarea
        value={text}
        onChange={setText}
        users={mentionable}
        mentions={mentions}
        onMentionsChange={setMentions}
        placeholder={placeholder}
        enterSends={enterSends}
      />
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
      <span className="comment-form-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={() => input.current.click()}
          title={tr('Đính kèm file (tối đa {MAX_MB} MB/file; kéo thả hoặc dán ảnh cũng được)', { MAX_MB })}
          aria-label={tr('Đính kèm file')}
        >
          📎
        </button>
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
        <button className="btn primary" disabled={!text.trim() && !files.length}>
          {tr('Gửi')}
        </button>
      </span>
    </form>
  );
}
