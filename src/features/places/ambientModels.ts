/**
 * Miniature 3D models for the decorative map life, built from small
 * fill-extrusion boxes (pure functions, unit-tested). Using extrusions keeps
 * them in the map's depth buffer, so real buildings hide them correctly and
 * they never float over buildings, pins or labels.
 *
 *   cars    — wheels, body, glass cabin, roof, head/tail lights; variants:
 *             sedan, hatchback, SUV, van, taxi (roof sign), bus (window band)
 *   trains  — push-pull sets of carriages that follow the curve of the
 *             track, with a glass window band, gaps between carriages, cab
 *             noses at both ends and white headlights / red tail lights that
 *             show the direction of travel
 *   people  — legs, torso, arms, head and hair, with a walking cycle
 *
 * Sizes are in "units" (≈ 14 screen px, see AmbientLayer) — exaggerated so
 * they stay visible; the motion is decorative, not real traffic.
 */
import type { Agent } from './ambient';
import { poseAtDistance } from './ambient';

export interface BoxFeature {
  type: 'Feature';
  properties: { c: string; h: number; b: number };
  geometry: { type: 'Polygon'; coordinates: [number, number][][] };
}

const M_LAT = 111_320;

/** Oriented box ring centred `fwd` metres ahead and `right` metres to the right of `center`. */
export function boxAt(center: [number, number], heading: number, fwd: number, right: number, length: number, width: number): [number, number][] {
  const [lng, lat] = center;
  const mLng = M_LAT * Math.cos((lat * Math.PI) / 180);
  const h = (heading * Math.PI) / 180;
  const fx = Math.sin(h);
  const fy = Math.cos(h);
  const rx = fy;
  const ry = -fx;
  const cx = fwd * fx + right * rx;
  const cy = fwd * fy + right * ry;
  const L = length / 2;
  const W = width / 2;
  const corner = (f: number, r: number): [number, number] => [lng + (cx + fx * f + rx * r) / mLng, lat + (cy + fy * f + ry * r) / M_LAT];
  return [corner(L, -W), corner(L, W), corner(-L, W), corner(-L, -W), corner(L, -W)];
}

interface Part { fwd: number; right: number; len: number; wid: number; base: number; top: number; color: string }
const box = (pos: [number, number], heading: number, u: number, p: Part): BoxFeature => ({
  type: 'Feature',
  properties: { c: p.color, b: p.base * u, h: p.top * u },
  geometry: { type: 'Polygon', coordinates: [boxAt(pos, heading, p.fwd * u, p.right * u, p.len * u, p.wid * u)] },
});

// ---- Cars ---------------------------------------------------------------------
export const CAR_VARIANTS = ['sedan', 'hatchback', 'suv', 'van', 'taxi', 'bus'] as const;
export type CarVariant = typeof CAR_VARIANTS[number];
const BODY_COLORS = ['#d7263d', '#1b4f9c', '#f4f4f2', '#2e2e33', '#3a7d44', '#8a8f98', '#e07a1f', '#5b3f8c'];
const GLASS = '#33465a';
const TYRE = '#1c1d21';

/** Deterministic per-agent variety (no Math.random: stable across frames). */
export function carLook(seed: number): { variant: CarVariant; color: string } {
  const r = (seed * 2654435761) >>> 0;
  const roll = r % 100;
  const variant: CarVariant = roll < 34 ? 'sedan' : roll < 54 ? 'hatchback' : roll < 72 ? 'suv' : roll < 84 ? 'van' : roll < 94 ? 'taxi' : 'bus';
  const color = variant === 'taxi' ? '#f5c518' : variant === 'bus' ? '#d64532' : BODY_COLORS[(r >>> 8) % BODY_COLORS.length];
  return { variant, color };
}

