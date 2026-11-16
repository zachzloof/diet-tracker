/**
 * Headless video shows no pointer, so the page draws its own: a soft finger-sized dot that
 * follows the (synthetic) mouse and a ripple wherever it presses. Injected with
 * addInitScript; it lives in a closed corner of the DOM, ignores pointer events and is only
 * ever present in the recording browser.
 *
 * `window.__demoCursor` lets the recorder park, hide or show the dot, and run a "swipe": an
 * eased scroll of whatever scrolls under the finger, with the dot dragging along.
 */
export const CURSOR_INIT_SCRIPT = `(() => {
  if (window.__demoCursor) return;
  const SIZE = 30;
  let dot = null;
  let x = -100, y = -100, visible = false, pressed = false;

  const css = \`
    .demo-cursor { position: fixed; left: 0; top: 0; width: \${SIZE}px; height: \${SIZE}px;
      margin: -\${SIZE / 2}px 0 0 -\${SIZE / 2}px; border-radius: 50%; pointer-events: none;
      z-index: 2147483647; background: rgba(255,255,255,0.30);
      border: 1.5px solid rgba(255,255,255,0.75);
      box-shadow: 0 2px 10px rgba(0,0,0,0.35), inset 0 0 6px rgba(255,255,255,0.25);
      opacity: 0; transition: opacity 180ms ease, width 120ms ease, height 120ms ease,
        margin 120ms ease, background 120ms ease; will-change: transform; }
    .demo-cursor.on { opacity: 1; }
    .demo-cursor.down { width: \${SIZE - 7}px; height: \${SIZE - 7}px;
      margin: -\${(SIZE - 7) / 2}px 0 0 -\${(SIZE - 7) / 2}px; background: rgba(255,255,255,0.50); }
    .demo-ripple { position: fixed; left: 0; top: 0; width: 56px; height: 56px;
      margin: -28px 0 0 -28px; border-radius: 50%; pointer-events: none; z-index: 2147483646;
      border: 2px solid rgba(255,255,255,0.8); background: rgba(255,255,255,0.14);
      animation: demo-ripple 520ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards; }
    @keyframes demo-ripple {
      from { transform: translate(var(--x), var(--y)) scale(0.35); opacity: 0.95; }
      to { transform: translate(var(--x), var(--y)) scale(1.5); opacity: 0; }
    }\`;

  const place = () => { if (dot) dot.style.transform = 'translate(' + x + 'px,' + y + 'px)'; };
  const sync = () => {
    if (!dot) return;
    dot.classList.toggle('on', visible);
    dot.classList.toggle('down', pressed);
  };

  const mount = () => {
    if (dot || !document.documentElement) return;
    const style = document.createElement('style');
    style.textContent = css;
    document.documentElement.appendChild(style);
    dot = document.createElement('div');
    dot.className = 'demo-cursor';
    dot.setAttribute('aria-hidden', 'true');
    document.documentElement.appendChild(dot);
    place();
    sync();
  };

  const ripple = () => {
    const ring = document.createElement('div');
    ring.className = 'demo-ripple';
    ring.style.setProperty('--x', x + 'px');
    ring.style.setProperty('--y', y + 'px');
    document.documentElement.appendChild(ring);
    setTimeout(() => ring.remove(), 600);
  };

  window.addEventListener('mousemove', (event) => { x = event.clientX; y = event.clientY; place(); }, true);
  window.addEventListener('mousedown', () => { pressed = true; sync(); ripple(); }, true);
  window.addEventListener('mouseup', () => { pressed = false; sync(); }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  const scroller = (cx, cy) => {
    let node = document.elementFromPoint(cx, cy);
    while (node && node !== document.documentElement) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };

  window.__demoCursor = {
    show() { mount(); visible = true; sync(); },
    hide() { visible = false; sync(); },
    moveTo(nx, ny) { x = nx; y = ny; place(); },
    position() { return { x, y }; },
    /** Scrolls what is under (cx, cy) by dy over ms, dragging the dot the other way like a thumb. */
    swipe(cx, cy, dy, ms) {
      return new Promise((resolve) => {
        mount();
        const target = scroller(cx, cy);
        const from = target.scrollTop;
        const max = target.scrollHeight - target.clientHeight;
        const to = Math.max(0, Math.min(max, from + dy));
        const travel = Math.max(-260, Math.min(260, -(to - from) * 0.55));
        const startY = cy - travel / 2;
        x = cx; y = startY; pressed = true; visible = true; place(); sync();
        const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
        const began = performance.now();
        const step = (now) => {
          const t = Math.min(1, (now - began) / ms);
          const k = ease(t);
          target.scrollTop = from + (to - from) * k;
          y = startY + travel * k; place();
          if (t < 1) requestAnimationFrame(step);
          else { pressed = false; sync(); resolve(to - from); }
        };
        requestAnimationFrame(step);
      });
    },
  };
})();`
