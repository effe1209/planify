/* Scala esterna al giardino (lib/extStair.js): geometria, scelta del lato, ingombro nel foglio e nel 3D. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FLOOR_RISE, LANDING, RISER, TREAD, extStairBounds, extStairGeometry, facadeEdges, removeExtStair, setExtStair } from '../src/lib/extStair.js';
import { FLOOR_H, buildScene } from '../src/lib/scene3d.js';
import { sheetBox } from '../src/lib/sheet.js';
import { THEMES } from '../src/lib/themes.js';

assert.equal(FLOOR_RISE, FLOOR_H, 'il dislivello di un piano è quello del 3D');
const t = 0.2;
const plan = {
  scale: 50, wallThickness: t * 50, dimensions: { width: 10, length: 8 }, svgWidth: 500, svgHeight: 400,
  rooms: [{ id: 1, kind: 'living', name: 'Soggiorno', x: 0, y: 0, w: 10, h: 8 }],
  walls: [{ x: 0, y: 0, w: 10, h: t }, { x: 0, y: 8 - t, w: 10, h: t }, { x: 0, y: 0, w: t, h: 8 }, { x: 10 - t, y: 0, w: t, h: 8 }],
  doors: [{ x: 4, y: 8 - t, w: 1, rot: 0, entrance: true }], windows: [], furniture: [],
};
assert.equal(facadeEdges(plan, 'S').length, 1);
assert.deepEqual(facadeEdges(plan, 'S')[0].out, [0, 1]);

const r = setExtStair(plan, 'S', { t: 0.5, rise: 3 });
assert.ok(r.plan, r.error);
const g = extStairGeometry(r.plan.extStair);
assert.equal(g.count, Math.round(3 / RISER));
assert.ok(g.landing.y >= 8 - 1e-6, 'il pianerottolo sta fuori dal muro sud');
assert.ok(Math.abs(g.landing.h - LANDING) < 1e-6);
assert.equal(g.steps.length, g.count - 1);
assert.ok(g.steps.every((s, i) => i === 0 || s.top < g.steps[i - 1].top), 'i gradini scendono');
assert.ok(g.steps[g.steps.length - 1].top <= 3 / g.count + 1e-6, 'l\'ultimo gradino è a un\'alzata da terra');
assert.ok(Math.abs(g.bounds.h - (LANDING + (g.count - 1) * TREAD)) < 0.01, 'rampa dritta verso l\'esterno');

// rampa lungo la facciata: poco ingombro verso il giardino
const side = extStairGeometry(setExtStair(plan, 'S', { mode: 'side', rise: 3 }).plan.extStair);
assert.ok(side.bounds.h < 2 && side.bounds.w > 4);

// il foglio si allarga per contenere la scala
const base = sheetBox(plan, false);
const wide = sheetBox(r.plan, false);
assert.ok(wide.h > base.h + 100, 'più alto sotto la scala');
assert.equal(extStairBounds(removeExtStair(r.plan)), null);
assert.ok(setExtStair({ ...plan, rooms: [] }, 'N').error);

// 3D: gradini e pianerottolo sotto il pavimento del piano, fino al giardino
const scene = buildScene(THREE, r.plan, THEMES.modern);
let low = Infinity;
let n = 0;
scene.traverse((o) => { if (o.userData.layer === 'SCALA_ESTERNA') { n++; low = Math.min(low, new THREE.Box3().setFromObject(o).min.y); } });
assert.ok(n > g.count, 'gradini e pianerottolo ci sono');
assert.ok(Math.abs(low + 3) < 0.02, `la scala parte dal giardino (${low})`);
console.log('extstair ok');

// casa rialzata: pilastri sotto il piano più basso (o basamento pieno, o niente) e giardino sotto la scala
import { buildHouse } from '../src/lib/scene3d.js';
import { frontOf } from '../src/lib/project.js';
import { themeFor } from '../src/lib/palette.js';
{
  const proj = (extra = {}) => ({ floors: [{ id: 'a', level: 1, plan: r.plan, meta: { style: 'modern' } }], ...extra });
  const layers = (p) => { const out = {}; buildHouse(THREE, p, (f) => themeFor(p, f)).traverse((o) => { if (o.userData.layer) out[o.userData.layer] = (out[o.userData.layer] || 0) + 1; }); return out; };
  assert.ok(layers(proj()).PILASTRI >= 4, 'pilastri sotto la casa rialzata');
  assert.ok(layers(proj({ houseBase: 'solid' })).BASAMENTO >= 1);
  assert.ok(!layers(proj({ houseBase: 'none' })).PILASTRI);
  const ground = { floors: [{ id: 'a', level: 0, plan, meta: { style: 'modern' } }] };
  assert.ok(!layers(ground).PILASTRI, 'la casa a terra non ha pilastri');
  // la porta è a sud ma la scala è a est: il giardino va davanti alla scala, salvo scelta diversa
  const east = setExtStair(plan, 'E', { rise: 3 }).plan;
  const pe = { floors: [{ id: 'a', level: 1, plan: east, meta: { style: 'modern' } }] };
  assert.equal(frontOf(pe).facade.front, 'E');
  assert.equal(frontOf(pe).facade.face, 'stair');
  assert.equal(frontOf({ ...pe, gardenFace: 'door' }).facade.front, 'S');
}
console.log('extstair casa rialzata ok');
