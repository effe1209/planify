/* La casa vista dal giardino (lib/project.js houseFront): facciata d'ingresso, portoncino, garage. */
import assert from 'node:assert/strict';
import { houseFront, houseRequest } from '../src/lib/project.js';

const plan = {
  dimensions: { width: 10, length: 8 },
  rooms: [{ x: 0, y: 0, w: 6, h: 8, kind: 'living' }, { x: 6, y: 0, w: 4, h: 6, kind: 'bed' }],
  doors: [{ x: 7, y: 6, w: 1, rot: 0, entrance: true }],
};
const basement = { dimensions: { width: 10, length: 8 }, rooms: [], doors: [{ x: 1, y: 8, w: 2.5, rot: 0, entrance: true, kind: 'garage' }] };
const project = { floors: [{ level: 0, plan }, { level: -1, plan: basement, meta: { type: 'garage' } }] };

// ingresso a sud (sulla rientranza): la facciata è la larghezza, garage interrato davanti con la rampa
let h = houseFront(project);
assert.equal(h.front, 'S');
assert.equal(h.w, 10);
assert.deepEqual(h.door, { x: 7.5, w: 1, d: 2 });
assert.deepEqual(h.garage, { x: 2.25, w: 2.5, d: 0, side: 'front', ramp: true });
assert.deepEqual(h.rects[1], { t: 6, d: 2, w: 4, h: 6, kind: 'bed' });

// ingresso a est: la facciata è la lunghezza, vista da est la sinistra è il sud
plan.doors = [{ x: 10, y: 2, w: 1, rot: 90, entrance: true }];
h = houseFront(project);
assert.equal(h.front, 'E');
assert.equal(h.w, 8);
assert.equal(h.door.x, 5.5);
assert.equal(h.garage.side, 'left');
assert.deepEqual(houseRequest(h), { w: 8, door: { x: 5.5, w: 1 }, garage: { x: 0, w: 2.5, side: 'left', ramp: true } });

assert.equal(houseFront({ floors: [{ level: 'out', plan, meta: { type: 'garden' } }] }), null);
// garage al piano strada: il piano terra è il garage, la porta di casa è sul vano scala, niente rampa
const streetGarage = {
  dimensions: { width: 10, length: 8 },
  rooms: [{ x: 0, y: 0, w: 10, h: 8, kind: 'garage' }],
  doors: [{ x: 1, y: 7.8, w: 2.5, rot: 0, entrance: true, kind: 'garage' }, { x: 7, y: 7.8, w: 0.9, rot: 0, entrance: true }],
};
h = houseFront({ floors: [{ level: 0, plan: streetGarage, meta: { type: 'garage' } }, { level: 1, plan }] });
assert.equal(h.front, 'S');
assert.equal(h.door.x, 7.45);
assert.deepEqual({ side: h.garage.side, ramp: h.garage.ramp }, { side: 'front', ramp: false });
console.log('garden ok');
