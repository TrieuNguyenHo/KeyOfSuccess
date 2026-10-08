import { useContext, useEffect, useRef, useState } from 'react';
import { api, fetchAttachment, uploadFile } from '../../api.js';
import { formatDateTime } from '../../utils.js';
import { askConfirm } from '../../components/Dialog.jsx';
import { CurrentUser } from '../../components/CurrentUser.js';
import { tr } from '../../i18n.js';

export const MAX_MB = 25; // same limit as the server
// Images the server serves as themselves (see INLINE_TYPES there); only these get a preview.
export const PREVIEW_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

const formatSize = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// Saves a blob under its name. A download link never renders the file, so an uploaded page cannot run.
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Thumbnail({ file }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let objectUrl;
    fetchAttachment(file.id)
      .then((blob) => setUrl((objectUrl = URL.createObjectURL(blob))))
      .catch(() => {});
    return () => objectUrl && URL.revokeObjectURL(objectUrl);
  }, [file.id]);
  return url ? <img src={url} alt="" /> : <span className="attachment-icon" aria-hidden="true">🖼</span>;
}

// The files of a list that may be uploaded; reports those over the limit through onError.
export function uploadable(list, onError) {
  const chosen = [...list];
  const tooBig = chosen.filter((f) => f.size > MAX_MB * 1024 * 1024);
  if (tooBig.length) onError(tr('File quá {MAX_MB} MB, hãy gửi link (Drive…) thay vì đính kèm: {p1}', { MAX_MB, p1: tooBig.map((f) => f.name).join(', ') }));
  return chosen.filter((f) => f.size > 0 && f.size <= MAX_MB * 1024 * 1024);
}

// A list of attached files: image previews, a click downloads, ✕ for those who may delete (the uploader unless
// `locked`, or everyone with canDeleteAll: task admins / requirement editors). act(fn) runs a request, then reloads.
export function FileList({ files, canDeleteAll, act, onError, compact = false, locked = false }) {
  const me = useContext(CurrentUser);

  async function open(file) {
    try {
      saveBlob(await fetchAttachment(file.id), file.name);
    } catch (e) {
      onError(e.message);
    }
  }

  async function remove(file) {
    const ok = await askConfirm({ title: tr('Xoá file "{name}"?', { name: file.name }), message: tr('Không hoàn tác được.'), confirmLabel: tr('Xoá file'), danger: true });
    if (ok) act(() => api(`/attachments/${file.id}`, { method: 'DELETE' }));
  }

  return (
    <ul className={`attachment-list ${compact ? 'compact' : ''}`}>
      {files.map((f) => (
        <li key={f.id} className="attachment">
          <button className="attachment-open" onClick={() => open(f)} title={tr('Tải {name}', { name: f.name })}>
            <span className="attachment-thumb">
              {PREVIEW_TYPES.includes(f.mime) ? <Thumbnail file={f} /> : <span className="attachment-icon" aria-hidden="true">📄</span>}
            </span>
            <span className="attachment-info">
              <span className="ellipsis">{f.name}</span>
              <span className="muted small ellipsis">
                {formatSize(f.size)}
                {!compact && ` · ${f.user_name ?? tr('Người dùng đã xoá')} · ${formatDateTime(f.created_at)}`}
              </span>
            </span>
          </button>
          {(canDeleteAll || (!locked && f.user_id === me.id)) && (
            <button className="icon-btn danger" onClick={() => remove(f)} title={tr('Xoá file')} aria-label={tr('Xoá {name}', { name: f.name })}>
              ✕
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

// Files attached to a task or a requirement. Anyone who sees it can add files (button or drag and drop);
// canDeleteAll is for task admins / requirement editors, everyone else deletes only their own uploads.
// act(fn) runs a request, then reloads the list.
export default function Attachments({ files, uploadPath, canDeleteAll, act, onError }) {
  const input = useRef(null);
  const [uploading, setUploading] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  async function add(list) {
    const ok = uploadable(list, onError);
    if (!ok.length) return;
    setUploading((n) => n + ok.length);
    await act(async () => {
      try {
        for (const file of ok) await uploadFile(uploadPath, file);
      } finally {
        setUploading((n) => n - ok.length);
      }
    });
  }

  return (
    <div
      className={`attachments ${dragOver ? 'drag-over' : ''}`}
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
      <div className="attachments-head">
        <h3>
          {tr('Đính kèm')} <span className="muted">{files.length}</span>
        </h3>
        <span className="grow" />
        {uploading > 0 && <span className="muted small">{tr('Đang tải lên {count} file…', { count: uploading })}</span>}
        <button className="link-btn" onClick={() => input.current.click()}>
          {tr('+ Thêm file')}
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
      </div>
      {files.length === 0 ? (
        <p className="muted small">{tr('Chưa có file. Kéo thả file vào đây hoặc bấm "+ Thêm file" (tối đa {max} MB/file).', { max: MAX_MB })}</p>
      ) : (
        <FileList files={files} canDeleteAll={canDeleteAll} act={act} onError={onError} />
      )}
    </div>
  );
}
