import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { generateUnverified, type BoardSpec } from '../src/generator/generate';

const SPECS: Record<string, BoardSpec> = {
  beginner: { width: 9, height: 9, mineCount: 10, seed: 'play-1', firstClick: 40 },
  intermediate: { width: 16, height: 16, mineCount: 40, seed: 'play-2', firstClick: 0 },
  expert: { width: 30, height: 16, mineCount: 99, seed: 'play-3', firstClick: 245 },
};

describe('playing a generated board start to finish', () => {
  for (const [name, spec] of Object.entries(SPECS)) {
    it(`wins ${name} by revealing every safe cell`, () => {
      const game = new Game(generateUnverified(spec));
      const opening = game.reveal(spec.firstClick);
      expect(opening.length).toBeGreaterThan(1);
      expect(game.cellView(spec.firstClick)).toBe(0);

      // Cheat with the real layout: this tests the game rules, not the solver.
      for (let i = 0; i < game.board.size; i++) {
        if (!game.board.mines[i]) game.reveal(i);
      }
      expect(game.status).toBe('won');
      expect(game.minesRemaining).toBe(0);
    });
  }

  it('wins by flagging and chording instead of clicking each cell', () => {
    const spec = SPECS.expert;
    const game = new Game(generateUnverified(spec));
    const { mines, size } = game.board;
    for (let i = 0; i < size; i++) if (mines[i]) game.toggleFlag(i);
    game.reveal(spec.firstClick);

    // Keep chording revealed numbers until nothing changes.
    let chorded = 0;
    let progress = true;
    while (progress && !game.isOver) {
      progress = false;
      for (let i = 0; i < size; i++) {
        const revealed = game.chord(i).length;
        chorded += revealed;
        if (revealed > 0) progress = true;
      }
    }
    expect(chorded).toBeGreaterThan(0);
    expect(game.status).not.toBe('lost');

    // Chording can't reach safe pockets walled off by mines; reveal those directly.
    for (let i = 0; i < size; i++) if (!mines[i]) game.reveal(i);
    expect(game.status).toBe('won');
  });

  it('loses when a mine is revealed', () => {
    const spec = SPECS.intermediate;
    const game = new Game(generateUnverified(spec));
    game.reveal(spec.firstClick);
    const mine = game.board.mines.indexOf(1);
    game.reveal(mine);
    expect(game.status).toBe('lost');
    expect(game.cellView(mine)).toBe('exploded');
  });
});
