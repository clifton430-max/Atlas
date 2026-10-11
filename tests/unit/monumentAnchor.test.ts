import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as maplibregl from 'maplibre-gl';
import { placementMatrix } from '@/features/collectibles/three/MonumentLayer';
import { MONUMENT_BY_DEF } from '@/features/collectibles/catalog';

const at = (lng: number, lat: number) => maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0);

describe('3D monument geographic anchoring', () => {
  const p = { id: 'x', defId: 'monument:eiffel-tower', latitude: 48.8583, longitude: 2.29448, rotationDeg: 0, scale: 1 };
  const def = MONUMENT_BY_DEF.get(p.defId)!;

  it('the model base sits exactly on its coordinate', () => {
    const base = new THREE.Vector3(0, 0, 0).applyMatrix4(placementMatrix(p));
    const mc = at(p.longitude, p.latitude);
    expect(base.x).toBeCloseTo(mc.x, 12);
    expect(base.y).toBeCloseTo(mc.y, 12);
    expect(base.z).toBeCloseTo(0, 12);
  });

  it('model "up" becomes altitude, with the real height in metres', () => {
    const top = new THREE.Vector3(0, 1, 0).applyMatrix4(placementMatrix(p));
    const metres = top.z / at(p.longitude, p.latitude).meterInMercatorCoordinateUnits();
    expect(metres).toBeCloseTo(def.heightMeters, 3);
    const doubled = new THREE.Vector3(0, 1, 0).applyMatrix4(placementMatrix({ ...p, scale: 2 }));
    expect(doubled.z / at(p.longitude, p.latitude).meterInMercatorCoordinateUnits()).toBeCloseTo(def.heightMeters * 2, 3);
  });

  it('rotation turns the model around its own base (anchor never moves)', () => {
    for (const rotationDeg of [0, 90, 215]) {
      const m = placementMatrix({ ...p, rotationDeg });
      const base = new THREE.Vector3().applyMatrix4(m);
      const mc = at(p.longitude, p.latitude);
      expect(base.x).toBeCloseTo(mc.x, 12);
      const east = new THREE.Vector3(1, 0, 0).applyMatrix4(m).sub(base);
      expect(Math.hypot(east.x, east.y)).toBeGreaterThan(0);
      expect(east.z).toBeCloseTo(0, 12); // stays level
    }
    const a = new THREE.Vector3(1, 0, 0).applyMatrix4(placementMatrix({ ...p, rotationDeg: 0 }));
    const b = new THREE.Vector3(1, 0, 0).applyMatrix4(placementMatrix({ ...p, rotationDeg: 90 }));
    expect(a.distanceTo(b)).toBeGreaterThan(0);
  });
});
