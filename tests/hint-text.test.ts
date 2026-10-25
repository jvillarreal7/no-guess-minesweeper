import { describe, expect, it } from 'vitest';
import { explainHint } from '../src/solver/hint';
import { describeHint } from '../src/ui/hint-text';
import { parseView } from './helpers';

/** Explains the hint for an ASCII view and returns the sentence a player would see. */
function textFor(picture: string, totalMines: number): string {
  const view = parseView(picture, totalMines);
  const hint = explainHint(view);
  if (!hint) throw new Error('no hint');
  return describeHint(hint, view.geometry.width, view.numbers);
}

describe('describeHint', () => {
  it('names the forced mines first, then the technique', () => {
    expect(textFor('?1?1', 1)).toBe(
      'First, row 1, column 3 has to be a mine, from the numbers around it. ' +
        'Complete number: the 1 at row 1, column 2 already has its mine, so its other covered neighbours are safe.',
    );
  });

  it('explains shared cells with the actual numbers', () => {
    expect(textFor('???????\n??121??', 4)).toBe(
      'Shared cells: the 2 at row 2, column 4 must put a mine in cells the 1 at row 2, column 3 also touches. ' +
        "That's all the 1 needs, so its other covered neighbours are safe.",
    );
  });

  it('says "the other" when both numbers are the same', () => {
    const numbers = Array.from({ length: 16 }, () => -1);
    numbers[2] = 1;
    numbers[6] = 1;
    expect(
      describeHint(
        { cell: 9, reason: { kind: 'shared', source: 2, target: 6, mines: 1 }, mines: [] },
        4,
        numbers,
      ),
    ).toBe(
      'Shared cells: the 1 at row 1, column 3 must put a mine in cells the 1 at row 2, column 3 also touches. ' +
        "That's all the other 1 needs, so its other covered neighbours are safe.",
    );
  });

  it('explains mine-count deductions', () => {
    expect(textFor('001??\n001??', 1)).toBe(
      'Mine count: the revealed numbers need the last mine, so cells that touch no number are safe.',
    );
    const plural = describeHint(
      { cell: 4, reason: { kind: 'remainingMines', minesLeft: 3 }, mines: [] },
      5,
      [],
    );
    expect(plural).toBe(
      'Mine count: the revealed numbers need all 3 remaining mines, so cells that touch no number are safe.',
    );
    expect(textFor('F??', 1)).toBe(
      'Mine count: the only mine is accounted for, so every covered cell is safe.',
    );
  });

  it('falls back to every arrangement, naming the numbers involved', () => {
    expect(textFor('???\n2F2', 2)).toBe(
      'Every arrangement: each way of placing mines that fits the 2 at row 2, column 1 and the 2 at row 2, column 3 ' +
        '(with 1 mine left in total) leaves this cell empty.',
    );
  });
});
