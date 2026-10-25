/** Board size and precomputed neighbor lists. Shared by every board of that size. */
export interface Geometry {
  readonly width: number;
  readonly height: number;
  readonly size: number;
  /** neighbors[i] = indices adjacent to cell i, ascending. */
  readonly neighbors: readonly Int32Array[];
}

/** A mine layout. Cells are flat indices: i = y * width + x. */
export interface Board extends Geometry {
  /** 1 = mine, 0 = safe. */
  readonly mines: Uint8Array;
  /** Number of adjacent mines, for every cell (mines included). */
  readonly numbers: Uint8Array;
  readonly mineCount: number;
}

export function toIndex(width: number, x: number, y: number): number {
  return y * width + x;
}

export function toCoords(width: number, i: number): { x: number; y: number } {
  return { x: i % width, y: Math.floor(i / width) };
}

const geometryCache = new Map<string, Geometry>();

export function getGeometry(width: number, height: number): Geometry {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`board size must be positive integers, got ${width}x${height}`);
  }
  const key = `${width}x${height}`;
  let geometry = geometryCache.get(key);
  if (!geometry) {
    geometry = { width, height, size: width * height, neighbors: buildNeighbors(width, height) };
    geometryCache.set(key, geometry);
  }
  return geometry;
}

function buildNeighbors(width: number, height: number): Int32Array[] {
  const neighbors: Int32Array[] = [];
  const buf: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      buf.length = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= width) continue;
          buf.push(ny * width + nx);
        }
      }
      neighbors.push(Int32Array.from(buf));
    }
  }
  return neighbors;
}

export function createBoard(width: number, height: number, mines: Uint8Array): Board {
  const geometry = getGeometry(width, height);
  if (mines.length !== geometry.size) {
    throw new RangeError(`mine array has length ${mines.length}, want ${geometry.size}`);
  }
  const numbers = new Uint8Array(geometry.size);
  let mineCount = 0;
  for (let i = 0; i < geometry.size; i++) {
    const m = mines[i];
    if (m !== 0 && m !== 1) throw new RangeError(`mine value at ${i} must be 0 or 1, got ${m}`);
    if (m === 0) continue;
    mineCount++;
    for (const n of geometry.neighbors[i]) numbers[n]++;
  }
  return { ...geometry, mines, numbers, mineCount };
}
