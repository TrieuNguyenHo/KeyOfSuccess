import { useEffect, useRef, useState } from 'react';

// Long-press drag for touch screens (iPad), where HTML5 drag and drop does not follow a finger.
// Holding still for HOLD_MS picks the item up; moving earlier is a normal scroll. While dragging, a copy of
// the item follows the finger, and the nearest [data-touch-scroll] container scrolls when the finger nears
// its edge. On release, onDrop(id, element under the finger) decides what happens; the drop targets mark
// themselves with data attributes. Mouse and trackpad keep using HTML5 drag and drop.
const HOLD_MS = 350;
const SLOP_PX = 10; // finger movement that means "scroll", not "hold"
const EDGE_PX = 48;
const SCROLL_STEP = 14;

// True on touch-first devices (iPad without trackpad, phones): there the HTML5 `draggable` is turned off so
// Safari's own long-press drag does not compete with this one.
export const coarsePointer = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;

export function useTouchDrag(onDrop) {
  const [dragId, setDragId] = useState(null);
  const [overElement, setOverElement] = useState(null);
  const cleanupRef = useRef(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => () => cleanupRef.current?.(), []);

  function start(id, e) {
    if (e.touches.length !== 1) return;
    const source = e.currentTarget;
    const container = source.closest('[data-touch-scroll]');
    let point = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    const origin = point;
    let active = false;
    let ghost = null;
    let scrollTimer = null;

    const hit = () => document.elementFromPoint(point.x, point.y);
    const placeGhost = () => {
      ghost.style.transform = `translate(${point.x - ghost.offsetWidth / 2}px, ${point.y - 20}px)`;
    };

    const timer = setTimeout(() => {
      active = true;
      navigator.vibrate?.(10);
      ghost = source.cloneNode(true);
      ghost.classList.add('touch-ghost');
      ghost.style.width = `${source.offsetWidth}px`;
      document.body.appendChild(ghost);
      placeGhost();
      setDragId(id);
      // Keep scrolling while the finger rests near an edge of the scroll container.
      scrollTimer = container && setInterval(() => {
        const box = container.getBoundingClientRect();
        if (point.x < box.left + EDGE_PX) container.scrollLeft -= SCROLL_STEP;
        else if (point.x > box.right - EDGE_PX) container.scrollLeft += SCROLL_STEP;
        if (point.y < box.top + EDGE_PX) container.scrollTop -= SCROLL_STEP;
        else if (point.y > box.bottom - EDGE_PX) container.scrollTop += SCROLL_STEP;
      }, 30);
    }, HOLD_MS);

    const move = (ev) => {
      point = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
      if (!active) {
        if (Math.hypot(point.x - origin.x, point.y - origin.y) > SLOP_PX) cleanup();
        return;
      }
      ev.preventDefault(); // the page must not scroll under a dragged item
      placeGhost();
      setOverElement(hit());
    };

    const end = (ev) => {
      if (active) {
        ev.preventDefault(); // no click (which would open the task) after a drag
        onDropRef.current(id, hit());
      }
      cleanup();
    };

    function cleanup() {
      clearTimeout(timer);
      clearInterval(scrollTimer);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', cleanup);
      ghost?.remove();
      cleanupRef.current = null;
      setDragId(null);
      setOverElement(null);
    }

    cleanupRef.current?.();
    cleanupRef.current = cleanup;
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end, { passive: false });
    window.addEventListener('touchcancel', cleanup);
  }

  return {
    dragId,
    // The element under the finger while dragging, to highlight the drop target.
    overElement,
    // Spread onto an item that may be dragged.
    bind: (id, enabled = true) => (enabled ? { onTouchStart: (e) => start(id, e) } : {}),
  };
}
