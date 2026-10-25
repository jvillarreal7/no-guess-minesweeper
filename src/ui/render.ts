import type { CellView } from '../core/game';
import { cellName, rowName } from './coords';

const SYMBOLS: Record<Exclude<CellView, number>, string> = {
  hidden: '',
  flag: '🚩',
  'wrong-flag': '❌',
  mine: '💣',
  exploded: '💣',
};

const DESCRIPTIONS: Record<Exclude<CellView, number>, string> = {
  hidden: 'hidden',
  flag: 'flagged',
  'wrong-flag': 'wrong flag',
  mine: 'mine',
  exploded: 'exploded mine',
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * A short red ring that spreads past a newly flagged cell, so the flag registers even
 * while a fingertip covers the cell itself.
 */
function pulse(cell: HTMLElement): void {
  if (reducedMotion.matches || typeof cell.animate !== 'function') return;
  cell.animate(
    [
      { boxShadow: '0 0 0 0 rgba(229, 72, 77, 0.9)', zIndex: 3 },
      { boxShadow: '0 0 0 14px rgba(229, 72, 77, 0)', zIndex: 3 },
    ],
    { duration: 500, easing: 'ease-out' },
  );
}

/** Row and column numbers around the board, matching the hint text (counting from 1). */
export interface BoardLabels {
  /** Holds the labels and the board; board sizing variables are set here. */
  area: HTMLElement;
  columns: HTMLElement;
  rows: HTMLElement;
}

/** The minefield: one button per cell. Only paints cells whose view changed. */
export class BoardView {
  private cells: HTMLButtonElement[] = [];
  private shown: (CellView | null)[] = [];
  private columnLabels: HTMLElement[] = [];
  private rowLabels: HTMLElement[] = [];
  private width = 0;
  private height = 0;

  constructor(
    private readonly grid: HTMLElement,
    private readonly labels: BoardLabels,
  ) {}

  get columns(): number {
    return this.width;
  }

  get size(): number {
    return this.cells.length;
  }

  /** Rebuilds the grid for a new board size. */
  setSize(width: number, height: number): void {
    if (width === this.width && height === this.height) {
      this.shown.fill(null);
      return;
    }
    this.width = width;
    this.height = height;
    this.labels.area.style.setProperty('--cols', String(width));
    this.grid.setAttribute('aria-label', `Minefield, ${width} by ${height}`);
    const label = (text: string) => {
      const span = document.createElement('span');
      span.textContent = text;
      return span;
    };
    this.columnLabels = Array.from({ length: width }, (_, x) => label(String(x + 1)));
    this.rowLabels = Array.from({ length: height }, (_, y) => label(rowName(y)));
    this.labels.columns.replaceChildren(...this.columnLabels);
    this.labels.rows.replaceChildren(...this.rowLabels);
    const fragment = document.createDocumentFragment();
    this.cells = Array.from({ length: width * height }, (_, i) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.i = String(i);
      cell.tabIndex = i === 0 ? 0 : -1;
      fragment.append(cell);
      return cell;
    });
    this.grid.replaceChildren(fragment);
    this.shown = new Array<CellView | null>(width * height).fill(null);
  }

  render(viewAt: (i: number) => CellView): void {
    this.cells.forEach((cell, i) => {
      const view = viewAt(i);
      const previous = this.shown[i];
      if (view === previous) return;
      this.shown[i] = view;
      this.paint(cell, i, view);
      if (previous === 'hidden' && view === 'flag') pulse(cell);
    });
  }

  /** Highlights one cell as a hint (and its row and column numbers), or clears it. */
  setHint(i: number | null): void {
    for (const el of this.labels.area.querySelectorAll<HTMLElement>('[data-hint]')) {
      delete el.dataset.hint;
    }
    if (i === null || !this.cells[i]) return;
    this.cells[i].dataset.hint = 'true';
    const column = this.columnLabels[i % this.width];
    const row = this.rowLabels[Math.floor(i / this.width)];
    if (column) column.dataset.hint = 'true';
    if (row) row.dataset.hint = 'true';
  }

  /** Moves keyboard focus (and the single tab stop) to cell i. */
  focusCell(i: number): void {
    const cell = this.cells[i];
    if (!cell) return;
    for (const c of this.cells) if (c.tabIndex === 0) c.tabIndex = -1;
    cell.tabIndex = 0;
    cell.focus();
  }

  private paint(cell: HTMLButtonElement, i: number, view: CellView): void {
    let description: string;
    if (typeof view === 'number') {
      cell.dataset.state = 'open';
      cell.dataset.n = String(view);
      cell.textContent = view === 0 ? '' : String(view);
      description = view === 0 ? 'empty' : `${view}`;
    } else {
      cell.dataset.state = view;
      delete cell.dataset.n;
      cell.textContent = SYMBOLS[view];
      description = DESCRIPTIONS[view];
    }
    cell.setAttribute('aria-label', `${description}, ${cellName(i, this.width)}`);
  }
}
