/**
 * The sky over the map: animated weather and decorative aircraft, drawn on
 * ONE 2D canvas placed directly above the map's WebGL canvas and BELOW every
 * marker (pins, previews) and control — and with pointer-events: none, so
 * clicks, drags, labels and pins always work through it.
 *
 * Engine: independent effects (sun, clouds, rain, snow, fog, lightning,
 * dimming) each with a weight that eases toward a target mix derived from the
 * WeatherState, so conditions cross-fade instead of snapping. Adding a new
 * condition = a new target mix (TARGETS) and, if needed, a new effect.
 *
 * Map-aware: clouds and rain drift with the map when it pans (a fixed
 * geographic anchor is tracked), aircraft fly between geographic points so
 * they pan and zoom with the map, and the canvas follows the map's size.
 *
 * Performance & comfort:
 *   - one rAF loop capped at 30 fps (20 on low-power devices, which also get
 *     half the particles); stops when the tab is hidden or nothing is shown;
 *   - particle counts scale with the visible area and have hard caps;
 *   - sprites are pre-rendered once; no per-frame allocations in hot paths;
 *   - prefers-reduced-motion: one static frame (soft tint and still clouds),
 *     no falling particles, no lightning, no aircraft;
 *   - everything is torn down (listeners, rAF, canvas) on unmount.
 *
 * The aircraft are DECORATIVE — random paths, not real flights — which the
 * map legend states.
 */
import { useEffect, useRef } from 'react';
import type * as maplibregl from 'maplibre-gl';
import { useMapInstance } from '@/features/map/MapContext';
import { getAmbientKinds, getAmbientPlayback, useAmbientEnabled, useAmbientKinds, useReducedMotion } from '@/features/places/ambient';
import { useWeather, type WeatherState } from './weather';
import { makePlane, planePosition, type Plane } from './aircraft';

type Mix = { sun: number; clouds: number; rain: number; snow: number; fog: number; storm: number; dim: number };
const ZERO: Mix = { sun: 0, clouds: 0, rain: 0, snow: 0, fog: 0, storm: 0, dim: 0 };

/** Target effect mix for a weather state (the extension point for new conditions). */
export function targetMix(w: WeatherState | null): Mix {
  if (!w) return ZERO;
  const i = Math.max(0.1, Math.min(1, w.intensity || 0.5));
  switch (w.kind) {
    case 'clear': return { ...ZERO, sun: w.isDay ? 1 : 0, clouds: 0.08 };
    case 'partly-cloudy': return { ...ZERO, sun: w.isDay ? 0.6 : 0, clouds: 0.3 + 0.4 * i };
    case 'cloudy': return { ...ZERO, clouds: 0.75 + 0.25 * i, dim: 0.35 };
    case 'rain': return { ...ZERO, clouds: 0.8, rain: i, dim: 0.35 + 0.35 * i };
    case 'storm': return { ...ZERO, clouds: 1, rain: Math.max(0.75, i), storm: 1, dim: 0.85 };
    case 'fog': return { ...ZERO, fog: 0.6 + 0.4 * i, dim: 0.2 };
    case 'snow': return { ...ZERO, clouds: 0.65, snow: i, dim: 0.2 };
  }
}

const lowPower = () => {
  const n = navigator as Navigator & { deviceMemory?: number };
  return (n.hardwareConcurrency ?? 8) <= 4 || (n.deviceMemory ?? 8) <= 4;
};

interface Cloud { x: number; y: number; s: number; v: number; sprite: number; a: number }
interface Drop { x: number; y: number; len: number; v: number }
interface Flake { x: number; y: number; r: number; v: number; phase: number }

function cloudSprite(seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 360; c.height = 200;
  const g = c.getContext('2d')!;
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let k = 0; k < 9; k++) {
    const x = 60 + rnd() * 240;
    const y = 70 + rnd() * 60;
    const rad = 45 + rnd() * 55;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.55, 'rgba(250,251,253,0.7)');
    grd.addColorStop(1, 'rgba(240,243,248,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  // soft grey underside for volume
  const under = g.createLinearGradient(0, 90, 0, 200);
  under.addColorStop(0, 'rgba(120,130,150,0)');
  under.addColorStop(1, 'rgba(120,130,150,0.18)');
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = under;
  g.fillRect(0, 0, 360, 200);
  return c;
}

function raySprite(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.translate(256, 256);
  for (let k = 0; k < 14; k++) {
    g.rotate((Math.PI * 2) / 14);
    const grd = g.createLinearGradient(0, 0, 250, 0);
    grd.addColorStop(0, 'rgba(255,236,170,0.55)');
    grd.addColorStop(1, 'rgba(255,236,170,0)');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(250, -14 - (k % 3) * 6); g.lineTo(250, 14 + (k % 3) * 6); g.closePath(); g.fill();
  }
  return c;
}

