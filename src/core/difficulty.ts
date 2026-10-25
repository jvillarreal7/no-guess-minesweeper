export interface Difficulty {
  readonly width: number;
  readonly height: number;
  readonly mineCount: number;
}

export const DIFFICULTIES = {
  beginner: { width: 9, height: 9, mineCount: 10 },
  intermediate: { width: 16, height: 16, mineCount: 40 },
  expert: { width: 30, height: 16, mineCount: 99 },
} as const satisfies Record<string, Difficulty>;

export type DifficultyName = keyof typeof DIFFICULTIES;

/**
 * Custom board limits. The density cap comes from the generator benchmark: no-guess boards
 * get rare fast as density rises, and big boards feel it most. At 21% the largest board
 * (50x30, 315 mines) still generates with p95 ~140 ms; at 22% its p95 is ~470 ms.
 */
export const CUSTOM_LIMITS = {
  minSide: 5,
  maxWidth: 50,
  maxHeight: 30,
  minMines: 1,
  /** Hard cap on mines / cells. */
  maxDensity: 0.21,
  /** Denser than Expert: warn that generation may take a moment. */
  warnDensity:
    DIFFICULTIES.expert.mineCount / (DIFFICULTIES.expert.width * DIFFICULTIES.expert.height),
} as const;

export type CustomCheck = { ok: true; warning: string | null } | { ok: false; error: string };

/** Validates a custom size. Always leaves room for the 3x3 first-click safe zone. */
export function validateCustom({ width, height, mineCount }: Difficulty): CustomCheck {
  const L = CUSTOM_LIMITS;
  const intIn = (v: number, lo: number, hi: number) => Number.isInteger(v) && v >= lo && v <= hi;
  if (!intIn(width, L.minSide, L.maxWidth)) {
    return { ok: false, error: `Width must be a whole number from ${L.minSide} to ${L.maxWidth}.` };
  }
  if (!intIn(height, L.minSide, L.maxHeight)) {
    return {
      ok: false,
      error: `Height must be a whole number from ${L.minSide} to ${L.maxHeight}.`,
    };
  }
  const cells = width * height;
  const maxMines = Math.min(cells - 9, Math.floor(cells * L.maxDensity));
  if (!intIn(mineCount, L.minMines, maxMines)) {
    return {
      ok: false,
      error: `Mines must be a whole number from ${L.minMines} to ${maxMines} for a ${width}x${height} board.`,
    };
  }
  const warning =
    mineCount > cells * L.warnDensity
      ? 'Dense boards take longer to generate, since fewer layouts can be solved without guessing.'
      : null;
  return { ok: true, warning };
}
