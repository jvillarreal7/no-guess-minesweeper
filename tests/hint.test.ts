import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { getGeometry } from '../src/core/board';
import { Game } from '../src/core/game';
import { generate } from '../src/generator/generate';
import { findHint, viewFromNumbers } from '../src/solver/hint';
import { viewCase } from './arbitraries';
import { parseView } from './helpers';
import { oracle } from './oracle';

describe('findHint', () => {
  it('returns a cell the oracle proves safe, or null only when none exists', () => {
    fc.assert(
      fc.property(viewCase(5), ({ view }) => {
        const hint = findHint(view);
        const verdict = oracle(view);
        if (hint === null) expect(verdict.safe).toEqual([]);
        else expect(verdict.safe).toContain(hint);
      }),
      { numRuns: 3000 },
    );
  });

  it('works through mine-only deductions to reach a safe cell', () => {
    // (3,0)=1 proves (2,0) is a mine and nothing else; then (1,0)=1 frees (0,0).
    expect(findHint(parseView('?1?1', 1))).toBe(0);
  });

  it('returns null on a 50/50', () => {
    expect(findHint(parseView('?1\n?1', 1))).toBeNull();
  });

  it('does not change the view it was given', () => {
    const view = parseView('?1?1', 1);
    const before = Array.from(view.knowledge);
    findHint(view);
    expect(Array.from(view.knowledge)).toEqual(before);
  });

  it('always has a hint mid-game on a generated board, whatever the player revealed', () => {
    // The no-guess promise in practice: reveal random safe cells, then ask for a hint.
    fc.assert(
      fc.property(
        fc.string({ maxLength: 6 }),
        fc.array(fc.nat(), { maxLength: 30 }),
        (seed, picks) => {
          const spec = { width: 9, height: 9, mineCount: 10, seed, firstClick: 40 };
          const result = generate(spec);
          if (!result.ok) return;
          const game = new Game(result.board, { opening: 40 });
          const safe = [...result.board.mines.keys()].filter((i) => !result.board.mines[i]);
          for (const p of picks) game.reveal(safe[p % safe.length]);
          if (game.isOver) return;
          const view = viewFromNumbers(getGeometry(9, 9), 10, game.visibleNumbers());
          const hint = findHint(view);
          expect(hint).not.toBeNull();
          if (hint !== null) expect(result.board.mines[hint]).toBe(0);
        },
      ),
      { numRuns: 300 },
    );
  });
});
