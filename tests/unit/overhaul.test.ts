import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatSpan, openStatus, parseOpeningHours } from '@/lib/openingHours';
import { fromWmo } from '@/features/weather/weather';
import { targetMix } from '@/features/weather/SkyLayer';
import { makePlane, planePosition } from '@/features/weather/aircraft';
import { boxAt, carFeatures, carLook, personFeatures, trainFeatures, CAR_VARIANTS } from '@/features/places/ambientModels';
import { makeAgent } from '@/features/places/ambient';
import { chessGameLink, chessPositionLink, parseChessMoves } from '@/lib/shareLinks';
import { importLocalGame } from '@/features/chess/localGame';
import { formatOdds } from '@/features/collectibles/TreasureRoom';
import { placesFilter } from '@/features/map/atlasStyle';

describe('opening hours', () => {
  it('parses common OSM forms into a weekly table', () => {
    const h = parseOpeningHours('Mo-Fr 09:00-17:00; Sa 10:00-14:00; Su off')!;
    expect(h.days[0]).toEqual([[540, 1020]]);
    expect(h.days[4]).toEqual([[540, 1020]]);
    expect(h.days[5]).toEqual([[600, 840]]);
    expect(h.days[6]).toEqual([]);
    expect(h.partial).toBe(false);
    expect(parseOpeningHours('24/7')!.days.every((d) => d[0][0] === 0 && d[0][1] === 1440)).toBe(true);
    expect(parseOpeningHours('Mo-Su 11:00-15:00,17:00-23:00')!.days[3]).toEqual([[660, 900], [1020, 1380]]);
    expect(parseOpeningHours('Fr,Sa 18:00-02:00')!.days[4]).toEqual([[1080, 1560]]); // past midnight
  });

  it('flags holiday/seasonal rules and refuses anything it does not fully understand (shown verbatim instead)', () => {
    expect(parseOpeningHours('Mo-Fr 08:00-18:00; PH off')!.partial).toBe(true);
    expect(parseOpeningHours('sunrise-sunset')).toBeNull();
    expect(parseOpeningHours('by appointment')).toBeNull();
    expect(parseOpeningHours('Mo-Fr 9-5')).toBeNull();
    expect(parseOpeningHours('')).toBeNull();
  });

  it('open/closed status includes ranges that spill over midnight', () => {
    const h = parseOpeningHours('Mo-Fr 09:00-17:00; Sa 18:00-02:00')!;
    expect(openStatus(h, 0, 600)).toEqual({ open: true, closesAt: 1020 });
    expect(openStatus(h, 0, 1080)).toEqual({ open: false, opensAt: { day: 1, minute: 540 } });
    expect(openStatus(h, 6, 60)).toEqual({ open: true, closesAt: 120 }); // Sunday 1 am, from Saturday night
    expect(openStatus(h, 6, 600)).toEqual({ open: false, opensAt: { day: 0, minute: 540 } });
    expect(formatSpan([0, 1440])).toBe('Open 24 hours');
  });
});

describe('weather', () => {
  it('maps real WMO codes to effects (never invents a condition)', () => {
    expect(fromWmo(0, 5, true).kind).toBe('clear');
    expect(fromWmo(2, 40, true)).toMatchObject({ kind: 'partly-cloudy', intensity: 0.4 });
    expect(fromWmo(3, null, true).kind).toBe('cloudy');
    expect(fromWmo(45, 100, false).kind).toBe('fog');
    expect(fromWmo(61, 90, true)).toMatchObject({ kind: 'rain', intensity: 0.35 });
    expect(fromWmo(65, 90, true).intensity).toBeGreaterThan(fromWmo(61, 90, true).intensity);
    expect(fromWmo(75, 90, true).kind).toBe('snow');
    expect(fromWmo(95, 90, true).kind).toBe('storm');
  });

  it('each condition has a distinct effect mix; no weather draws nothing', () => {
    expect(Object.values(targetMix(null)).every((v) => v === 0)).toBe(true);
    expect(targetMix({ kind: 'rain', intensity: 0.8, isDay: true }).rain).toBe(0.8);
    expect(targetMix({ kind: 'cloudy', intensity: 1, isDay: true }).rain).toBe(0);
    expect(targetMix({ kind: 'clear', intensity: 0, isDay: true }).sun).toBe(1);
    expect(targetMix({ kind: 'clear', intensity: 0, isDay: false }).sun).toBe(0); // no sun rays at night
    expect(targetMix({ kind: 'storm', intensity: 1, isDay: true }).storm).toBe(1);
  });
});

describe('aircraft', () => {
  const map = { getContainer: () => ({ clientWidth: 1000, clientHeight: 600 }) as HTMLElement, unproject: ([x, y]: [number, number]) => ({ lng: x / 100, lat: -y / 100 }) };
  it('flies from just outside one edge to the opposite edge, then ends', () => {
    let i = 0; const seq = [0.0, 0.5, 0.5, 0.2, 0.9];
    const p = makePlane(map as never, 1000, () => seq[i++ % seq.length])!;
    expect(p.from[0]).toBeLessThan(0); // entered from the left (outside the view)
    expect(p.to[0]).toBeGreaterThan(10); // leaves on the right
    expect(planePosition(p, 1000)!.at).toEqual(p.from);
    expect(planePosition(p, 1000 + p.durationMs + 1)).toBeNull();
    expect(p.durationMs).toBeGreaterThanOrEqual(28_000);
  });
});

