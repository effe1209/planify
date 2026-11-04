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
for (const ty of ['kitchen_fridge_tall', 'kitchen_oven_tall', 'kitchen_dishwasher']) assert.equal(types.filter((x) => x === ty).length, 1, ty);
assert.ok(!types.includes('kitchen_washer_tall'), 'niente lavatrice in cucina');
assert.equal(r.plan.furniture.find((f) => f.type === 'kitchen_dishwasher').builtIn, true, 'incassata di serie');
assert.equal(r.plan.furniture.find((f) => f.type === 'kitchen_counter').noDishwasher, true);
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
for (const f of r.plan.furniture.filter((q) => q.type === 'kitchen_fridge_tall' || q.type === 'kitchen_oven_tall' || q.type === 'kitchen_dishwasher')) assert.ok(f.x + f.w <= 2.6 || f.x >= 3.6, 'colonna davanti alla finestra');
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
assert.equal(sum.columns.length, 2);
assert.equal(sum.dishwasher, true);
// a vista: frontale in acciaio
const vis = completeKitchen({ ...mk(counter), rooms: [{ ...mk(counter).rooms[0], kitchenDishwasher: 'visible' }] }, 1);
assert.equal(vis.plan.furniture.find((f) => f.type === 'kitchen_dishwasher').builtIn, false);
// la lavastoviglie sta dal lato del lavello (a destra della finestra sul muro: lavello al 58% del piano)
const dw = r.plan.furniture.find((f) => f.type === 'kitchen_dishwasher');
assert.ok(dw.x >= counter.x + counter.w - 0.001 || dw.x + dw.w <= counter.x + 0.001, 'accanto al piano');

// piano che occupa tutta la parete: le colonne vanno ad angolo, sul muro che gli sta accanto (cucina a L), e il frigo è l'ultimo della fila
const wide = mk({ ...counter, x: 0.1, w: 5.8 }, { doors: [], windows: [] });
const w2 = completeKitchen(wide, 1);
const ctr = w2.plan.furniture.find((f) => f.type === 'kitchen_counter');
assert.equal(ctr.w, 5.8, 'il piano non si accorcia se c\'è posto ad angolo');
const arms = w2.plan.furniture.filter((f) => f.type.endsWith('_tall') || f.type === 'kitchen_dishwasher');
assert.equal(arms.length, 3, 'tutte e tre le unità');
for (const f of arms) {
  assert.ok(f.facing === 'E' || f.facing === 'W', 'sul muro ad angolo guardano verso l\'interno');
  assert.ok(f.y >= 0.1 + 0.6 - 0.01, 'dopo la profondità del piano, non sopra di lui');
  assert.ok(f.x < 0.2 || f.x + f.w > 5.8, 'contro il muro est o ovest');
}
const fridgeY = w2.plan.furniture.find((f) => f.type === 'kitchen_fridge_tall');
const sameWall = arms.filter((f) => Math.abs(f.x - fridgeY.x) < 0.01);
assert.ok(sameWall.every((f) => f.y <= fridgeY.y + 1e-6), 'il frigo è l\'ultimo sul suo muro (il più lontano dal piano)');
assert.deepEqual(baseKitchen(w2.plan, 1).plan.furniture.find((f) => f.type === 'kitchen_counter').w, 5.8);

// frigo ai bordi: con un piano corto in mezzo alla parete è l'ultimo della sua fila, mai tra due unità
for (const x0 of [1.0, 1.8, 2.4]) {
  const q = completeKitchen(mk({ ...counter, x: x0, w: 2.0 }, { doors: [], windows: [] }), 1).plan;
  const along = q.furniture.filter((f) => (f.type.endsWith('_tall') || f.type === 'kitchen_dishwasher') && Math.abs(f.y - counter.y) < 0.01);
  const fr = along.find((f) => f.type === 'kitchen_fridge_tall');
  if (!fr) continue;
  const rightSide = fr.x > x0;
  assert.ok(along.every((f) => (rightSide ? f.x <= fr.x + 1e-6 || f.x < x0 : f.x >= fr.x - 1e-6 || f.x > x0 + 2)), 'frigo non all\'estremo');
}

// ad angolo non c'è posto (porte negli angoli): si accorcia il piano
const blocked = mk({ ...counter, x: 0.1, w: 5.8 }, { windows: [], doors: [{ x: 0, y: 1.0, w: 0.9, rot: 90, openDir: 1 }, { x: 5.8, y: 1.0, w: 0.9, rot: 90, openDir: 1 }] });
const w3 = completeKitchen(blocked, 1);
const ctr3 = w3.plan.furniture.find((f) => f.type === 'kitchen_counter');
assert.ok(ctr3.w < 5.8 && ctr3.kitchenOrig, 'senza angolo libero il piano si accorcia');
assert.equal(baseKitchen(w3.plan, 1).plan.furniture.find((f) => f.type === 'kitchen_counter').w, 5.8);

// facciate diverse: contro il muro est e ovest le colonne seguono lo stesso muro
for (const [facing, x, y, w, h] of [['W', 5.3, 0.8, 0.6, 2.4], ['E', 0.1, 0.8, 0.6, 2.4], ['N', 1.6, 3.3, 2.4, 0.6]]) {
  const c = { type: 'kitchen_counter', x, y, w, h, rot: 0, facing, room: 1 };
  const q = completeKitchen(mk(c, { doors: [], windows: [] }), 1);
  const cols = q.plan.furniture.filter((f) => f.type.endsWith('_tall') || f.type === 'kitchen_dishwasher');
  assert.ok(cols.length >= 2, `${facing}: colonne`);
  const aligned = cols.filter((f) => (facing === 'N' ? Math.abs(f.y - y) < 1e-6 : Math.abs(f.x - x) < 1e-6));
  assert.ok(aligned.length >= 2, `${facing}: almeno due unità allineate al piano (le altre vanno ad angolo)`);
  for (const f of cols.filter((q) => !aligned.includes(q))) assert.notEqual(f.facing, facing, `${facing}: l'unità ad angolo guarda in un'altra direzione`);
}

// 3D e impianti
const scene = buildScene(THREE, r.plan, THEMES.modern);
const names = new Set();
scene.traverse((o) => { if (o.name) names.add(o.name); });
for (const n of ['COLONNA_FRIGO', 'COLONNA_FORNO', 'LAVASTOVIGLIE', 'PENSILE']) assert.ok(names.has(n), n);
const project = { name: 'p', floors: [{ id: 'a', level: 0, name: 'T', plan: r.plan, meta: { style: 'modern' } }] };
const tags = planElectric(project).floors.a.points.filter((p) => p.kind === 'dedicated').map((p) => p.tag);
for (const tg of ['FR', 'FO', 'LS']) assert.ok(tags.includes(tg), `presa ${tg}`);
assert.equal(tags.filter((x) => x === 'LS').length, 1, 'una sola presa lavastoviglie');
assert.ok(!tags.includes('LV'), 'nessuna presa lavatrice in cucina');
assert.equal(tags.filter((x) => x === 'FR').length, 1, 'un solo frigo');
const fx = planPlumbing(project).floors.a.fixtures;
assert.equal(fx.filter((f) => f.type === 'dishwasher').length, 1, 'una sola lavastoviglie allacciata');
assert.ok(!fx.some((f) => f.type === 'washer'), 'niente lavatrice');
console.log('kitchenfull ok');
