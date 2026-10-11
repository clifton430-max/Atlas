/**
 * Model thumbnails rendered with ONE shared offscreen WebGL renderer (browsers
 * cap the number of live WebGL contexts, so a grid of 18 live viewers would
 * break). Each model is rendered once to a PNG data URL and cached in memory.
 */
import * as THREE from 'three';
import { loadMonument } from './models';

let renderer: THREE.WebGLRenderer | null = null;
const cache = new Map<string, Promise<string>>();
const SIZE = 256;

function getRenderer() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.addEventListener('webglcontextlost', () => { renderer = null; cache.clear(); });
  }
  return renderer;
}

export function monumentThumbnail(defId: string): Promise<string> {
  let p = cache.get(defId);
  if (!p) {
    p = loadMonument(defId).then((obj) => {
      const r = getRenderer();
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight('#fff8ec', '#5b4a3a', 1.6));
      const sun = new THREE.DirectionalLight('#ffffff', 2.2);
      sun.position.set(2, 3, 1.5);
      scene.add(sun, obj);
      const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
      const sphere = new THREE.Box3().setFromObject(obj).getBoundingSphere(new THREE.Sphere());
      const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(15))) * 0.82;
      camera.position.copy(sphere.center).addScaledVector(new THREE.Vector3(1.7, 1.1, 2.1).normalize(), dist);
      camera.lookAt(sphere.center);
      r.setClearColor(0x000000, 0);
      r.render(scene, camera);
      return r.domElement.toDataURL('image/png');
    });
    p.catch(() => cache.delete(defId));
    cache.set(defId, p);
  }
  return p;
}
