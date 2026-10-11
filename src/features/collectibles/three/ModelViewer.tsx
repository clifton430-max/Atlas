/**
 * Interactive 3D preview of a monument model (drag to rotate, scroll/pinch to
 * zoom; arrow keys rotate when focused). Gentle auto-rotation is disabled
 * under prefers-reduced-motion. Handles WebGL context loss/restore, failed
 * model loads (with retry) and cleans up all GPU resources on unmount.
 * Lazy-loaded (three.js is not in the main bundle).
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadMonument } from './models';

export default function ModelViewer({ defId, label, glow, autoRotate = true, className }: {
  defId: string;
  label: string;
  /** Rarity colour for the stage light / rim. */
  glow?: string;
  autoRotate?: boolean;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'lost'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
    } catch {
      setState('error');
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
    camera.position.set(1.7, 1.25, 2.1);
    scene.add(new THREE.HemisphereLight('#fff8ec', '#5b4a3a', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2);
    sun.position.set(2, 3, 1.5);
    scene.add(sun);
    if (glow) { const rim = new THREE.PointLight(glow, 3, 6); rim.position.set(-1.5, 1.2, -1.2); scene.add(rim); }
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.42, 0);
    controls.enableDamping = !reduce;
    controls.autoRotate = autoRotate && !reduce;
    controls.autoRotateSpeed = 1.6;
    controls.minDistance = 1.2;
    controls.maxDistance = 5;
    controls.enablePan = false;

    const resize = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf = 0;
    let alive = true;
    const loop = () => { if (!alive) return; controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    const onLost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(raf); setState('lost'); };
    const onRestored = () => setAttempt((a) => a + 1); // rebuild everything
    renderer.domElement.addEventListener('webglcontextlost', onLost);
    renderer.domElement.addEventListener('webglcontextrestored', onRestored);

    let model: THREE.Object3D | null = null;
    setState('loading');
    loadMonument(defId).then((obj) => {
      if (!alive) return;
      model = obj;
      scene.add(obj);
      // Frame the whole model (wide monuments like the Colosseum included).
      const sphere = new THREE.Box3().setFromObject(obj).getBoundingSphere(new THREE.Sphere());
      const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 0.86;
      const dir = new THREE.Vector3(1.7, 1.1, 2.1).normalize();
      controls.target.copy(sphere.center);
      camera.position.copy(sphere.center).addScaledVector(dir, dist);
      controls.minDistance = dist * 0.45;
      controls.maxDistance = dist * 2.5;
      controls.update();
      setState('ready');
      loop();
    }).catch(() => alive && setState('error'));

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onRestored);
      if (model) scene.remove(model); // shared geometry/materials stay cached for other views
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [defId, glow, autoRotate, attempt]);

  return (
    <div className={className} role="img" aria-label={`${label} — interactive 3D model. Drag to rotate.`} data-testid="model-viewer" data-state={state}>
      <div ref={host} className="relative size-full">
        {state === 'loading' && <p className="absolute inset-0 grid place-items-center text-xs text-neutral-500">Loading 3D model…</p>}
        {(state === 'error' || state === 'lost') && (
          <div className="absolute inset-0 grid place-items-center p-3 text-center text-xs text-neutral-600">
            <div>
              <p>{state === 'lost' ? 'The 3D view was interrupted by the graphics driver.' : 'This 3D model couldn’t be loaded.'}</p>
              <button type="button" className="mt-1 underline" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
