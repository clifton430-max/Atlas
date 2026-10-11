/**
 * Tiny modelling kit for Atlas's ORIGINAL procedural monument miniatures.
 * Every model is composed from three.js primitives with flat-shaded, fully
 * coloured materials in a consistent "miniature diorama" style. No third-party
 * meshes or textures are used.
 */
import * as THREE from 'three';

const mats = new Map();
export function mat(color, opts = {}) {
  const key = `${color}|${opts.metal ?? 0}|${opts.rough ?? 0.85}|${opts.emissive ?? ''}`;
  if (!mats.has(key)) {
    mats.set(key, new THREE.MeshStandardMaterial({
      color, flatShading: true, metalness: opts.metal ?? 0, roughness: opts.rough ?? 0.85,
      ...(opts.emissive ? { emissive: opts.emissive, emissiveIntensity: 0.6 } : {}),
      name: `atlas-${String(color).replace('#', '')}`,
    }));
  }
  return mats.get(key);
}

export class Builder {
  constructor(name) { this.group = new THREE.Group(); this.group.name = name; }
  add(geo, color, [x = 0, y = 0, z = 0] = [], { rot = [0, 0, 0], scale, ...m } = {}) {
    const mesh = new THREE.Mesh(geo, mat(color, m));
    mesh.position.set(x, y, z);
    mesh.rotation.set(...rot);
    if (scale) mesh.scale.set(...scale);
    this.group.add(mesh);
    return mesh;
  }
  /** Box resting on y (bottom at y). */
  box(w, h, d, color, x = 0, y = 0, z = 0, o) { return this.add(new THREE.BoxGeometry(w, h, d), color, [x, y + h / 2, z], o); }
  /** Cylinder resting on y. */
  cyl(rTop, rBot, h, color, x = 0, y = 0, z = 0, seg = 16, o = {}) { return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, !!o.open), color, [x, y + h / 2, z], o); }
  cone(r, h, color, x = 0, y = 0, z = 0, seg = 16, o) { return this.add(new THREE.ConeGeometry(r, h, seg), color, [x, y + h / 2, z], o); }
  sphere(r, color, x = 0, y = 0, z = 0, o = {}) {
    const g = new THREE.SphereGeometry(r, o.seg ?? 16, o.seg ? Math.ceil(o.seg / 2) : 10, 0, Math.PI * 2, 0, o.hemi ? Math.PI / 2 : Math.PI);
    return this.add(g, color, [x, y, z], o);
  }
  /** Lathe (domes, onion domes, lotus towers) from [radius, height] points, resting on y. */
  lathe(points, color, x = 0, y = 0, z = 0, seg = 16, o) {
    return this.add(new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(r, h)), seg), color, [x, y, z], o);
  }
  /** Triangular prism (gable roofs, pediments): length along x. */
  prism(len, w, h, color, x = 0, y = 0, z = 0, o = {}) {
    const shape = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
    g.translate(0, 0, -len / 2);
    g.rotateY(Math.PI / 2);
    return this.add(g, color, [x, y, z], o);
  }
  /** Square-section beam between two points (lattice members, legs). */
  beam(from, to, t, color, o) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const len = a.distanceTo(b);
    const mesh = this.add(new THREE.BoxGeometry(t, len, t), color, [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2], o);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  }
  /** Round diorama base tile. */
  base(r, color = '#7fb069', edge = '#6b5640', h = 0.06) {
    this.cyl(r, r * 1.03, h * 0.6, edge, 0, -h, 0, 40);
    this.cyl(r, r, h * 0.4, color, 0, -h * 0.4, 0, 40);
  }
  ring(n, r, fn) { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; fn(Math.cos(a) * r, Math.sin(a) * r, a, i); } }
}

/** Onion-dome profile (Saint Basil's / Taj Mahal style). */
export const onion = (r, h) => [[0.001, 0], [r * 0.82, h * 0.05], [r, h * 0.28], [r * 0.92, h * 0.5], [r * 0.55, h * 0.72], [r * 0.18, h * 0.88], [0.001, h]];

/** Normalize to height 1, centred on x/z, resting on y=0. */
export function normalize(group) {
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const s = 1 / size.y;
  const wrap = new THREE.Group();
  wrap.name = group.name;
  group.position.set(-(box.min.x + size.x / 2), -box.min.y, -(box.min.z + size.z / 2));
  const inner = new THREE.Group();
  inner.add(group);
  inner.scale.setScalar(s);
  wrap.add(inner);
  wrap.updateMatrixWorld(true);
  return wrap;
}
