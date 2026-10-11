/**
 * Build the monument GLB assets:  node scripts/models/build.mjs
 *
 * Output: public/models/monuments/<id>.glb (binary glTF 2.0, embedded flat
 * colour materials, no textures) + src/features/collectibles/models.manifest.json
 * (bytes, triangles, sha256 for cache-busting and integrity checks).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MODELS } from './monuments.mjs';
import { normalize } from './kit.mjs';

// GLTFExporter (binary) uses FileReader, which Node lacks.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); this.onload?.({ target: this }); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((r) => { this.result = `data:${blob.type};base64,${Buffer.from(r).toString('base64')}`; this.onloadend?.(); this.onload?.({ target: this }); }); }
};

/** Bake transforms and merge all meshes sharing a material: ~1 draw call per colour. */
function mergeByMaterial(group, id) {
  group.updateMatrixWorld(true);
  const byMat = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
    g.computeVertexNormals();
    (byMat.get(o.material) ?? byMat.set(o.material, []).get(o.material)).push(g);
  });
  const out = new THREE.Group();
  out.name = id;
  for (const [m, geos] of byMat) out.add(new THREE.Mesh(mergeGeometries(geos), m));
  return out;
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const outDir = path.join(root, 'public/models/monuments');
fs.mkdirSync(outDir, { recursive: true });
const exporter = new GLTFExporter();
const manifest = {};

for (const [id, build] of Object.entries(MODELS)) {
  const model = mergeByMaterial(normalize(build()), id);
  let tris = 0;
  model.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  const glb = Buffer.from(await exporter.parseAsync(model, { binary: true }));
  fs.writeFileSync(path.join(outDir, `${id}.glb`), glb);
  manifest[id] = { file: `/models/monuments/${id}.glb`, bytes: glb.length, triangles: Math.round(tris),
    // Normalized dimensions (height = 1): placement sizes models by their largest dimension.
    size: { x: +size.x.toFixed(3), y: +size.y.toFixed(3), z: +size.z.toFixed(3) }, sha256: crypto.createHash('sha256').update(glb).digest('hex').slice(0, 16) };
  console.log(id.padEnd(24), String(glb.length).padStart(7), 'bytes', String(Math.round(tris)).padStart(6), 'tris');
}
fs.writeFileSync(path.join(root, 'src/features/collectibles/models.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
