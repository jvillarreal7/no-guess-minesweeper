import { ContradictionError, Findings, type Constraint } from './constraints';
import type { Deduction } from './types';

/** Stop deriving new constraints past this many, so a huge frontier can't blow up. */
export const MAX_TIER2_CONSTRAINTS = 2000;

/**
 * Pairwise reduction over constraints that share cells.
 *
 * For a pair A, B with shared cells S, the mines in S lie in [sMin, sMax]:
 *   sMax = min(|S|, A, B)
 *   sMin = max(0, A - |A only|, B - |B only|)
 * so A's own cells hold between A - sMax and A - sMin mines (same for B). If a range
 * pins its cells (S, A only or B only) to 0 or to all, they are decided. When sMin = sMax the split is exact and the
 * parts become new constraints (this covers the subset rule: B - A has B - A mines),
 * which are then paired like any other.
 *
 * Runs every pair of the original constraints, then keeps pairing derived ones until
 * something is decided.
 */
export function tier2(
  constraints: readonly Constraint[],
  maxConstraints = MAX_TIER2_CONSTRAINTS,
): Deduction | null {
  const pool: Constraint[] = [];
  const byKey = new Map<string, Constraint>();
  const byCell = new Map<number, number[]>();
  const findings = new Findings();

  const add = (c: Constraint): void => {
    const key = c.cells.join(',');
    const existing = byKey.get(key);
    if (existing) {
      if (existing.mines !== c.mines) {
        throw new ContradictionError(`cells {${key}} hold both ${existing.mines} and ${c.mines}`);
      }
      return;
    }
    if (pool.length >= maxConstraints) return;
    byKey.set(key, c);
    for (const cell of c.cells) {
      const list = byCell.get(cell);
      if (list) list.push(pool.length);
      else byCell.set(cell, [pool.length]);
    }
    pool.push(c);
  };

  /** Adds a derived constraint unless it is empty or already decided. */
  const derive = (cells: number[], mines: number): void => {
    if (mines > 0 && mines < cells.length) add({ cells, mines });
  };

  const resolve = (cells: number[], fewest: number, most: number): void => {
    if (cells.length === 0) return;
    if (most === 0) findings.addSafe(cells);
    else if (fewest === cells.length) findings.addMines(cells);
  };

  for (const c of constraints) add(c);
  const originalCount = pool.length;

  for (let a = 0; a < pool.length; a++) {
    const A = pool[a];
    // Pair with every earlier constraint sharing a cell; later ones pair with A in turn.
    const partners = new Set<number>();
    for (const cell of A.cells) {
      for (const b of byCell.get(cell) ?? []) if (b < a) partners.add(b);
    }
    for (const b of partners) {
      const B = pool[b];
      const { onlyA, onlyB, shared } = split(A.cells, B.cells);
      const sMax = Math.min(shared.length, A.mines, B.mines);
      const sMin = Math.max(0, A.mines - onlyA.length, B.mines - onlyB.length);
      if (sMin > sMax) {
        throw new ContradictionError(
          `constraints {${A.cells}}=${A.mines} and {${B.cells}}=${B.mines} conflict`,
        );
      }
      resolve(shared, sMin, sMax);
      resolve(onlyA, A.mines - sMax, A.mines - sMin);
      resolve(onlyB, B.mines - sMax, B.mines - sMin);
      if (sMin === sMax) {
        derive(shared, sMin);
        derive(onlyA, A.mines - sMin);
        derive(onlyB, B.mines - sMin);
      }
    }
    if (!findings.isEmpty && a >= originalCount - 1) break;
  }
  return findings.toDeduction(2);
}

/** Splits two ascending cell lists into A-only, B-only and shared cells. */
function split(
  a: readonly number[],
  b: readonly number[],
): { onlyA: number[]; onlyB: number[]; shared: number[] } {
  const onlyA: number[] = [];
  const onlyB: number[] = [];
  const shared: number[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      shared.push(a[i]);
      i++;
      j++;
    } else if (a[i] < b[j]) onlyA.push(a[i++]);
    else onlyB.push(b[j++]);
  }
  while (i < a.length) onlyA.push(a[i++]);
  while (j < b.length) onlyB.push(b[j++]);
  return { onlyA, onlyB, shared };
}
