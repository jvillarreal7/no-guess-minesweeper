import { buildConstraints, type Constraint } from './constraints';
import { findDeductions } from './solve';
import { createView, Knowledge, type PlayerView, type SolverOptions, type Tier } from './types';

/**
 * The technique a player could use to prove the hinted cell safe. Cell indices name the
 * revealed numbers involved.
 */
export type HintReason =
  /** The number at `source` already touches all its mines; its other neighbours are safe. */
  | { kind: 'complete'; source: number }
  /**
   * The number at `source` must put `mines` of its mines in cells the number at `target`
   * also touches. That is all `target` needs, so its other neighbours are safe.
   */
  | { kind: 'shared'; source: number; target: number; mines: number }
  /** Combining the counts of several numbers leaves no room for a mine here. */
  | { kind: 'combined'; sources: number[] }
  /** Every arrangement that fits these numbers and the mines left leaves the cell empty. */
  | { kind: 'arrangements'; sources: number[]; minesLeft: number }
  /** The numbers need every remaining mine, so cells touching no number are safe. */
  | { kind: 'remainingMines'; minesLeft: number }
  /** Every mine is accounted for, so every covered cell is safe. */
  | { kind: 'allMinesFound'; totalMines: number };

export interface Hint {
  cell: number;
  reason: HintReason;
  /** Mines proven along the way that the explanation relies on (next to its numbers). */
  mines: number[];
}

/** Simpler explanations first: the hint picks the easiest cell to learn from. */
const RANK: Record<HintReason['kind'], number> = {
  complete: 0,
  allMinesFound: 1,
  shared: 2,
  remainingMines: 3,
  combined: 4,
  arrangements: 5,
};

const MAX_SOURCES = 3;

/**
 * A provably safe cell and how a player could prove it, or null if none can be proven.
 * Deductions that only prove mines are applied (to a copy) and solving continues, since
 * those mines often free a safe cell.
 */
export function explainHint(view: PlayerView, options: SolverOptions = {}): Hint | null {
  const work = createView(view.geometry, view.totalMines);
  work.knowledge.set(view.knowledge);
  work.numbers.set(view.numbers);
  for (;;) {
    const deduction = findDeductions(work, options);
    if (!deduction) return null;
    if (deduction.safe.length === 0) {
      for (const cell of deduction.mines) work.knowledge[cell] = Knowledge.Mine;
      continue;
    }
    const constraints = buildConstraints(work);
    let best: { cell: number; reason: HintReason } | null = null;
    for (const cell of deduction.safe) {
      const reason = reasonFor(work, constraints, cell, deduction.tier);
      if (!best || RANK[reason.kind] < RANK[best.reason.kind]) best = { cell, reason };
    }
    if (!best) return null;
    return { ...best, mines: minesRelied(view, work, best.reason) };
  }
}

/** Just the cell of explainHint. */
export function findHint(view: PlayerView, options: SolverOptions = {}): number | null {
  return explainHint(view, options)?.cell ?? null;
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

/** Picks the simplest technique that proves `cell` safe at this tier. */
function reasonFor(
  work: PlayerView,
  constraints: Constraint[],
  cell: number,
  tier: Tier,
): HintReason {
  const minesLeft = work.totalMines - work.knowledge.filter((k) => k === Knowledge.Mine).length;
  if (tier === 1) {
    const done = constraints.find((c) => c.mines === 0 && c.cells.includes(cell));
    if (done?.source !== undefined) return { kind: 'complete', source: done.source };
    return { kind: 'allMinesFound', totalMines: work.totalMines };
  }
  const sources = nearbySources(work, constraints, cell);
  if (tier === 2) return sharedReason(constraints, cell) ?? { kind: 'combined', sources };
  if (sources.length === 0) return { kind: 'remainingMines', minesLeft };
  return { kind: 'arrangements', sources, minesLeft };
}

/**
 * Looks for two numbers where one (the driver) must put mines in cells the other (the
 * target, which touches `cell`) also sees, filling the target. Then `cell` is safe.
 */
function sharedReason(constraints: Constraint[], cell: number): HintReason | null {
  for (const target of constraints) {
    if (target.source === undefined || target.mines === 0 || !target.cells.includes(cell)) {
      continue;
    }
    for (const driver of constraints) {
      if (driver === target || driver.source === undefined || driver.cells.includes(cell)) {
        continue;
      }
      const shared = driver.cells.filter((c) => target.cells.includes(c)).length;
      if (shared === 0) continue;
      // Cells only the driver sees can't hold more than their count, so the rest of the
      // driver's mines must sit in the shared cells.
      const forced = driver.mines - (driver.cells.length - shared);
      if (forced >= target.mines) {
        return {
          kind: 'shared',
          source: driver.source,
          target: target.source,
          mines: target.mines,
        };
      }
    }
  }
  return null;
}

/** Numbers whose constraints touch `cell`, or overlap those, nearest first. */
function nearbySources(work: PlayerView, constraints: Constraint[], cell: number): number[] {
  const direct = constraints.filter((c) => c.cells.includes(cell));
  const linked = constraints.filter(
    (c) => direct.includes(c) || direct.some((d) => d.cells.some((x) => c.cells.includes(x))),
  );
  const { width } = work.geometry;
  const distance = (i: number) =>
    Math.max(
      Math.abs((i % width) - (cell % width)),
      Math.abs(Math.floor(i / width) - Math.floor(cell / width)),
    );
  const sources = [
    ...new Set(linked.map((c) => c.source).filter((s): s is number => s !== undefined)),
  ];
  return sources.sort((a, b) => distance(a) - distance(b) || a - b).slice(0, MAX_SOURCES);
}

/** Mines proven during the hint (not already known) that touch the reason's numbers. */
function minesRelied(view: PlayerView, work: PlayerView, reason: HintReason): number[] {
  const sources =
    reason.kind === 'complete'
      ? [reason.source]
      : reason.kind === 'shared'
        ? [reason.source, reason.target]
        : reason.kind === 'combined' || reason.kind === 'arrangements'
          ? reason.sources
          : [];
  const { neighbors } = view.geometry;
  const mines = new Set<number>();
  for (const s of sources) {
    for (const n of neighbors[s]) {
      if (work.knowledge[n] === Knowledge.Mine && view.knowledge[n] !== Knowledge.Mine)
        mines.add(n);
    }
  }
  return [...mines].sort((a, b) => a - b);
}
