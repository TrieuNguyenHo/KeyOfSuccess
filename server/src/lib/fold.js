// Text folded for accent-insensitive search (v36): mentions as their names, lower case, no diacritics, đ as d, so
// "thiet ke" finds "Thiết kế" and "duc" finds "Đức". No database import: db.js uses it to fill messages.search.
const MENTION_RE = /@\[([^\]\n]{1,80})\]\(\d+\)/g;

export const foldText = (text) =>
  String(text ?? '')
    .replace(MENTION_RE, '@$1')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
