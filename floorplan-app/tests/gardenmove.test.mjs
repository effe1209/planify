/* Giardino spostato a mano (project.gardenOffset): scena 3D e viste dei render seguono lo stesso spostamento. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildHouse } from '../src/lib/scene3d.js';
import { gardenFrame } from '../src/lib/renderStudio.js';
import { gardenOffset } from '../src/lib/project.js';
import { themeFor } from '../src/lib/palette.js';

const t = 0.2;
const house = {
  scale: 50, wallThickness: 10, dimensions: { width: 10, length: 8 }, svgWidth: 500, svgHeight: 400,
  rooms: [{ id: 1, kind: 'living', name: 'S', x: 0, y: 0, w: 10, h: 8 }],
  walls: [{ x: 0, y: 0, w: 10, h: t }, { x: 0, y: 8 - t, w: 10, h: t }, { x: 0, y: 0, w: t, h: 8 }, { x: 10 - t, y: 0, w: t, h: 8 }],
  doors: [{ x: 4, y: 8 - t, w: 1, rot: 0, entrance: true }], windows: [], furniture: [],
};
const garden = { scale: 50, wallThickness: 10, dimensions: { width: 14, length: 9 }, svgWidth: 700, svgHeight: 450, rooms: [{ id: 1, kind: 'garden', name: 'Giardino', x: 0, y: 0, w: 14, h: 9 }],
  walls: [], doors: [], windows: [], furniture: [], house: { x: 2, w: 10 } };
const proj = (extra = {}) => ({ floors: [{ id: 'h', level: 0, plan: house, meta: { style: 'modern' } }, { id: 'g', level: 'out', plan: garden, meta: { type: 'garden' } }], ...extra });
const gardenPos = (p) => { let g; buildHouse(THREE, p, (f) => themeFor(p, f)).traverse((o) => { if (o.userData.floor?.level === 'out' && o.userData.floor.id === 'g' && !g) g = o; }); const v = new THREE.Vector3(); g.updateMatrixWorld(true); return g.localToWorld(v.set(0, 0, 0)); };

const base = gardenPos(proj());
const moved = gardenPos(proj({ gardenOffset: { a: 1.5, d: 2 } }));
// porta a sud: lungo la facciata = x del mondo, verso l'esterno = z del mondo
assert.ok(Math.abs(moved.x - base.x - 1.5) < 1e-6 && Math.abs(moved.z - base.z - 2) < 1e-6, `${moved.x - base.x}, ${moved.z - base.z}`);
// le viste dei render usano lo stesso riferimento
const f0 = gardenFrame(proj());
const f1 = gardenFrame(proj({ gardenOffset: { a: 1.5, d: 2 } }));
const p0 = f0.toWorld(3, 1);
const p1 = f1.toWorld(3, 1);
assert.ok(Math.abs(p1[0] - p0[0] - 1.5) < 1e-6 && Math.abs(p1[1] - p0[1] - 2) < 1e-6);
assert.deepEqual(gardenOffset({}), { a: 0, d: 0 });
assert.deepEqual(gardenOffset({ gardenOffset: { a: 'x', d: 3 } }), { a: 0, d: 3 });
// stesso spostamento su tutte le facciate: scena 3D e riferimento dei render coincidono
for (const door of [{ x: 4, y: 0, w: 1, rot: 0, entrance: true }, { x: 9.8, y: 3, w: 1, rot: 90, entrance: true }, { x: 0, y: 3, w: 1, rot: 90, entrance: true }]) {
  const mk = (extra = {}) => ({ ...proj(extra), floors: [{ id: 'h', level: 0, plan: { ...house, doors: [door] }, meta: { style: 'modern' } }, { id: 'g', level: 'out', plan: garden, meta: { type: 'garden' } }] });
  const b = gardenPos(mk());
  const m = gardenPos(mk({ gardenOffset: { a: 1.5, d: 2 } }));
  const w0 = gardenFrame(mk()).toWorld(3, 1);
  const w1 = gardenFrame(mk({ gardenOffset: { a: 1.5, d: 2 } })).toWorld(3, 1);
  assert.ok(Math.abs((m.x - b.x) - (w1[0] - w0[0])) < 1e-6 && Math.abs((m.z - b.z) - (w1[1] - w0[1])) < 1e-6, `facciata ${door.x},${door.y}`);
}
console.log('gardenmove ok');
