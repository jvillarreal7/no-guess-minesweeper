import { describe, expect, it } from 'vitest';
import { cellName, rowName } from '../src/ui/coords';

describe('board coordinates', () => {
  it('names rows with letters, continuing past Z like a spreadsheet', () => {
    expect([0, 1, 25, 26, 27, 29].map(rowName)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AD']);
  });

  it('names cells as row letter then column number', () => {
    expect(cellName(0, 16)).toBe('A1');
    expect(cellName(29, 16)).toBe('B14');
    expect(cellName(16 * 16 - 1, 16)).toBe('P16');
  });
});
