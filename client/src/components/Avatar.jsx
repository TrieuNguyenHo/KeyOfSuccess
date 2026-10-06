import { useAvatarUrl } from '../avatars.js';
import { colorFor, initials } from '../utils.js';

// The user's profile picture when they have one (userId given), else their initials on a color from the name.
export function Avatar({ name, small, userId }) {
  const url = useAvatarUrl(userId);
  if (url) return <img className={`avatar ${small ? 'small' : ''}`} src={url} alt="" title={name} />;
  return (
    <span className={`avatar ${small ? 'small' : ''}`} style={{ background: colorFor(name) }} title={name}>
      {initials(name)}
    </span>
  );
}
