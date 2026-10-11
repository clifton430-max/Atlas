/**
 * Expansion set (catalog v2): 11 more public-domain landmarks, 5 ORIGINAL
 * fantasy monuments (fictional — invented for Atlas, never placed as real
 * places), and the single Celestial-tier reward, the Farnese Atlas (an
 * ancient Roman marble, public domain). Same diorama style and kit as
 * monuments.mjs; simplified and stylised, not survey-accurate.
 */
import * as THREE from 'three';
import { Builder, onion } from './kit.mjs';

const PI = Math.PI;

export const MODELS_V2 = {
  // ------------------------------------------------------------------ Common
  'great-torii'() {
    const b = new Builder('great-torii');
    b.box(2.0, 0.05, 1.6, '#4b8fbf', 0, -0.06, 0); // sea at high tide
    b.box(2.0, 0.02, 1.6, '#6fb0d8', 0, -0.015, 0, { rough: 0.3 });
    const red = '#d3412b', black = '#222';
    for (const x of [-0.45, 0.45]) {
      b.cyl(0.06, 0.07, 0.95, red, x, 0, 0, 14);
      for (const z of [-0.22, 0.22]) b.cyl(0.035, 0.04, 0.65, red, x, 0, z, 10); // supporting legs
      b.box(0.06, 0.04, 0.5, red, x, 0.32, 0);
      b.cyl(0.075, 0.075, 0.06, black, x, 0, 0, 14);
    }
    b.box(1.18, 0.07, 0.11, red, 0, 0.68, 0); // nuki
    b.box(0.08, 0.16, 0.08, red, 0, 0.75, 0); // gakuzuka
    b.box(1.45, 0.07, 0.16, red, 0, 0.9, 0); // shimaki
    const kasagi = b.box(1.62, 0.07, 0.2, black, 0, 0.97, 0);
    kasagi.scale.set(1, 1, 1);
    for (const s of [-1, 1]) b.box(0.18, 0.06, 0.2, black, s * 0.82, 1.0, 0, { rot: [0, 0, s * 0.25] }); // upswept ends
    return b.group;
  },
  'kinderdijk-windmills'() {
    const b = new Builder('kinderdijk-windmills');
    b.box(2.6, 0.04, 1.4, '#7fb069', 0, -0.05, 0);
    b.box(2.6, 0.03, 0.3, '#4da3d8', 0, -0.02, 0.15, { rough: 0.3 }); // canal
    const mill = (x, z, rot) => {
      b.cyl(0.13, 0.2, 0.55, '#5d4a3a', x, 0, z, 8);
      b.cone(0.15, 0.16, '#3b3028', x, 0.55, z, 8);
      const hub = [x + Math.sin(rot) * 0.16, 0.6, z + Math.cos(rot) * 0.16];
      for (let i = 0; i < 4; i++) {
        const a = i * PI / 2 + 0.3;
        const tip = [hub[0] + Math.cos(rot) * Math.cos(a) * 0.42, hub[1] + Math.sin(a) * 0.42, hub[2] - Math.sin(rot) * Math.cos(a) * 0.42];
        b.beam(hub, tip, 0.02, '#2b2622');
        const mid = [(hub[0] + tip[0]) / 2, (hub[1] + tip[1]) / 2, (hub[2] + tip[2]) / 2];
        b.box(0.07, 0.3, 0.008, '#efe6d6', ...mid, { rot: [0, rot, a - PI / 2] });
      }
    };
    mill(-0.8, -0.35, 0.3); mill(0, -0.4, 0.3); mill(0.8, -0.35, 0.3);
    return b.group;
  },
  'wayfinders-cairn'() {
    const b = new Builder('wayfinders-cairn');
    b.base(0.9, '#9cc47a', '#6b5640');
    const stones = ['#8f8a80', '#a39d92', '#7c776e', '#b3ada2'];
    let y = 0;
    [0.5, 0.42, 0.34, 0.27, 0.2, 0.14].forEach((r, i) => {
      b.sphere(r, stones[i % 4], (i % 2 ? 0.03 : -0.03), y + r * 0.45, 0, { scale: [1, 0.45, 0.9], seg: 10 });
      y += r * 0.82;
    });
    // A brass wayfinding compass on top and lanterns pointing the four ways (fictional).
    b.cyl(0.12, 0.12, 0.03, '#c9a227', 0, y + 0.02, 0, 16, { metal: 0.6, rough: 0.35 });
    b.cone(0.03, 0.14, '#d64532', 0, y + 0.05, 0.05, 4, { rot: [PI / 2, 0, 0] });
    b.ring(4, 0.65, (x, z) => { b.cyl(0.015, 0.015, 0.35, '#5c4228', x, 0, z, 6); b.sphere(0.05, '#ffd27a', x, 0.4, z, { emissive: '#ffb84d' }); });
    return b.group;
  },
  // --------------------------------------------------------------- Uncommon
  'brandenburg-gate'() {
    const b = new Builder('brandenburg-gate');
    b.base(1.2, '#cfc6b4', '#8a7f6c');
    const s = '#e9dfc8', d = '#d8ccb0';
    b.box(1.7, 0.06, 0.55, d, 0, 0, 0);
    for (let i = 0; i < 6; i++) for (const z of [-0.18, 0.18]) b.cyl(0.045, 0.05, 0.55, s, -0.75 + i * 0.3, 0.06, z, 12);
    for (let i = 0; i < 5; i++) b.box(0.08, 0.55, 0.42, d, -0.6 + i * 0.3, 0.06, 0); // walls between passages
    b.box(1.76, 0.14, 0.58, s, 0, 0.61, 0); // entablature
    b.box(0.9, 0.12, 0.4, s, 0, 0.75, 0); // attic
    // Quadriga (simplified): chariot and four horses in verdigris.
    const g = '#5e9c8a';
    b.box(0.12, 0.08, 0.1, g, 0, 0.87, -0.04);
    for (let i = 0; i < 4; i++) { b.box(0.05, 0.08, 0.18, g, -0.12 + i * 0.08, 0.87, 0.1); b.box(0.04, 0.06, 0.05, g, -0.12 + i * 0.08, 0.95, 0.19); }
    b.cyl(0.015, 0.015, 0.16, g, 0, 0.95, -0.04, 6); b.sphere(0.03, g, 0, 1.12, -0.04);
    return b.group;
  },
  'tower-of-hercules'() {
    const b = new Builder('tower-of-hercules');
    b.cone(1.2, 0.3, '#7d9a5a', 0, -0.05, 0, 12); // headland
    b.box(2.4, 0.03, 2.4, '#4b8fbf', 0, -0.08, 0);
    const stone = '#cdbf9f', dark = '#b2a383';
    b.box(0.42, 0.8, 0.42, stone, 0, 0.22, 0);
    for (let i = 0; i < 6; i++) b.box(0.43, 0.02, 0.43, dark, 0, 0.32 + i * 0.12, 0, { rot: [0, (i % 2) * 0.05, 0] }); // ramp bands
    b.box(0.3, 0.18, 0.3, stone, 0, 1.02, 0);
    b.cyl(0.11, 0.13, 0.16, stone, 0, 1.2, 0, 8);
    b.sphere(0.07, '#ffe39a', 0, 1.42, 0, { emissive: '#ffcf5a' });
    b.cone(0.12, 0.08, '#8a6f4f', 0, 1.36, 0, 8);
    return b.group;
  },
  'lantern-lighthouse'() {
    const b = new Builder('lantern-lighthouse');
    b.box(2.2, 0.04, 2.2, '#3f7fb0', 0, -0.06, 0);
    b.cone(0.8, 0.28, '#7a7266', 0, -0.04, 0, 9); // rocks
    for (let i = 0; i < 6; i++) b.cyl(0.22 - i * 0.02, 0.24 - i * 0.02, 0.17, i % 2 ? '#f4f1ea' : '#d64532', 0, 0.22 + i * 0.17, 0, 16);
    b.cyl(0.2, 0.2, 0.03, '#2b2b2b', 0, 1.24, 0, 16);
    // A cluster of floating paper lanterns around the light (fictional).
    b.cyl(0.13, 0.13, 0.18, '#ffd27a', 0, 1.27, 0, 12, { emissive: '#ffb84d' });
    b.cone(0.17, 0.14, '#2b2b2b', 0, 1.45, 0, 12);
    b.ring(5, 0.45, (x, z, a, i) => b.cyl(0.05, 0.05, 0.08, ['#ff9f43', '#ffd27a', '#ff6b6b'][i % 3], x, 1.0 + (i % 3) * 0.15, z, 8, { emissive: '#ff9f43' }));
    return b.group;
  },
  // ------------------------------------------------------------------- Rare
  'golden-gate-bridge'() {
    const b = new Builder('golden-gate-bridge');
    b.box(3.2, 0.03, 1.4, '#3f7fb0', 0, -0.05, 0);
    const io = '#c0362c';
    b.box(3.2, 0.04, 0.16, io, 0, 0.25, 0); // deck
    for (const x of [-0.75, 0.75]) {
      for (const z of [-0.07, 0.07]) b.box(0.07, 0.95, 0.06, io, x, 0, z);
      for (const y of [0.4, 0.62, 0.84]) b.box(0.07, 0.05, 0.2, io, x, y, 0);
      b.box(0.12, 0.08, 0.22, '#9a9a9a', x, -0.03, 0); // piers
    }
    // Main cables: a sagging curve between towers and down to the anchorages.
    for (const z of [-0.08, 0.08]) {
      const pts = [];
      for (let i = 0; i <= 20; i++) { const x = -0.75 + i * 0.075; const t = (x / 0.75); pts.push([x, 0.3 + 0.62 * t * t, z]); }
      for (let i = 0; i < 20; i++) b.beam(pts[i], pts[i + 1], 0.018, io);
      for (const s of [-1, 1]) b.beam([s * 0.75, 0.92, z], [s * 1.55, 0.27, z], 0.018, io);
      for (let i = 1; i < 20; i += 2) b.beam([pts[i][0], 0.27, z], pts[i], 0.006, io); // suspenders
    }
    return b.group;
  },
  'himeji-castle'() {
    const b = new Builder('himeji-castle');
    b.base(1.1, '#8fbf6a');
    b.box(1.1, 0.25, 0.9, '#8d8a83', 0, 0, 0, { scale: [1, 1, 1] }); // stone base
    const white = '#f4f1ea', roof = '#5f6f78';
    const tier = (w, d, y, h) => {
      b.box(w, h, d, white, 0, y, 0);
      b.box(w + 0.16, 0.04, d + 0.16, roof, 0, y + h, 0);
      b.prism(w * 0.6, d + 0.1, 0.1, roof, 0, y + h + 0.04, 0);
    };
    tier(0.9, 0.72, 0.25, 0.16); tier(0.75, 0.6, 0.45, 0.14); tier(0.6, 0.48, 0.63, 0.13); tier(0.45, 0.36, 0.8, 0.12); tier(0.3, 0.26, 0.96, 0.11);
    for (const s of [-1, 1]) b.box(0.05, 0.05, 0.05, '#d4af37', s * 0.16, 1.17, 0, { metal: 0.5 }); // shachihoko
    return b.group;
  },
  'floating-observatory'() {
    const b = new Builder('floating-observatory');
    // A fictional island observatory hovering above a mirror pool.
    b.base(0.9, '#8fbf6a');
    b.cyl(0.55, 0.55, 0.02, '#7fc3e8', 0, 0, 0, 32, { rough: 0.2 });
    b.cone(0.55, 0.45, '#7a6a58', 0, 0.25, 0, 10, { rot: [PI, 0, 0] }); // inverted rock island
    b.cyl(0.56, 0.56, 0.07, '#8fbf6a', 0, 0.7, 0, 16);
    b.cyl(0.24, 0.26, 0.3, '#efe6d6', 0, 0.77, 0, 16);
    b.sphere(0.26, '#3b6ea5', 0, 1.07, 0, { hemi: true, seg: 20, metal: 0.4, rough: 0.4 });
    b.box(0.08, 0.06, 0.3, '#1f2a36', 0, 1.18, 0.05, { rot: [0.6, 0, 0] }); // telescope slit/tube
    b.ring(6, 0.42, (x, z) => b.sphere(0.035, '#c9e8ff', x, 0.55, z, { emissive: '#9fd6ff' })); // floating crystals
    return b.group;
  },
  // ------------------------------------------------------------------- Epic
  'temple-of-heaven'() {
    const b = new Builder('temple-of-heaven');
    b.base(1.2, '#cfc6b4', '#8a7f6c');
    for (let i = 0; i < 3; i++) b.cyl(0.95 - i * 0.15, 0.95 - i * 0.15, 0.08, '#f4f1ea', 0, i * 0.08, 0, 32); // marble terraces
    const blue = '#1f4e8c', red = '#b03a2e', gold = '#d4af37';
    let y = 0.24;
    [[0.42, 0.2, 0.62], [0.34, 0.16, 0.5], [0.26, 0.14, 0.38]].forEach(([r, h, roofR]) => {
      b.cyl(r, r, h, red, 0, y, 0, 24);
      b.cone(roofR, 0.12, blue, 0, y + h, 0, 32);
      y += h + 0.06;
    });
    b.lathe(onion(0.07, 0.18), gold, 0, y + 0.06, 0, 12, { metal: 0.6, rough: 0.35 });
    return b.group;
  },
  'notre-dame'() {
    const b = new Builder('notre-dame');
    b.base(1.3, '#c9c1b2', '#7a6f60');
    const s = '#d8ccb2', d = '#c3b597', roof = '#5d6a73';
    b.box(0.7, 0.75, 0.32, s, 0, 0, 0.7); // west facade
    for (const x of [-0.24, 0.24]) b.box(0.22, 0.32, 0.26, s, x, 0.75, 0.7); // twin towers
    b.cyl(0.11, 0.11, 0.02, '#8a3b5c', 0, 0.48, 0.865, 20, { rot: [PI / 2, 0, 0] }); // rose window
    for (const x of [-0.2, 0, 0.2]) b.box(0.12, 0.18, 0.02, '#5a4a3a', x, 0, 0.865); // portals
    b.box(0.5, 0.5, 1.3, d, 0, 0, -0.1); // nave
    b.prism(1.3, 0.56, 0.24, roof, 0, 0.5, -0.1);
    b.box(1.1, 0.42, 0.3, d, 0, 0, -0.15); // transept
    b.prism(1.1, 0.34, 0.2, roof, 0, 0.42, -0.15, { rot: [0, PI / 2, 0] });
    b.cone(0.05, 0.42, roof, 0, 0.62, -0.15, 8); // spire
    for (const s2 of [-1, 1]) for (let i = 0; i < 4; i++) b.beam([s2 * 0.25, 0.42, -0.5 + i * 0.25], [s2 * 0.52, 0.12, -0.5 + i * 0.25], 0.03, d); // flying buttresses
    return b.group;
  },
  'clockwork-compass'() {
    const b = new Builder('clockwork-compass');
    // A fictional brass clockwork tower whose giant compass rose turns toward discoveries.
    b.base(0.9, '#c9c1b2', '#6b5640');
    const brass = '#c9a227', copper = '#b87333', iron = '#4a4a4a';
    b.cyl(0.32, 0.4, 0.6, copper, 0, 0, 0, 8, { metal: 0.5, rough: 0.4 });
    b.cyl(0.26, 0.3, 0.3, brass, 0, 0.6, 0, 8, { metal: 0.6, rough: 0.35 });
    b.add(new THREE.TorusGeometry(0.42, 0.03, 8, 32), brass, [0, 1.1, 0], { metal: 0.6, rough: 0.35 });
    b.cyl(0.38, 0.38, 0.02, '#f4ecd8', 0, 1.09, 0, 32, { rot: [PI / 2, 0, 0] });
    for (let i = 0; i < 4; i++) b.cone(0.05, 0.34, i === 0 ? '#d64532' : iron, Math.sin(i * PI / 2) * 0.17, 1.1 + Math.cos(i * PI / 2) * 0.17 - 0.17, 0.02, 3, { rot: [0, 0, -i * PI / 2] });
    b.ring(8, 0.3, (x, z) => b.add(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 10), brass, [x, 0.3, z], { rot: [PI / 2, 0, 0], metal: 0.6 })); // gears
    b.cone(0.28, 0.3, copper, 0, 0.9, 0, 8, { metal: 0.5 });
    return b.group;
  },
  // -------------------------------------------------------------- Legendary
  'great-sphinx'() {
    const b = new Builder('great-sphinx');
    b.base(1.5, '#e2c27a', '#b08d4c');
    const s = '#d8b978', d = '#c4a463';
    b.box(1.4, 0.3, 0.45, s, -0.1, 0, 0); // body
    b.box(0.5, 0.12, 0.14, d, 0.85, 0, 0.13); // paws
    b.box(0.5, 0.12, 0.14, d, 0.85, 0, -0.13);
    b.box(0.32, 0.38, 0.4, s, 0.5, 0.2, 0); // head + nemes
    b.prism(0.3, 0.42, 0.14, d, 0.5, 0.58, 0, { rot: [0, PI / 2, 0] });
    b.box(0.08, 0.16, 0.2, d, 0.68, 0.32, 0); // face
    b.box(0.6, 0.18, 0.5, '#c9a866', -0.95, 0, 0); // rear haunch
    return b.group;
  },
  'potala-palace'() {
    const b = new Builder('potala-palace');
    b.cone(1.5, 0.5, '#8a7a5c', 0, -0.05, 0, 12, { scale: [1, 1, 0.6] }); // Marpo Ri
    const white = '#f4f1ea', red = '#8f2a2a', gold = '#d4af37';
    b.box(2.0, 0.35, 0.5, white, 0, 0.35, 0.05); // White Palace wings
    b.box(0.8, 0.55, 0.45, red, 0, 0.45, 0.08); // Red Palace
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) b.box(0.06, 0.08, 0.01, '#3a2a22', -0.75 + c * 0.3, 0.42 + r * 0.07, 0.31); // windows
    b.box(0.82, 0.04, 0.47, '#5a1e1e', 0, 1.0, 0.08);
    for (const x of [-0.25, 0, 0.25]) b.prism(0.16, 0.18, 0.1, gold, x, 1.04, 0.08, { metal: 0.6, rough: 0.35 });
    return b.group;
  },
  'skyward-harbour'() {
    const b = new Builder('skyward-harbour');
    // A fictional airship harbour: a lighthouse spire with moored airships.
    b.base(1.1, '#8fbf6a');
    b.cyl(0.18, 0.28, 1.0, '#efe6d6', 0, 0, 0, 10);
    for (let i = 0; i < 3; i++) b.cyl(0.6 - i * 0.12, 0.6 - i * 0.12, 0.03, '#8a6f4f', 0, 0.35 + i * 0.3, 0, 16); // mooring rings
    b.sphere(0.14, '#ffd27a', 0, 1.1, 0, { emissive: '#ffb84d' });
    b.cone(0.16, 0.22, '#3b6ea5', 0, 1.18, 0, 10);
    const ship = (x, y, z, rot, color) => {
      b.sphere(0.12, color, x, y, z, { scale: [2.6, 1, 1], rot: [0, rot, 0], seg: 14 });
      b.box(0.16, 0.05, 0.07, '#5c4228', x, y - 0.15, z, { rot: [0, rot, 0] });
      b.beam([x, y - 0.1, z], [x * 0.25, 0.4, z * 0.25], 0.006, '#3a3a3a');
    };
    ship(0.62, 0.62, 0.1, 0.2, '#d64532'); ship(-0.55, 0.85, -0.25, -0.6, '#2f6fea'); ship(0.1, 0.42, -0.62, 1.4, '#f5c518');
    return b.group;
  },
  // ----------------------------------------------------------------- Mythic
  borobudur() {
    const b = new Builder('borobudur');
    b.base(1.5, '#7fb069');
    const stone = '#8c8578', dark = '#77706a';
    for (let i = 0; i < 6; i++) b.box(2.2 - i * 0.3, 0.1, 2.2 - i * 0.3, i % 2 ? dark : stone, 0, i * 0.1, 0); // square terraces
    for (let i = 0; i < 3; i++) {
      const r = 0.62 - i * 0.16, y = 0.6 + i * 0.08;
      b.cyl(r + 0.05, r + 0.05, 0.08, stone, 0, y, 0, 32);
      b.ring(10 - i * 2, r, (x, z) => b.lathe([[0.001, 0], [0.05, 0.01], [0.05, 0.05], [0.035, 0.08], [0.001, 0.12]], dark, x, y + 0.08, z, 8)); // stupas
    }
    b.lathe(onion(0.18, 0.32), stone, 0, 0.84, 0, 16);
    b.cyl(0.01, 0.02, 0.15, dark, 0, 1.14, 0, 6);
    return b.group;
  },
  'crystal-spire'() {
    const b = new Builder('crystal-spire');
    // Fictional: the Cartographers' Crystal Spire, glowing with charted routes.
    b.base(1.0, '#3f5a7a', '#2b3a4f');
    const crystal = (x, z, h, r, color) => b.cone(r, h, color, x, 0, z, 6, { metal: 0.2, rough: 0.15, emissive: color });
    crystal(0, 0, 1.6, 0.22, '#7fd1ff');
    crystal(0.28, 0.1, 0.9, 0.13, '#a98bff');
    crystal(-0.25, -0.12, 1.0, 0.14, '#6fe3c2');
    crystal(-0.1, 0.3, 0.6, 0.1, '#ffd27a');
    crystal(0.15, -0.3, 0.7, 0.11, '#7fd1ff');
    b.add(new THREE.TorusGeometry(0.5, 0.012, 6, 40), '#ffd27a', [0, 0.7, 0], { rot: [PI / 2.4, 0, 0.3], emissive: '#ffb84d' });
    b.add(new THREE.TorusGeometry(0.42, 0.01, 6, 40), '#ffffff', [0, 1.0, 0], { rot: [PI / 2, 0.5, 0], emissive: '#c9e8ff' });
    return b.group;
  },
  // -------------------------------------------------------------- Celestial
  'farnese-atlas'() {
    const b = new Builder('farnese-atlas');
    // Atlas kneeling and holding up the celestial globe (ancient Roman marble,
    // Naples). Stylised: marble figure, star-chart sphere with gilded bands.
    b.cyl(0.55, 0.6, 0.12, '#e9e4da', 0, 0, 0, 8); // plinth
    b.cyl(0.5, 0.5, 0.04, '#d4af37', 0, 0.12, 0, 8, { metal: 0.7, rough: 0.3 });
    const marble = '#efe9df';
    b.box(0.12, 0.08, 0.34, marble, -0.08, 0.16, 0.05); // kneeling leg
    b.box(0.1, 0.24, 0.1, marble, 0.1, 0.16, -0.06, { rot: [0.3, 0, 0] }); // other leg
    b.box(0.22, 0.3, 0.16, marble, 0, 0.32, 0, { rot: [0.25, 0, 0] }); // torso (leaning forward)
    b.sphere(0.06, marble, 0, 0.67, 0.08); // head, bowed
    b.beam([-0.12, 0.58, 0], [-0.2, 0.86, -0.04], 0.05, marble); // raised arms
    b.beam([0.12, 0.58, 0], [0.2, 0.86, -0.04], 0.05, marble);
    // Celestial globe with constellation dots and the zodiac band.
    b.sphere(0.34, '#1d2b5a', 0, 1.18, -0.04, { seg: 28, metal: 0.2, rough: 0.5 });
    b.add(new THREE.TorusGeometry(0.35, 0.012, 6, 48), '#d4af37', [0, 1.18, -0.04], { rot: [PI / 2 - 0.41, 0, 0], metal: 0.8, rough: 0.25 });
    b.add(new THREE.TorusGeometry(0.35, 0.008, 6, 48), '#d4af37', [0, 1.18, -0.04], { rot: [0, 0, 0], metal: 0.8, rough: 0.25 });
    for (let i = 0; i < 26; i++) {
      const t = i * 2.399963, y = 1 - (i / 25) * 2, r = Math.sqrt(1 - y * y);
      b.sphere(0.014, '#fff4c2', Math.cos(t) * r * 0.345, 1.18 + y * 0.345, -0.04 + Math.sin(t) * r * 0.345, { seg: 6, emissive: '#ffe08a' });
    }
    return b.group;
  },
};
