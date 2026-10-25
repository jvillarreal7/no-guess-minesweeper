import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { getGeometry } from '../src/core/board';
import { generateUnverified, safeZone, type BoardSpec } from '../src/generator/generate';

const BEGINNER: BoardSpec = { width: 9, height: 9, mineCount: 10, seed: 'abc123', firstClick: 40 };

function mineIndices(mines: Uint8Array): number[] {
  const out: number[] = [];
  mines.forEach((m, i) => {
    if (m) out.push(i);
  });
  return out;
}

describe('safeZone', () => {
  it('is the click plus its neighbors', () => {
    const g = getGeometry(9, 9);
    expect(safeZone(g, 40)).toEqual([30, 31, 32, 39, 40, 41, 48, 49, 50]);
    expect(safeZone(g, 0)).toEqual([0, 1, 9, 10]);
    expect(safeZone(g, 4)).toEqual([3, 4, 5, 12, 13, 14]);
  });
});

describe('generateUnverified', () => {
  it('places exactly mineCount mines', () => {
    expect(generateUnverified(BEGINNER).mineCount).toBe(10);
  });

  it('keeps the safe zone clear so the first click is a zero', () => {
    const board = generateUnverified(BEGINNER);
    for (const i of safeZone(board, 40)) expect(board.mines[i]).toBe(0);
    expect(board.numbers[40]).toBe(0);
  });

  it('is deterministic for the same inputs', () => {
    const a = generateUnverified(BEGINNER);
    const b = generateUnverified({ ...BEGINNER });
    expect(Array.from(a.mines)).toEqual(Array.from(b.mines));
  });

  it('differs across seeds and first clicks', () => {
    const base = mineIndices(generateUnverified(BEGINNER).mines);
    expect(mineIndices(generateUnverified({ ...BEGINNER, seed: 'abc124' }).mines)).not.toEqual(
      base,
    );
    expect(mineIndices(generateUnverified({ ...BEGINNER, firstClick: 0 }).mines)).not.toEqual(base);
  });

  it('keeps producing the pinned board for this GENERATOR_VERSION', () => {
    // If this fails, generator output changed: bump GENERATOR_VERSION and update the pin.
    expect(mineIndices(generateUnverified(BEGINNER).mines)).toEqual(PINNED_BEGINNER);
  });

  it('fills every cell outside the safe zone at maximum density', () => {
    const board = generateUnverified({ ...BEGINNER, mineCount: 81 - 9 });
    expect(board.mineCount).toBe(72);
    expect(board.numbers[40]).toBe(0);
  });

  it('allows a board with no mines', () => {
    expect(generateUnverified({ ...BEGINNER, mineCount: 0 }).mineCount).toBe(0);
  });

  it('rejects invalid mine counts and clicks', () => {
    expect(() => generateUnverified({ ...BEGINNER, mineCount: 73 })).toThrow(RangeError);
    expect(() => generateUnverified({ ...BEGINNER, mineCount: -1 })).toThrow(RangeError);
    expect(() => generateUnverified({ ...BEGINNER, mineCount: 2.5 })).toThrow(RangeError);
    expect(() => generateUnverified({ ...BEGINNER, firstClick: 81 })).toThrow(RangeError);
    expect(() => generateUnverified({ ...BEGINNER, firstClick: -1 })).toThrow(RangeError);
  });

  it('respects the mine count and safe zone for any valid spec', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 30 }),
        fc.nat(),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.string(),
        (width, height, clickSeed, density, seed) => {
          const firstClick = clickSeed % (width * height);
          const zone = safeZone(getGeometry(width, height), firstClick);
          const mineCount = Math.floor(density * (width * height - zone.length));
          const board = generateUnverified({ width, height, mineCount, seed, firstClick });
          expect(board.mineCount).toBe(mineCount);
          for (const i of zone) expect(board.mines[i]).toBe(0);
          expect(board.numbers[firstClick]).toBe(0);
        },
      ),
      { numRuns: 500 },
    );
  });
});

const PINNED_BEGINNER = [2, 43, 44, 52, 62, 64, 67, 69, 75, 80];