export function carParts(variant: CarVariant, color: string): Part[] {
  const dims: Record<CarVariant, { len: number; wid: number; bodyTop: number; cabin: [number, number, number]; roofTop: number }> = {
    // cabin: [length, forward offset, glass top]
    sedan: { len: 1.0, wid: 0.46, bodyTop: 0.21, cabin: [0.5, -0.05, 0.34], roofTop: 0.37 },
    hatchback: { len: 0.82, wid: 0.44, bodyTop: 0.21, cabin: [0.5, -0.1, 0.35], roofTop: 0.38 },
    suv: { len: 1.05, wid: 0.5, bodyTop: 0.27, cabin: [0.66, -0.1, 0.43], roofTop: 0.47 },
    van: { len: 1.1, wid: 0.5, bodyTop: 0.26, cabin: [0.92, -0.04, 0.5], roofTop: 0.54 },
    taxi: { len: 1.0, wid: 0.46, bodyTop: 0.21, cabin: [0.5, -0.05, 0.34], roofTop: 0.37 },
    bus: { len: 2.3, wid: 0.56, bodyTop: 0.3, cabin: [2.2, 0, 0.56], roofTop: 0.62 },
  };
  const d = dims[variant];
  const half = d.len / 2;
  const wheelX = half - (variant === 'bus' ? 0.32 : 0.2);
  const parts: Part[] = [];
  for (const f of [wheelX, -wheelX]) for (const r of [1, -1]) parts.push({ fwd: f, right: r * (d.wid / 2 - 0.035), len: 0.18, wid: 0.08, base: 0, top: 0.12, color: TYRE });
  parts.push({ fwd: 0, right: 0, len: d.len, wid: d.wid * 0.94, base: 0.06, top: d.bodyTop, color });
  const [cl, cf, ct] = d.cabin;
  parts.push({ fwd: cf, right: 0, len: cl, wid: d.wid * 0.86, base: d.bodyTop, top: ct, color: GLASS });
  parts.push({ fwd: cf - 0.02, right: 0, len: cl - 0.06, wid: d.wid * 0.82, base: ct, top: d.roofTop, color: variant === 'bus' ? '#f4f1ea' : color });
  if (variant === 'taxi') parts.push({ fwd: -0.06, right: 0, len: 0.14, wid: 0.2, base: d.roofTop, top: d.roofTop + 0.07, color: '#fffbe6' });
  // Head lights (front) and tail lights (rear) show which way it is going.
  for (const r of [1, -1]) {
    parts.push({ fwd: half - 0.015, right: r * d.wid * 0.3, len: 0.03, wid: 0.09, base: 0.11, top: 0.18, color: '#fff7c2' });
    parts.push({ fwd: -half + 0.015, right: r * d.wid * 0.3, len: 0.03, wid: 0.09, base: 0.11, top: 0.18, color: '#c81d25' });
  }
  return parts;
}

export function carFeatures(a: Agent, t: number, u: number): BoxFeature[] {
  const look = carLook(a.seed);
  const { position, heading } = poseAtTime(a, t);
  const scale = u * 1.3; // a little larger than a "unit" so the details read at street zoom
  return carParts(look.variant, look.color).map((p) => box(position, heading, scale, p));
}

// ---- Trains -------------------------------------------------------------------
export const TRAIN_CARS = 3;
const CAR_LEN = 1.7;
const CAR_GAP = 0.1;
const TRAIN_COLORS = ['#e8eef9', '#f2efe6', '#dfe9e2'];
const STRIPE = ['#2f5bea', '#c2410c', '#15803d'];

/** Train length along the track, in units. */
export const trainLengthUnits = () => TRAIN_CARS * CAR_LEN + (TRAIN_CARS - 1) * CAR_GAP;

export function trainFeatures(a: Agent, t: number, u: number): BoxFeature[] {
  const out: BoxFeature[] = [];
  const spacing = (CAR_LEN + CAR_GAP) * u;
  const span = spacing * (TRAIN_CARS - 1);
  // The set's middle moves back and forth inside the line, so every carriage stays on the track.
  const usable = Math.max(1, a.length - span - CAR_LEN * u);
  const period = usable * 2;
  let d = (a.offset + a.speed * t) % period;
  const back = d > usable;
  if (back) d = period - d;
  const head = d + span + (CAR_LEN * u) / 2; // distance of the leading carriage centre (forward direction)
  const body = TRAIN_COLORS[a.seed % TRAIN_COLORS.length];
  const stripe = STRIPE[a.seed % STRIPE.length];
  for (let k = 0; k < TRAIN_CARS; k++) {
    const s = head - k * spacing;
    const pose = poseAtDistance(a, s);
    // Geometry uses the line's own direction; carriage 0 is at the far (higher-distance) end.
    const heading = pose.heading;
    const pos = pose.position;
    const half = CAR_LEN / 2;
    const parts: Part[] = [
      { fwd: 0, right: 0, len: CAR_LEN, wid: 0.52, base: 0.04, top: 0.2, color: body },
      { fwd: 0, right: 0, len: CAR_LEN, wid: 0.53, base: 0.2, top: 0.24, color: stripe },
      { fwd: 0, right: 0, len: CAR_LEN - 0.08, wid: 0.5, base: 0.24, top: 0.4, color: GLASS },
      { fwd: 0, right: 0, len: CAR_LEN - 0.04, wid: 0.5, base: 0.4, top: 0.46, color: body },
    ];
    for (const f of [half - 0.3, -half + 0.3]) parts.push({ fwd: f, right: 0, len: 0.3, wid: 0.44, base: 0, top: 0.06, color: TYRE });
    // Cab cars at both ends (push-pull): a yellow nose; white lights on the leading end, red on the trailing end.
    if (k === 0 || k === TRAIN_CARS - 1) {
      const end = k === 0 ? 1 : -1;
      const leading = back ? k === TRAIN_CARS - 1 : k === 0;
      parts.push({ fwd: end * (half - 0.05), right: 0, len: 0.1, wid: 0.5, base: 0.04, top: 0.3, color: '#f5c518' });
      for (const r of [1, -1]) parts.push({ fwd: end * (half + 0.01), right: r * 0.16, len: 0.04, wid: 0.08, base: 0.1, top: 0.16, color: leading ? '#fffbe0' : '#d0202a' });
    }
    for (const p of parts) out.push(box(pos, heading, u, p));
  }
  return out;
}

