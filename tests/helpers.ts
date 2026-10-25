import { createBoard, type Board } from '../src/core/board';

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
