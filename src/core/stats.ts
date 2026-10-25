import { DIFFICULTIES, type Difficulty } from './difficulty';

export interface DifficultyStats {
  played: number;
  won: number;
  /** Fastest win without hints, in ms. */
  bestMs: number | null;
}

/** Keyed by statsKey(): a preset name, or WxHxM for custom boards. */
export type Stats = Record<string, DifficultyStats>;

const EMPTY: DifficultyStats = { played: 0, won: 0, bestMs: null };

export function statsKey(d: Difficulty): string {
  for (const [name, preset] of Object.entries(DIFFICULTIES)) {
    if (
      preset.width === d.width &&
      preset.height === d.height &&
      preset.mineCount === d.mineCount
    ) {
      return name;
    }
  }
  return `${d.width}x${d.height}x${d.mineCount}`;
}

export function statsFor(stats: Stats, key: string): DifficultyStats {
  return stats[key] ?? EMPTY;
}

/** A game counts as played once its board exists and the first cell is open. */
export function recordPlayed(stats: Stats, key: string): Stats {
  const s = statsFor(stats, key);
  return { ...stats, [key]: { ...s, played: s.played + 1 } };
}

/** Wins always count; only hint-free wins can set a best time. */
export function recordWin(stats: Stats, key: string, ms: number, hintsUsed: number): Stats {
  const s = statsFor(stats, key);
  const best = hintsUsed === 0 && (s.bestMs === null || ms < s.bestMs) ? ms : s.bestMs;
  return { ...stats, [key]: { ...s, won: s.won + 1, bestMs: best } };
}

/** Parses stored stats, dropping anything malformed instead of throwing. */
export function parseStats(json: string | null): Stats {
  if (json === null) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {};
  }
  if (typeof raw !== 'object' || raw === null) return {};
  const stats: Stats = {};
  const count = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : null);
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null) continue;
    const { played, won, bestMs } = value as Record<string, unknown>;
    const p = count(played);
    const w = count(won);
    if (p === null || w === null || w > p) continue;
    const best = typeof bestMs === 'number' && bestMs >= 0 ? bestMs : null;
    stats[key] = { played: p, won: w, bestMs: best };
  }
  return stats;
}
