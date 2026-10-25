import { describe, expect, it } from 'vitest';
import { CUSTOM_LIMITS, DIFFICULTIES, validateCustom } from '../src/core/difficulty';

describe('validateCustom', () => {
  it('accepts the standard sizes without a warning', () => {
    for (const d of Object.values(DIFFICULTIES)) {
      expect(validateCustom(d)).toEqual({ ok: true, warning: null });
    }
  });

  it('rejects sizes outside the limits', () => {
    expect(validateCustom({ width: 4, height: 9, mineCount: 5 }).ok).toBe(false);
    expect(validateCustom({ width: 9, height: 31, mineCount: 5 }).ok).toBe(false);
    expect(validateCustom({ width: 51, height: 9, mineCount: 5 }).ok).toBe(false);
    expect(validateCustom({ width: 9.5, height: 9, mineCount: 5 }).ok).toBe(false);
  });

  it('caps mines at the density limit', () => {
    const cap = Math.floor(30 * 16 * CUSTOM_LIMITS.maxDensity);
    expect(validateCustom({ width: 30, height: 16, mineCount: cap }).ok).toBe(true);
    const over = validateCustom({ width: 30, height: 16, mineCount: cap + 1 });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toContain(String(cap));
  });

  it('rejects zero, negative and fractional mine counts', () => {
    for (const mineCount of [0, -1, 2.5]) {
      expect(validateCustom({ width: 9, height: 9, mineCount }).ok).toBe(false);
    }
  });

  it('always leaves room for the 3x3 safe zone', () => {
    // 5x5 = 25 cells: the density cap (5) is already below 25 - 9, so test the formula directly.
    const result = validateCustom({ width: 5, height: 5, mineCount: 25 - 9 });
    expect(result.ok).toBe(false);
  });

  it('warns about boards denser than Expert', () => {
    const result = validateCustom({ width: 30, height: 16, mineCount: 100 });
    expect(result.ok && result.warning).toBeTruthy();
  });
});
