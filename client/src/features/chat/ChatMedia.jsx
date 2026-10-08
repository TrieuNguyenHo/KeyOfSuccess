import { useContext, useEffect, useState } from 'react';
import { api, fetchAttachment } from '../../api.js';
import { CurrentUser } from '../../components/CurrentUser.js';
import { askConfirm } from '../../components/Dialog.jsx';
import { tr } from '../../i18n.js';
import { saveBlob } from '../comments/Attachments.jsx';

// An image's bytes as an object URL, fetched with the token (files never sit behind a bare URL).
function useImageUrl(id) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let objectUrl;
    fetchAttachment(id)
      .then((blob) => setUrl((objectUrl = URL.createObjectURL(blob))))
      .catch(() => {});
    return () => objectUrl && URL.revokeObjectURL(objectUrl);
  }, [id]);
  return url;
}

function Thumb({ file, onOpen }) {
  const url = useImageUrl(file.id);
  return (
    <button type="button" className="chat-image" onClick={onOpen} title={file.name} aria-label={tr('Xem ảnh {name}', { name: file.name })}>
      {url ? <img src={url} alt={file.name} /> : <span className="chat-image-wait" aria-hidden="true" />}
    </button>
  );
}

// Full screen: one image at a time, ← / → between the message's images, Esc or a click outside closes. The uploader
// deletes it from here. act(fn) runs a request, then reloads.
function Lightbox({ files, index, onIndex, onClose, act, onError }) {
  const me = useContext(CurrentUser);
  const file = files[index];
  const url = useImageUrl(file.id);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (e.key === 'ArrowRight' && index < files.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, files.length, onIndex, onClose]);

  async function download() {
    try {
      saveBlob(await fetchAttachment(file.id), file.name);
    } catch (e) {
      onError(e.message);
    }
  }

  async function remove() {
    const ok = await askConfirm({ title: tr('Xoá file "{name}"?', { name: file.name }), message: tr('Không hoàn tác được.'), confirmLabel: tr('Xoá file'), danger: true });
    if (!ok) return;
    onClose();
    act(() => api(`/attachments/${file.id}`, { method: 'DELETE' }));
  }

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={file.name} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lightbox-bar">
        <span className="ellipsis grow">{file.name}</span>
        {files.length > 1 && <span>{`${index + 1} / ${files.length}`}</span>}
        <button className="btn small" onClick={download}>
          {tr('Tải về')}
        </button>
        {file.user_id === me.id && (
          <button className="btn small danger" onClick={remove}>
            {tr('Xoá file')}
          </button>
        )}
        <button className="btn small" onClick={onClose} aria-label={tr('Đóng')}>
          ✕
        </button>
      </div>
      {index > 0 && (
        <button className="lightbox-nav prev" onClick={() => onIndex(index - 1)} aria-label={tr('Ảnh trước')}>
          ‹
        </button>
      )}
      {url && <img className="lightbox-img" src={url} alt={file.name} />}
      {index < files.length - 1 && (
        <button className="lightbox-nav next" onClick={() => onIndex(index + 1)} aria-label={tr('Ảnh sau')}>
          ›
        </button>
      )}
    </div>
  );
}

// The images of a message, shown in it (one large, several in a grid); a click opens them full screen.
export default function ChatImages({ files, act, onError }) {
  const [open, setOpen] = useState(null);
  return (
    <>
      <div className={`chat-images ${files.length > 1 ? 'grid' : ''}`}>
        {files.map((f, i) => (
          <Thumb key={f.id} file={f} onOpen={() => setOpen(i)} />
        ))}
      </div>
      {open !== null && files[open] && <Lightbox files={files} index={open} onIndex={setOpen} onClose={() => setOpen(null)} act={act} onError={onError} />}
    </>
  );
}
