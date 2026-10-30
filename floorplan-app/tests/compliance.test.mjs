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
console.log('compliance ok');
