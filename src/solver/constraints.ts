import { Knowledge, type Deduction, type PlayerView, type Tier } from './types';

/** Exactly `mines` of `cells` (unknown cells, ascending) are mines. */
export interface Constraint {
  readonly cells: readonly number[];
  readonly mines: number;
}

/** The view (or a set of constraints) admits no mine layout. Always a bug upstream. */
export class ContradictionError extends Error {
  override name = 'ContradictionError';
}

/**
 * One constraint per revealed number that still has unknown neighbors:
 * sum(unknown neighbors) = number - proven mines around it.
 */
export function buildConstraints(view: PlayerView): Constraint[] {
  const { knowledge, numbers } = view;
  const { size, neighbors } = view.geometry;
  const constraints: Constraint[] = [];
  for (let i = 0; i < size; i++) {
    const number = numbers[i];
    if (number < 0) continue;
    const cells: number[] = [];
    let mines = number;
    for (const n of neighbors[i]) {
      if (knowledge[n] === Knowledge.Unknown) cells.push(n);
      else if (knowledge[n] === Knowledge.Mine) mines--;
    }
    if (mines < 0 || mines > cells.length) {
      throw new ContradictionError(
        `cell ${i} shows ${number} but ${mines} mines remain among ${cells.length} unknown cells`,
      );
    }
    if (cells.length > 0) constraints.push({ cells, mines });
  }
  return constraints;
}

/** The global mine count as a constraint over every unknown cell. */
export function globalConstraint(view: PlayerView): Constraint {
  const cells: number[] = [];
  let mines = view.totalMines;
  view.knowledge.forEach((k, i) => {
    if (k === Knowledge.Unknown) cells.push(i);
    else if (k === Knowledge.Mine) mines--;
  });
  if (mines < 0 || mines > cells.length) {
    throw new ContradictionError(`${mines} mines remain among ${cells.length} unknown cells`);
  }
  return { cells, mines };
}

/** Collects proven cells, refusing to call one cell both safe and a mine. */
export class Findings {
  private readonly safe = new Set<number>();
  private readonly mines = new Set<number>();

  get isEmpty(): boolean {
    return this.safe.size === 0 && this.mines.size === 0;
  }

  addSafe(cells: Iterable<number>): void {
    for (const c of cells) {
      if (this.mines.has(c)) throw new ContradictionError(`cell ${c} proven both safe and mine`);
      this.safe.add(c);
    }
  }

  addMines(cells: Iterable<number>): void {
    for (const c of cells) {
      if (this.safe.has(c)) throw new ContradictionError(`cell ${c} proven both safe and mine`);
      this.mines.add(c);
    }
  }

  toDeduction(tier: Tier): Deduction | null {
    if (this.isEmpty) return null;
    const byIndex = (a: number, b: number) => a - b;
    return { safe: [...this.safe].sort(byIndex), mines: [...this.mines].sort(byIndex), tier };
  }
}