// ---- People -------------------------------------------------------------------
const SHIRTS = ['#e4572e', '#2f5bea', '#f2c14e', '#3a7d44', '#7b5ea7', '#ef6f6c', '#17a2b8', '#ffffff'];
const TROUSERS = ['#2b2d42', '#3d405b', '#6b4f3a', '#1d3557', '#555b6e'];
const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
const HAIR = ['#2b1d14', '#5a3825', '#d9b26a', '#1a1a1a', '#a0522d', '#8c8c8c'];

export function personFeatures(a: Agent, t: number, u: number): BoxFeature[] {
  const r = (a.seed * 2246822519) >>> 0;
  const shirt = SHIRTS[r % SHIRTS.length];
  const trousers = TROUSERS[(r >>> 3) % TROUSERS.length];
  const skin = SKIN[(r >>> 6) % SKIN.length];
  const hair = HAIR[(r >>> 9) % HAIR.length];
  const tall = 0.92 + ((r >>> 12) % 17) / 100; // subtle height variation
  const { position, heading } = poseAtTime(a, t);
  // Walking cycle: stride follows distance travelled, so faster walkers step faster.
  const phase = ((a.offset + a.speed * t) / 0.75) * Math.PI;
  const swing = Math.sin(phase) * 0.07;
  const p = u * 1.05 * tall;
  const parts: Part[] = [
    { fwd: swing, right: 0.045, len: 0.07, wid: 0.06, base: 0, top: 0.24, color: trousers },
    { fwd: -swing, right: -0.045, len: 0.07, wid: 0.06, base: 0, top: 0.24, color: trousers },
    { fwd: 0, right: 0, len: 0.1, wid: 0.18, base: 0.24, top: 0.46, color: shirt },
    { fwd: -swing * 0.8, right: 0.115, len: 0.06, wid: 0.05, base: 0.27, top: 0.45, color: shirt },
    { fwd: swing * 0.8, right: -0.115, len: 0.06, wid: 0.05, base: 0.27, top: 0.45, color: shirt },
    { fwd: 0, right: 0, len: 0.06, wid: 0.06, base: 0.46, top: 0.49, color: skin },
    { fwd: 0, right: 0, len: 0.1, wid: 0.1, base: 0.49, top: 0.6, color: skin },
    { fwd: -0.01, right: 0, len: 0.11, wid: 0.11, base: 0.58, top: 0.63, color: hair },
  ];
  return parts.map((x) => box(position, heading, p, x));
}

/**
 * Pose at time t with a SMOOTHED heading (looks a few metres ahead and
 * behind), so vehicles turn through corners instead of snapping.
 */
export function poseAtTime(a: Agent, t: number): { position: [number, number]; heading: number } {
  const period = a.length * 2;
  let d = (a.offset + a.speed * t) % period;
  const back = d > a.length;
  if (back) d = period - d;
  const here = poseAtDistance(a, d);
  const look = Math.min(6, a.length / 4);
  const ahead = poseAtDistance(a, Math.min(a.length, d + look)).position;
  const behind = poseAtDistance(a, Math.max(0, d - look)).position;
  const dx = (ahead[0] - behind[0]) * Math.cos((here.position[1] * Math.PI) / 180);
  const dy = ahead[1] - behind[1];
  const forward = dx === 0 && dy === 0 ? here.heading : (Math.atan2(dx, dy) * 180) / Math.PI;
  return { position: here.position, heading: ((back ? forward + 180 : forward) + 360) % 360 };
}
