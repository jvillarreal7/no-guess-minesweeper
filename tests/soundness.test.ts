import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { getGeometry, type Board } from '../src/core/board';
import { generateUnverified, safeZone } from '../src/generator/generate';
import { findDeductions, revealFromBoard } from '../src/solver/solve';
import {
  createView,
  Knowledge,
  type Deduction,
  type PlayerView,
  type SolverOptions,
} from '../src/solver/types';
import { viewCase } from './arbitraries';
import { oracle, type OracleVerdict } from './oracle';

// The oracle soundness test (see CLAUDE.md). Never weaken, skip or narrow it to make it
// pass: fix the solver instead.

const RUNS = Number(process.env.ORACLE_RUNS ?? 10_000);
// Scale the per-test timeout with the run count (ORACLE_RUNS=200000 takes minutes).
const TIMEOUT_MS = Math.max(5_000, RUNS);
const UNLIMITED: SolverOptions = { maxComponentSize: Infinity, maxNodes: Infinity };

/** Every cell the solver proves must be proven by the oracle too. */
function expectSound(d: Deduction | null, verdict: OracleVerdict): void {
  if (!d) return;
  expect(
    d.safe.filter((c) => !verdict.safe.includes(c)),
    'claimed safe, not certain',
  ).toEqual([]);
  expect(
    d.mines.filter((c) => !verdict.mines.includes(c)),
    'claimed mine, not certain',
  ).toEqual([]);
}

/** With no limits, the solver must find something whenever the oracle can. */
function expectCompleteWhenStuck(view: PlayerView, verdict: OracleVerdict): void {
  if (findDeductions(view, UNLIMITED) === null) {
    expect(verdict, 'solver stuck but oracle found certain cells').toEqual({ safe: [], mines: [] });
  }
}

function apply(view: PlayerView, d: Deduction): void {
  for (const c of d.safe) view.knowledge[c] = Knowledge.Safe;
  for (const c of d.mines) view.knowledge[c] = Knowledge.Mine;
}

/** Reveals every proven-safe cell (expanding zeros), as the driver does. */
function revealProvenSafe(view: PlayerView, board: Board): void {
  const reveal = revealFromBoard(board);
  const { knowledge, numbers } = view;
  const stack = [...knowledge.keys()].filter(
    (i) => knowledge[i] === Knowledge.Safe && numbers[i] < 0,
  );
  let cell: number | undefined;
  while ((cell = stack.pop()) !== undefined) {
    if (numbers[cell] >= 0) continue;
    numbers[cell] = reveal(cell);
    if (numbers[cell] !== 0) continue;
    for (const n of view.geometry.neighbors[cell]) {
      if (knowledge[n] !== Knowledge.Unknown) continue;
      knowledge[n] = Knowledge.Safe;
      stack.push(n);
    }
  }
}

const boardCase = fc
  .record({
    width: fc.integer({ min: 1, max: 5 }),
    height: fc.integer({ min: 1, max: 5 }),
    clickSeed: fc.nat(),
    density: fc.double({ min: 0, max: 1, noNaN: true }),
    seed: fc.string({ maxLength: 8 }),
  })
  .map(({ width, height, clickSeed, density, seed }) => {
    const firstClick = clickSeed % (width * height);
    const zone = safeZone(getGeometry(width, height), firstClick);
    const mineCount = Math.floor(density * (width * height - zone.length));
    return {
      board: generateUnverified({ width, height, mineCount, seed, firstClick }),
      firstClick,
    };
  });

describe('solver vs. brute-force oracle on boards up to 5x5', () => {
  it(
    'every deduction along a full solve from the first click is certain',
    () => {
      fc.assert(
        fc.property(fc.oneof(boardCase, fc.noBias(boardCase)), ({ board, firstClick }) => {
          const view = createView(getGeometry(board.width, board.height), board.mineCount);
          view.knowledge[firstClick] = Knowledge.Safe;
          for (;;) {
            revealProvenSafe(view, board);
            if (view.knowledge.every((k) => k !== Knowledge.Unknown)) return;
            const verdict = oracle(view);
            const d = findDeductions(view);
            expectSound(d, verdict);
            expectCompleteWhenStuck(view, verdict);
            if (!d) return;
            apply(view, d);
          }
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT_MS,
  );

  it(
    'every deduction on arbitrary player views is certain, down to the fixpoint',
    () => {
      fc.assert(
        fc.property(viewCase(5), ({ view }) => {
          for (;;) {
            const verdict = oracle(view);
            const d = findDeductions(view);
            expectSound(d, verdict);
            expectCompleteWhenStuck(view, verdict);
            if (!d) return;
            apply(view, d);
          }
        }),
        { numRuns: RUNS },
      );
    },
    TIMEOUT_MS,
  );

  it(
    'stays sound when tier 3 limits force it to skip components',
    () => {
      fc.assert(
        fc.property(
          viewCase(5),
          fc.integer({ min: 0, max: 8 }),
          fc.integer({ min: 1, max: 300 }),
          ({ view }, maxComponentSize, maxNodes) => {
            const options = { maxComponentSize, maxNodes };
            for (;;) {
              const d = findDeductions(view, options);
              expectSound(d, oracle(view));
              if (!d) return;
              apply(view, d);
            }
          },
        ),
        { numRuns: Math.ceil(RUNS / 5) },
      );
    },
    TIMEOUT_MS,
  );
});
