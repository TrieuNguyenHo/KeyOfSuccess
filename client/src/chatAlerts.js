// Chat alerts in the browser (v35): the unread count in the tab title, a short sound, and a desktop notification while
// the tab is in the background. Desktop notifications need the user's permission and a secure page (HTTPS or
// localhost); without them the title and the sound still work. Nothing here reaches a closed browser (that would need
// Web Push).

const BASE_TITLE = document.title;

export function setTitleCount(count) {
  document.title = count > 0 ? `(${count}) ${BASE_TITLE}` : BASE_TITLE;
}

const supported = () => 'Notification' in window && window.isSecureContext;
// 'granted' | 'denied' | 'default' (not asked yet) | 'unsupported'.
export const notifyPermission = () => (supported() ? Notification.permission : 'unsupported');
export const askNotifyPermission = () => (supported() ? Notification.requestPermission() : Promise.resolve('unsupported'));

let audio;
// A soft two-note "ting", made on the spot (no sound file). Browsers allow it once the user has clicked in the page.
export function ding() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    [880, 1320].forEach((frequency, i) => {
      const start = audio.currentTime + i * 0.12;
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      tone.connect(gain).connect(audio.destination);
      tone.start(start);
      tone.stop(start + 0.32);
    });
  } catch {
    // No sound where the browser refuses it.
  }
}

// A desktop notification; a click brings the tab forward and runs onClick. One per conversation (tag), the newest
// replacing the older.
export function showNotification({ title, body, tag, onClick }) {
  if (notifyPermission() !== 'granted') return;
  try {
    const notification = new Notification(title, { body, tag, renotify: true });
    notification.onclick = () => {
      window.focus();
      onClick();
      notification.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker; the title and the sound remain.
  }
}
