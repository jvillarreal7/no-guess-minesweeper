import { createBoard, getGeometry, type Board, type Geometry } from '../core/board';
import { createRng, type Rng } from '../core/rng';
import { solveBoard } from '../solver/solve';
import type { SolveResult, SolverOptions } from '../solver/types';

/**
 * Bump whenever generator output for a given spec changes (see CLAUDE.md). That includes
 * solver changes: a stronger or weaker solver accepts a different attempt.
 */
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
 * Random placement with a safe zone, not checked by the solver: the board may need guessing.
 * Draws from the same RNG state as generate()'s first attempt. Used for tests and benchmarks.
 */
export function generateUnverified(spec: BoardSpec): Board {
  const mines = placeMines(spec, createRng(spec.seed));
  return createBoard(spec.width, spec.height, mines);
}

export const DEFAULT_MAX_ATTEMPTS = 500;

export interface GenerateOptions {
  /** Placements to try before reporting failure. */
  maxAttempts?: number;
  /**
   * Solver limits. For benchmarking only: the solver decides which attempt is accepted,
   * so changing these (or the solver's strength) changes boards; bump GENERATOR_VERSION.
   */
  solver?: SolverOptions;
}

export type GenerateResult =
  | { ok: true; board: Board; attempts: number; maxTier: SolveResult['maxTier'] }
  | { ok: false; attempts: number };

/**
 * Phase A generator: place mines, solve from scratch from the first click, and accept the
 * first board the solver clears. Otherwise re-roll from the next RNG state, up to
 * maxAttempts. Deterministic: the solver's limits count nodes, never time.
 */
export function generate(spec: BoardSpec, options: GenerateOptions = {}): GenerateResult {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError(`maxAttempts must be a positive integer, got ${maxAttempts}`);
  }
  const rng = createRng(spec.seed);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const board = createBoard(spec.width, spec.height, placeMines(spec, rng));
    const result = solveBoard(board, spec.firstClick, options.solver);
    if (result.solved) return { ok: true, board, attempts: attempt, maxTier: result.maxTier };
  }
  return { ok: false, attempts: maxAttempts };
}
