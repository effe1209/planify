/* Conformità alla norma nazionale (lib/compliance.js). */
import assert from 'node:assert/strict';
import { checkCompliance } from '../src/lib/compliance.js';

const room = (id, name, kind, x, y, w, h, size = '') => ({ id, name, kind, x, y, w, h, size });
const ids = (r) => r.items.map((i) => i.id).sort();

// alloggio a norma: soggiorno 5×4, camera 4×4, bagno 2,5×3, finestre ovunque
const good = {
  rooms: [room(1, 'Soggiorno', 'living', 0, 0, 5, 4), room(2, 'Camera', 'bed', 5, 0, 4, 4, 'double'), room(3, 'Bagno', 'bath', 0, 4, 2.5, 3)],
  windows: [{ x: 0.5, y: 0, w: 2.4, rot: 0 }, { x: 5.5, y: 0, w: 2.4, rot: 0 }, { x: 0.3, y: 7, w: 0.8, rot: 0 }],
  doors: [{ x: 2, y: 4, w: 0.9, rot: 0, entrance: true }, { x: 5, y: 1, w: 0.9, rot: 90 }],
};
let r = checkCompliance(good, { type: 'apartment' });
assert.equal(r.fail, 0, JSON.stringify(r.items));

// camera di 9 m² matrimoniale, finestra piccola e porta stretta
const bad = {
  rooms: [room(1, 'Soggiorno', 'living', 0, 0, 5, 4), room(2, 'Camera', 'bed', 5, 0, 3, 3, 'double'), room(3, 'Bagno', 'bath', 0, 4, 1.2, 2)],
  windows: [{ x: 0.5, y: 0, w: 2.4, rot: 0 }, { x: 5.5, y: 0, w: 0.5, rot: 0 }],
  doors: [{ x: 5, y: 1, w: 0.7, rot: 90 }, { x: 2, y: 4, w: 0.7, rot: 0, entrance: true }],
};
r = checkCompliance(bad, { type: 'apartment' });
const got = ids(r);
for (const id of ['area', 'light', 'door', 'dwelling', 'bath-vent']) assert.ok(got.includes(id), `${id} in ${got}`);
assert.ok(r.fail >= 4);

// garage e giardino: nessuna verifica abitativa
r = checkCompliance(bad, { type: 'garage' });
assert.equal(r.items.length, 0);

// la finestra sul muro tra due locali conta una sola volta (divisa)
const shared = {
  rooms: [room(1, 'A', 'living', 0, 0, 5, 4), room(2, 'B', 'bed', 5, 0, 4, 4, 'double')],
  windows: [{ x: 5, y: 1, w: 1, rot: 90 }],
  doors: [],
};
r = checkCompliance(shared, { type: 'apartment' });
assert.ok(r.items.some((i) => i.id === 'light'));
// altezza interna: 2,40 m non basta per i locali abitabili, 2,70 sì
assert.ok(checkCompliance(good, { type: 'apartment', height: 2.4 }).items.some((i) => i.id === 'height'));
assert.ok(!checkCompliance(good, { type: 'apartment', height: 2.7 }).items.some((i) => i.id === 'height'));

// scale: 17 alzate in 3,0 m vanno bene; 13 gradini (rampa di 3,6 m) no
const stairPlan = { ...good, stairs: [] };
const straight = (run) => [{ type: 'straight', up: 'E', x: 0, y: 0, w: run, h: 1 }];
r = checkCompliance(stairPlan, { type: 'apartment', stairs: straight(4.6) });
assert.ok(!r.items.some((i) => i.id.startsWith('stairs')), JSON.stringify(r.items));
r = checkCompliance(stairPlan, { type: 'apartment', stairs: straight(3.6) });
assert.ok(r.items.some((i) => i.id === 'stairs-rise' && i.level === 'fail'), JSON.stringify(r.items));
r = checkCompliance(stairPlan, { type: 'apartment', stairs: [{ type: 'straight', up: 'E', x: 0, y: 0, w: 4.6, h: 0.7 }] });
assert.ok(r.items.some((i) => i.id === 'stairs'));

// rampa del garage: 3 m in 15 m è il 20% (ammesso), in 8 m è il 37% (no)
const garden = (len) => ({ rooms: [{ id: 1, name: 'Giardino', kind: 'garden', x: 0, y: 0, w: 10, h: 20 }], furniture: [{ type: 'ramp', x: 1, y: 0, w: 3, h: len }] });
assert.equal(checkCompliance(garden(15), { type: 'garden' }).fail, 0);
assert.equal(checkCompliance(garden(8), { type: 'garden' }).fail, 1);

// posti auto: 2 auto in 20 m² non entrano (servono 25 m²)
const box = { rooms: [{ id: 1, name: 'Garage', kind: 'garage', x: 0, y: 0, w: 4, h: 5 }], furniture: [{ type: 'car', room: 1 }, { type: 'car', room: 1 }] };
assert.ok(checkCompliance(box, { type: 'garage' }).items.some((i) => i.id === 'stall'));
console.log('compliance ok');
