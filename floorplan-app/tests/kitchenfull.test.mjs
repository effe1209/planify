/* Cucina completa: colonne con elettrodomestici e pensili accanto al piano cucina (lib/kitchenFull.js). */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { baseKitchen, completeKitchen, kitchenSummary } from '../src/lib/kitchenFull.js';
import { buildScene } from '../src/lib/scene3d.js';
import { THEMES } from '../src/lib/themes.js';
import { planElectric } from '../src/lib/electric.js';
import { planPlumbing } from '../src/lib/plumbing.js';
import { furnitureRect } from '../src/lib/kitchenWindows.js';

const t = 0.2;
const mk = (counter, extra = {}) => ({
  scale: 50, wallThickness: t * 50, dimensions: { width: 6, length: 4 }, svgWidth: 300, svgHeight: 200,
  rooms: [{ id: 1, kind: 'living_kitchen', name: 'Cucina', x: 0, y: 0, w: 6, h: 4 }],
  walls: [{ x: 0, y: 0, w: 6, h: t }, { x: 0, y: 4 - t, w: 6, h: t }, { x: 0, y: 0, w: t, h: 4 }, { x: 6 - t, y: 0, w: t, h: 4 }],
  doors: [{ x: 4.6, y: 4 - t, w: 0.9, rot: 0, entrance: true }], windows: [{ x: 2.6, y: 0, w: 1.0, rot: 0 }],
  furniture: [counter], ...extra,
});
const counter = { type: 'kitchen_counter', x: 1.6, y: t, w: 2.4, h: 0.6, rot: 0, facing: 'S', room: 1 };

const r = completeKitchen(mk(counter), 1);
assert.ok(r.plan && r.added > 0, 'si aggiunge qualcosa');
const types = r.plan.furniture.map((f) => f.type);
for (const ty of ['kitchen_fridge_tall', 'kitchen_oven_tall', 'kitchen_washer_tall']) assert.equal(types.filter((x) => x === ty).length, 1, ty);
assert.ok(types.includes('wall_cabinet'), 'pensili');
assert.equal(r.plan.rooms[0].kitchenStyle, 'full');
assert.equal(r.plan.furniture.find((f) => f.type === 'kitchen_counter').noFridge, true);
// niente sovrapposizioni tra gli arredi della cucina (pensili esclusi: stanno in alto)
const floorItems = r.plan.furniture.filter((f) => f.type !== 'wall_cabinet').map((f) => furnitureRect(f));
for (let i = 0; i < floorItems.length; i++) for (let j = i + 1; j < floorItems.length; j++) {
  const a = floorItems[i]; const b = floorItems[j];
  assert.ok(!(a.x0 < b.x1 - 0.011 && a.x1 > b.x0 + 0.011 && a.y0 < b.y1 - 0.011 && a.y1 > b.y0 + 0.011), `arredi sovrapposti ${i} ${j}`);
}
// tutto dentro il locale e lontano dalla porta d'ingresso e dalla finestra
for (const f of r.plan.furniture) { assert.ok(f.x >= 0 && f.x + f.w <= 6 && f.y >= 0 && f.y + f.h <= 4, `${f.type} fuori dal locale`); }
for (const f of r.plan.furniture.filter((q) => q.type === 'kitchen_fridge_tall' || q.type === 'kitchen_oven_tall' || q.type === 'kitchen_washer_tall')) assert.ok(f.x + f.w <= 2.6 || f.x >= 3.6, 'colonna davanti alla finestra');
// i pensili non coprono la finestra né la cappa
const hood = 1.6 + 2.4 * 0.75;
for (const c of r.plan.furniture.filter((q) => q.type === 'wall_cabinet')) {
  assert.ok(c.x + c.w <= 2.6 + 0.001 || c.x >= 3.6 - 0.001, 'pensile sulla finestra');
  assert.ok(c.x + c.w <= hood - 0.4 || c.x >= hood + 0.4, 'pensile sulla cappa');
  assert.deepEqual(c.z, [1.4, 2.1]);
}
// rifatta, non raddoppia; tornando alla base si ritrova il piano com'era
const again = completeKitchen(r.plan, 1);
assert.equal(again.plan.furniture.length, r.plan.furniture.length, 'nessun doppione');
const back = baseKitchen(r.plan, 1).plan;
assert.deepEqual(back.furniture, [counter]);
assert.equal(back.rooms[0].kitchenStyle, undefined);
const sum = kitchenSummary(r.plan, 1);
assert.equal(sum.columns.length, 3);

// piano che occupa tutta la parete: si accorcia per fare posto alle colonne
const wide = mk({ ...counter, x: 0.1, w: 5.8 }, { doors: [], windows: [] });
const w2 = completeKitchen(wide, 1);
const ctr = w2.plan.furniture.find((f) => f.type === 'kitchen_counter');
assert.ok(ctr.w < 5.8 && ctr.kitchenOrig, 'piano accorciato');
assert.ok(w2.plan.furniture.filter((f) => f.type.endsWith('_tall')).length >= 2);
assert.deepEqual(baseKitchen(w2.plan, 1).plan.furniture.find((f) => f.type === 'kitchen_counter').w, 5.8);

// facciate diverse: contro il muro est e ovest le colonne seguono lo stesso muro
for (const [facing, x, y, w, h] of [['W', 5.3, 0.8, 0.6, 2.4], ['E', 0.1, 0.8, 0.6, 2.4], ['N', 1.6, 3.3, 2.4, 0.6]]) {
  const c = { type: 'kitchen_counter', x, y, w, h, rot: 0, facing, room: 1 };
  const q = completeKitchen(mk(c, { doors: [], windows: [] }), 1);
  const cols = q.plan.furniture.filter((f) => f.type.endsWith('_tall'));
  assert.ok(cols.length >= 2, `${facing}: colonne`);
  for (const f of cols) assert.ok(facing === 'N' ? Math.abs(f.y - y) < 1e-6 : Math.abs(f.x - x) < 1e-6, `${facing}: colonna allineata al piano`);
}

// 3D e impianti
const scene = buildScene(THREE, r.plan, THEMES.modern);
const names = new Set();
scene.traverse((o) => { if (o.name) names.add(o.name); });
for (const n of ['COLONNA_FRIGO', 'COLONNA_FORNO', 'COLONNA_LAVATRICE', 'PENSILE']) assert.ok(names.has(n), n);
const project = { name: 'p', floors: [{ id: 'a', level: 0, name: 'T', plan: r.plan, meta: { style: 'modern' } }] };
const tags = planElectric(project).floors.a.points.filter((p) => p.kind === 'dedicated').map((p) => p.tag);
for (const tg of ['FR', 'FO', 'LV']) assert.ok(tags.includes(tg), `presa ${tg}`);
assert.equal(tags.filter((x) => x === 'FR').length, 1, 'un solo frigo');
assert.ok(planPlumbing(project).floors.a.fixtures.some((f) => f.type === 'washer'), 'lavatrice allacciata');
console.log('kitchenfull ok');
