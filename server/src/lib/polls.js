// Polls in group, project and team chats (v37, decided 2026-10-08, like Zalo): the poll rides on a message whose body is
// its question. Its creator picks whether several options may be chosen, whether others may add options, and an
// optional deadline; they may also close it by hand. Votes are public (names shown) and can change while it is open.
import { db } from '../db.js';
import { placeholders } from './util.js';

export const QUESTION_MAX = 200;
export const OPTION_MAX = 100;
export const OPTIONS_MIN = 2;
export const OPTIONS_MAX = 10; // when created
export const OPTIONS_LIMIT = 20; // with the ones added later

const parseTime = (s) => new Date(`${s.replace(' ', 'T')}Z`);
// SQLite's datetime('now') form, which closes_at and closed_at use.
export const toStamp = (date) => date.toISOString().replace('T', ' ').slice(0, 19);

export const findPoll = (messageId) => db.prepare('SELECT * FROM polls WHERE message_id = ?').get(messageId);
export const isOpen = (poll) => !poll.closed_at && (!poll.closes_at || parseTime(poll.closes_at) > new Date());

// The options of a request: trimmed, without blanks or repeats (ignoring case); null when one is too long.
export function cleanOptions(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const options = [];
  for (const raw of list) {
    const text = String(raw ?? '').trim();
    if (text.length > OPTION_MAX) return null;
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    options.push(text);
  }
  return options;
}

// Each message's poll, as the reader sees it: options with their votes (who), whether the reader picked them.
export function withPolls(messages, reader) {
  const ids = messages.filter((m) => !m.deleted_at).map((m) => m.id);
  if (!ids.length) return messages.map((m) => ({ ...m, poll: null }));
  const polls = db.prepare(`SELECT * FROM polls WHERE message_id IN (${placeholders(ids)})`).all(...ids);
  if (!polls.length) return messages.map((m) => ({ ...m, poll: null }));
  const pollIds = polls.map((p) => p.message_id);
  const options = db.prepare(`SELECT * FROM poll_options WHERE message_id IN (${placeholders(pollIds)}) ORDER BY id`).all(...pollIds);
  const votes = db
    .prepare(
      `SELECT v.option_id, v.user_id, u.name FROM poll_votes v JOIN poll_options o ON o.id = v.option_id
       LEFT JOIN users u ON u.id = v.user_id WHERE o.message_id IN (${placeholders(pollIds)}) ORDER BY v.created_at, v.rowid`
    )
    .all(...pollIds);
  return messages.map((m) => {
    const poll = polls.find((p) => p.message_id === m.id);
    if (!poll || m.deleted_at) return { ...m, poll: null };
    const own = options.filter((o) => o.message_id === m.id);
    const voted = votes.filter((v) => own.some((o) => o.id === v.option_id));
    return {
      ...m,
      poll: {
        multiple: Boolean(poll.multiple),
        allow_add: Boolean(poll.allow_add),
        closes_at: poll.closes_at,
        closed_at: poll.closed_at,
        open: isOpen(poll),
        voter_count: new Set(voted.map((v) => v.user_id)).size,
        options: own.map((o) => {
          const by = voted.filter((v) => v.option_id === o.id);
          return { id: o.id, text: o.text, count: by.length, voters: by.map((v) => ({ id: v.user_id, name: v.name })), mine: by.some((v) => v.user_id === reader.id) };
        }),
      },
    };
  });
}
