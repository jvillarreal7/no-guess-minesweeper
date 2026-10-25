import { ContradictionError, Findings, type Constraint } from './constraints';
import { Knowledge, type Deduction, type PlayerView, type SolverOptions } from './types';

export const DEFAULT_MAX_COMPONENT_SIZE = 40;
export const DEFAULT_MAX_NODES = 200_000;

/** Frontier cells linked by shared constraints, and those constraints. */
interface Component {
  cells: number[];
  constraints: Constraint[];
}

/** What enumeration learned about one component. */
interface Enumerated {
  cells: number[];
  /** feasible[k] = 1 if some consistent layout of the component has exactly k mines. */
  feasible: Uint8Array;
  /**
   * mineAt[j * (n + 1) + k] = 1 if cell j is a mine in some layout with k mines
   * (safeAt likewise). Null when the component was skipped: then `feasible` allows
   * every k and nothing is known per cell.
   */
  mineAt: Uint8Array | null;
  safeAt: Uint8Array | null;
}

/**
 * Exact reasoning over the whole frontier plus the global mine count.
 *
 * 1. Split the frontier into components (cells linked by a shared constraint).
 * 2. Enumerate each component's consistent layouts by backtracking, recording which mine
 *    counts k it can hold and, for each k, which cells can be mine or safe.
 * 3. Combine components with boolean subset-sum: with M mines left and I interior cells,
 *    a choice of counts is valid when M - I <= sum(k) <= M.
 * 4. A cell is certain if no valid choice lets it be the other way. Interior cells are all
 *    safe if every valid choice leaves 0 mines for them, all mines if every one leaves I.
 *
 * Components over the size cap or node budget are skipped: treated as able to hold any
 * count, with nothing known per cell. That only weakens conclusions, so it stays sound.
 */
export function tier3(
  view: PlayerView,
  constraints: readonly Constraint[],
  options: SolverOptions = {},
): Deduction | null {
  const maxSize = options.maxComponentSize ?? DEFAULT_MAX_COMPONENT_SIZE;
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const { size } = view.geometry;

  const inFrontier = new Uint8Array(size);
  for (const c of constraints) for (const cell of c.cells) inFrontier[cell] = 1;
  const interior: number[] = [];
  let minesLeft = view.totalMines;
  for (let i = 0; i < size; i++) {
    if (view.knowledge[i] === Knowledge.Mine) minesLeft--;
    else if (view.knowledge[i] === Knowledge.Unknown && !inFrontier[i]) interior.push(i);
  }

  const components = splitComponents(constraints, size).map((comp) =>
    comp.cells.length > maxSize ? skipped(comp) : (enumerate(comp, maxNodes) ?? skipped(comp)),
  );

  // Mine totals reachable by components [0, i) and by components [i, end).
  const prefix: Uint8Array[] = [Uint8Array.of(1)];
  for (const comp of components) prefix.push(sumset(prefix[prefix.length - 1], comp.feasible));
  const suffix: Uint8Array[] = new Array<Uint8Array>(components.length + 1);
  suffix[components.length] = Uint8Array.of(1);
  for (let i = components.length - 1; i >= 0; i--) {
    suffix[i] = sumset(components[i].feasible, suffix[i + 1]);
  }

  // The frontier's total s is valid when the interior can take the rest: 0 <= M - s <= I.
  const lo = minesLeft - interior.length;
  const hi = minesLeft;
  const all = prefix[components.length];
  let minTotal = Infinity;
  let maxTotal = -Infinity;
  for (let s = Math.max(0, lo); s <= Math.min(hi, all.length - 1); s++) {
    if (!all[s]) continue;
    minTotal = Math.min(minTotal, s);
    maxTotal = Math.max(maxTotal, s);
  }
  if (minTotal === Infinity) {
    throw new ContradictionError(`no split of ${minesLeft} mines fits the frontier and interior`);
  }

  const findings = new Findings();
  if (interior.length > 0) {
    // The interior holds between M - maxTotal and M - minTotal mines.
    if (minesLeft - minTotal === 0) findings.addSafe(interior);
    else if (minesLeft - maxTotal === interior.length) findings.addMines(interior);
  }

  components.forEach((comp, i) => {
    const { mineAt, safeAt, cells, feasible } = comp;
    if (!mineAt || !safeAt) return;
    const others = rangeCounter(sumset(prefix[i], suffix[i + 1]));
    const n = cells.length;
    const validK: number[] = [];
    for (let k = 0; k <= n; k++) {
      if (feasible[k] && others(lo - k, hi - k)) validK.push(k);
    }
    if (validK.length === 0) throw new ContradictionError('a component fits no valid mine total');
    cells.forEach((cell, j) => {
      const canMine = validK.some((k) => mineAt[j * (n + 1) + k]);
      const canSafe = validK.some((k) => safeAt[j * (n + 1) + k]);
      if (!canMine) findings.addSafe([cell]);
      else if (!canSafe) findings.addMines([cell]);
    });
  });

  return findings.toDeduction(3);
}

