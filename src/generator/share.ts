import { validateCustom } from '../core/difficulty';
import { GENERATOR_VERSION, type BoardSpec } from './generate';

/**
 * A board as written in a share link. Without a first click it is only a seed: the board
 * is generated around wherever the player clicks first.
 */
export interface SharedBoard {
  width: number;
  height: number;
  mineCount: number;
  seed: string;
  firstClick: number | null;
}

export type ParsedShare =
  { kind: 'none' } | { kind: 'ok'; board: SharedBoard } | { kind: 'invalid'; reason: string };

/** Seeds are short and URL-safe so links stay readable. */
const SEED_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const KEYS = ['v', 'w', 'h', 'm', 's', 'c'] as const;

/** Query string for a board: v=1&w=30&h=16&m=99&s=abc123&c=245 (c only once known). */
export function boardQuery(board: SharedBoard): string {
  const params = new URLSearchParams({
    v: String(GENERATOR_VERSION),
    w: String(board.width),
    h: String(board.height),
    m: String(board.mineCount),
    s: board.seed,
  });
  if (board.firstClick !== null) params.set('c', String(board.firstClick));
  return params.toString();
}

/** Reads a board from a query string. Anything malformed is `invalid`, never thrown. */
export function parseBoardQuery(search: string): ParsedShare {
  const params = new URLSearchParams(search);
  if (!KEYS.some((k) => params.has(k))) return { kind: 'none' };

  const int = (key: string): number | null => {
    const raw = params.get(key);
    return raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
  };
  const version = int('v');
  if (version !== GENERATOR_VERSION) {
    return {
      kind: 'invalid',
      reason:
        version === null
          ? 'This link is missing its generator version.'
          : `This link was made with generator version ${version}; this page has version ${GENERATOR_VERSION}.`,
    };
  }
  const width = int('w');
  const height = int('h');
  const mineCount = int('m');
  if (width === null || height === null || mineCount === null) {
    return { kind: 'invalid', reason: 'This link is missing the board size or mine count.' };
  }
  const check = validateCustom({ width, height, mineCount });
  if (!check.ok) return { kind: 'invalid', reason: check.error };

  const seed = params.get('s') ?? '';
  if (!SEED_PATTERN.test(seed)) {
    return { kind: 'invalid', reason: 'This link has a malformed seed.' };
  }

  let firstClick: number | null = null;
  if (params.has('c')) {
    firstClick = int('c');
    if (firstClick === null || firstClick >= width * height) {
      return { kind: 'invalid', reason: 'This link has an out-of-range first click.' };
    }
  }
  return { kind: 'ok', board: { width, height, mineCount, seed, firstClick } };
}

/** The generator spec for a shared board once its first click is known. */
export function specFor(board: SharedBoard, firstClick: number): BoardSpec {
  return {
    width: board.width,
    height: board.height,
    mineCount: board.mineCount,
    seed: board.seed,
    firstClick,
  };
}
