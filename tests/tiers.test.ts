import { describe, expect, it } from 'vitest';
import { buildConstraints, ContradictionError, type Constraint } from '../src/solver/constraints';
import { findDeductions } from '../src/solver/solve';
import { tier1 } from '../src/solver/tier1';
import { tier2 } from '../src/solver/tier2';
import { Knowledge } from '../src/solver/types';
import { deduceToFixpoint, parseView } from './helpers';

const c = (cells: number[], mines: number): Constraint => ({ cells, mines });

describe('buildConstraints', () => {
  it('makes one constraint per revealed number with unknown neighbors', () => {
    const view = parseView(
      `
        ?2F
        ?21
        000
      `,
      2,
    );
    // Both 2s see unknown (0,0),(0,1) plus the proven mine at (2,0): 1 left.
    // The zeros at (0,2) and (1,2) see unknown (0,1): 0 left.
    // (2,1)=1 and (2,2)=0 see no unknowns, so they add nothing.
    // Each constraint also records the number it came from.
    expect(buildConstraints(view)).toEqual([
      { ...c([0, 3], 1), source: 1 },
      { ...c([0, 3], 1), source: 4 },
      { ...c([3], 0), source: 6 },
      { ...c([3], 0), source: 7 },
    ]);
  });

  it('throws on a view no layout could produce', () => {
    expect(() => buildConstraints(parseView('0F', 1))).toThrow(ContradictionError);
    expect(() => buildConstraints(parseView('2?', 2))).toThrow(ContradictionError);
  });
});

describe('tier1', () => {
  it('marks every cell safe when the remaining count is 0', () => {
    expect(tier1([c([1, 2, 3], 0)])).toEqual({ safe: [1, 2, 3], mines: [], tier: 1 });
  });

  it('marks every cell a mine when the count equals the cell count', () => {
    expect(tier1([c([4, 7], 2)])).toEqual({ safe: [], mines: [4, 7], tier: 1 });
  });

  it('finds nothing in an undecided constraint', () => {
    expect(tier1([c([1, 2], 1)])).toBeNull();
  });
});

describe('tier2', () => {
  it('subtracts a subset: the rest of B holds count(B) - count(A) mines', () => {
    expect(tier2([c([1, 2], 1), c([1, 2, 3], 1)])).toEqual({ safe: [3], mines: [], tier: 2 });
    expect(tier2([c([1, 2], 1), c([1, 2, 3], 2)])).toEqual({ safe: [], mines: [3], tier: 2 });
  });

  it('solves 1-2-1 from the overlapping constraints', () => {
    // Hidden row h0..h4 above a wall reading 1 2 1 under h1..h3.
    const result = tier2([c([0, 1, 2], 1), c([1, 2, 3], 2), c([2, 3, 4], 1)]);
    expect(result?.mines).toEqual([1, 3]);
    expect(result?.safe).toEqual([0, 4]);
  });

  it('solves 1-2-2-1 from the overlapping constraints', () => {
    const result = tier2([c([0, 1, 2], 1), c([1, 2, 3], 2), c([2, 3, 4], 2), c([3, 4, 5], 1)]);
    expect(result?.mines).toEqual([2, 3]);
    expect(result?.safe).toEqual([0, 5]);
  });

  it('chains derived constraints', () => {
    // {1,2,3,4}=2 minus {1,2}=1 derives {3,4}=1. No original pair decides anything,
    // but the derived {3,4}=1 is a subset of {3,4,5}=1, which frees 5.
    expect(tier2([c([1, 2], 1), c([1, 2, 3, 4], 2), c([3, 4, 5], 1)])).toEqual({
      safe: [5],
      mines: [],
      tier: 2,
    });
  });

  it('finds nothing in a true 50/50', () => {
    expect(tier2([c([1, 2], 1), c([1, 2], 1)])).toBeNull();
  });
});

describe('patterns on a player view', () => {
  it('1-2-1: mines over the 1s, safe over the 2, nothing else claimed', () => {
    const view = parseView(
      `
        ???????
        ??121??
      `,
      4,
    );
    const result = deduceToFixpoint(view);
    expect(result.tiers[0]).toBe(2);
    expect(result.mines).toEqual([2, 4]);
    expect(result.safe).toEqual([1, 3, 5, 8, 12]);
    for (const i of [0, 6, 7, 13]) expect(view.knowledge[i]).toBe(Knowledge.Unknown);
  });

  it('1-2-2-1: mines over the 2s, the rest of the span safe', () => {
    const view = parseView(
      `
        ????????
        ??1221??
      `,
      4,
    );
    const result = deduceToFixpoint(view);
    expect(result.tiers[0]).toBe(2);
    expect(result.mines).toEqual([3, 4]);
    expect(result.safe).toEqual([1, 2, 5, 6, 9, 14]);
    for (const i of [0, 7, 8, 15]) expect(view.knowledge[i]).toBe(Knowledge.Unknown);
  });

  it('forced 50/50: no deduction at all', () => {
    const view = parseView(
      `
        ?1
        ?1
      `,
      1,
    );
    expect(findDeductions(view)).toBeNull();
  });
});

describe('global mine count (trivial cases)', () => {
  it('marks every unknown safe once all mines are proven', () => {
    expect(findDeductions(parseView('F??', 1))).toEqual({ safe: [1, 2], mines: [], tier: 1 });
  });

  it('marks every unknown a mine when they must all be mines', () => {
    expect(findDeductions(parseView('F??', 3))).toEqual({ safe: [], mines: [1, 2], tier: 1 });
  });
});
