import fc from 'fast-check';
import { createBoard, getGeometry, type Board } from '../src/core/board';
import { createView, Knowledge, type PlayerView } from '../src/solver/types';

export interface ViewCase {
  board: Board;
  view: PlayerView;
}

/**
 * A random board up to maxSide x maxSide plus a view of it a player could hold: some safe
 * cells revealed with their true numbers, some mines marked as proven. Always consistent,
 * because the real layout fits it.
 */
export function viewCase(maxSide: number): fc.Arbitrary<ViewCase> {
  const cells = maxSide * maxSide;
  const unit = fc.double({ min: 0, max: 1, noNaN: true });
  const params = (minSide: number) =>
    fc.record({
      width: fc.integer({ min: minSide, max: maxSide }),
      height: fc.integer({ min: minSide, max: maxSide }),
      mineP: fc.double({ min: 0, max: 0.6, noNaN: true }),
      // Keep these low enough that plenty of cells stay unknown.
      revealP: fc.double({ min: 0, max: 0.6, noNaN: true }),
      flagP: fc.double({ min: 0, max: 0.4, noNaN: true }),
      rolls: fc.array(fc.tuple(unit, unit), { minLength: cells, maxLength: cells }),
    });
  // fast-check's default bias favors tiny boards and extreme odds, which keeps the edge
  // cases coming. Most cases are unbiased near-full-size boards with mid-range densities.
  return fc
    .oneof(
      { arbitrary: params(1), weight: 1 },
      { arbitrary: fc.noBias(params(Math.max(1, maxSide - 1))), weight: 3 },
    )
    .map(({ width, height, mineP, revealP, flagP, rolls }) => {
      const size = width * height;
      const mines = new Uint8Array(size);
      for (let i = 0; i < size; i++) mines[i] = rolls[i][0] < mineP ? 1 : 0;
      const board = createBoard(width, height, mines);
      const view = createView(getGeometry(width, height), board.mineCount);
      for (let i = 0; i < size; i++) {
        const known = rolls[i][1];
        if (mines[i] && known < flagP) view.knowledge[i] = Knowledge.Mine;
        if (!mines[i] && known < revealP) {
          view.knowledge[i] = Knowledge.Safe;
          view.numbers[i] = board.numbers[i];
        }
      }
      return { board, view };
    });
}
