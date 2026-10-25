import type { Geometry } from '../core/board';

/** What the solver knows about a cell. */
export const Knowledge = { Unknown: 0, Safe: 1, Mine: 2 } as const;
export type Knowledge = (typeof Knowledge)[keyof typeof Knowledge];

/**
 * Everything a player can see: the board size, the total mine count, the numbers on
 * revealed cells, and which cells have been proven safe or mined. Never the real layout.
 */
export interface PlayerView {
  readonly geometry: Geometry;
  readonly totalMines: number;
  /** Per-cell Knowledge. */
  readonly knowledge: Uint8Array;
  /** Revealed number per cell, or -1 if not revealed. Only Safe cells can have a number. */
  readonly numbers: Int8Array;
}

/** 1 = single-cell rules, 2 = subset/pair reduction, 3 = component enumeration. */
export type Tier = 1 | 2 | 3;

/** Cells proven safe or mined by one tier, in ascending index order. */
export interface Deduction {
  safe: number[];
  mines: number[];
  tier: Tier;
}

export interface SolveResult {
  /** Every safe cell was revealed. */
  solved: boolean;
  /** Highest tier any step needed; 0 if the opening alone cleared the board. */
  maxTier: Tier | 0;
  /** Number of deduction rounds applied. */
  steps: number;
}

export function createView(geometry: Geometry, totalMines: number): PlayerView {
  return {
    geometry,
    totalMines,
    knowledge: new Uint8Array(geometry.size),
    numbers: new Int8Array(geometry.size).fill(-1),
  };
}
