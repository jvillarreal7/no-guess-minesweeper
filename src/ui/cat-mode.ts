// Easter egg: press and hold the face to put a cat behind the board.

const HOLD_MS = 700;
const CAT_URL = 'https://cataas.com/cat';

/**
 * Calls `onHold` when `button` is pressed and held. The click that ends the hold is
 * swallowed, so the button's normal click action doesn't also run. Register this before
 * the button's own click listener.
 */
export function onPressAndHold(button: HTMLElement, onHold: () => void): void {
  let timer: number | undefined;
  let held = false;
  const cancel = (): void => {
    window.clearTimeout(timer);
    timer = undefined;
  };

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    held = false;
    cancel();
    timer = window.setTimeout(() => {
      timer = undefined;
      held = true;
      onHold();
    }, HOLD_MS);
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel'] as const) {
    button.addEventListener(type, cancel);
  }
  button.addEventListener(
    'click',
    (event) => {
      if (!held) return;
      held = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { capture: true },
  );
  // A long press on touch screens can open a context menu instead of finishing the hold.
  button.addEventListener('contextmenu', (event) => event.preventDefault());
}

const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_SLOP_PX = 30;

/**
 * Calls `onDoubleTap` on a double tap or double click anywhere inside `el`. Tracked from
 * pointer events because touch browsers don't reliably send `dblclick`.
 */
export function onDoubleTap(el: HTMLElement, handler: () => void): void {
  let lastTime = -Infinity;
  let lastX = 0;
  let lastY = 0;
  el.addEventListener('pointerup', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    const quick = event.timeStamp - lastTime < DOUBLE_TAP_MS;
    const close = Math.hypot(event.clientX - lastX, event.clientY - lastY) < DOUBLE_TAP_SLOP_PX;
    if (quick && close) {
      lastTime = -Infinity; // A third tap starts a new pair.
      handler();
      return;
    }
    lastTime = event.timeStamp;
    lastX = event.clientX;
    lastY = event.clientY;
  });
}

/** Shows a random cat from cataas.com behind the board while enabled. */
export class CatMode {
  private on = false;
  /** Bumped per request, so a slow image never replaces a newer one. */
  private request = 0;

  constructor(
    private readonly frame: HTMLElement,
    private readonly onFailure: () => void,
  ) {}

  get enabled(): boolean {
    return this.on;
  }

  set(on: boolean): void {
    this.on = on;
    if (on) {
      this.frame.dataset.cat = 'loading';
      this.newCat();
    } else {
      this.request++;
      this.setReveal(false);
      delete this.frame.dataset.cat;
      this.frame.style.removeProperty('--cat-image');
    }
  }

  get revealed(): boolean {
    return this.frame.dataset.catReveal !== undefined;
  }

  /** Hides the board and shows the cat at full strength (after a cleared board). */
  setReveal(on: boolean): void {
    if (on && this.on) this.frame.dataset.catReveal = '';
    else delete this.frame.dataset.catReveal;
  }

  /** Swaps in a different cat. Does nothing while cat mode is off. */
  newCat(): void {
    if (!this.on) return;
    const request = ++this.request;
    // A unique URL per request, or the browser would keep showing the same cached cat.
    const url = `${CAT_URL}?t=${Date.now()}-${request}`;
    const image = new Image();
    image.onload = () => {
      if (request !== this.request) return;
      this.frame.style.setProperty('--cat-image', `url("${url}")`);
      this.frame.dataset.cat = 'on';
    };
    image.onerror = () => {
      if (request !== this.request) return;
      this.onFailure();
    };
    image.src = url;
  }
}
