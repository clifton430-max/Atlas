/**
 * Original procedural miniatures of 18 landmarks whose designs are in the
 * public domain (ancient sites or designers who died more than 70 years ago).
 * Simplified, stylised and recognisable — not survey-accurate replicas.
 */
import * as THREE from 'three';
import { Builder, onion } from './kit.mjs';

const PI = Math.PI;

export const MODELS = {
  // ------------------------------------------------------------------ Common
  stonehenge() {
    const b = new Builder('stonehenge');
    b.base(1.25, '#8fbf6a');
    const stone = '#8d8a83', dark = '#77736c';
    b.ring(16, 1, (x, z, a, i) => {
      b.box(0.16, 0.42, 0.1, i % 3 ? stone : dark, x, 0, z, { rot: [0, -a, 0] });
      if (i % 4 !== 3) b.box(0.42, 0.07, 0.11, stone, Math.cos(a + 0.2) * 1, 0.42, Math.sin(a + 0.2) * 1, { rot: [0, -a - PI / 2 + 0.2, 0] });
    });
    [-0.9, -0.45, 0, 0.45, 0.9].forEach((t, i) => {
      const a = t + PI / 2, r = 0.55;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      b.box(0.12, 0.6 - Math.abs(i - 2) * 0.05, 0.1, dark, x - 0.08, 0, z, { rot: [0, -a, 0] });
      b.box(0.12, 0.6 - Math.abs(i - 2) * 0.05, 0.1, dark, x + 0.08, 0, z, { rot: [0, -a, 0] });
      b.box(0.32, 0.08, 0.12, stone, x, 0.6 - Math.abs(i - 2) * 0.05, z, { rot: [0, -a, 0] });
    });
    b.box(0.3, 0.05, 0.12, '#9b8f7a', 0, 0, -0.1);
    return b.group;
  },
  'ahu-tongariki'() {
    const b = new Builder('ahu-tongariki');
    b.box(3.6, 0.04, 1.6, '#3f8fc4', 0, -0.06, 0.55); // sea
    b.box(3.6, 0.06, 1.1, '#8fbf6a', 0, -0.06, -0.2);
    b.box(3.1, 0.12, 0.42, '#6d6159', 0, 0, -0.15); // ahu platform
    for (let i = 0; i < 15; i++) {
      const x = -1.4 + i * 0.2, h = 0.5 + ((i * 7) % 5) * 0.03;
      b.box(0.13, h, 0.11, '#4a4440', x, 0.12, -0.15);
      b.box(0.15, 0.12, 0.13, '#3d3734', x, 0.12 + h, -0.14); // head/brow
      b.box(0.04, 0.08, 0.04, '#3d3734', x, 0.12 + h - 0.12, -0.08); // nose
      if (i === 7) b.cyl(0.07, 0.08, 0.08, '#8b3a2b', x, 0.24 + h, -0.14); // pukao
    }
    return b.group;
  },
  'arc-de-triomphe'() {
    const b = new Builder('arc-de-triomphe');
    b.base(1.1, '#cfc6b4', '#8a7f6c');
    const s = '#e4d6b5', d = '#d2c19b';
    for (const x of [-0.42, 0.42]) for (const z of [-0.2, 0.2]) b.box(0.3, 0.62, 0.22, s, x, 0, z);
    b.box(1.14, 0.26, 0.66, s, 0, 0.62, 0); // attic
    b.box(1.18, 0.04, 0.7, d, 0, 0.62, 0); // cornice
    b.box(1.2, 0.03, 0.72, d, 0, 0.88, 0);
    b.box(0.56, 0.16, 0.66, d, 0, 0.46, 0, { scale: [1, 1, 0.98] }); // arch crown
    b.cyl(0.28, 0.28, 0.66, s, 0, 0.32, 0, 16, { rot: [PI / 2, 0, 0], open: false });
    for (const x of [-0.42, 0.42]) b.box(0.22, 0.2, 0.02, '#c2ae84', x, 0.18, 0.21); // reliefs
    return b.group;
  },
  // --------------------------------------------------------------- Uncommon
  'leaning-tower-of-pisa'() {
    const b = new Builder('leaning-tower-of-pisa');
    b.base(0.9, '#8fbf6a');
    const t = new Builder('tower'), m = '#f2ede1', col = '#e2dccd';
    t.cyl(0.26, 0.27, 0.22, m, 0, 0, 0, 24);
    for (let i = 0; i < 6; i++) {
      const y = 0.22 + i * 0.16;
      t.cyl(0.24, 0.24, 0.16, m, 0, y, 0, 24);
      t.cyl(0.275, 0.275, 0.02, col, 0, y + 0.14, 0, 24);
      t.ring(12, 0.265, (x, z) => t.cyl(0.012, 0.012, 0.12, col, x, y + 0.02, z, 6));
    }
    t.cyl(0.17, 0.17, 0.16, m, 0, 1.18, 0, 20);
    t.cyl(0.19, 0.19, 0.02, col, 0, 1.34, 0, 20);
    t.group.rotation.z = -0.07; // the famous lean (~4°)
    b.group.add(t.group);
    return b.group;
  },
  'big-ben'() {
    const b = new Builder('big-ben');
    b.base(0.6, '#b9b1a3', '#7a6f60');
    const s = '#c9a96b', d = '#a88a52';
    b.box(0.3, 0.9, 0.3, s, 0, 0, 0);
    for (let y = 0.1; y < 0.85; y += 0.15) b.box(0.32, 0.015, 0.32, d, 0, y, 0);
    b.box(0.36, 0.3, 0.36, s, 0, 0.9, 0);
    for (const [x, z, r] of [[0, 0.181, 0], [0, -0.181, PI], [0.181, 0, PI / 2], [-0.181, 0, -PI / 2]]) {
      b.cyl(0.13, 0.13, 0.01, '#2c2a26', x, 1.05, z, 24, { rot: [PI / 2, r, 0] });
      b.cyl(0.11, 0.11, 0.012, '#f3eedd', x, 1.05, z, 24, { rot: [PI / 2, r, 0] });
    }
    b.box(0.3, 0.16, 0.3, d, 0, 1.2, 0);
    b.cone(0.22, 0.42, '#3b4a5a', 0, 1.36, 0, 4, { rot: [0, PI / 4, 0] });
    b.cyl(0.01, 0.01, 0.12, '#d4af37', 0, 1.78, 0, 6, { metal: 0.6, rough: 0.4 });
    return b.group;
  },
  parthenon() {
    const b = new Builder('parthenon');
    b.base(1.5, '#b9ad93', '#8a7d64');
    const m = '#efe6d2', w = 2.0, d = 0.95;
    b.box(w + 0.2, 0.05, d + 0.2, '#ddd1b8', 0, 0, 0);
    b.box(w + 0.1, 0.05, d + 0.1, '#e5dac3', 0, 0.05, 0);
    b.box(w, 0.05, d, m, 0, 0.1, 0);
    const cols = (n, len, fixed, axis) => { for (let i = 0; i < n; i++) { const t = -len / 2 + (i * len) / (n - 1); axis === 'x' ? b.cyl(0.04, 0.045, 0.5, m, t, 0.15, fixed, 10) : b.cyl(0.04, 0.045, 0.5, m, fixed, 0.15, t, 10); } };
    cols(13, w - 0.1, d / 2 - 0.05, 'x'); cols(13, w - 0.1, -d / 2 + 0.05, 'x');
    cols(6, d - 0.1, w / 2 - 0.05, 'z'); cols(6, d - 0.1, -w / 2 + 0.05, 'z');
    b.box(w - 0.5, 0.48, d - 0.35, '#e0d4bb', 0, 0.15, 0); // cella
    b.box(w, 0.12, d, m, 0, 0.65, 0); // entablature
    b.box(w, 0.02, d, '#d8ccb1', 0, 0.71, 0);
    b.prism(w, d, 0.16, '#e7dcc4', 0, 0.77, 0);
    return b.group;
  },
  // ------------------------------------------------------------------- Rare
  'statue-of-liberty'() {
    const b = new Builder('statue-of-liberty');
    b.base(0.9, '#8fbf6a');
    b.cyl(0.62, 0.66, 0.08, '#b8ad9c', 0, 0, 0, 11); // star fort
    b.box(0.36, 0.42, 0.36, '#c9bfae', 0, 0.08, 0); // pedestal
    b.box(0.4, 0.04, 0.4, '#b3a894', 0, 0.42, 0);
    b.box(0.3, 0.08, 0.3, '#c9bfae', 0, 0.46, 0);
    const g = '#5fa58e', hi = '#78b9a3';
    b.cyl(0.08, 0.13, 0.5, g, 0, 0.54, 0, 12); // robe
    b.cyl(0.06, 0.08, 0.1, hi, 0, 1.04, 0, 10); // shoulders
    b.sphere(0.06, g, 0, 1.18, 0, { seg: 12 });
    b.ring(7, 0.07, (x, z) => b.cone(0.012, 0.07, hi, x, 1.2, z, 5, { rot: [x * 6, 0, -z * 6] }));
    b.cyl(0.022, 0.026, 0.3, g, 0.07, 1.06, 0, 8, { rot: [0, 0, -0.18] }); // raised arm
    b.cyl(0.03, 0.02, 0.06, '#d4af37', 0.125, 1.36, 0, 8, { metal: 0.5, rough: 0.35 });
    b.cone(0.03, 0.08, '#f6c445', 0.125, 1.42, 0, 8, { emissive: '#f6a623' }); // flame
    b.box(0.08, 0.12, 0.025, hi, -0.09, 0.86, 0.05, { rot: [0, 0, 0.2] }); // tablet
    return b.group;
  },
  neuschwanstein() {
    const b = new Builder('neuschwanstein');
    b.cone(1.1, 0.35, '#6f7f5d', 0, -0.05, 0, 9); // hill
    b.cyl(1.1, 1.15, 0.05, '#5f6f4f', 0, -0.1, 0, 9);
    const w = '#f1ece2', roof = '#4a6a8a';
    b.box(0.7, 0.55, 0.26, w, 0, 0.28, 0);
    b.prism(0.7, 0.28, 0.22, roof, 0, 0.83, 0);
    b.box(0.26, 0.32, 0.36, w, -0.42, 0.28, 0.05);
    b.prism(0.36, 0.26, 0.16, roof, -0.42, 0.6, 0.05, { rot: [0, PI / 2, 0] });
    for (const [x, z, r, h] of [[0.42, 0.08, 0.1, 0.78], [0.38, -0.14, 0.07, 0.62], [-0.2, 0.18, 0.06, 0.6], [0.1, -0.18, 0.05, 0.7], [-0.6, -0.08, 0.07, 0.48]]) {
      b.cyl(r, r, h, w, x, 0.28, z, 16);
      b.cyl(r * 1.15, r * 1.15, 0.03, '#d9d2c4', x, 0.28 + h, z, 16);
      b.cone(r * 1.15, r * 3, roof, x, 0.31 + h, z, 16);
    }
    for (let i = 0; i < 5; i++) b.box(0.05, 0.08, 0.01, '#3d4b5c', -0.24 + i * 0.12, 0.6, 0.131);
    return b.group;
  },
  'el-castillo'() {
    const b = new Builder('el-castillo');
    b.base(1.15, '#8fbf6a');
    const s = '#d9c9a3', d = '#c4b28a';
    for (let i = 0; i < 9; i++) { const size = 1.2 - i * 0.1; b.box(size, 0.07, size, i % 2 ? d : s, 0, i * 0.07, 0); }
    // Four staircases: from the ground at the outer edge up to the summit platform.
    const run = 0.45, rise = 0.63, len = Math.hypot(run, rise), tilt = Math.atan2(rise, run);
    for (const r of [0, PI / 2, PI, -PI / 2]) {
      const st = b.add(new THREE.BoxGeometry(0.18, 0.04, len), '#cdbb92', [Math.sin(r) * 0.375, rise / 2, Math.cos(r) * 0.375]);
      st.rotation.order = 'YXZ';
      st.rotation.set(tilt, r, 0);
    }
    b.box(0.32, 0.18, 0.32, s, 0, 0.63, 0); // temple
    b.box(0.36, 0.03, 0.36, d, 0, 0.81, 0);
    b.box(0.08, 0.11, 0.01, '#3a3226', 0, 0.63, 0.161);
    return b.group;
  },
  // ------------------------------------------------------------------- Epic
  colosseum() {
    const b = new Builder('colosseum');
    b.base(1.25, '#b9ad93', '#8a7d64');
    const t = '#d8c3a0', d = '#b49a74', S = [1, 1, 0.78];
    b.cyl(0.62, 0.62, 0.02, '#e3cc9a', 0, 0, 0, 40, { scale: S }); // arena
    for (let tier = 0; tier < 4; tier++) {
      const y = tier * 0.15, h = tier === 3 ? 0.12 : 0.15;
      const arc = tier === 3 ? PI * 1.35 : PI * 2;
      const n = 40;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * arc;
        if (tier >= 2 && a > PI * 1.55) continue; // the ruined outer ring
        const x = Math.cos(a) * 1.0, z = Math.sin(a) * 0.78;
        b.box(0.1, h, 0.08, i % 2 ? t : d, x, y, z, { rot: [0, -Math.atan2(z / 0.78, x) - PI / 2, 0] });
      }
    }
    for (let k = 0; k < 3; k++) b.cyl(0.92 - k * 0.12, 0.8 - k * 0.12, 0.08, d, 0, 0.05 + k * 0.08, 0, 40, { scale: S, open: true });
    return b.group;
  },
  'petra-treasury'() {
    const b = new Builder('petra-treasury');
    b.box(1.6, 1.5, 0.6, '#b8664a', 0, 0, -0.32); // cliff
    b.box(1.8, 0.05, 1.1, '#c98f6b', 0, -0.05, 0); // sand
    const s = '#d98a6a', d = '#c47657';
    b.box(1.05, 0.06, 0.06, d, 0, 0.0, 0.02);
    for (let i = 0; i < 6; i++) b.cyl(0.035, 0.035, 0.5, s, -0.45 + i * 0.18, 0.06, 0.05, 10);
    b.box(1.05, 0.08, 0.1, d, 0, 0.56, 0.03);
    b.prism(0.6, 0.6, 0.18, s, 0, 0.64, 0.05, { rot: [0, PI / 2, 0], scale: [1, 1, 0.15] });
    b.box(1.0, 0.05, 0.08, d, 0, 0.82, 0.02);
    b.cyl(0.12, 0.12, 0.36, s, 0, 0.87, 0.05, 14); // tholos
    b.ring(8, 0.13, (x, z) => b.cyl(0.015, 0.015, 0.34, d, x, 0.87, z + 0.05, 6));
    b.cone(0.14, 0.14, d, 0, 1.23, 0.05, 14);
    b.cyl(0.03, 0.03, 0.06, s, 0, 1.37, 0.05, 8);
    for (const x of [-0.38, 0.38]) { b.box(0.22, 0.36, 0.1, s, x, 0.87, 0.03); b.prism(0.22, 0.22, 0.08, d, x, 1.23, 0.03, { scale: [0.6, 1, 1] }); }
    b.box(0.14, 0.24, 0.02, '#4a2a1e', 0, 0.06, 0.08); // doorway
    return b.group;
  },
  'saint-basils'() {
    const b = new Builder('saint-basils');
    b.base(1.0, '#c9c1b2', '#7a6f60');
    const brick = '#a63a2b', white = '#efe6d6';
    b.box(1.1, 0.25, 1.1, brick, 0, 0, 0);
    b.cyl(0.14, 0.17, 0.65, brick, 0, 0.25, 0, 8);
    b.cone(0.16, 0.42, '#e9d8a6', 0, 0.9, 0, 8);
    b.lathe(onion(0.06, 0.12), '#d4af37', 0, 1.32, 0, 12, { metal: 0.5, rough: 0.4 });
    const domes = ['#2e8b57', '#c0392b', '#2471a3', '#f1c40f', '#16a085', '#d35400', '#8e44ad', '#27ae60'];
    b.ring(8, 0.38, (x, z, a, i) => {
      const big = i % 2 === 0, h = big ? 0.42 : 0.3;
      b.cyl(0.09, 0.1, h, i % 2 ? white : brick, x, 0.25, z, 8);
      b.lathe(onion(big ? 0.14 : 0.11, big ? 0.28 : 0.22), domes[i], x, 0.25 + h, z, 12);
      b.cyl(0.005, 0.005, 0.08, '#d4af37', x, 0.25 + h + (big ? 0.28 : 0.22), z, 4, { metal: 0.6 });
    });
    return b.group;
  },
  // -------------------------------------------------------------- Legendary
  'eiffel-tower'() {
    const b = new Builder('eiffel-tower');
    b.base(0.95, '#8fbf6a');
    const c = '#7b5b3a', l = '#8d6a45';
    const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    // Four curved legs: two segments each, splayed at the base, converging at the 1st platform.
    for (const [sx, sz] of corners) {
      for (const off of [-0.05, 0.05]) {
        b.beam([sx * (0.42 + off * sz), 0, sz * (0.42 - off * sx)], [sx * 0.3, 0.24, sz * 0.3], 0.035, c);
        b.beam([sx * 0.3, 0.24, sz * 0.3], [sx * (0.24 + off * sz * 0.5), 0.44, sz * (0.24 - off * sx * 0.5)], 0.03, c);
      }
      b.beam([sx * 0.42, 0.02, sz * 0.42], [sx * 0.24, 0.44, sz * 0.24], 0.012, l); // lattice diagonal
    }
    // Arches between the legs.
    for (const r of [0, PI / 2]) b.add(new THREE.TorusGeometry(0.3, 0.018, 6, 20, PI), c, [0, 0.02, 0], { rot: [0, r, 0] });
    b.box(0.62, 0.05, 0.62, l, 0, 0.44, 0); // 1st platform
    // Middle section to the 2nd platform.
    for (const [sx, sz] of corners) b.beam([sx * 0.22, 0.49, sz * 0.22], [sx * 0.13, 0.86, sz * 0.13], 0.028, c);
    for (let i = 0; i < 3; i++) { const y = 0.58 + i * 0.1, r = 0.2 - i * 0.025; b.cyl(r * 1.4, r * 1.4, 0.012, l, 0, y, 0, 4, { rot: [0, PI / 4, 0], open: true }); }
    b.box(0.34, 0.04, 0.34, l, 0, 0.86, 0); // 2nd platform
    // Upper spire to the top.
    for (const [sx, sz] of corners) b.beam([sx * 0.11, 0.9, sz * 0.11], [sx * 0.025, 1.58, sz * 0.025], 0.022, c);
    for (let i = 0; i < 6; i++) { const y = 0.98 + i * 0.1, r = 0.1 - i * 0.013; b.cyl(r * 1.4, r * 1.4, 0.01, l, 0, y, 0, 4, { rot: [0, PI / 4, 0], open: true }); }
    b.box(0.08, 0.06, 0.08, l, 0, 1.58, 0);
    b.cyl(0.006, 0.01, 0.16, '#5c4228', 0, 1.64, 0, 6);
    return b.group;
  },
  'taj-mahal'() {
    const b = new Builder('taj-mahal');
    b.box(2.2, 0.04, 2.6, '#7fb069', 0, -0.04, 0.35); // gardens
    b.box(0.22, 0.03, 1.3, '#4da3d8', 0, -0.01, 0.95); // reflecting pool
    const m = '#f5f1ea', s = '#e6ddd0';
    b.box(1.5, 0.12, 1.5, s, 0, 0, 0); // plinth
    b.cyl(0.52, 0.52, 0.52, m, 0, 0.12, 0, 8, { rot: [0, PI / 8, 0] });
    b.box(0.3, 0.38, 0.02, '#d9cfbf', 0, 0.16, 0.49); // iwan
    b.cyl(0.24, 0.24, 0.12, m, 0, 0.64, 0, 16);
    b.lathe(onion(0.34, 0.56), m, 0, 0.74, 0, 24);
    b.cyl(0.006, 0.006, 0.1, '#d4af37', 0, 1.3, 0, 4, { metal: 0.6 });
    for (const [x, z] of [[0.36, 0.36], [-0.36, 0.36], [0.36, -0.36], [-0.36, -0.36]]) {
      b.cyl(0.08, 0.08, 0.12, m, x, 0.64, z, 8);
      b.lathe(onion(0.1, 0.16), m, x, 0.76, z, 12);
    }
    for (const [x, z] of [[0.72, 0.72], [-0.72, 0.72], [0.72, -0.72], [-0.72, -0.72]]) {
      b.cyl(0.035, 0.045, 0.82, m, x, 0.12, z, 10);
      for (const y of [0.35, 0.6, 0.86]) b.cyl(0.06, 0.06, 0.02, s, x, 0.12 + y - 0.1, z, 10);
      b.lathe(onion(0.05, 0.08), m, x, 0.94, z, 10);
    }
    return b.group;
  },
  'angkor-wat'() {
    const b = new Builder('angkor-wat');
    b.box(2.4, 0.03, 2.4, '#3f8fc4', 0, -0.06, 0); // moat
    b.box(2.0, 0.05, 2.0, '#8fbf6a', 0, -0.05, 0);
    b.box(0.16, 0.03, 0.6, '#a8957a', 0, -0.03, 1.1); // causeway
    const s = '#a8957a', d = '#8c7a60';
    b.box(1.6, 0.1, 1.6, s, 0, 0, 0);
    b.box(1.2, 0.14, 1.2, d, 0, 0.1, 0);
    b.box(0.85, 0.16, 0.85, s, 0, 0.24, 0);
    const lotus = (h) => [[0.001, 0], [0.11, 0.02], [0.12, h * 0.25], [0.1, h * 0.5], [0.06, h * 0.78], [0.02, h * 0.95], [0.001, h]];
    for (const [x, z] of [[0.36, 0.36], [-0.36, 0.36], [0.36, -0.36], [-0.36, -0.36]]) b.lathe(lotus(0.48), d, x, 0.4, z, 8);
    b.lathe(lotus(0.75).map(([r, h]) => [r * 1.3, h]), s, 0, 0.4, 0, 8);
    for (let i = 0; i < 4; i++) b.box(1.6, 0.04, 0.04, d, 0, 0.1, i < 2 ? (i ? 0.79 : -0.79) : 0, { rot: [0, i > 1 ? PI / 2 : 0, 0], scale: [1, 1, 1] });
    return b.group;
  },
  // ----------------------------------------------------------------- Mythic
  'great-pyramid'() {
    const b = new Builder('great-pyramid');
    b.base(1.5, '#e2c27a', '#b08d4c');
    for (const [x, z, r] of [[-0.9, -0.6, 0.35], [1.0, 0.5, 0.3]]) b.sphere(r, '#e8c985', x, -0.02, z, { hemi: true, scale: [1, 0.25, 1] }); // dunes
    b.cone(1.05, 0.95, '#d8b978', 0, 0, 0, 4, { rot: [0, PI / 4, 0] });
    for (let i = 1; i < 10; i++) { const y = i * 0.09, r = 1.05 * (1 - y / 0.95); b.cyl(r * 1.002, r * 1.002, 0.008, '#c9a866', 0, y, 0, 4, { rot: [0, PI / 4, 0], open: true }); }
    b.box(0.12, 0.08, 0.02, '#4a3a22', 0, 0.12, 0.66, { rot: [-0.85, 0, 0] }); // entrance
    return b.group;
  },
  'machu-picchu'() {
    const b = new Builder('machu-picchu');
    b.cone(1.3, 0.3, '#5b7d4a', 0, -0.1, 0, 10);
    b.cone(0.38, 1.0, '#3f6b3a', 0.55, 0.1, -0.55, 9); // Huayna Picchu
    for (let i = 0; i < 6; i++) b.cyl(1.0 - i * 0.1, 1.02 - i * 0.1, 0.05, i % 2 ? '#7aa35a' : '#8fbf6a', -0.1, 0.18 + i * 0.05, 0.15, 24, { scale: [1, 1, 0.6] });
    const stone = '#a39a8a', thatch = '#b08d4c';
    const huts = [[-0.4, 0.2], [-0.2, 0.35], [0, 0.2], [0.15, 0.4], [-0.55, 0.45], [0.3, 0.15], [-0.3, 0.05]];
    huts.forEach(([x, z], i) => {
      b.box(0.12, 0.06, 0.09, stone, x, 0.47, z);
      if (i % 2 === 0) b.prism(0.12, 0.1, 0.07, thatch, x, 0.53, z);
    });
    b.box(0.2, 0.04, 0.1, stone, -0.15, 0.47, -0.15); // Intihuatana terrace
    return b.group;
  },
  'hagia-sophia'() {
    const b = new Builder('hagia-sophia');
    b.base(1.2, '#c9c1b2', '#7a6f60');
    const wall = '#d9a08b', d = '#c48b76', lead = '#6f7c86';
    b.box(1.1, 0.4, 0.95, wall, 0, 0, 0);
    b.box(0.5, 0.25, 0.95, d, -0.65, 0, 0);
    b.box(0.5, 0.25, 0.95, d, 0.65, 0, 0);
    b.cyl(0.34, 0.36, 0.14, wall, 0, 0.4, 0, 24); // drum
    b.ring(20, 0.35, (x, z, a) => b.box(0.03, 0.06, 0.01, '#2d3b45', x, 0.44, z, { rot: [0, -a + PI / 2, 0] }));
    b.sphere(0.36, lead, 0, 0.54, 0, { hemi: true, seg: 24, scale: [1, 0.62, 1] });
    for (const x of [-0.4, 0.4]) b.sphere(0.24, lead, x, 0.4, 0, { hemi: true, scale: [1, 0.6, 1] }); // semi-domes
    for (const [x, z] of [[0.75, 0.6], [-0.75, 0.6], [0.75, -0.6], [-0.75, -0.6]]) {
      b.cyl(0.035, 0.04, 0.95, '#efe6d6', x, 0, z, 10);
      b.cyl(0.055, 0.055, 0.02, '#e0d6c4', x, 0.7, z, 10);
      b.cone(0.04, 0.18, lead, x, 0.95, z, 10);
    }
    b.cyl(0.004, 0.004, 0.08, '#d4af37', 0, 0.76, 0, 4, { metal: 0.6 });
    return b.group;
  },
};