/** Groups constraints into components with union-find over their cells. */
function splitComponents(constraints: readonly Constraint[], size: number): Component[] {
  const parent = new Int32Array(size).map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (const { cells } of constraints) {
    for (let k = 1; k < cells.length; k++) parent[find(cells[k])] = find(cells[0]);
  }

  const byRoot = new Map<number, Component>();
  const seen = new Uint8Array(size);
  for (const c of constraints) {
    if (c.cells.length === 0) continue;
    const root = find(c.cells[0]);
    let comp = byRoot.get(root);
    if (!comp) {
      comp = { cells: [], constraints: [] };
      byRoot.set(root, comp);
    }
    comp.constraints.push(c);
    for (const cell of c.cells) {
      if (seen[cell]) continue;
      seen[cell] = 1;
      comp.cells.push(cell);
    }
  }
  return [...byRoot.values()];
}

function skipped(comp: Component): Enumerated {
  return {
    cells: comp.cells,
    feasible: new Uint8Array(comp.cells.length + 1).fill(1),
    mineAt: null,
    safeAt: null,
  };
}

/** Backtracks over every consistent layout. Returns null if the node budget runs out. */
function enumerate(comp: Component, maxNodes: number): Enumerated | null {
  const { cells, constraints } = comp;
  const n = cells.length;
  const local = new Map<number, number>();
  cells.forEach((cell, j) => local.set(cell, j));

  const target = Int32Array.from(constraints, (c) => c.mines);
  const open = Int32Array.from(constraints, (c) => c.cells.length);
  const mined = new Int32Array(constraints.length);
  const consOf: number[][] = cells.map(() => []);
  constraints.forEach((c, k) => {
    for (const cell of c.cells) consOf[local.get(cell) ?? -1].push(k);
  });

  // Visit cells breadth-first through shared constraints so each constraint closes early.
  const order: number[] = [];
  const queued = new Uint8Array(n);
  queued[0] = 1;
  order.push(0);
  for (let head = 0; head < order.length; head++) {
    for (const k of consOf[order[head]]) {
      for (const cell of constraints[k].cells) {
        const j = local.get(cell) ?? -1;
        if (!queued[j]) {
          queued[j] = 1;
          order.push(j);
        }
      }
    }
  }

  const value = new Uint8Array(n);
  const feasible = new Uint8Array(n + 1);
  const mineAt = new Uint8Array(n * (n + 1));
  const safeAt = new Uint8Array(n * (n + 1));
  let nodes = 0;
  let aborted = false;

  const visit = (pos: number, mines: number): void => {
    if (++nodes > maxNodes) {
      aborted = true;
      return;
    }
    if (pos === n) {
      // Every constraint is fully assigned and was checked on the way down.
      feasible[mines] = 1;
      for (let j = 0; j < n; j++) (value[j] ? mineAt : safeAt)[j * (n + 1) + mines] = 1;
      return;
    }
    const j = order[pos];
    for (let v = 0; v <= 1 && !aborted; v++) {
      value[j] = v;
      let ok = true;
      for (const k of consOf[j]) {
        open[k]--;
        mined[k] += v;
        if (mined[k] > target[k] || mined[k] + open[k] < target[k]) ok = false;
      }
      if (ok) visit(pos + 1, mines + v);
      for (const k of consOf[j]) {
        open[k]++;
        mined[k] -= v;
      }
    }
  };
  visit(0, 0);
  if (aborted) return null;
  if (!feasible.includes(1)) throw new ContradictionError('a frontier component has no layout');
  return { cells, feasible, mineAt, safeAt };
}

/** Sums reachable by adding one value from each set (sets as 0/1 arrays indexed by value). */
function sumset(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length - 1);
  for (let i = 0; i < a.length; i++) {
    if (!a[i]) continue;
    for (let j = 0; j < b.length; j++) if (b[j]) out[i + j] = 1;
  }
  return out;
}

/** Returns a query: does `set` contain any value in [from, to]? */
function rangeCounter(set: Uint8Array): (from: number, to: number) => boolean {
  const before = new Int32Array(set.length + 1);
  for (let i = 0; i < set.length; i++) before[i + 1] = before[i] + set[i];
  return (from, to) => {
    const a = Math.max(0, from);
    const b = Math.min(set.length - 1, to);
    return a <= b && before[b + 1] - before[a] > 0;
  };
}
