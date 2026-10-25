import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Knowledge, type PlayerView } from '../src/solver/types';
import { viewCase } from './arbitraries';
import { parseView } from './helpers';
import { oracle, type OracleVerdict } from './oracle';

/** Tries every assignment of the unknown cells. Exponential; only for tiny views. */
function bruteForce(view: PlayerView): OracleVerdict {
  const { knowledge, numbers, totalMines } = view;
  const { size, neighbors } = view.geometry;
  const unknown = [...knowledge.keys()].filter((i) => knowledge[i] === Knowledge.Unknown);
  const isMine = new Uint8Array(size);
  for (let i = 0; i < size; i++) isMine[i] = knowledge[i] === Knowledge.Mine ? 1 : 0;
  const canBeMine = new Set<number>();
  const canBeSafe = new Set<number>();
  let layouts = 0;
  for (let mask = 0; mask < 2 ** unknown.length; mask++) {
    unknown.forEach((c, bit) => (isMine[c] = (mask >> bit) & 1));
    if (isMine.reduce((s, m) => s + m, 0) !== totalMines) continue;
    let ok = true;
    for (let i = 0; i < size && ok; i++) {
      if (numbers[i] < 0) continue;
      let around = 0;
      for (const n of neighbors[i]) around += isMine[n];
      ok = around === numbers[i];
    }
    if (!ok) continue;
    layouts++;
    for (const c of unknown) (isMine[c] ? canBeMine : canBeSafe).add(c);
  }
  if (layouts === 0) throw new Error('no consistent layout');
  return {
    safe: unknown.filter((c) => !canBeMine.has(c)),
    mines: unknown.filter((c) => !canBeSafe.has(c)),
  };
}

const unknownCount = (view: PlayerView) =>
  view.knowledge.reduce((n, k) => n + (k === Knowledge.Unknown ? 1 : 0), 0);

describe('oracle', () => {
  it('finds nothing certain in a 50/50', () => {
    expect(oracle(parseView('?1\n?1', 1))).toEqual({ safe: [], mines: [] });
  });

  it('solves 1-2-1 the same way a player would', () => {
    const verdict = oracle(parseView('???????\n??121??', 2));
    // With only 2 mines in total, everything outside the pattern is safe too.
    expect(verdict.mines).toEqual([2, 4]);
    expect(verdict.safe).toEqual([0, 1, 3, 5, 6, 7, 8, 12, 13]);
  });

  it('uses the global mine count', () => {
    expect(oracle(parseView('???\n2F2', 2))).toEqual({ safe: [0, 2], mines: [1] });
    expect(oracle(parseView('???\n2F2', 3))).toEqual({ safe: [1], mines: [0, 2] });
  });

  it('throws on an impossible view', () => {
    expect(() => oracle(parseView('0F', 1))).toThrow();
    expect(() => oracle(parseView('1?', 0))).toThrow();
  });

  it('agrees with brute force on random small views', () => {
    fc.assert(
      fc.property(viewCase(4), ({ view }) => {
        fc.pre(unknownCount(view) <= 14);
        expect(oracle(view)).toEqual(bruteForce(view));
      }),
      { numRuns: 1000 },
    );
  });
});
