import { findDeductions } from './solve';
import { createView, Knowledge, type PlayerView, type SolverOptions } from './types';

/**
 * A cell that is provably safe in the player's view, or null if none can be proven.
 * Deductions that only prove mines are applied (to a copy) and solving continues, since
 * those mines often free a safe cell. Prefers the lowest tier that yields a safe cell.
 */
export function findHint(view: PlayerView, options: SolverOptions = {}): number | null {
  const work = createView(view.geometry, view.totalMines);
  work.knowledge.set(view.knowledge);
  work.numbers.set(view.numbers);
  for (;;) {
    const deduction = findDeductions(work, options);
    if (!deduction) return null;
    if (deduction.safe.length > 0) return deduction.safe[0];
    for (const cell of deduction.mines) work.knowledge[cell] = Knowledge.Mine;
  }
}

/** Builds the solver's view from what the player can see (numbers on revealed cells). */
export function viewFromNumbers(
  geometry: PlayerView['geometry'],
  totalMines: number,
  numbers: Int8Array,
): PlayerView {
  const view = createView(geometry, totalMines);
  numbers.forEach((n, i) => {
    if (n < 0) return;
    view.knowledge[i] = Knowledge.Safe;
    view.numbers[i] = n;
  });
  return view;
}
