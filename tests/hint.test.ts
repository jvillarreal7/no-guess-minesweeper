import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { getGeometry } from '../src/core/board';
import { Game } from '../src/core/game';
import { generate } from '../src/generator/generate';
import { explainHint, findHint, viewFromNumbers } from '../src/solver/hint';
import { Knowledge } from '../src/solver/types';
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

describe('explainHint', () => {
  it('explains a number that already has its mines', () => {
    // The 1 at (3,0) forces a mine at (2,0); that completes the 1 at (1,0), freeing (0,0).
    expect(explainHint(parseView('?1?1', 1))).toEqual({
      cell: 0,
      reason: { kind: 'complete', source: 1 },
      mines: [2],
    });
  });

  it('explains two numbers sharing cells (1-2-1)', () => {
    // The 2 must put a mine in cells the 1 also touches, which completes the 1.
    expect(explainHint(parseView('???????\n??121??', 4))).toEqual({
      cell: 1,
      reason: { kind: 'shared', source: 10, target: 9, mines: 1 },
      mines: [],
    });
  });

  it('explains when every mine is accounted for', () => {
    expect(explainHint(parseView('F??', 1))?.reason).toEqual({
      kind: 'allMinesFound',
      totalMines: 1,
    });
  });

  it('explains cells away from the numbers when the numbers need every mine left', () => {
    expect(explainHint(parseView('001??\n001??', 1))).toEqual({
      cell: 4,
      reason: { kind: 'remainingMines', minesLeft: 1 },
      mines: [],
    });
  });

  it('falls back to "every arrangement" for the hardest cases', () => {
    expect(explainHint(parseView('???\n2F2', 2))).toEqual({
      cell: 0,
      reason: { kind: 'arrangements', sources: [3, 5], minesLeft: 1 },
      mines: [],
    });
  });

  it('only ever claims things that are true (random positions vs. the oracle)', () => {
    fc.assert(
      fc.property(viewCase(5), ({ view }) => {
        const hint = explainHint(view);
        const verdict = oracle(view);
        if (hint === null) {
          expect(verdict.safe).toEqual([]);
          return;
        }
        expect(verdict.safe).toContain(hint.cell);
        for (const m of hint.mines) expect(verdict.mines).toContain(m);

        const { neighbors } = view.geometry;
        const touches = (a: number, b: number) => Array.from(neighbors[a]).includes(b);
        const { reason } = hint;
        if (reason.kind === 'complete') {
          // The number touches the hinted cell and exactly its count of known mines.
          expect(touches(reason.source, hint.cell)).toBe(true);
          const known = Array.from(neighbors[reason.source]).filter(
            (n) => view.knowledge[n] === Knowledge.Mine || hint.mines.includes(n),
          ).length;
          expect(known).toBe(view.numbers[reason.source]);
        }
        if (reason.kind === 'shared') {
          expect(touches(reason.target, hint.cell)).toBe(true);
          expect(touches(reason.source, hint.cell)).toBe(false);
          const common = Array.from(neighbors[reason.source]).some(
            (n) => touches(reason.target, n) && view.knowledge[n] !== Knowledge.Safe,
          );
          expect(common).toBe(true);
        }
        if (reason.kind === 'remainingMines') {
          expect(Array.from(neighbors[hint.cell]).every((n) => view.numbers[n] < 0)).toBe(true);
        }
      }),
      { numRuns: 3000 },
    );
  });
});
