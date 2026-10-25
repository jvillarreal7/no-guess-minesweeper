import { getGeometry, type Board } from '../core/board';
import { buildConstraints, ContradictionError, globalConstraint } from './constraints';
import { tier1 } from './tier1';
import { tier2 } from './tier2';
import { createView, Knowledge, type Deduction, type PlayerView, type SolveResult } from './types';

/** Returns the number under a cell. Called only on cells already proven safe. */
export type RevealFn = (i: number) => number;

/**
 * Runs the tiers in order on the current view and returns the first that makes progress.
 * Tier 1 includes the trivial global-count cases (no mines left / every unknown a mine).
 */
export function findDeductions(view: PlayerView): Deduction | null {
  const constraints = buildConstraints(view);
  return tier1([...constraints, globalConstraint(view)]) ?? tier2(constraints);
}

/**
 * Plays the view forward: reveals every proven-safe cell, deduces, repeats. Stops when
 * every safe cell is revealed (solved) or no tier can prove anything (stuck).
 * Mutates `view`. Mine positions are learned only through `reveal` on proven-safe cells.
 */
export function solve(view: PlayerView, reveal: RevealFn): SolveResult {
  const { knowledge, numbers, totalMines } = view;
  const { size, neighbors } = view.geometry;
  const pending: number[] = [];
  let safeCount = 0;
  for (let i = 0; i < size; i++) {
    if (knowledge[i] !== Knowledge.Safe) continue;
    safeCount++;
    if (numbers[i] < 0) pending.push(i);
  }

  const markSafe = (i: number): void => {
    if (knowledge[i] === Knowledge.Safe) return;
    if (knowledge[i] === Knowledge.Mine) {
      throw new ContradictionError(`cell ${i} is already a mine`);
    }
    knowledge[i] = Knowledge.Safe;
    safeCount++;
    pending.push(i);
  };
  const markMine = (i: number): void => {
    if (knowledge[i] === Knowledge.Safe) throw new ContradictionError(`cell ${i} is already safe`);
    knowledge[i] = Knowledge.Mine;
  };

  let maxTier: SolveResult['maxTier'] = 0;
  let steps = 0;
  for (;;) {
    // Reveal everything proven safe. A 0 proves its neighbors safe, so expand it directly.
    let cell: number | undefined;
    while ((cell = pending.pop()) !== undefined) {
      const n = reveal(cell);
      numbers[cell] = n;
      if (n === 0) for (const nb of neighbors[cell]) markSafe(nb);
    }

    if (safeCount === size - totalMines) {
      // Every safe cell is revealed, so whatever is left is a mine.
      for (let i = 0; i < size; i++) if (knowledge[i] === Knowledge.Unknown) markMine(i);
      return { solved: true, maxTier, steps };
    }

    const deduction = findDeductions(view);
    if (!deduction) return { solved: false, maxTier, steps };
    steps++;
    if (deduction.tier > maxTier) maxTier = deduction.tier;
    for (const i of deduction.safe) markSafe(i);
    for (const i of deduction.mines) markMine(i);
  }
}

/** A RevealFn backed by a real board. Throws if asked to reveal a mine: that means unsoundness. */
export function revealFromBoard(board: Board): RevealFn {
  return (i) => {
    if (board.mines[i]) throw new Error(`solver revealed a mine at cell ${i}: unsound deduction`);
    return board.numbers[i];
  };
}

/** Solves `board` from scratch, starting with a click on `firstClick`. */
export function solveBoard(board: Board, firstClick: number): SolveResult & { view: PlayerView } {
  if (!Number.isInteger(firstClick) || firstClick < 0 || firstClick >= board.size) {
    throw new RangeError(`first click ${firstClick} is outside 0..${board.size - 1}`);
  }
  // Use the shared geometry, not `board` itself, so the view carries no mine layout.
  const view = createView(getGeometry(board.width, board.height), board.mineCount);
  view.knowledge[firstClick] = Knowledge.Safe;
  return { ...solve(view, revealFromBoard(board)), view };
}