describe('ambient models', () => {
  const line = makeAgent('car', [[-73.99, 40.75], [-73.985, 40.752], [-73.98, 40.751]], 3)!;
  it('cars have wheels, a body, a glass cabin, a roof and lights; variety is deterministic', () => {
    const f = carFeatures(line, 1, 10);
    const colors = f.map((x) => x.properties.c);
    expect(colors.filter((c) => c === '#1c1d21')).toHaveLength(4); // four tyres
    expect(colors).toContain('#33465a'); // glass
    expect(colors).toContain('#fff7c2'); // headlights
    expect(colors).toContain('#c81d25'); // tail lights
    expect(carLook(3)).toEqual(carLook(3));
    const variants = new Set(Array.from({ length: 200 }, (_, i) => carLook(i).variant));
    for (const v of CAR_VARIANTS) expect(variants).toContain(v);
  });

  it('people have legs, torso, arms, head and hair, and their legs swing as they walk', () => {
    const w = makeAgent('walker', [[-73.99, 40.75], [-73.989, 40.7505]], 5)!;
    const a = personFeatures(w, 0, 10); const b = personFeatures(w, 0.3, 10);
    expect(a).toHaveLength(8);
    expect(JSON.stringify(a[0].geometry)).not.toBe(JSON.stringify(b[0].geometry));
  });

  it('trains are carriages following the track with cab ends and direction lights', () => {
    const rail = makeAgent('train', [[-73.99, 40.75], [-73.96, 40.76]], 2)!;
    const f = trainFeatures(rail, 0, 8);
    const colors = f.map((x) => x.properties.c);
    expect(colors.filter((c) => c === '#f5c518')).toHaveLength(2); // a cab nose at each end
    expect(colors).toContain('#fffbe0'); // headlights on the leading end
    expect(colors).toContain('#d0202a'); // tail lights on the trailing end
  });

  it('boxAt offsets forward/right in metres', () => {
    const r = boxAt([0, 0], 0, 10, 0, 2, 2); // 10 m north
    const corners = r.slice(0, 4); // the 5th vertex closes the ring
    const lat = corners.reduce((s, p) => s + p[1], 0) / 4;
    expect(lat * 111_320).toBeCloseTo(10, 5);
    const w = (Math.max(...corners.map((p) => p[0])) - Math.min(...corners.map((p) => p[0]))) * 111_320;
    expect(w).toBeCloseTo(2, 5); // 2 m wide
  });
});

describe('chess links', () => {
  it('position links round-trip and are validated by replay', () => {
    const url = chessPositionLink(['e4', 'e5', 'Nf3']);
    expect(parseChessMoves(new URL(url).searchParams)).toEqual(['e4', 'e5', 'Nf3']);
    expect(importLocalGame(['e4', 'e5', 'Nf3'])!.moves).toHaveLength(3);
    expect(importLocalGame(['e4', 'e4'])).toBeNull(); // illegal
    expect(parseChessMoves(new URLSearchParams('moves=<script>'))).toBeNull();
    expect(chessGameLink('abc')).toMatch(/\/chess\/abc$/);
  });
});

describe('odds and filters', () => {
  it('formats basis points exactly', () => {
    expect([formatOdds(2990), formatOdds(100), formatOdds(10), formatOdds(2500), formatOdds(5)]).toEqual(['29.9%', '1%', '0.1%', '25%', '0.05%']);
  });
  it('places saved on the open map are excluded from the discovery layer (drawn once, as droplets)', () => {
    expect(JSON.stringify(placesFilter(['cafe'], [11]))).toContain('"!",["in",["id"],["literal",[11]]]');
    expect(JSON.stringify(placesFilter([]))).toContain('__none__');
  });
});

describe('hosting (vercel.json)', () => {
  const cfg = JSON.parse(readFileSync('vercel.json', 'utf8')) as { rewrites: { source: string; destination: string }[] };
  const rewritten = (p: string) => cfg.rewrites.some((r) => new RegExp(`^${r.source}$`).test(p));
  it('rewrites every app route to index.html (deep links survive refresh) but never real asset paths', () => {
    for (const p of ['/collab/4f0c9a2e-8a1b-4c3d-9e8f-0123456789ab', '/chess/x', '/maps/y', '/settings/animations', '/invite/t', '/treasure']) expect(rewritten(p), p).toBe(true);
    for (const p of ['/assets/index-abc.js', '/models/monuments/x.glb', '/atlas.svg', '/icons/icon-192.png']) expect(rewritten(p), p).toBe(false);
    expect(cfg.rewrites[0].destination).toBe('/index.html');
  });
});
