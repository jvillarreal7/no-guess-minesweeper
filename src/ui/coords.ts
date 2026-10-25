// Board coordinates as a player reads them: rows are letters (A, B, ... Z, AA, AB, ...),
// columns are numbers from 1. Used for the labels around the board and in hint text.

/** Row 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function rowName(y: number): string {
  let name = '';
  for (let n = y + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/** A cell's name, like "B14": its row letter, then its column number. */
export function cellName(cell: number, width: number): string {
  return `${rowName(Math.floor(cell / width))}${(cell % width) + 1}`;
}