export function SkyLayer() {
  const { map } = useMapInstance();
  const { state } = useWeather();
  const ambient = useAmbientEnabled();
  const kinds = useAmbientKinds();
  const reduced = useReducedMotion();
  const stateRef = useRef(state);
  stateRef.current = state;
  const planesOn = ambient && kinds.planes && !reduced;
  const active = !!state || planesOn;

  useEffect(() => {
    if (!map || !active) return;
    const container = map.getCanvasContainer();
    const canvas = document.createElement('canvas');
    canvas.className = 'atlas-sky';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.testid = 'sky-layer';
    Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' });
    container.insertBefore(canvas, map.getCanvas().nextSibling);
    const ctx = canvas.getContext('2d');
    if (!ctx) { canvas.remove(); return; }

    const low = lowPower();
    const dpr = Math.min(window.devicePixelRatio || 1, low ? 1 : 1.5);
    const frameMs = 1000 / (low ? 20 : 30);
    let W = 0; let H = 0;
    const resize = () => {
      const box = map.getContainer();
      W = box.clientWidth; H = box.clientHeight;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const sprites = [cloudSprite(1), cloudSprite(7), cloudSprite(13)];
    const rays = raySprite();
    const mix: Mix = { ...ZERO };
    const clouds: Cloud[] = [];
    const drops: Drop[] = [];
    const flakes: Flake[] = [];
    let planes: Plane[] = [];
    // Simulated clock (ms): advances with playback speed and stops while paused.
    let sim = 0;
    let nextPlaneAt = 4000 + Math.random() * 8000;
    let flash = 0;
    let nextFlash = 5000;
    let raysAngle = 0;
    let realDt = 0;

    const seedClouds = () => {
      clouds.length = 0;
      const n = Math.max(4, Math.min(low ? 7 : 12, Math.round((W * H) / 140_000)));
      for (let k = 0; k < n; k++) clouds.push({ x: Math.random() * (W + 400) - 200, y: Math.random() * (H + 200) - 100, s: 0.8 + Math.random() * 1.1, v: 6 + Math.random() * 10, sprite: k % 3, a: 0.6 + Math.random() * 0.4 });
    };
    seedClouds();
    const cap = (n: number) => Math.round(low ? n / 2 : n);

    // Track a geographic anchor so clouds and rain move with the map when it pans.
    let anchor = map.getCenter();
    let anchorPx = map.project(anchor);
    const onMove = () => {
      const p = map.project(anchor);
      const dx = p.x - anchorPx.x; const dy = p.y - anchorPx.y;
      if (Math.abs(dx) > W || Math.abs(dy) > H) { anchor = map.getCenter(); anchorPx = map.project(anchor); return; }
      for (const c of clouds) { c.x += dx; c.y += dy; }
      for (const d of drops) { d.x += dx; d.y += dy; }
      for (const f of flakes) { f.x += dx; f.y += dy; }
      anchorPx = p;
      if (reduced) draw(sim, 0);
    };
    const onResize = () => { resize(); if (reduced) draw(sim, 0); };

    const wrapCloud = (c: Cloud) => {
      const w = 360 * c.s;
      if (c.x > W + 200) c.x = -w - 100;
      if (c.x < -w - 300) c.x = W + 100;
      if (c.y > H + 150) c.y = -200;
      if (c.y < -300) c.y = H;
    };

    const draw = (now: number, dt: number) => {
      const target = targetMix(stateRef.current);
      const ease = reduced ? 1 : Math.min(1, realDt / 1.6); // ~1.6 s cross-fade (real time, even while paused)
      (Object.keys(mix) as (keyof Mix)[]).forEach((k) => { mix[k] += (target[k] - mix[k]) * ease; });
      ctx.clearRect(0, 0, W, H);

      // Dim / overcast tint.
      if (mix.dim > 0.01) { ctx.fillStyle = `rgba(36,48,70,${0.2 * mix.dim})`; ctx.fillRect(0, 0, W, H); }

      // Sun: warm glow from the top-right with slowly turning rays (kept faint).
      if (mix.sun > 0.01) {
        const g = ctx.createRadialGradient(W * 0.92, -H * 0.05, 0, W * 0.92, -H * 0.05, Math.max(W, H) * 0.75);
        g.addColorStop(0, `rgba(255,226,150,${0.32 * mix.sun})`);
        g.addColorStop(0.4, `rgba(255,236,190,${0.1 * mix.sun})`);
        g.addColorStop(1, 'rgba(255,240,210,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        raysAngle += dt * 0.03;
        ctx.save();
        ctx.globalAlpha = 0.09 * mix.sun;
        ctx.translate(W * 0.92, -H * 0.05); ctx.rotate(raysAngle);
        const size = Math.max(W, H) * 1.1;
        ctx.drawImage(rays, -size / 2, -size / 2, size, size);
        ctx.restore();
      }

      // Aircraft fly below the clouds' tops: draw them before the clouds.
      if (planes.length) {
        const zoom = map.getZoom();
        const px = Math.max(16, Math.min(40, 14 + (zoom - 10) * 3.2));
        planes = planes.filter((p) => {
          const pos = planePosition(p, now);
          if (!pos) return false;
          const a = map.project(pos.from); const b = map.project(pos.at);
          drawPlane(ctx, b.x, b.y, Math.atan2(b.y - a.y, b.x - a.x), px, p.livery);
          return true;
        });
      }

      // Clouds.
      if (mix.clouds > 0.01) {
        for (const c of clouds) {
          if (!reduced) { c.x += c.v * dt; wrapCloud(c); }
          ctx.globalAlpha = Math.min(1, mix.clouds * c.a * (stateRef.current?.kind === 'storm' ? 0.95 : 0.7));
          ctx.drawImage(sprites[c.sprite], c.x, c.y, 360 * c.s, 200 * c.s);
        }
        ctx.globalAlpha = 1;
      }

      // Fog: wide translucent bands drifting slowly.
      if (mix.fog > 0.01) {
        for (let k = 0; k < 4; k++) {
          const y = ((k * H) / 3.2 + (reduced ? 0 : now / 90 * (k % 2 ? 1 : -1))) % (H + 200) - 100;
          const g = ctx.createLinearGradient(0, y - 120, 0, y + 120);
          g.addColorStop(0, 'rgba(236,239,243,0)');
          g.addColorStop(0.5, `rgba(236,239,243,${0.38 * mix.fog})`);
          g.addColorStop(1, 'rgba(236,239,243,0)');
          ctx.fillStyle = g; ctx.fillRect(0, y - 120, W, 240);
        }
      }

      // Rain: angled streaks; count follows intensity and screen area.
      if (!reduced && mix.rain > 0.02) {
        const want = Math.min(cap(420), Math.round(((W * H) / 2600) * mix.rain));
        while (drops.length < want) drops.push({ x: Math.random() * (W + 100) - 50, y: Math.random() * H, len: 10 + Math.random() * 14, v: 650 + Math.random() * 350 });
        drops.length = Math.min(drops.length, want);
        ctx.strokeStyle = `rgba(190,208,232,${0.35 + 0.3 * mix.rain})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const d of drops) {
          d.y += d.v * dt; d.x -= d.v * dt * 0.18;
          if (d.y > H + 20) { d.y = -20 - Math.random() * 40; d.x = Math.random() * (W + 120); }
          ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.len * 0.18, d.y - d.len);
        }
        ctx.stroke();
      } else drops.length = 0;

      // Snow: drifting flakes.
      if (!reduced && mix.snow > 0.02) {
        const want = Math.min(cap(260), Math.round(((W * H) / 5200) * mix.snow));
        while (flakes.length < want) flakes.push({ x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 2.2, v: 25 + Math.random() * 35, phase: Math.random() * 6 });
        flakes.length = Math.min(flakes.length, want);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        for (const f of flakes) {
          f.y += f.v * dt; f.phase += dt; f.x += Math.sin(f.phase) * 12 * dt;
          if (f.y > H + 5) { f.y = -5; f.x = Math.random() * W; }
          ctx.moveTo(f.x + f.r, f.y); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        }
        ctx.fill();
      } else flakes.length = 0;

      // Lightning: a gentle, infrequent sky flash (never a strobe; none under reduced motion).
      if (!reduced && mix.storm > 0.5) {
        if (now > nextFlash) { flash = 0.16; nextFlash = now + 7000 + Math.random() * 9000; }
        if (flash > 0.001) { ctx.fillStyle = `rgba(235,240,255,${flash})`; ctx.fillRect(0, 0, W, H); flash *= Math.pow(0.02, dt); }
      }
    };

    let raf = 0;
    let last = 0;
    let prev = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < frameMs) return;
      last = now;
      const { paused, speed } = getAmbientPlayback();
      realDt = prev ? Math.min(now - prev, 200) / 1000 : 0;
      const dt = realDt * (paused ? 0 : speed);
      prev = now;
      sim += dt * 1000;
      // Aircraft: occasional, at most two at once, off when disabled.
      const k = getAmbientKinds();
      if (planesOn && k.planes && !paused && sim > nextPlaneAt) {
        if (planes.length < 2) {
          const p = makePlane(map as maplibregl.Map, sim, Math.random);
          if (p) planes.push(p);
        }
        nextPlaneAt = sim + 25_000 + Math.random() * 45_000;
      }
      if (!planesOn) planes = [];
      draw(sim, dt);
    };
    const start = () => { if (!raf && !document.hidden && !reduced) { prev = 0; raf = requestAnimationFrame(tick); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const onVis = () => (document.hidden ? stop() : start());

    if (reduced) draw(sim, 0); else start();
    map.on('move', onMove);
    map.on('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    // Re-render the static frame when the weather changes under reduced motion.
    const staticTimer = reduced ? window.setInterval(() => draw(sim, 0), 2000) : 0;
    return () => {
      stop();
      window.clearInterval(staticTimer);
      map.off('move', onMove);
      map.off('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      canvas.remove();
    };
  }, [map, active, reduced, planesOn]);

  return null;
}

const LIVERIES = [
  { body: '#f7f7f5', tail: '#d64532', stripe: '#1b4f9c' },
  { body: '#f2f4f7', tail: '#1b4f9c', stripe: '#1b4f9c' },
  { body: '#ffffff', tail: '#11764d', stripe: '#f5c518' },
  { body: '#eef1f4', tail: '#5b3f8c', stripe: '#e07a1f' },
];

/** Top-down airliner: fuselage, swept wings with engines, tailplane, cockpit and window line, plus a ground shadow. */
function drawPlane(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, px: number, liveryIdx: number) {
  const L = LIVERIES[liveryIdx % LIVERIES.length];
  const s = px / 40; // model is 40 units long
  // Shadow far below (altitude): offset and soft.
  ctx.save();
  ctx.translate(x + 26, y + 34); ctx.rotate(angle); ctx.scale(s, s);
  ctx.fillStyle = 'rgba(20,30,40,0.14)';
  planePath(ctx); ctx.fill();
  ctx.restore();
  // Contrail.
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle);
  const trail = ctx.createLinearGradient(-px * 0.5, 0, -px * 4.5, 0);
  trail.addColorStop(0, 'rgba(255,255,255,0.45)'); trail.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = trail; ctx.lineWidth = Math.max(1, px / 18);
  for (const off of [-px * 0.22, px * 0.22]) { ctx.beginPath(); ctx.moveTo(-px * 0.1, off); ctx.lineTo(-px * 4.5, off); ctx.stroke(); }
  ctx.scale(s, s);
  // Body.
  ctx.fillStyle = L.body; ctx.strokeStyle = 'rgba(60,70,85,0.55)'; ctx.lineWidth = 0.8;
  planePath(ctx); ctx.fill(); ctx.stroke();
  // Engines under the wings.
  ctx.fillStyle = '#9aa3ad';
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(1, side * 7.5, 2.4, 1.1, 0, 0, Math.PI * 2); ctx.fill(); }
  // Tail fin colour and fuselage stripe.
  ctx.fillStyle = L.tail;
  ctx.beginPath(); ctx.moveTo(-17, 0); ctx.lineTo(-12.5, -0.9); ctx.lineTo(-12.5, 0.9); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-18.5, -5.5); ctx.lineTo(-15.5, -5.5); ctx.lineTo(-13.5, -1); ctx.lineTo(-13.5, 1); ctx.lineTo(-15.5, 5.5); ctx.lineTo(-18.5, 5.5); ctx.lineTo(-17, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = L.stripe; ctx.fillRect(-12, -0.35, 26, 0.7);
  // Cockpit and windows.
  ctx.fillStyle = '#2b3a4a';
  ctx.beginPath(); ctx.ellipse(16.4, 0, 1.4, 1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5b6b7c';
  for (let k = -10; k < 14; k += 2) { ctx.fillRect(k, -1.25, 0.8, 0.45); ctx.fillRect(k, 0.8, 0.8, 0.45); }
  ctx.restore();
}

function planePath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  // nose -> right side
  ctx.moveTo(19, 0);
  ctx.quadraticCurveTo(18, -1.9, 15, -2);
  ctx.lineTo(4, -2.1);
  ctx.lineTo(-3, -16); ctx.lineTo(-6.5, -16); ctx.lineTo(-3, -2.1); // right wing
  ctx.lineTo(-13, -1.6);
  ctx.lineTo(-17, -6); ctx.lineTo(-19, -6); ctx.lineTo(-17.5, -1.2); // right tailplane
  ctx.lineTo(-19.5, 0);
  ctx.lineTo(-17.5, 1.2); ctx.lineTo(-19, 6); ctx.lineTo(-17, 6); ctx.lineTo(-13, 1.6); // left tailplane
  ctx.lineTo(-3, 2.1); ctx.lineTo(-6.5, 16); ctx.lineTo(-3, 16); ctx.lineTo(4, 2.1); // left wing
  ctx.lineTo(15, 2);
  ctx.quadraticCurveTo(18, 1.9, 19, 0);
  ctx.closePath();
}
