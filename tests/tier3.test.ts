import { describe, expect, it } from 'vitest';
import { buildConstraints } from '../src/solver/constraints';
import { findDeductions, solveBoard } from '../src/solver/solve';
import { tier2 } from '../src/solver/tier2';
import { tier3 } from '../src/solver/tier3';
import { Knowledge } from '../src/solver/types';
import { at, parseBoard, parseView } from './helpers';

// a b c over "2 F 2": {a,b}=1 and {b,c}=1. Either b is the mine (1 mine) or a and c are (2).
const CHAIN = `
  ???
  2F2
`;

// {(3,0),(3,1)} = 1; (4,0) and (4,1) touch no number, so they are interior cells.
const POCKET = `
  001??
  001??
`;

describe('tier3: component enumeration with the global mine count', () => {
  it('is needed for the chain (tiers 1-2 find nothing)', () => {
    const view = parseView(CHAIN, 2);
    expect(tier2(buildConstraints(view))).toBeNull();
    expect(findDeductions(view)?.tier).toBe(3);
  });

  it('picks the 1-mine layout when only 1 mine is left', () => {
    expect(findDeductions(parseView(CHAIN, 2))).toEqual({ safe: [0, 2], mines: [1], tier: 3 });
  });

  it('picks the 2-mine layout when 2 mines are left', () => {
    expect(findDeductions(parseView(CHAIN, 3))).toEqual({ safe: [1], mines: [0, 2], tier: 3 });
  });

  it('frees interior cells when the frontier must hold every remaining mine', () => {
    expect(findDeductions(parseView(POCKET, 1))).toEqual({ safe: [4, 9], mines: [], tier: 3 });
  });

  it('mines interior cells when the frontier leaves exactly enough for all of them', () => {
    expect(findDeductions(parseView(POCKET, 3))).toEqual({ safe: [], mines: [4, 9], tier: 3 });
  });

  it('finds nothing when the count leaves room for more than one split', () => {
    // 2 mines left and the frontier holds exactly 1, so the interior holds 1 of its 2 cells.
    expect(findDeductions(parseView(POCKET, 2))).toBeNull();
  });

  it('does not free the interior when the frontier might hold fewer mines (regression)', () => {
    // Found by the random-board test. The frontier {2,9,10,17} holds 1 or 2 of the 2 mines
    // left, so the 4 interior cells hold 0 or 1: nothing is certain anywhere.
    const view = parseView(
      `
        ???10000
        ???21011
        ??2F101F
      `,
      4,
    );
    expect(findDeductions(view)).toBeNull();
  });

  it('skips components above the size cap (sound, just incomplete)', () => {
    const view = parseView(CHAIN, 2);
    const constraints = buildConstraints(view);
    expect(tier3(view, constraints, { maxComponentSize: 2 })).toBeNull();
    expect(tier3(view, constraints, { maxComponentSize: 3 })).not.toBeNull();
  });

  it('skips components that exceed the node budget', () => {
    const view = parseView(CHAIN, 2);
    expect(tier3(view, buildConstraints(view), { maxNodes: 2 })).toBeNull();
  });
});

describe('endgames', () => {
  it('solves a board whose last step needs the global mine count', () => {
    // After the opening and tier 2, "2 F 2" is left above two 2s with one mine to go.
    const board = parseBoard(`
      .*.
      .*.
      ...
      ...
    `);
    const result = solveBoard(board, at(3, 1, 3));
    expect(result.solved).toBe(true);
    expect(result.maxTier).toBe(3);
    expect(result.view.knowledge[at(3, 1, 0)]).toBe(Knowledge.Mine);
  });

  it('frees interior cells with the count, then stops at the 50/50 that remains', () => {
    const board = parseBoard(`
      ...*.
      .....
    `);
    const result = solveBoard(board, 0);
    expect(result.solved).toBe(false);
    expect(result.maxTier).toBe(3);
    expect(result.view.knowledge[at(5, 4, 0)]).toBe(Knowledge.Safe);
    expect(result.view.knowledge[at(5, 4, 1)]).toBe(Knowledge.Safe);
    expect(result.view.knowledge[at(5, 3, 0)]).toBe(Knowledge.Unknown);
    expect(result.view.knowledge[at(5, 3, 1)]).toBe(Knowledge.Unknown);
  });
});
