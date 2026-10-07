// Mentions live inline in comment bodies as @[Name](userId); the client renders them as tags.
import { projectAccess, taskAccess } from './access.js';
import { activeUsers } from './users.js';

export const MENTION_RE = /@\[([^\]\n]{1,80})\]\((\d+)\)/g;
const EXCERPT_LENGTH = 140;
export const plainExcerpt = (body) => body.replace(MENTION_RE, '@$1').slice(0, EXCERPT_LENGTH);

// Active users who may see the thing being discussed, i.e. who can be mentioned there.
export const taskViewers = (task) => activeUsers().filter((u) => taskAccess(u, task));
export const projectViewers = (project) => activeUsers().filter((u) => projectAccess(u, project));
export const mentionList = (viewers, me) =>
  viewers
    .filter((u) => u.id !== me.id)
    .map(({ id, name, email }) => ({ id, name, email }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

// Keeps mentions of people who can see the discussion and turns any other markup into plain "@Name",
// so nobody is notified about something they cannot open.
export function resolveMentions(body, viewers, author) {
  const allowed = new Set(viewers.map((u) => u.id));
  const mentioned = new Set();
  const cleaned = body.replace(MENTION_RE, (markup, name, id) => {
    if (!allowed.has(Number(id))) return `@${name}`;
    if (Number(id) !== author.id) mentioned.add(Number(id));
    return markup;
  });
  return { body: cleaned, mentioned: [...mentioned], excerpt: plainExcerpt(cleaned) };
}
