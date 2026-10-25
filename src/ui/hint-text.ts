import type { Hint } from '../solver/hint';

/** "row 3, column 12", counting from 1 as a player would. */
function position(cell: number, width: number): string {
  return `row ${Math.floor(cell / width) + 1}, column ${(cell % width) + 1}`;
}

/** "a", "a and b", "a, b and c". */
function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * How a player could prove the hinted cell safe themselves: the technique's name, then how
 * it applies here, in a sentence or two. `numbers` holds the revealed numbers (-1 elsewhere).
 */
export function describeHint(hint: Hint, width: number, numbers: ArrayLike<number>): string {
  const number = (cell: number) => `the ${numbers[cell]} at ${position(cell, width)}`;
  const parts: string[] = [];

  if (hint.mines.length > 0) {
    const one = hint.mines.length === 1;
    const cells = list(hint.mines.map((m) => position(m, width)));
    parts.push(
      `First, ${cells} ${one ? 'has to be a mine' : 'have to be mines'}, from the numbers around ${one ? 'it' : 'them'}.`,
    );
  }

  const reason = hint.reason;
  switch (reason.kind) {
    case 'complete': {
      const n = numbers[reason.source];
      const has = n === 1 ? 'its mine' : `all ${n} of its mines`;
      parts.push(
        `Complete number: ${number(reason.source)} already has ${has}, so its other covered neighbours are safe.`,
      );
      break;
    }
    case 'shared': {
      const mines = reason.mines === 1 ? 'a mine' : `${reason.mines} mines`;
      // "the 1 ... the 1 ... all the 1 needs" is ambiguous; say "the other 1" instead.
      const sameNumber = numbers[reason.source] === numbers[reason.target];
      const target = `the ${sameNumber ? 'other ' : ''}${numbers[reason.target]}`;
      parts.push(
        `Shared cells: ${number(reason.source)} must put ${mines} in cells ${number(reason.target)} also touches. ` +
          `That's all ${target} needs, so its other covered neighbours are safe.`,
      );
      break;
    }
    case 'combined':
      parts.push(
        `Combining numbers: comparing ${list(reason.sources.map(number))} leaves no room for a mine here.`,
      );
      break;
    case 'arrangements':
      parts.push(
        `Every arrangement: each way of placing mines that fits ${list(reason.sources.map(number))} ` +
          `(with ${plural(reason.minesLeft, 'mine')} left in total) leaves this cell empty.`,
      );
      break;
    case 'remainingMines': {
      const left =
        reason.minesLeft === 1 ? 'the last mine' : `all ${reason.minesLeft} remaining mines`;
      parts.push(
        `Mine count: the revealed numbers need ${left}, so cells that touch no number are safe.`,
      );
      break;
    }
    case 'allMinesFound': {
      const all =
        reason.totalMines === 1 ? 'the only mine is' : `all ${reason.totalMines} mines are`;
      parts.push(`Mine count: ${all} accounted for, so every covered cell is safe.`);
      break;
    }
  }
  return parts.join(' ');
}
