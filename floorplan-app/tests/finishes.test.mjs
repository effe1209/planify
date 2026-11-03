/* Colore e materiale per locale e per muro (room.look, plan.wallLooks). */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildScene } from '../src/lib/scene3d.js';
import { THEMES } from '../src/lib/themes.js';

const t = 0.2;
const plan = (extra = {}, rextra = {}) => ({
  scale: 50, wallThickness: t * 50, dimensions: { width: 8, length: 4 },
  rooms: [{ id: 1, kind: 'living', name: 'A', x: 0, y: 0, w: 4, h: 4, ...rextra }, { id: 2, kind: 'bed', name: 'B', x: 4, y: 0, w: 4, h: 4 }],
  walls: [{ x: -t / 2, y: -t / 2, w: 8 + t, h: t }, { x: -t / 2, y: 4 - t / 2, w: 8 + t, h: t }, { x: -t / 2, y: -t / 2, w: t, h: 4 + t }, { x: 8 - t / 2, y: -t / 2, w: t, h: 4 + t }, { x: 4 - t / 2, y: 0, w: t, h: 4 }],
  doors: [], windows: [], furniture: [], ...extra,
});
const colors = (g) => { const out = new Set(); g.traverse((o) => { if (o.isMesh && o.userData.layer === 'MURI') [].concat(o.material).forEach((m) => m.userData.pbrTint && out.add(m.userData.pbrTint)); }); return out; };
const floorOf = (g, id) => { let m; g.traverse((o) => { if (o.userData.layer === 'PAVIMENTI' && o.userData.roomId === id) m = o.material; }); return m; };

const base = buildScene(THREE, plan(), THEMES.modern);
assert.ok(!colors(base).has('#336699'));
const r = buildScene(THREE, plan({}, { look: { wall: { color: '#336699' }, floor: { mat: 'marble' } } }), THEMES.modern);
assert.ok(colors(r).has('#336699'), 'pareti del locale col colore scelto');
assert.notEqual(floorOf(r, 1), floorOf(base, 1), 'pavimento col materiale scelto');
assert.equal(floorOf(r, 2).userData.pbr, floorOf(base, 2).userData.pbr, 'l\'altro locale non cambia');
const w = buildScene(THREE, plan({ wallLooks: { '1-2': { color: '#aa3366' } } }), THEMES.modern);
assert.ok(colors(w).has('#aa3366'), 'muro tra due locali con il suo colore');
console.log('finishes ok');

// muro interno a cavallo del bordo del soppalco: basso solo sotto il soppalco, intero dove il soppalco non c'è
{
  const p = {
    scale: 50, wallThickness: t * 50, dimensions: { width: 10, length: 8 }, height: 5,
    rooms: [{ id: 1, kind: 'living', name: 'A', x: 0, y: 0, w: 10, h: 4 }, { id: 2, kind: 'kitchen', name: 'B', x: 0, y: 4, w: 10, h: 4 }],
    walls: [{ x: -t / 2, y: -t / 2, w: 10 + t, h: t }, { x: -t / 2, y: 8 - t / 2, w: 10 + t, h: t }, { x: -t / 2, y: -t / 2, w: t, h: 8 + t }, { x: 10 - t / 2, y: -t / 2, w: t, h: 8 + t }, { x: 0, y: 4 - t / 2, w: 10, h: t }],
    doors: [], windows: [], furniture: [],
    mezzanine: { x: 5, y: 0, w: 5, h: 8, elev: 2.6, slab: 0.2, parapet: 1.0, open: ['W'], stair: { x: 3.5, y: 6, w: 1.5, h: 1 } },
  };
  const g = buildScene(THREE, p, THEMES.modern);
  let left = 0, right = 0;
  g.traverse((o) => {
    if (!o.isMesh || o.userData.layer !== 'MURI') return;
    const bb = new THREE.Box3().setFromObject(o);
    if (Math.abs((bb.min.z + bb.max.z) / 2 - 4) > 0.2 || bb.max.z - bb.min.z > 0.5) return;
    if (bb.max.x <= 5.01) left = Math.max(left, bb.max.y);
    if (bb.min.x >= 4.99) right = Math.max(right, bb.max.y);
  });
  assert.ok(left > 4.9, `fuori dal soppalco il muro sale a tutta altezza (${left})`);
  assert.ok(right < 2.5, `sotto il soppalco il muro arriva al solaio (${right})`);
}
console.log('finishes mezz ok');
