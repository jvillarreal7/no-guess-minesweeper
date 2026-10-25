import type { Board } from './board';

export const CellState = { Hidden: 0, Revealed: 1, Flagged: 2 } as const;
export type CellState = (typeof CellState)[keyof typeof CellState];

/** `ready` until the first reveal; `won` and `lost` are final. */
export type GameStatus = 'ready' | 'playing' | 'won' | 'lost';

/**
 * What a cell should look like. A number (0-8) is a revealed safe cell.
 * `mine` and `wrong-flag` only appear after a loss; `exploded` is a revealed mine.
 */
export type CellView = number | 'hidden' | 'flag' | 'wrong-flag' | 'mine' | 'exploded';

export interface GameOptions {
  /** Clock for the timer, in ms. Injected so the engine stays deterministic in tests. */
  now?: () => number;
  /**
   * A safe cell to reveal as part of setup (a shared board's first click). It does not
   * start the timer: the status stays `ready` until the player's own first reveal.
   */
  opening?: number;
}

export class Game {
  readonly board: Board;
  /** Per-cell CellState. Read-only for callers; change it through the methods below. */
  readonly state: Uint8Array;
  private readonly now: () => number;
  private _status: GameStatus = 'ready';
  private _flagCount = 0;
  private revealedSafe = 0;
  private hitMine = false;
  private _startedAt: number | null = null;
  private _endedAt: number | null = null;

  constructor(board: Board, options: GameOptions = {}) {
    this.board = board;
    this.state = new Uint8Array(board.size);
    this.now = options.now ?? (() => Date.now());
    if (options.opening !== undefined) {
      this.assertIndex(options.opening);
      if (board.mines[options.opening]) throw new Error('the opening cell must be safe');
      this.open(options.opening, []);
      this.settle();
    }
  }

  get status(): GameStatus {
    return this._status;
  }

  get isOver(): boolean {
    return this._status === 'won' || this._status === 'lost';
  }

  get flagCount(): number {
    return this._flagCount;
  }

  /** Mines minus flags. Can go negative. */
  get minesRemaining(): number {
    return this.board.mineCount - this._flagCount;
  }

  get startedAt(): number | null {
    return this._startedAt;
  }

  get endedAt(): number | null {
    return this._endedAt;
  }

  elapsedMs(now: number = this.now()): number {
    if (this._startedAt === null) return 0;
    return (this._endedAt ?? now) - this._startedAt;
  }

  /**
   * What the player can see as numbers: the number on each revealed safe cell, -1 elsewhere.
   * Flags are left out on purpose; they are the player's guesses, not information.
   */
  visibleNumbers(): Int8Array {
    const out = new Int8Array(this.board.size).fill(-1);
    for (let i = 0; i < this.board.size; i++) {
      if (this.state[i] === CellState.Revealed && !this.board.mines[i])
        out[i] = this.board.numbers[i];
    }
    return out;
  }

  /** Reveals a hidden, unflagged cell (flood-filling zeros). Returns the newly revealed cells. */
  reveal(i: number): number[] {
    this.assertIndex(i);
    if (this.isOver || this.state[i] !== CellState.Hidden) return [];
    this.start();
    const revealed: number[] = [];
    this.open(i, revealed);
    this.settle();
    return revealed;
  }

  /** Primary click: chords a revealed number, otherwise reveals. Returns the newly revealed cells. */
  activate(i: number): number[] {
    this.assertIndex(i);
    return this.state[i] === CellState.Revealed ? this.chord(i) : this.reveal(i);
  }

  /** Toggles a flag on a hidden cell. Returns whether anything changed. */
  toggleFlag(i: number): boolean {
    this.assertIndex(i);
    if (this.isOver) return false;
    const s = this.state[i];
    if (s === CellState.Hidden) {
      this.state[i] = CellState.Flagged;
      this._flagCount++;
      return true;
    }
    if (s === CellState.Flagged) {
      this.state[i] = CellState.Hidden;
      this._flagCount--;
      return true;
    }
    return false;
  }

  /**
   * On a revealed number whose adjacent flag count equals the number, reveals all
   * other hidden neighbors. A wrong flag can lose the game. Returns the newly revealed cells.
   */
  chord(i: number): number[] {
    this.assertIndex(i);
    const { neighbors, numbers } = this.board;
    if (this.isOver || this.state[i] !== CellState.Revealed || numbers[i] === 0) return [];
    let flags = 0;
    for (const n of neighbors[i]) if (this.state[n] === CellState.Flagged) flags++;
    if (flags !== numbers[i]) return [];
    const revealed: number[] = [];
    for (const n of neighbors[i]) {
      if (this.state[n] === CellState.Hidden) this.open(n, revealed);
    }
    this.settle();
    return revealed;
  }

  cellView(i: number): CellView {
    this.assertIndex(i);
    const isMine = this.board.mines[i] === 1;
    const lost = this._status === 'lost';
    switch (this.state[i]) {
      case CellState.Revealed:
        return isMine ? 'exploded' : this.board.numbers[i];
      case CellState.Flagged:
        return lost && !isMine ? 'wrong-flag' : 'flag';
      default:
        return lost && isMine ? 'mine' : 'hidden';
    }
  }

  /** Reveals a hidden cell; if it is a zero, iteratively flood-fills unflagged hidden cells. */
  private open(start: number, revealed: number[]): void {
    const { mines, numbers, neighbors } = this.board;
    this.state[start] = CellState.Revealed;
    revealed.push(start);
    if (mines[start]) {
      this.hitMine = true;
      return;
    }
    this.revealedSafe++;
    if (numbers[start] !== 0) return;

    const stack = [start];
    let cell: number | undefined;
    while ((cell = stack.pop()) !== undefined) {
      for (const n of neighbors[cell]) {
        if (this.state[n] !== CellState.Hidden) continue;
        // A zero's neighbors are never mines, so everything reached here is safe.
        this.state[n] = CellState.Revealed;
        revealed.push(n);
        this.revealedSafe++;
        if (numbers[n] === 0) stack.push(n);
      }
    }
  }

  private start(): void {
    if (this._status !== 'ready') return;
    this._status = 'playing';
    this._startedAt = this.now();
  }

  /** Ends the game if a mine is revealed or every safe cell is. */
  private settle(): void {
    const { mines, size, mineCount } = this.board;
    if (this.hitMine) {
      this.end('lost');
      return;
    }
    if (this.revealedSafe === size - mineCount) {
      for (let i = 0; i < size; i++) {
        if (mines[i]) this.state[i] = CellState.Flagged;
      }
      this._flagCount = mineCount;
      this.end('won');
    }
  }

  private end(status: 'won' | 'lost'): void {
    this._status = status;
    this._endedAt = this.now();
  }

  private assertIndex(i: number): void {
    if (!Number.isInteger(i) || i < 0 || i >= this.board.size) {
      throw new RangeError(`cell index ${i} is outside 0..${this.board.size - 1}`);
    }
  }
}
