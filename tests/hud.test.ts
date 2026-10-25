import { describe, expect, it } from 'vitest';
import { formatCounter } from '../src/ui/hud';

describe('formatCounter', () => {
  it('pads to three digits and clamps', () => {
    expect(formatCounter(0)).toBe('000');
    expect(formatCounter(7)).toBe('007');
    expect(formatCounter(120)).toBe('120');
    expect(formatCounter(5000)).toBe('999');
  });

  it('shows negative mine counts with a minus sign', () => {
    expect(formatCounter(-5)).toBe('-05');
    expect(formatCounter(-250)).toBe('-99');
  });
});
