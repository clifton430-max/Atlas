/** DEV-only: every monument model side by side (visual verification of the asset pipeline). */
import { lazy, Suspense } from 'react';
import { MONUMENTS, RARITY } from '@/features/collectibles/catalog';

const ModelViewer = lazy(() => import('@/features/collectibles/three/ModelViewer'));

export function MonumentGallery() {
  // Browsers allow ~16 WebGL contexts per page: show 9 at a time (?page=0|1).
  const page = Number(new URLSearchParams(window.location.search).get('page') ?? 0);
  return (
    <main className="grid min-h-full grid-cols-5 gap-2 bg-[#efe6d2] p-3">
      {MONUMENTS.slice(page * 9, page * 9 + 9).map((m) => (
        <figure key={m.id} className="rounded-xl bg-white p-1 shadow">
          <Suspense fallback={<div className="h-40" />}>
            <ModelViewer defId={m.defId} label={m.name} glow={RARITY[m.rarity].color} autoRotate={false} className="h-40" />
          </Suspense>
          <figcaption className="text-center text-[11px]">{m.name} · {m.rarity} · {m.model.triangles} tris</figcaption>
        </figure>
      ))}
    </main>
  );
}
