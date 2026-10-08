import { useContext, useState } from 'react';
import { api } from '../../api.js';
import { Avatar } from '../../components/Avatar.jsx';
import { CurrentUser } from '../../components/CurrentUser.js';
import { locale, tr } from '../../i18n.js';

const OPTIONS_MIN = 2; // as on the server (lib/polls.js)
const OPTIONS_MAX = 10;
const OPTION_MAX = 100;
const QUESTION_MAX = 200;
const VOTERS_SHOWN = 3;

const parseTime = (s) => new Date(`${s.replace(' ', 'T')}Z`);
const whenText = (s) => parseTime(s).toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// A poll in the conversation (v37): options with a bar of their share, the voters' avatars (names on hover), a click to
// vote or take a vote back. Its creator closes it; others add options when it allows. onChange(message) with the
// updated message, onError(text).
export function PollCard({ message, onChange, onError }) {
  const me = useContext(CurrentUser);
  const poll = message.poll;
  const own = message.user_id === me.id;
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const most = Math.max(1, ...poll.options.map((o) => o.count));

  async function run(path, body) {
    try {
      onChange(await api(`/chat-messages/${message.id}/${path}`, { method: 'POST', body }));
      return true;
    } catch (e) {
      onError(e.message);
      return false;
    }
  }

  function pick(option) {
    const mine = poll.options.filter((o) => o.mine).map((o) => o.id);
    let ids;
    if (poll.multiple) ids = option.mine ? mine.filter((id) => id !== option.id) : [...mine, option.id];
    else ids = option.mine ? [] : [option.id];
    run('vote', { option_ids: ids });
  }

  async function addOption(e) {
    e.preventDefault();
    if (!text.trim()) return;
    if (await run('poll-options', { text: text.trim() })) {
      setText('');
      setAdding(false);
    }
  }

  const facts = [
    tr('{count} người đã bình chọn', { count: poll.voter_count }),
    poll.multiple && tr('Chọn được nhiều phương án'),
    !poll.open ? tr('Đã khoá') : poll.closes_at && tr('Khoá lúc {time}', { time: whenText(poll.closes_at) }),
  ].filter(Boolean);

  return (
    <div className="poll">
      <div className="poll-question">
        <span aria-hidden="true">📊</span> {message.body}
      </div>
      <ul className="poll-options" role="group" aria-label={message.body}>
        {poll.options.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              className={`poll-option ${o.mine ? 'mine' : ''}`}
              onClick={() => pick(o)}
              disabled={!poll.open}
              role={poll.multiple ? 'checkbox' : 'radio'}
              aria-checked={o.mine}
            >
              <span className="poll-bar" style={{ width: `${(o.count / most) * 100}%` }} aria-hidden="true" />
              <span className={`poll-mark ${poll.multiple ? 'box' : 'dot'}`} aria-hidden="true" />
              <span className="grow poll-text">{o.text}</span>
              {o.voters.length > 0 && (
                <span className="poll-voters" title={o.voters.map((v) => v.name).join(', ')}>
                  {o.voters.slice(0, VOTERS_SHOWN).map((v) => (
                    <Avatar key={v.id} name={v.name ?? '?'} userId={v.id} small />
                  ))}
                </span>
              )}
              <span className="poll-count">{o.count}</span>
            </button>
          </li>
        ))}
      </ul>
      {adding ? (
        <form className="poll-add" onSubmit={addOption}>
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={OPTION_MAX} placeholder={tr('Phương án mới')} aria-label={tr('Phương án mới')} />
          <button className="btn small primary" disabled={!text.trim()}>
            {tr('Thêm')}
          </button>
          <button type="button" className="btn small" onClick={() => setAdding(false)}>
            {tr('Huỷ')}
          </button>
        </form>
      ) : (
        poll.open &&
        (poll.allow_add || own) && (
          <button type="button" className="link-btn" onClick={() => setAdding(true)}>
            {tr('+ Thêm phương án')}
          </button>
        )
      )}
      <div className="poll-facts muted small">
        <span>{facts.join(' · ')}</span>
        {own && poll.open && (
          <button type="button" className="link-btn" onClick={() => run('close-poll')}>
            {tr('Khoá bình chọn')}
          </button>
        )}
      </div>
    </div>
  );
}

// "Tạo bình chọn": the question, 2 to 10 options, several choices or one, others adding options, an optional deadline.
export function PollDialog({ conversationId, onCreated, onClose }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(true);
  const [allowAdd, setAllowAdd] = useState(true);
  const [closesAt, setClosesAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const filled = options.filter((o) => o.trim());

  async function submit(e) {
    e.preventDefault();
    if (!question.trim() || filled.length < OPTIONS_MIN || busy) return;
    setBusy(true);
    try {
      await api(`/chats/${conversationId}/polls`, {
        method: 'POST',
        // datetime-local is the reader's local time; the server gets it as an instant.
        body: { question: question.trim(), options: filled, multiple, allow_add: allowAdd, closes_at: closesAt ? new Date(closesAt).toISOString() : null },
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal chat-dialog" onClick={(e) => e.stopPropagation()} onSubmit={submit} aria-label={tr('Tạo bình chọn')}>
        <div className="modal-header">
          <h2>{tr('Tạo bình chọn')}</h2>
          <span className="grow" />
          <button type="button" className="icon-btn" onClick={onClose} aria-label={tr('Đóng')}>
            ✕
          </button>
        </div>
        <label className="form-field">
          <span>{tr('Câu hỏi')}</span>
          <input autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={QUESTION_MAX} required />
        </label>
        <div className="form-field poll-edit">
          <span>{tr('Phương án')}</span>
          {options.map((o, i) => (
            <span key={i} className="poll-edit-row">
              <input
                value={o}
                onChange={(e) => setOptions((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
                maxLength={OPTION_MAX}
                placeholder={tr('Phương án {n}', { n: i + 1 })}
                aria-label={tr('Phương án {n}', { n: i + 1 })}
              />
              {options.length > OPTIONS_MIN && (
                <button type="button" className="icon-btn" onClick={() => setOptions((list) => list.filter((_, j) => j !== i))} aria-label={tr('Bỏ phương án {n}', { n: i + 1 })}>
                  ✕
                </button>
              )}
            </span>
          ))}
          {options.length < OPTIONS_MAX && (
            <button type="button" className="link-btn" onClick={() => setOptions((list) => [...list, ''])}>
              {tr('+ Thêm phương án')}
            </button>
          )}
        </div>
        <label className="poll-check">
          <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} />
          {tr('Cho chọn nhiều phương án')}
        </label>
        <label className="poll-check">
          <input type="checkbox" checked={allowAdd} onChange={(e) => setAllowAdd(e.target.checked)} />
          {tr('Cho người khác thêm phương án')}
        </label>
        <label className="form-field">
          <span>{tr('Hạn chót (không bắt buộc)')}</span>
          <input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            {tr('Huỷ')}
          </button>
          <button className="btn primary" disabled={!question.trim() || filled.length < OPTIONS_MIN || busy}>
            {tr('Tạo bình chọn')}
          </button>
        </div>
      </form>
    </div>
  );
}
