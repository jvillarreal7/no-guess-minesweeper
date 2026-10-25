import { parseStats, type Stats } from '../core/stats';

// localStorage can be missing or throw (private mode, blocked storage, quota), so every
// access is wrapped and the game works without it.

const STATS_KEY = 'ngms.stats.v1';
const DIFFICULTY_KEY = 'ngms.difficulty.v1';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore: stats are a convenience, not game state.
  }
}

export function loadStats(): Stats {
  return parseStats(read(STATS_KEY));
}

export function saveStats(stats: Stats): void {
  write(STATS_KEY, JSON.stringify(stats));
}

/** The difficulty picker's last choice (a preset name or "custom"). */
export function loadDifficultyChoice(): string | null {
  return read(DIFFICULTY_KEY);
}

export function saveDifficultyChoice(choice: string): void {
  write(DIFFICULTY_KEY, choice);
}
