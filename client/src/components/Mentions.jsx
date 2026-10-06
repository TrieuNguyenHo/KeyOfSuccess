import { useRef, useState } from 'react';
import { tr } from '../i18n.js';
import { Avatar } from './Avatar.jsx';

// Comments store mentions as @[Name](userId). While typing, the textarea shows plain "@Name" and the
// picked people are kept aside; toMentionMarkup() turns them into markup when the comment is sent.
const MENTION_MARKUP = /@\[([^\]\n]{1,80})\]\((\d+)\)/g;
const MENTION_SUGGESTIONS = 6;

// Accent-insensitive match, so typing "@lan anh" finds "Lan Anh" and "@duc" finds "Đức".
const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

export function toMentionMarkup(text, mentions) {
  // Longest names first, so "@Lan Anh Nguyen" is not cut short by a mention of "Lan Anh".
  return [...mentions]
    .sort((a, b) => b.name.length - a.name.length)
    .reduce((out, m) => out.split(`@${m.name}`).join(`@[${m.name}](${m.id})`), text);
}

// The reverse, for editing a sent comment: plain "@Name" text plus the people it mentions.
export function fromMentionMarkup(body) {
  const mentions = [];
  const text = body.replace(MENTION_MARKUP, (markup, name, id) => {
    if (!mentions.some((m) => m.id === Number(id))) mentions.push({ id: Number(id), name });
    return `@${name}`;
  });
  return { text, mentions };
}

export function CommentBody({ body }) {
  const parts = [];
  let last = 0;
  for (const match of body.matchAll(MENTION_MARKUP)) {
    parts.push(body.slice(last, match.index));
    parts.push(
      <span key={match.index} className="mention">
        @{match[1]}
      </span>
    );
    last = match.index + match[0].length;
  }
  parts.push(body.slice(last));
  return <div className="comment-body">{parts}</div>;
}

// Textarea with an @-mention picker. `users` are the people who may be mentioned (they can see the
// task or requirement); `mentions` / `onMentionsChange` hold the ones picked so far.
export function MentionTextarea({ value, onChange, users, mentions, onMentionsChange, placeholder }) {
  const ref = useRef(null);
  const [query, setQuery] = useState(null); // { start, text } while the caret follows "@word"
  const [active, setActive] = useState(0);
  const matches = query
    ? users.filter((u) => fold(u.name).includes(fold(query.text))).slice(0, MENTION_SUGGESTIONS)
    : [];

  function detect(text, caret) {
    const match = /(^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
    setQuery(match ? { start: caret - match[2].length - 1, text: match[2] } : null);
    setActive(0);
  }

  function pick(user) {
    const caret = ref.current.selectionStart;
    const inserted = `@${user.name} `;
    onChange(value.slice(0, query.start) + inserted + value.slice(caret));
    if (!mentions.some((m) => m.id === user.id)) onMentionsChange([...mentions, { id: user.id, name: user.name }]);
    const position = query.start + inserted.length;
    setQuery(null);
    requestAnimationFrame(() => {
      ref.current.focus();
      ref.current.setSelectionRange(position, position);
    });
  }

  function onKeyDown(e) {
    if (!matches.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === 'Escape') {
      setQuery(null);
    }
  }

  return (
    <div className="mention-box">
      <textarea
        ref={ref}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={onKeyDown}
        onClick={(e) => detect(value, e.target.selectionStart)}
        onBlur={() => setQuery(null)}
        aria-autocomplete="list"
        aria-expanded={matches.length > 0}
      />
      {matches.length > 0 && (
        <ul className="mention-menu" role="listbox" aria-label={tr('Nhắc tới')}>
          {matches.map((u, i) => (
            <li
              key={u.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              // mousedown + preventDefault keeps focus in the textarea, so blur does not close the menu first.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(u);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <Avatar name={u.name} userId={u.id} small />
              <span className="ellipsis grow">{u.name}</span>
              <span className="muted small ellipsis">{u.email}</span>
            </li>
          ))}
        </ul>
      )}
      {query && matches.length === 0 && (
        <div className="mention-menu mention-empty muted small">{tr('Không có ai tên "{name}" xem được nội dung này.', { name: query.text })}</div>
      )}
    </div>
  );
}
