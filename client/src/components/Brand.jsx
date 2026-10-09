import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { tr } from '../i18n.js';

// The app's name. O is twice the size of the other letters, and K and S, KingSport's initials, twice the O
// (see .brand in styles/base.css). Screen readers still read one word: "KeyOfSuccess".
export function Brand({ className = '' }) {
  return (
    <span className={`brand ${className}`}>
      <span className="ks">K</span>ey<span className="o">O</span>f<span className="ks">S</span>uccess
    </span>
  );
}

// The deployed version under the app's name: the git tag deploy/update.sh wrote (GET /api/health), "dev" when the app
// was not deployed through the scripts. Read once per page load.
let versionRequest = null;
export function AppVersion() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    versionRequest ??= api('/health').catch(() => null);
    versionRequest.then(setHealth);
  }, []);
  if (!health) return null;
  const title = [health.commit && `commit ${health.commit}`, `schema ${health.schema}`].filter(Boolean).join(' · ');
  return (
    <span className="app-version" title={title}>
      {health.version ?? tr('bản dev')}
    </span>
  );
}
