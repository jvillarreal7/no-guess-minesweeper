import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { getGeometry } from '../src/core/board';
import { DIFFICULTIES } from '../src/core/difficulty';
import { generate, generateUnverified, safeZone, type BoardSpec } from '../src/generator/generate';
import { solveBoard } from '../src/solver/solve';

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

describe('generate (verified)', () => {
  it('only returns boards the solver clears from the first click', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 12 }),
        fc.integer({ min: 2, max: 12 }),
        fc.nat(),
        fc.double({ min: 0, max: 0.2, noNaN: true }),
        fc.string({ maxLength: 8 }),
        (width, height, clickSeed, density, seed) => {
          const firstClick = clickSeed % (width * height);
          const mineCount = Math.floor(density * width * height);
          fc.pre(
            mineCount <= width * height - safeZone(getGeometry(width, height), firstClick).length,
          );
          const result = generate({ width, height, mineCount, seed, firstClick });
          if (!result.ok) return; // Allowed: some small specs have no solvable layout.
          const { board } = result;
          expect(board.mineCount).toBe(mineCount);
          expect(board.numbers[firstClick]).toBe(0);
          expect(board.mines[firstClick]).toBe(0);
          // Re-verify from scratch, independently of the generator's own check.
          expect(solveBoard(board, firstClick).solved).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('produces every standard difficulty, verified', () => {
    for (const [name, d] of Object.entries(DIFFICULTIES)) {
      for (let k = 0; k < 5; k++) {
        const firstClick = (k * 37) % (d.width * d.height);
        const spec = { ...d, seed: `${name}-${k}`, firstClick };
        const result = generate(spec);
        expect(result.ok, `${name} seed ${k}`).toBe(true);
        if (result.ok) expect(solveBoard(result.board, firstClick).solved).toBe(true);
      }
    }
  });

  it('is deterministic for the same spec', () => {
    const spec = { ...DIFFICULTIES.expert, seed: 'same', firstClick: 245 };
    const a = generate(spec);
    const b = generate({ ...spec });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(Array.from(a.board.mines)).toEqual(Array.from(b.board.mines));
      expect(a.attempts).toBe(b.attempts);
    }
  });

  it('accepts the unverified board when it is already solvable', () => {
    // The first attempt draws from the same RNG state as generateUnverified.
    for (let k = 0; k < 20; k++) {
      const spec = { ...BEGINNER, seed: `first-${k}` };
      const raw = generateUnverified(spec);
      if (!solveBoard(raw, spec.firstClick).solved) continue;
      const result = generate(spec);
      expect(result.ok && result.attempts).toBe(1);
      if (result.ok) expect(Array.from(result.board.mines)).toEqual(Array.from(raw.mines));
    }
  });

  it('keeps producing the pinned board for this GENERATOR_VERSION', () => {
    // If this fails, generator (or solver) output changed: bump GENERATOR_VERSION.
    const spec = { ...DIFFICULTIES.expert, seed: 'pin', firstClick: 245 };
    const result = generate(spec);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attempts).toBe(PINNED_EXPERT.attempts);
      expect(mineIndices(result.board.mines).slice(0, 10)).toEqual(PINNED_EXPERT.firstMines);
    }
  });

  it('reports failure when no attempt within the budget is solvable', () => {
    // 2x4, click in a corner, 1 mine: every placement ends in a 50/50.
    const spec = { width: 2, height: 4, mineCount: 1, seed: 'x', firstClick: 0 };
    expect(generate(spec, { maxAttempts: 20 })).toEqual({ ok: false, attempts: 20 });
  });

  it('rejects an invalid attempt budget', () => {
    expect(() => generate(BEGINNER, { maxAttempts: 0 })).toThrow(RangeError);
    expect(() => generate(BEGINNER, { maxAttempts: 1.5 })).toThrow(RangeError);
  });
});

const PINNED_EXPERT = { attempts: 30, firstMines: [7, 9, 11, 13, 14, 27, 31, 32, 42, 51] };
