import { describe, expect, it } from 'vitest';
import { createBoard } from '../src/core/board';
import { CellState, Game } from '../src/core/game';
import { at, parseBoard } from './helpers';

// Mines in the middle column; columns 0 and 4 are zeros.
const WALL = `
  ..*..
  ..*..
  ..*..
  ..*..
  ..*..
`;

// Corners are mines; the centre is a 2 and the edges are 1s or 0s.
const DIAGONAL = `
  *..
  ...
  ..*
`;

describe('new game', () => {
  it('starts ready with every cell hidden', () => {
    const game = new Game(parseBoard(WALL));
    expect(game.status).toBe('ready');
    expect(game.minesRemaining).toBe(5);
    expect(Array.from(game.state).every((s) => s === CellState.Hidden)).toBe(true);
  });
});

describe('reveal', () => {
  it('reveals a single number cell', () => {
    const game = new Game(parseBoard(DIAGONAL));
    expect(game.reveal(at(3, 1, 1))).toEqual([at(3, 1, 1)]);
    expect(game.status).toBe('playing');
    expect(game.cellView(at(3, 1, 1))).toBe(2);
    expect(game.state[at(3, 1, 0)]).toBe(CellState.Hidden);
  });

  it('flood-fills a zero region and its numbered border, but no further', () => {
    const game = new Game(parseBoard(WALL));
    const revealed = game.reveal(at(5, 0, 0));
    expect(revealed).toHaveLength(10);
    for (let y = 0; y < 5; y++) {
      expect(game.cellView(at(5, 0, y))).toBe(0);
      expect(game.state[at(5, 1, y)]).toBe(CellState.Revealed);
      for (const x of [2, 3, 4]) expect(game.state[at(5, x, y)]).toBe(CellState.Hidden);
    }
    expect(game.cellView(at(5, 1, 0))).toBe(2);
    expect(game.cellView(at(5, 1, 2))).toBe(3);
    expect(game.status).toBe('playing');
  });

  it('does not flood into flagged cells', () => {
    const game = new Game(parseBoard(WALL));
    game.toggleFlag(at(5, 0, 4));
    expect(game.reveal(at(5, 0, 0))).toHaveLength(9);
    expect(game.state[at(5, 0, 4)]).toBe(CellState.Flagged);
    expect(game.state[at(5, 1, 4)]).toBe(CellState.Revealed);
  });

  it('ignores flagged and already revealed cells', () => {
    const game = new Game(parseBoard(DIAGONAL));
    game.toggleFlag(at(3, 1, 0));
    expect(game.reveal(at(3, 1, 0))).toEqual([]);
    expect(game.state[at(3, 1, 0)]).toBe(CellState.Flagged);
    expect(game.status).toBe('ready');

    game.reveal(at(3, 1, 1));
    expect(game.reveal(at(3, 1, 1))).toEqual([]);
  });

  it('loses when a mine is revealed', () => {
    const game = new Game(parseBoard(WALL));
    expect(game.reveal(at(5, 2, 0))).toEqual([at(5, 2, 0)]);
    expect(game.status).toBe('lost');
    expect(game.cellView(at(5, 2, 0))).toBe('exploded');
  });

  it('floods a huge board without overflowing the stack', () => {
    const width = 300;
    const height = 300;
    const mines = new Uint8Array(width * height);
    mines[width * height - 1] = 1;
    const game = new Game(createBoard(width, height, mines));
    expect(game.reveal(0)).toHaveLength(width * height - 1);
    expect(game.status).toBe('won');
  });

  it('rejects out-of-range indices', () => {
    const game = new Game(parseBoard(DIAGONAL));
    expect(() => game.reveal(-1)).toThrow(RangeError);
    expect(() => game.reveal(9)).toThrow(RangeError);
    expect(() => game.reveal(1.5)).toThrow(RangeError);
    expect(() => game.toggleFlag(9)).toThrow(RangeError);
    expect(() => game.chord(9)).toThrow(RangeError);
  });
});

describe('flags', () => {
  it('toggles on hidden cells and updates the mine counter', () => {
    const game = new Game(parseBoard(DIAGONAL));
    expect(game.toggleFlag(at(3, 0, 0))).toBe(true);
    expect(game.state[at(3, 0, 0)]).toBe(CellState.Flagged);
    expect(game.cellView(at(3, 0, 0))).toBe('flag');
    expect(game.minesRemaining).toBe(1);
    expect(game.toggleFlag(at(3, 0, 0))).toBe(true);
    expect(game.state[at(3, 0, 0)]).toBe(CellState.Hidden);
    expect(game.minesRemaining).toBe(2);
  });

  it('lets the mine counter go negative', () => {
    const game = new Game(parseBoard(DIAGONAL));
    for (const i of [1, 2, 3]) game.toggleFlag(i);
    expect(game.minesRemaining).toBe(-1);
  });

  it('cannot flag a revealed cell', () => {
    const game = new Game(parseBoard(DIAGONAL));
    game.reveal(at(3, 1, 1));
    expect(game.toggleFlag(at(3, 1, 1))).toBe(false);
    expect(game.state[at(3, 1, 1)]).toBe(CellState.Revealed);
    expect(game.minesRemaining).toBe(2);
  });
});

