import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../src/core/difficulty';
import { parseStats, recordPlayed, recordWin, statsFor, statsKey } from '../src/core/stats';

describe('stats', () => {
  it('keys presets by name and custom boards by size', () => {
    expect(statsKey(DIFFICULTIES.expert)).toBe('expert');
    expect(statsKey({ width: 20, height: 10, mineCount: 30 })).toBe('20x10x30');
  });

  it('counts games and wins, keeping the fastest hint-free time', () => {
    let s = recordPlayed({}, 'beginner');
    s = recordWin(s, 'beginner', 30_000, 0);
    s = recordPlayed(s, 'beginner');
    s = recordWin(s, 'beginner', 20_000, 2); // faster, but used hints
    s = recordPlayed(s, 'beginner');
    s = recordWin(s, 'beginner', 25_000, 0);
    expect(statsFor(s, 'beginner')).toEqual({ played: 3, won: 3, bestMs: 25_000 });
    expect(statsFor(s, 'expert')).toEqual({ played: 0, won: 0, bestMs: null });
  });

  it('does not mutate the stats it is given', () => {
    const s = recordPlayed({}, 'expert');
    recordWin(s, 'expert', 1000, 0);
    expect(s).toEqual({ expert: { played: 1, won: 0, bestMs: null } });
  });

  it('round-trips through JSON', () => {
    const s = recordWin(recordPlayed({}, 'expert'), 'expert', 81_234, 0);
    expect(parseStats(JSON.stringify(s))).toEqual(s);
  });

  it('drops anything malformed instead of throwing', () => {
    expect(parseStats(null)).toEqual({});
    expect(parseStats('not json')).toEqual({});
    expect(parseStats('[1,2]')).toEqual({});
    expect(
      parseStats(
        JSON.stringify({
          good: { played: 2, won: 1, bestMs: 500 },
          negative: { played: -1, won: 0, bestMs: null },
          tooManyWins: { played: 1, won: 2, bestMs: null },
          junk: 'x',
          badBest: { played: 1, won: 1, bestMs: 'fast' },
        }),
      ),
    ).toEqual({
      good: { played: 2, won: 1, bestMs: 500 },
      badBest: { played: 1, won: 1, bestMs: null },
    });
  });
});
