/** What the board does with a cell; the UI decides nothing beyond which one was meant. */
export interface CellActions {
  /** Click / tap / Enter: reveal or chord. */
  primary(i: number): void;
  /** Right-click / long-press / F: flag. */
  secondary(i: number): void;
}

/** The parts of the board view that input needs. */
export interface BoardGrid {
  readonly columns: number;
  readonly size: number;
  focusCell(i: number): void;
}

const LONG_PRESS_MS = 400;
const MOVE_TOLERANCE_PX = 10;

/** Translates mouse, touch and keyboard events on the grid into cell actions. */
export function attachInput(grid: HTMLElement, board: BoardGrid, actions: CellActions): void {
  let pressTimer: number | undefined;
  let pressStart: { x: number; y: number } | null = null;
  let suppressClick = false;
  let lastPointerType = 'mouse';

  const cellIndex = (target: EventTarget | null): number | null => {
    if (!(target instanceof Element)) return null;
    const cell = target.closest<HTMLElement>('[data-i]');
    return cell ? Number(cell.dataset.i) : null;
  };

  const cancelPress = (): void => {
    window.clearTimeout(pressTimer);
    pressTimer = undefined;
    pressStart = null;
  };

  grid.addEventListener('pointerdown', (event) => {
    lastPointerType = event.pointerType;
    suppressClick = false;
    if (event.pointerType === 'mouse') return;
    const i = cellIndex(event.target);
    if (i === null) return;
    pressStart = { x: event.clientX, y: event.clientY };
    pressTimer = window.setTimeout(() => {
      pressTimer = undefined;
      suppressClick = true; // The finger lifting must not also reveal.
      navigator.vibrate?.(15);
      actions.secondary(i);
    }, LONG_PRESS_MS);
  });

  grid.addEventListener('pointermove', (event) => {
    if (!pressStart) return;
    const moved = Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y);
    if (moved > MOVE_TOLERANCE_PX) cancelPress(); // Scrolling, not pressing.
  });

  for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
    grid.addEventListener(type, cancelPress);
  }

  grid.addEventListener('click', (event) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const i = cellIndex(event.target);
    if (i !== null) actions.primary(i);
  });

  grid.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    // Touch and pen flag through the long-press timer; some browsers also send
    // contextmenu on long-press, which would toggle the flag straight back.
    if (lastPointerType !== 'mouse') return;
    const i = cellIndex(event.target);
    if (i !== null) actions.secondary(i);
  });

  grid.addEventListener('keydown', (event) => {
    const i = cellIndex(event.target);
    if (i === null) return;
    if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      actions.secondary(i);
      return;
    }
    const next = arrowTarget(event.key, i, board.columns, board.size);
    if (next !== null) {
      event.preventDefault();
      board.focusCell(next);
    }
  });
}

/** The cell an arrow key moves to from i, or null if it isn't an arrow or hits an edge. */
function arrowTarget(key: string, i: number, columns: number, size: number): number | null {
  const x = i % columns;
  switch (key) {
    case 'ArrowLeft':
      return x > 0 ? i - 1 : null;
    case 'ArrowRight':
      return x < columns - 1 ? i + 1 : null;
    case 'ArrowUp':
      return i - columns >= 0 ? i - columns : null;
    case 'ArrowDown':
      return i + columns < size ? i + columns : null;
    default:
      return null;
  }
}
