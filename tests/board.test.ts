import { describe, expect, it } from 'vitest';
import { createBoard, getGeometry, toCoords, toIndex } from '../src/core/board';
import { at, parseBoard } from './helpers';

describe('index <-> coordinates', () => {
  it('round-trips every cell', () => {
    const width = 7;
    const height = 4;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = toIndex(width, x, y);
        expect(i).toBe(y * width + x);
        expect(toCoords(width, i)).toEqual({ x, y });
      }
    }
  });
});

describe('getGeometry', () => {
  it('has 3 neighbors at corners, 5 on edges and 8 inside', () => {
    const g = getGeometry(5, 4);
    expect(g.size).toBe(20);
    const count = (x: number, y: number) => g.neighbors[at(5, x, y)]?.length;
    expect(count(0, 0)).toBe(3);
    expect(count(4, 0)).toBe(3);
    expect(count(0, 3)).toBe(3);
    expect(count(4, 3)).toBe(3);
    expect(count(2, 0)).toBe(5);
    expect(count(0, 1)).toBe(5);
    expect(count(4, 2)).toBe(5);
    expect(count(2, 3)).toBe(5);
    expect(count(1, 1)).toBe(8);
    expect(count(3, 2)).toBe(8);
  });

  it('lists exactly the adjacent cells, sorted', () => {
    const g = getGeometry(5, 4);
    expect(Array.from(g.neighbors[at(5, 1, 1)] ?? [])).toEqual([0, 1, 2, 5, 7, 10, 11, 12]);
    expect(Array.from(g.neighbors[at(5, 4, 3)] ?? [])).toEqual([13, 14, 18]);
  });

  it('has symmetric neighbor lists with no self-loops', () => {
    const g = getGeometry(6, 5);
    for (let i = 0; i < g.size; i++) {
      const ns = Array.from(g.neighbors[i] ?? []);
      expect(ns).not.toContain(i);
      for (const n of ns) expect(Array.from(g.neighbors[n] ?? [])).toContain(i);
    }
  });

  it('handles 1-wide and 1x1 boards', () => {
    expect(getGeometry(1, 1).neighbors[0]?.length).toBe(0);
    const strip = getGeometry(1, 3);
    expect(Array.from(strip.neighbors[1] ?? [])).toEqual([0, 2]);
    expect(Array.from(strip.neighbors[0] ?? [])).toEqual([1]);
  });

  it('is computed once per size', () => {
    expect(getGeometry(9, 9)).toBe(getGeometry(9, 9));
    expect(getGeometry(9, 9)).not.toBe(getGeometry(9, 8));
  });

  it('rejects invalid sizes', () => {
    expect(() => getGeometry(0, 5)).toThrow(RangeError);
    expect(() => getGeometry(5, -1)).toThrow(RangeError);
    expect(() => getGeometry(2.5, 3)).toThrow(RangeError);
  });
});

describe('createBoard', () => {
  it('computes adjacent-mine numbers', () => {
    const board = parseBoard(`
      *..
      ...
      ..*
    `);
    expect(board.mineCount).toBe(2);
    expect(Array.from(board.numbers)).toEqual([0, 1, 0, 1, 2, 1, 0, 1, 0]);
  });

  it('counts up to 8', () => {
    const board = parseBoard(`
      ***
      *.*
      ***
    `);
    expect(board.numbers[4]).toBe(8);
    expect(board.mineCount).toBe(8);
  });

  it('shares the precomputed geometry', () => {
    const board = parseBoard(`
      ...
      .*.
    `);
    expect(board.neighbors).toBe(getGeometry(3, 2).neighbors);
    expect(board.width).toBe(3);
    expect(board.height).toBe(2);
    expect(board.size).toBe(6);
  });

  it('rejects a mine array of the wrong length', () => {
    expect(() => createBoard(3, 3, new Uint8Array(8))).toThrow(RangeError);
  });

  it('rejects mine values other than 0 and 1', () => {
    expect(() => createBoard(2, 1, Uint8Array.of(0, 2))).toThrow(RangeError);
  });
});
