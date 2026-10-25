import { createBoard, getGeometry, type Board } from '../src/core/board';
import { findDeductions } from '../src/solver/solve';
import { createView, Knowledge, type PlayerView, type Tier } from '../src/solver/types';

/**
 * Builds a board from an ASCII picture: `*` is a mine, `.` is safe.
 * Leading/trailing blank lines and indentation are ignored.
 */
export function parseBoard(picture: string): Board {
  const rows = picture
    .split('\n')
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const mines = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`row ${y} has length ${row.length}, want ${width}`);
    for (let x = 0; x < width; x++) {
      const ch = row[x];
      if (ch === '*') mines[y * width + x] = 1;
      else if (ch !== '.') throw new Error(`unexpected character '${ch}' at (${x}, ${y})`);
    }
  });
  return createBoard(width, height, mines);
}

/** Index of (x, y) on a board of the given width. */
export function at(width: number, x: number, y: number): number {
  return y * width + x;
}

/**
 * Builds a solver view from an ASCII picture: `?` is unknown, `0`-`8` is a revealed
 * number, `F` is a proven mine. `totalMines` is the board's mine count.
 */
export function parseView(picture: string, totalMines: number): PlayerView {
  const rows = picture
    .split('\n')
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
  const width = rows[0]?.length ?? 0;
  const view = createView(getGeometry(width, rows.length), totalMines);
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`row ${y} has length ${row.length}, want ${width}`);
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? '';
      const i = y * width + x;
      if (ch === 'F') view.knowledge[i] = Knowledge.Mine;
      else if (ch >= '0' && ch <= '8') {
        view.knowledge[i] = Knowledge.Safe;
        view.numbers[i] = Number(ch);
      } else if (ch !== '?') throw new Error(`unexpected character '${ch}' at (${x}, ${y})`);
    }
  });
  return view;
}

/**
 * Applies findDeductions until it returns null, without revealing anything.
 * Returns every cell proven safe or mined, and the tier of each step.
 */
export function deduceToFixpoint(view: PlayerView): {
  safe: number[];
  mines: number[];
  tiers: Tier[];
} {
  const safe: number[] = [];
  const mines: number[] = [];
  const tiers: Tier[] = [];
  for (let d = findDeductions(view); d; d = findDeductions(view)) {
    tiers.push(d.tier);
    for (const i of d.safe) view.knowledge[i] = Knowledge.Safe;
    for (const i of d.mines) view.knowledge[i] = Knowledge.Mine;
    safe.push(...d.safe);
    mines.push(...d.mines);
  }
  const byIndex = (a: number, b: number) => a - b;
  return { safe: safe.sort(byIndex), mines: mines.sort(byIndex), tiers };
}
