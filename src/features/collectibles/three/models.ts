/**
 * Monument model loading (three.js GLTFLoader). One parsed copy per model is
 * cached; callers receive clones (geometry/materials shared, so many
 * placements cost little GPU memory). Failed loads are remembered briefly and
 * retried later; callers show a fallback instead of a broken scene.
 * This module (and three.js) is only loaded on demand.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MONUMENT_BY_DEF } from '../catalog';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D>>();
const failedAt = new Map<string, number>();
const RETRY_MS = 30_000;

export class ModelLoadError extends Error {}

export function loadMonument(defId: string): Promise<THREE.Object3D> {
  const def = MONUMENT_BY_DEF.get(defId);
  if (!def) return Promise.reject(new ModelLoadError(`Unknown monument ${defId}`));
  const failed = failedAt.get(defId);
  if (failed && Date.now() - failed < RETRY_MS) return Promise.reject(new ModelLoadError('Model failed to load recently'));
  let p = cache.get(defId);
  if (!p) {
    // The content hash in the query string busts HTTP caches when a model changes.
    p = loader.loadAsync(`${def.model.file}?v=${def.model.version}`).then((g) => g.scene).catch((e: unknown) => {
      cache.delete(defId);
      failedAt.set(defId, Date.now());
      throw new ModelLoadError(e instanceof Error ? e.message : 'Model failed to load');
    });
    cache.set(defId, p);
  }
  return p.then((scene) => scene.clone(true));
}

/** Make every material of a clone translucent (placement ghost) without touching the shared ones. */
export function ghostify(obj: THREE.Object3D, opacity = 0.55) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
      const c = (m as THREE.Material).clone();
      c.transparent = true;
      c.opacity = opacity;
      c.depthWrite = false;
      return c;
    });
    mesh.material = Array.isArray(mesh.material) ? mats : mats[0];
  });
}
