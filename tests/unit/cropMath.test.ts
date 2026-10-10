import { describe, expect, it } from 'vitest';
import { clampOffset, drawRect, scaleCrop } from '@/features/pins/cropMath';
import { safeNext } from '@/features/auth/AuthPage';

describe('crop geometry', () => {
  const wide = { width: 400, height: 200 };
  it('cover fills the frame, contain fits the whole image', () => {
    expect(drawRect(wide, { fit: 'cover', zoom: 1, offsetX: 0, offsetY: 0 }, 200)).toEqual({ x: -100, y: 0, width: 400, height: 200 });
    expect(drawRect(wide, { fit: 'contain', zoom: 1, offsetX: 0, offsetY: 0 }, 200)).toEqual({ x: 0, y: 50, width: 200, height: 100 });
  });
  it('clamps cover offsets so no empty edge is revealed', () => {
    const c = clampOffset(wide, { fit: 'cover', zoom: 1, offsetX: 500, offsetY: 30 }, 200);
    expect(c.offsetX).toBe(100);
    expect(c.offsetY).toBe(0);
  });
  it('scales preview offsets to the output frame', () => {
    expect(scaleCrop({ fit: 'cover', zoom: 2, offsetX: 10, offsetY: -20 }, 200, 256)).toEqual({ fit: 'cover', zoom: 2, offsetX: 12.8, offsetY: -25.6 });
  });
});

describe('safeNext (post-login redirect)', () => {
  it('only allows same-origin paths', () => {
    expect(safeNext('/invite/abc')).toBe('/invite/abc');
    expect(safeNext('//evil.com')).toBe('/');
    expect(safeNext('https://evil.com')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
});
