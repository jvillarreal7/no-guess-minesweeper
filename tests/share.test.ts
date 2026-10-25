import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../src/core/difficulty';
import { generate, GENERATOR_VERSION } from '../src/generator/generate';
import { boardQuery, parseBoardQuery, specFor, type SharedBoard } from '../src/generator/share';

const EXPERT: SharedBoard = { ...DIFFICULTIES.expert, seed: 'abc123', firstClick: 245 };

describe('share links', () => {
  it('writes the plan format', () => {
    expect(boardQuery(EXPERT)).toBe(`v=${GENERATOR_VERSION}&w=30&h=16&m=99&s=abc123&c=245`);
    expect(boardQuery({ ...EXPERT, firstClick: null })).toBe(
      `v=${GENERATOR_VERSION}&w=30&h=16&m=99&s=abc123`,
    );
  });

  it('round-trips, with or without a first click', () => {
    expect(parseBoardQuery('?' + boardQuery(EXPERT))).toEqual({ kind: 'ok', board: EXPERT });
    const seedOnly = { ...EXPERT, firstClick: null };
    expect(parseBoardQuery(boardQuery(seedOnly))).toEqual({ kind: 'ok', board: seedOnly });
  });

  it('reproduces the same board from a parsed link', () => {
    const parsed = parseBoardQuery(boardQuery(EXPERT));
    if (parsed.kind !== 'ok' || parsed.board.firstClick === null) throw new Error('bad parse');
    const a = generate(specFor(EXPERT, 245));
    const b = generate(specFor(parsed.board, parsed.board.firstClick));
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(Array.from(b.board.mines)).toEqual(Array.from(a.board.mines));
  });

  it('ignores pages with no board in the URL', () => {
    expect(parseBoardQuery('')).toEqual({ kind: 'none' });
    expect(parseBoardQuery('?utm_source=x')).toEqual({ kind: 'none' });
  });

  it('rejects malformed links with a reason', () => {
    const base = boardQuery(EXPERT);
    const cases = [
      base.replace(`v=${GENERATOR_VERSION}`, 'v=999'), // other generator version
      base.replace(`v=${GENERATOR_VERSION}&`, ''), // missing version
      base.replace('w=30', 'w=abc'),
      base.replace('m=99', 'm=400'), // over the density cap
      base.replace('s=abc123', 's=has%20space'),
      base.replace('s=abc123', 's='),
      base.replace('c=245', 'c=480'), // off the board
      base.replace('c=245', 'c=-1'),
    ];
    for (const query of cases) {
      const result = parseBoardQuery(query);
      expect(result.kind, query).toBe('invalid');
      if (result.kind === 'invalid') expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it('round-trips any valid board', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 30 }),
        fc.integer({ min: 5, max: 30 }),
        fc.stringMatching(/^[A-Za-z0-9_-]{1,64}$/),
        fc.nat(),
        fc.boolean(),
        (width, height, seed, clickSeed, withClick) => {
          const board: SharedBoard = {
            width,
            height,
            mineCount: Math.max(1, Math.floor(width * height * 0.15)),
            seed,
            firstClick: withClick ? clickSeed % (width * height) : null,
          };
          expect(parseBoardQuery(boardQuery(board))).toEqual({ kind: 'ok', board });
        },
      ),
    );
  });
});
