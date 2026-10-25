import type { CellView } from '../core/game';

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

/** The minefield: one button per cell. Only paints cells whose view changed. */
export class BoardView {
  private cells: HTMLButtonElement[] = [];
  private shown: (CellView | null)[] = [];
  private width = 0;
  private height = 0;

  constructor(private readonly grid: HTMLElement) {}

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
    this.grid.style.setProperty('--cols', String(width));
    this.grid.setAttribute('aria-label', `Minefield, ${width} by ${height}`);
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
      if (view === this.shown[i]) return;
      this.shown[i] = view;
      this.paint(cell, i, view);
    });
  }

  /** Highlights one cell as a hint, or clears the highlight. */
  setHint(i: number | null): void {
    for (const cell of this.grid.querySelectorAll<HTMLElement>('[data-hint]')) {
      delete cell.dataset.hint;
    }
    if (i !== null && this.cells[i]) this.cells[i].dataset.hint = 'true';
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
    const row = Math.floor(i / this.width) + 1;
    const column = (i % this.width) + 1;
    cell.setAttribute('aria-label', `${description}, row ${row}, column ${column}`);
  }
}
