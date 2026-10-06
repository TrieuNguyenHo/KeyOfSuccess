import { useEffect, useState } from 'react';
import { tr } from '../i18n.js';

// App-styled replacements for prompt() / confirm(). <DialogHost /> is mounted once in Workspace;
// askText / askConfirm open it and resolve when the user answers.
let show = null;

function open(dialog) {
  return new Promise((resolve) => {
    if (!show) return resolve(null);
    show({ ...dialog, resolve });
  });
}

// Resolves with the trimmed text, or null when cancelled or left empty / unchanged.
export const askText = ({ title, label, initial = '', placeholder, confirmLabel = tr('Lưu') }) =>
  open({ kind: 'text', title, label, initial, placeholder, confirmLabel });

// Resolves true or false. danger = destructive action (red button with ⚠).
export const askConfirm = ({ title, message, confirmLabel = tr('Đồng ý'), danger = false }) =>
  open({ kind: 'confirm', title, message, confirmLabel, danger }).then(Boolean);

export function DialogHost() {
  const [dialog, setDialog] = useState(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    show = (d) => {
      setValue(d.initial ?? '');
      setDialog(d);
    };
    return () => {
      show = null;
    };
  }, []);

  function finish(result) {
    dialog.resolve(result);
    setDialog(null);
  }

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e) => e.key === 'Escape' && finish(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!dialog) return null;

  const text = value.trim();
  const canSubmit = dialog.kind === 'confirm' || (text && text !== dialog.initial);

  return (
    <div className="modal-backdrop dialog-backdrop" onClick={() => finish(null)}>
      <form
        className="modal dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) finish(dialog.kind === 'text' ? text : true);
        }}
      >
        <div className="modal-header">
          <h2 id="dialog-title">
            {dialog.danger && <span aria-hidden="true">⚠ </span>}
            {dialog.title}
          </h2>
        </div>

        {dialog.kind === 'text' ? (
          <label className="form-field">
            <span>{dialog.label}</span>
            <input
              autoFocus
              value={value}
              placeholder={dialog.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </label>
        ) : (
          dialog.message && <p className="dialog-message">{dialog.message}</p>
        )}

        <div className="modal-actions">
          <button type="button" className="link-btn" onClick={() => finish(null)}>
            {tr('Huỷ')}
          </button>
          <button autoFocus={dialog.kind === 'confirm'} className={`btn ${dialog.danger ? 'danger' : 'primary'}`} disabled={!canSubmit}>
            {dialog.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
