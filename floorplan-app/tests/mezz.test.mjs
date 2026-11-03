/* Soppalco ridimensionabile, tappeti e sedie nel 3D. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mezzLimits, mezzRatio, resizeMezz } from '../src/lib/mezz.js';
import { rugsFor } from '../src/lib/rugs.js';
import { checkCompliance } from '../src/lib/compliance.js';
import { buildScene } from '../src/lib/scene3d.js';
import { THEMES } from '../src/lib/themes.js';

const room = (id, name, kind, x, y, w, h) => ({ id, name, kind, x, y, w, h });
const mezz = { x: 8.4, y: 0, w: 3.6, h: 8, elev: 2.6, slab: 0.2, parapet: 1, open: ['W'],
  stair: { x: 4.35, y: 6.9, w: 4.05, h: 0.9, up: 'E', type: 'straight', risers: 15 },
  bath: { walls: [{ x: 10.6, y: 4, w: 1.4, h: 0.1 }, { x: 10.6, y: 5.4, w: 1.4, h: 0.1 }], door: { x: 10.6, y: 4.4, w: 0.1, h: 0.8 } } };
const plan = {
  dimensions: { width: 12, length: 8 }, scale: 50, wallThickness: 10, height: 5, mezzanine: mezz,
  rooms: [room(1, 'Soggiorno', 'living', 0, 0, 8.4, 8), room(2, 'Bagno', 'bath', 8.4, 0, 3.6, 3), room(3, 'Cucina', 'kitchen', 8.4, 3, 3.6, 5)],
  doors: [{ x: 0.35, y: 8, w: 0.9, rot: 0, entrance: true }], windows: [], walls: [],
  furniture: [
    { type: 'bed', x: 10, y: 1, w: 2, h: 1.6, facing: 'W', room: 1, elev: 2.6 },
    { type: 'sofa', x: 3.5, y: 7.0, w: 0.8, h: 0.7, facing: 'N', room: 1 },
    { type: 'table', x: 2, y: 2, w: 1.8, h: 0.9, facing: 'S', room: 1 },
    { type: 'rug', x: 3, y: 4, w: 2.4, h: 1.6, facing: 'S', room: 1 },
  ],
};

// limiti: min con il bagnetto 3 m, max entro metà del loft
const lim = mezzLimits(plan);
assert.equal(lim.min, 3);
assert.ok(lim.max <= 0.5 * 12 * 8 / 8 + 1e-6 && lim.max > 3.6, JSON.stringify(lim));

// allargare dal lato aperto: il bordo si sposta, la rampa lo segue, il muro esterno resta
const big = resizeMezz(plan, 4.5);
assert.ok(!big.error, big.error);
assert.equal(big.plan.mezzanine.w, 4.5);
assert.equal(big.plan.mezzanine.x + big.plan.mezzanine.w, 12);
assert.ok(Math.abs(big.plan.mezzanine.stair.x - (4.35 - 0.9)) < 1e-6);
assert.ok(mezzRatio(plan, 4.5) > 1 / 3);
// l'arredo del soppalco contro il muro non si muove; il divano sotto la rampa nuova si toglie
const bed = big.plan.furniture.find((f) => f.type === 'bed');
assert.ok(bed.x >= big.plan.mezzanine.x && bed.x + bed.w <= 12);
assert.ok(big.dropped.includes('sofa'), JSON.stringify(big.dropped));
// stringere oltre il minimo non si può: resta al minimo
assert.equal(resizeMezz(plan, 1).plan.mezzanine.w, 3);
// oltre il massimo si ferma al massimo
assert.equal(resizeMezz(plan, 20).plan.mezzanine.w, lim.max);

// con il bordo aperto a est (soppalco sul lato ovest) l'asse è lo stesso ma al contrario
const west = { ...plan, mezzanine: { ...mezz, x: 0, open: ['E'], stair: { ...mezz.stair, x: 3.6, up: 'W' }, bath: undefined } };
const w2 = resizeMezz(west, 4.2);
assert.ok(!w2.error && w2.plan.mezzanine.x === 0 && w2.plan.mezzanine.w === 4.2 && Math.abs(w2.plan.mezzanine.stair.x - 4.2) < 1e-6, JSON.stringify(w2.plan?.mezzanine));

// a limite di norma: oltre 1/3 avviso, oltre metà errore
const ids = (r) => r.items.map((i) => i.id);
assert.ok(!ids(checkCompliance(plan, { type: 'loft', height: 5 })).includes('mezz-area'));
assert.ok(ids(checkCompliance(big.plan, { type: 'loft', height: 5 })).includes('mezz-area'));

// tappeti: quello messo a mano e quello sotto il tavolino; non sul soppalco
const withCoffee = { ...plan, furniture: [...plan.furniture, { type: 'coffee_table', x: 5, y: 4.5, w: 1.2, h: 0.6, room: 1 }] };
assert.equal(rugsFor(withCoffee).length, 2);
assert.equal(rugsFor({ ...plan, furniture: plan.furniture.filter((f) => f.type !== 'rug') }).length, 0, 'il letto sul soppalco non ha tappeto');

// 3D: tappeto basso, sedie attorno al tavolo (4 per lato lungo → 2 per 1,8 m + 2), bagnetto con muri bassi 2,2 m
const g = buildScene(THREE, { ...withCoffee, furniture: [...withCoffee.furniture] }, THEMES.modern);
const flat = g.children.filter((c) => c.geometry?.parameters?.height === 0.012);
assert.equal(flat.length, 2, `tappeti ${flat.length}`);
// ogni sedia è un gruppo (seduta morbida a 45 cm, gambe, montanti e schienale curvo)
const chairSeats = g.children.filter((c) => c.isGroup && c.children.length === 9 && Math.abs(c.children[0].position.y - 0.45) < 0.01);   // seduta + 4 gambe + 2 montanti + fascia + traversa
assert.ok(chairSeats.length >= 6, `sedute ${chairSeats.length}`);
const bathWalls = g.children.filter((c) => c.userData.layer === 'MURI' && Math.abs(c.geometry.parameters.height - 2.2) < 1e-6);
assert.equal(bathWalls.length, 2);
console.log('mezz ok');

// il muro sotto il soppalco (bagno e cucina) segue il bordo aperto, anche se soggiorno e cucina sono una zona aperta
{
  const zoned = { ...plan, rooms: [{ ...plan.rooms[0], zone: 1 }, { ...plan.rooms[1], zone: 3 }, { ...plan.rooms[2], zone: 1 }] };
  const w = resizeMezz(zoned, 4.5);
  assert.ok(!w.error, w.error);
  const [liv, bath, kit] = w.plan.rooms;
  assert.equal(bath.x, 7.5); assert.equal(kit.x, 7.5);
  assert.equal(liv.w, 7.5);
  assert.equal(bath.x, w.plan.mezzanine.x);
  assert.equal(liv.zone, 1); assert.equal(bath.zone, 3);
  const back = resizeMezz(w.plan, 3.6);
  assert.equal(back.plan.rooms[1].x, 8.4);
  console.log('mezz muro sotto ok');
}

// il solaio e il parapetto del soppalco non arrivano a filo della facciata: finiscono dentro lo spessore dei muri esterni
{
  const g = buildScene(THREE, { ...plan, scale: 50, wallThickness: 10, walls: [{ x: 0, y: 0, w: 12, h: 0.2 }, { x: 0, y: 7.8, w: 12, h: 0.2 }, { x: 11.8, y: 0, w: 0.2, h: 8 }] }, THEMES.modern);
  const box = new THREE.Box3();
  let n = 0;
  g.traverse((o) => { if (o.isMesh && (o.userData.layer === 'SOLAI' || o.userData.layer === 'RINGHIERE')) { box.expandByObject(o); n++; } });
  assert.ok(n >= 3);
  assert.ok(box.max.x <= 12 - 0.09 && box.min.z >= 0.09 && box.max.z <= 8 - 0.09, `soppalco fuori dal muro: ${JSON.stringify([box.min, box.max])}`);
  console.log('mezz facciata ok');
}
