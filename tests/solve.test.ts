import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { getGeometry } from '../src/core/board';
import { generateUnverified, safeZone } from '../src/generator/generate';
import { revealFromBoard, solveBoard } from '../src/solver/solve';
import { Knowledge } from '../src/solver/types';
import { at, parseBoard } from './helpers';

describe('solveBoard', () => {
  it('needs no deductions when the opening clears the board', () => {
    const board = parseBoard(`
      .....
      .....
      ..*..
    `);
    expect(solveBoard(board, 0)).toMatchObject({ solved: true, maxTier: 0, steps: 0 });
  });

  it('clears a board that needs subset logic after the opening', () => {
    // The opening leaves the top row hidden above 1 2 1 1; tier 2 finishes it.
    const board = parseBoard(`
      *.*.
      ....
      ....
    `);
    const result = solveBoard(board, at(4, 0, 2));
    expect(result.solved).toBe(true);
    expect(result.maxTier).toBe(2);
    expect(result.view.knowledge[0]).toBe(Knowledge.Mine);
    expect(result.view.knowledge[2]).toBe(Knowledge.Mine);
  });

  it('reports stuck on a forced 50/50 and leaves both cells unknown', () => {
    const board = parseBoard(`
      *...
      ....
    `);
    const result = solveBoard(board, at(4, 3, 0));
    expect(result.solved).toBe(false);
    const unknown = [...result.view.knowledge.keys()].filter(
      (i) => result.view.knowledge[i] === Knowledge.Unknown,
    );
    expect(unknown).toEqual([at(4, 0, 0), at(4, 0, 1)]);
  });

  it('rejects an out-of-range first click', () => {
    const board = parseBoard('..*');
    expect(() => solveBoard(board, 3)).toThrow(RangeError);
  });

  it('never claims anything false on random boards (soundness smoke test)', () => {
    let solved = 0;
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 12 }),
        fc.integer({ min: 3, max: 12 }),
        fc.nat(),
        fc.double({ min: 0, max: 0.3, noNaN: true }),
        fc.string(),
        (width, height, clickSeed, density, seed) => {
          const firstClick = clickSeed % (width * height);
          const zone = safeZone(getGeometry(width, height), firstClick);
          const mineCount = Math.floor(density * (width * height - zone.length));
          const board = generateUnverified({ width, height, mineCount, seed, firstClick });

          // revealFromBoard throws if the solver ever reveals a mine.
          const result = solveBoard(board, firstClick);
          const { knowledge } = result.view;
          for (let i = 0; i < board.size; i++) {
            if (knowledge[i] === Knowledge.Mine) expect(board.mines[i]).toBe(1);
            if (knowledge[i] === Knowledge.Safe) expect(board.mines[i]).toBe(0);
            if (result.solved) expect(knowledge[i]).not.toBe(Knowledge.Unknown);
          }
          if (result.solved) solved++;
        },
      ),
      { numRuns: 300 },
    );
    expect(solved).toBeGreaterThan(0);
  });
});

describe('revealFromBoard', () => {
  it('returns the number under a safe cell and throws on a mine', () => {
    const reveal = revealFromBoard(parseBoard('*..'));
    expect(reveal(1)).toBe(1);
    expect(reveal(2)).toBe(0);
    expect(() => reveal(0)).toThrow(/mine/);
  });
});
