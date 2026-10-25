import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';

function take(seed: string, n: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.nextUint32());
}

describe('createRng', () => {
  it('gives the same sequence for the same seed', () => {
    expect(take('abc123', 50)).toEqual(take('abc123', 50));
  });

  it('gives different sequences for different seeds', () => {
    expect(take('abc123', 10)).not.toEqual(take('abc124', 10));
    expect(take('', 10)).not.toEqual(take(' ', 10));
  });

  it('keeps producing the pinned sequence (changing it changes every board)', () => {
    expect(take('minesweeper', 4)).toEqual(PINNED_MINESWEEPER);
  });

  it('next() stays in [0, 1)', () => {
    const rng = createRng('range');
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextUint32() returns unsigned 32-bit integers', () => {
    const rng = createRng('u32');
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextUint32();
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('nextInt(n) stays in range and is roughly uniform', () => {
    const rng = createRng('buckets');
    const n = 10;
    const samples = 100_000;
    const counts = new Array<number>(n).fill(0);
    for (let i = 0; i < samples; i++) {
      const v = rng.nextInt(n);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(n);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    for (const c of counts) {
      expect(Math.abs(c - samples / n)).toBeLessThan((samples / n) * 0.05);
    }
  });

  it('nextInt(1) is always 0', () => {
    const rng = createRng('one');
    for (let i = 0; i < 100; i++) expect(rng.nextInt(1)).toBe(0);
  });

  it('nextInt rejects invalid bounds', () => {
    const rng = createRng('bad');
    expect(() => rng.nextInt(0)).toThrow(RangeError);
    expect(() => rng.nextInt(-3)).toThrow(RangeError);
    expect(() => rng.nextInt(2.5)).toThrow(RangeError);
    expect(() => rng.nextInt(2 ** 32 + 1)).toThrow(RangeError);
  });
});

const PINNED_MINESWEEPER = [2822553929, 695074747, 296681887, 306046253];
