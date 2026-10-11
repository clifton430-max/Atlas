/**
 * MapLibre custom layer that draws placed 3D monuments at their real
 * geographic positions (three.js on the map's own WebGL context).
 *
 * - Anchoring: each placement's model matrix (mercator translation, metres ->
 *   mercator scale, glTF Y-up -> map Z-up, heading) is multiplied into the
 *   projection matrix on the CPU in double precision, then drawn — so models
 *   stay fixed to their coordinates while the map pans, zooms, rotates and
 *   tilts, without float32 jitter.
 * - Depth: renderingMode "3d" shares the depth buffer with the 3D buildings,
 *   so real buildings and monuments occlude each other correctly.
 * - Performance: models are cached and cloned (shared geometry/materials);
 *   at most 100 placements per map (DB limit); nothing renders below zoom 12.
 * - Lifecycle: survives style changes (re-added on style.load by the owner),
 *   disposes its renderer on removal, and recovers from context loss.
 */
import * as THREE from 'three';
import * as maplibregl from 'maplibre-gl';
import { MONUMENT_BY_DEF } from '../catalog';
import { ghostify, loadMonument } from './models';

export interface LayerPlacement { id: string; defId: string; latitude: number; longitude: number; rotationDeg: number; scale: number }
interface Item { key: string; placement: LayerPlacement; scene: THREE.Scene | null; matrix: THREE.Matrix4; ghost: boolean; failed: boolean }

export const MONUMENT_LAYER_ID = 'atlas-monuments';
const MIN_ZOOM = 12;

function lights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight('#fff8ec', '#6b5a48', 1.5));
  const sun = new THREE.DirectionalLight('#ffffff', 2.0);
  sun.position.set(0.4, -0.6, 1); // map space: z is up
  scene.add(sun);
}

export function placementMatrix(p: LayerPlacement): THREE.Matrix4 {
  const def = MONUMENT_BY_DEF.get(p.defId);
  const mc = maplibregl.MercatorCoordinate.fromLngLat([p.longitude, p.latitude], 0);
  const s = mc.meterInMercatorCoordinateUnits() * (def?.heightMeters ?? 80) * p.scale;
  return new THREE.Matrix4()
    .makeTranslation(mc.x, mc.y, mc.z)
    .multiply(new THREE.Matrix4().makeScale(s, -s, s))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
    .multiply(new THREE.Matrix4().makeRotationY(-THREE.MathUtils.degToRad(p.rotationDeg)));
}

export class MonumentLayer implements maplibregl.CustomLayerInterface {
  readonly id = MONUMENT_LAYER_ID;
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;
  private map: maplibregl.Map | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private camera = new THREE.Camera();
  private items = new Map<string, Item>();
  /** Called when a model fails to load (so the UI can say so). */
  onError?: (defId: string) => void;

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  onRemove() {
    for (const it of this.items.values()) this.disposeItem(it);
    this.items.clear();
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
  }

  /** Replace the set of rendered placements (ghost = translucent placement preview). */
  setPlacements(list: LayerPlacement[], ghost?: LayerPlacement | null) {
    const wanted = new Map<string, { p: LayerPlacement; ghost: boolean }>();
    for (const p of list) wanted.set(p.id, { p, ghost: false });
    if (ghost) wanted.set(`ghost:${ghost.defId}`, { p: ghost, ghost: true });
    for (const [key, it] of this.items) if (!wanted.has(key)) { this.disposeItem(it); this.items.delete(key); }
    for (const [key, { p, ghost: g }] of wanted) {
      const existing = this.items.get(key);
      if (existing && existing.placement.defId === p.defId && existing.ghost === g) {
        existing.placement = p;
        existing.matrix = placementMatrix(p);
        continue;
      }
      if (existing) this.disposeItem(existing);
      const item: Item = { key, placement: p, scene: null, matrix: placementMatrix(p), ghost: g, failed: false };
      this.items.set(key, item);
      loadMonument(p.defId).then((obj) => {
        if (this.items.get(key) !== item) return;
        if (g) ghostify(obj);
        const scene = new THREE.Scene();
        lights(scene);
        scene.add(obj);
        item.scene = scene;
        this.map?.triggerRepaint();
      }).catch(() => { item.failed = true; this.onError?.(p.defId); });
    }
    this.map?.triggerRepaint();
  }

  private disposeItem(it: Item) {
    // Geometry/materials are shared with the model cache; only ghost materials are ours.
    if (it.ghost) it.scene?.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
    });
    it.scene = null;
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: maplibregl.CustomRenderMethodInput) {
    if (!this.renderer || !this.map || this.map.getZoom() < MIN_ZOOM) return;
    const main = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]);
    this.renderer.resetState();
    for (const it of this.items.values()) {
      if (!it.scene) continue;
      this.camera.projectionMatrix.copy(main).multiply(it.matrix);
      this.renderer.render(it.scene, this.camera);
    }
  }

  /** Screen-space hit test: the placement whose model covers the point, if any. */
  hitTest(point: { x: number; y: number }): LayerPlacement | null {
    const map = this.map;
    if (!map || map.getZoom() < MIN_ZOOM) return null;
    let best: { p: LayerPlacement; d: number } | null = null;
    for (const it of this.items.values()) {
      if (it.ghost) continue;
      const p = it.placement;
      const base = map.project([p.longitude, p.latitude]);
      const mpp = (40_075_016.686 * Math.cos((p.latitude * Math.PI) / 180)) / (512 * 2 ** map.getZoom());
      const def = MONUMENT_BY_DEF.get(p.defId);
      const h = ((def?.heightMeters ?? 80) * p.scale) / mpp;
      const w = Math.max(24, ((def?.sizeMeters ?? 80) * p.scale) / mpp);
      const inside = point.x > base.x - w / 2 && point.x < base.x + w / 2 && point.y < base.y + 8 && point.y > base.y - h * Math.cos((map.getPitch() * Math.PI) / 180) - 8;
      const d = Math.hypot(point.x - base.x, point.y - base.y);
      if (inside && (!best || d < best.d)) best = { p, d };
    }
    return best?.p ?? null;
  }
}
