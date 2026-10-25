import { Findings, type Constraint } from './constraints';
import type { Deduction } from './types';

/**
 * Single-constraint rules: a count of 0 makes every cell safe; a count equal to the
 * number of cells makes every cell a mine.
 */
export function tier1(constraints: readonly Constraint[]): Deduction | null {
  const findings = new Findings();
  for (const { cells, mines } of constraints) {
    if (cells.length === 0) continue;
    if (mines === 0) findings.addSafe(cells);
    else if (mines === cells.length) findings.addMines(cells);
  }
  return findings.toDeduction(1);
}