describe('chord', () => {
  it('reveals the other neighbors when the flags match the number', () => {
    const game = new Game(parseBoard(DIAGONAL));
    game.reveal(at(3, 1, 1));
    game.toggleFlag(at(3, 0, 0));
    game.toggleFlag(at(3, 2, 2));
    const revealed = game.chord(at(3, 1, 1));
    expect(revealed.sort((a, b) => a - b)).toEqual([1, 2, 3, 5, 6, 7]);
    expect(game.status).toBe('won');
  });

  it('loses when a flag is wrong', () => {
    const game = new Game(parseBoard(DIAGONAL));
    game.reveal(at(3, 1, 1));
    game.toggleFlag(at(3, 0, 0));
    game.toggleFlag(at(3, 2, 1));
    game.chord(at(3, 1, 1));
    expect(game.status).toBe('lost');
    expect(game.cellView(at(3, 2, 2))).toBe('exploded');
    expect(game.cellView(at(3, 2, 1))).toBe('wrong-flag');
    expect(game.cellView(at(3, 0, 0))).toBe('flag');
  });

  it('does nothing when the flag count does not match', () => {
    const game = new Game(parseBoard(DIAGONAL));
    game.reveal(at(3, 1, 1));
    game.toggleFlag(at(3, 0, 0));
    expect(game.chord(at(3, 1, 1))).toEqual([]);
    expect(game.status).toBe('playing');
    expect(game.state[at(3, 1, 0)]).toBe(CellState.Hidden);
  });

  it('does nothing on hidden or flagged cells', () => {
    const game = new Game(parseBoard(DIAGONAL));
    expect(game.chord(at(3, 1, 1))).toEqual([]);
    game.toggleFlag(at(3, 1, 1));
    expect(game.chord(at(3, 1, 1))).toEqual([]);
    expect(game.status).toBe('ready');
  });
});

describe('activate (primary click)', () => {
  it('reveals a hidden cell', () => {
    const game = new Game(parseBoard(DIAGONAL));
    expect(game.activate(at(3, 1, 1))).toEqual([at(3, 1, 1)]);
  });

  it('chords a revealed number', () => {
    const game = new Game(parseBoard(DIAGONAL));
    game.activate(at(3, 1, 1));
    game.toggleFlag(at(3, 0, 0));
    game.toggleFlag(at(3, 2, 2));
    expect(game.activate(at(3, 1, 1))).toHaveLength(6);
    expect(game.status).toBe('won');
  });

  it('does nothing on a flagged cell', () => {
    const game = new Game(parseBoard(DIAGONAL));
    game.toggleFlag(at(3, 1, 1));
    expect(game.activate(at(3, 1, 1))).toEqual([]);
  });
});

describe('win', () => {
  it('wins when every safe cell is revealed, and auto-flags the mines', () => {
    const game = new Game(parseBoard(DIAGONAL));
    // 2 and 6 are zeros; revealing 6 last is what finishes the board.
    for (const i of [1, 3, 4, 5, 7, 2]) game.reveal(i);
    expect(game.status).toBe('playing');
    game.reveal(6);
    expect(game.status).toBe('won');
    expect(game.state[0]).toBe(CellState.Flagged);
    expect(game.state[8]).toBe(CellState.Flagged);
    expect(game.minesRemaining).toBe(0);
  });

  it('can win with a single opening click', () => {
    const game = new Game(
      parseBoard(`
        *....
        .....
        .....
        .....
        ....*
      `),
    );
    expect(game.reveal(at(5, 2, 2))).toHaveLength(23);
    expect(game.status).toBe('won');
  });
});

describe('after the game ends', () => {
  it('ignores reveal, flag and chord', () => {
    const game = new Game(parseBoard(DIAGONAL));
    game.reveal(at(3, 1, 1));
    game.reveal(at(3, 0, 0));
    expect(game.status).toBe('lost');
    expect(game.reveal(at(3, 1, 0))).toEqual([]);
    expect(game.toggleFlag(at(3, 1, 0))).toBe(false);
    expect(game.chord(at(3, 1, 1))).toEqual([]);
    expect(game.state[at(3, 1, 0)]).toBe(CellState.Hidden);
  });

  it('shows unflagged mines on loss and keeps safe cells hidden', () => {
    const game = new Game(parseBoard(DIAGONAL));
    expect(game.cellView(at(3, 2, 2))).toBe('hidden');
    game.reveal(at(3, 1, 1));
    game.reveal(at(3, 0, 0));
    expect(game.cellView(at(3, 0, 0))).toBe('exploded');
    expect(game.cellView(at(3, 2, 2))).toBe('mine');
    expect(game.cellView(at(3, 1, 0))).toBe('hidden');
  });
});

describe('timer', () => {
  it('starts on the first reveal and stops when the game ends', () => {
    let now = 1000;
    const game = new Game(parseBoard(DIAGONAL), { now: () => now });
    game.toggleFlag(at(3, 2, 2));
    expect(game.startedAt).toBeNull();
    expect(game.elapsedMs()).toBe(0);

    game.reveal(at(3, 1, 1));
    expect(game.startedAt).toBe(1000);
    now = 4000;
    expect(game.elapsedMs()).toBe(3000);

    now = 5000;
    game.reveal(at(3, 0, 0));
    expect(game.endedAt).toBe(5000);
    now = 9000;
    expect(game.elapsedMs()).toBe(4000);
  });

  it('does not start on a no-op reveal', () => {
    const game = new Game(parseBoard(DIAGONAL), { now: () => 42 });
    game.toggleFlag(0);
    game.reveal(0);
    expect(game.startedAt).toBeNull();
  });
});
