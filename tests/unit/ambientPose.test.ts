import { describe, expect, it } from 'vitest';
import { boxAround, makeAgent, poseAt } from '@/features/places/ambient';
import { haversineMeters } from '@/features/places/geo';

// A straight 400 m north-going line at Manhattan latitude.
const line: [number, number][] = [[-73.98, 40.75], [-73.98, 40.7536]];

describe('ambient vehicle pose', () => {
  const a = makeAgent('car', line, 1)!;

  it('stays on the real line and faces the direction of travel (ping-pong)', () => {
    const fwd = poseAt({ ...a, offset: 0 }, 1);
    expect(fwd.position[0]).toBeCloseTo(-73.98, 6);
    expect(fwd.heading).toBeCloseTo(0, 0); // north
    const back = poseAt({ ...a, offset: a.length + 10 }, 0);
    expect(back.heading).toBeCloseTo(180, 0); // coming back south
    for (let t = 0; t < 200; t += 7) {
      const { position: [lng, lat] } = poseAt(a, t);
      expect(lng).toBeCloseTo(-73.98, 6);
      expect(lat).toBeGreaterThanOrEqual(40.75 - 1e-9);
      expect(lat).toBeLessThanOrEqual(40.7536 + 1e-9);
    }
  });

  it('builds a closed box of the requested size, oriented along the heading', () => {
    const ring = boxAround([-73.98, 40.75], 90, 10, 4); // facing east
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    const p = (c: [number, number]) => ({ longitude: c[0], latitude: c[1] });
    expect(haversineMeters(p(ring[1]), p(ring[2]))).toBeCloseTo(10, 0); // length runs east-west
    expect(haversineMeters(p(ring[0]), p(ring[1]))).toBeCloseTo(4, 0);
    expect(Math.abs(ring[1][1] - ring[2][1])).toBeLessThan(1e-9);
  });
});
