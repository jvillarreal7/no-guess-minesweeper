import { createBoard, getGeometry, type Board, type Geometry } from '../core/board';
import { createRng, type Rng } from '../core/rng';

/** Bump whenever generator output for a given spec changes (see CLAUDE.md). */
export const GENERATOR_VERSION = 1;

/** Together with GENERATOR_VERSION, fully determines a board. */
export interface BoardSpec {
  width: number;
  height: number;
  mineCount: number;
  seed: string;
  firstClick: number;
}

/** The first-click cell and its neighbors. Kept mine-free so the first click is an opening. */
export function safeZone(geometry: Geometry, firstClick: number): number[] {
  return [firstClick, ...geometry.neighbors[firstClick]].sort((a, b) => a - b);
}

/** Places `mineCount` mines uniformly at random outside the safe zone. */
export function placeMines(spec: BoardSpec, rng: Rng): Uint8Array {
  const geometry = getGeometry(spec.width, spec.height);
  const { size } = geometry;
  if (!Number.isInteger(spec.firstClick) || spec.firstClick < 0 || spec.firstClick >= size) {
    throw new RangeError(`first click ${spec.firstClick} is outside 0..${size - 1}`);
  }
  const zone = safeZone(geometry, spec.firstClick);
  const maxMines = size - zone.length;
  if (!Number.isInteger(spec.mineCount) || spec.mineCount < 0 || spec.mineCount > maxMines) {
    throw new RangeError(`mine count ${spec.mineCount} must be an integer in 0..${maxMines}`);
  }

  const inZone = new Uint8Array(size);
  for (const i of zone) inZone[i] = 1;
  const candidates = new Int32Array(maxMines);
  let n = 0;
  for (let i = 0; i < size; i++) if (!inZone[i]) candidates[n++] = i;

  // Partial Fisher-Yates: the first mineCount slots become a uniform random subset.
  const mines = new Uint8Array(size);
  for (let k = 0; k < spec.mineCount; k++) {
    const j = k + rng.nextInt(n - k);
    const pick = candidates[j];
    candidates[j] = candidates[k];
    candidates[k] = pick;
    mines[pick] = 1;
  }
  return mines;
}

/**
 * Phase 1 placeholder: random placement with a safe zone, not yet checked by the solver.
 * Boards from this may require guessing.
 */
export function generateUnverified(spec: BoardSpec): Board {
  const mines = placeMines(spec, createRng(spec.seed));
  return createBoard(spec.width, spec.height, mines);
}
