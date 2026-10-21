import { describe, it, expect } from 'vitest';
import { makeTransform } from './Canvas2D';

describe('Canvas2D world <-> pixel transform', () => {
  const t = makeTransform({ cx: 1, cy: -0.5, scale: 100 }, 800, 600);

  it('maps the view centre to the canvas centre', () => {
    expect(t.toPixel(1, -0.5)).toEqual([400, 300]);
  });

  it('has +y pointing up on screen', () => {
    const [, pyLow] = t.toPixel(1, -0.5);
    const [, pyHigh] = t.toPixel(1, 0.5);
    expect(pyHigh).toBeLessThan(pyLow);
    expect(pyLow - pyHigh).toBeCloseTo(100);
  });

  it('round-trips world -> pixel -> world', () => {
    for (const [x, y] of [
      [0, 0],
      [2.345, -1.25],
      [-10, 7],
    ]) {
      const [px, py] = t.toPixel(x, y);
      const [wx, wy] = t.toWorld(px, py);
      expect(wx).toBeCloseTo(x, 9);
      expect(wy).toBeCloseTo(y, 9);
    }
  });
});
