import { Knowledge, type PlayerView } from '../src/solver/types';

/** Unknown cells that are safe / mined in every mine layout consistent with the view. */
export interface OracleVerdict {
  safe: number[];
  mines: number[];
}

/**
 * Reference solver for small views. Shares nothing with src/solver except the PlayerView
 * type, so a bug in the real solver can't hide here.
 *
 * A layout is consistent when every revealed number equals its count of adjacent mines
 * (proven mines plus mines placed on unknown cells) and the total equals totalMines.
 * For each unknown cell, the oracle searches for a consistent layout with that cell mined
 * and one with it safe. A cell is certain when only one of the two exists.
 *
 * Throws if no layout at all is consistent with the view.
 */
export function oracle(view: PlayerView): OracleVerdict {
  const { knowledge, numbers, totalMines } = view;
  const { size, neighbors } = view.geometry;

  let provenMines = 0;
  for (let i = 0; i < size; i++) if (knowledge[i] === Knowledge.Mine) provenMines++;
  const minesLeft = totalMines - provenMines;

  // Each revealed number: the unknown cells around it and how many of them must be mines.
  const clues: { cells: number[]; target: number }[] = [];
  for (let i = 0; i < size; i++) {
    if (numbers[i] < 0) continue;
    const cells: number[] = [];
    let target = numbers[i];
    for (const n of neighbors[i]) {
      if (knowledge[n] === Knowledge.Unknown) cells.push(n);
      else if (knowledge[n] === Knowledge.Mine) target--;
    }
    clues.push({ cells, target });
  }

  // Search cells next to clues first so contradictions show up early.
  const touched = new Set(clues.flatMap((c) => c.cells));
  const unknown: number[] = [];
  for (let i = 0; i < size; i++)
    if (knowledge[i] === Knowledge.Unknown && touched.has(i)) unknown.push(i);
  for (let i = 0; i < size; i++)
    if (knowledge[i] === Knowledge.Unknown && !touched.has(i)) unknown.push(i);

  const cluesOf = new Map<number, number[]>();
  clues.forEach((clue, k) => {
    for (const c of clue.cells) cluesOf.set(c, [...(cluesOf.get(c) ?? []), k]);
  });

  // value[c]: -1 unassigned, 0 safe, 1 mine.
  const value = new Int8Array(size).fill(-1);

  /** Can the clues touching `cell`, and the mine total, still be met? */
  const stillPossible = (cell: number, minesPlaced: number, cellsLeft: number): boolean => {
    if (minesPlaced > minesLeft || minesPlaced + cellsLeft < minesLeft) return false;
    for (const k of cluesOf.get(cell) ?? []) {
      const { cells, target } = clues[k];
      let mines = 0;
      let open = 0;
      for (const c of cells) {
        if (value[c] === 1) mines++;
        else if (value[c] === -1) open++;
      }
      if (mines > target || mines + open < target) return false;
    }
    return true;
  };

  /** Checks a complete assignment against every rule from scratch. */
  const consistent = (): boolean => {
    let total = 0;
    for (const c of unknown) total += value[c];
    if (total !== minesLeft) return false;
    return clues.every(({ cells, target }) => cells.reduce((s, c) => s + value[c], 0) === target);
  };

  /** Depth-first search for a consistent layout, optionally with one cell fixed. */
  const search = (
    pos: number,
    minesPlaced: number,
    fixedCell: number,
    fixedValue: number,
  ): boolean => {
    if (pos === unknown.length) return consistent();
    const cell = unknown[pos];
    for (const v of cell === fixedCell ? [fixedValue] : [0, 1]) {
      value[cell] = v;
      const placed = minesPlaced + v;
      if (
        stillPossible(cell, placed, unknown.length - pos - 1) &&
        search(pos + 1, placed, fixedCell, fixedValue)
      ) {
        return true;
      }
    }
    value[cell] = -1;
    return false;
  };

  const canBeMine = new Uint8Array(size);
  const canBeSafe = new Uint8Array(size);
  /** Runs one search; on success records every cell's value as possible. */
  const witness = (fixedCell: number, fixedValue: number): boolean => {
    value.fill(-1);
    if (!search(0, 0, fixedCell, fixedValue)) return false;
    for (const c of unknown) {
      if (value[c] === 1) canBeMine[c] = 1;
      else canBeSafe[c] = 1;
    }
    return true;
  };

  if (!witness(-1, 0)) throw new Error('oracle: no mine layout is consistent with this view');
  for (const c of unknown) {
    if (!canBeMine[c]) witness(c, 1);
    if (!canBeSafe[c]) witness(c, 0);
  }

  return {
    safe: unknown.filter((c) => !canBeMine[c]).sort((a, b) => a - b),
    mines: unknown.filter((c) => !canBeSafe[c]).sort((a, b) => a - b),
  };
}
