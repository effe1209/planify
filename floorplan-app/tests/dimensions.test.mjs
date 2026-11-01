/* Quote esterne a catene in cm (lib/dimensions.js). */
import assert from 'node:assert/strict';
import { dimensionChains, tierIndex } from '../src/lib/dimensions.js';

const plan = {
  dimensions: { width: 10, length: 8 },
  rooms: [{ id: 1, kind: 'living', x: 0, y: 0, w: 6, h: 8 }, { id: 2, kind: 'bed', x: 6, y: 0, w: 4, h: 4 }, { id: 3, kind: 'bath', x: 6, y: 4, w: 4, h: 4 }],
  windows: [{ x: 1, y: 0, w: 1.5, rot: 0 }, { x: 0, y: 3, w: 1, rot: 90 }],
  doors: [{ x: 4, y: 8, w: 1, rot: 0, entrance: true }, { x: 6, y: 2, w: 0.9, rot: 90 }],   // la seconda sta su un muro interno
};
const ch = dimensionChains(plan);
const get = (side, tier) => ch.find((c) => c.side === side && c.tier === tier);

assert.deepEqual(get('N', 'total').segs.map((s) => s.cm), [1000]);
assert.deepEqual(get('W', 'total').segs.map((s) => s.cm), [800]);
assert.equal(get('S', 'total'), undefined, 'il totale solo sopra e a sinistra');
// aperture a nord: muro 100, finestra 150, muro 750
assert.deepEqual(get('N', 'open').segs.map((s) => [s.cm, s.open]), [[100, false], [150, true], [750, false]]);
// interassi a nord: i bordi dei locali che toccano il lato: 0, 6, 10
assert.deepEqual(get('N', 'axes').segs.map((s) => s.cm), [600, 400]);
assert.deepEqual(get('S', 'axes').segs.map((s) => s.cm), [600, 400]);
// finestra a ovest e portoncino a sud; la porta interna non compare
assert.deepEqual(get('W', 'open').segs.map((s) => s.cm), [300, 100, 400]);
assert.deepEqual(get('S', 'open').segs.map((s) => s.cm), [400, 100, 500]);
assert.equal(get('E', 'open'), undefined);
// i livelli si impilano senza buchi: a nord aperture 0, interassi 1, totale 2; a sud aperture 0, interassi 1
assert.deepEqual(['open', 'axes', 'total'].map((t) => tierIndex(ch, get('N', t))), [0, 1, 2]);
assert.deepEqual(['open', 'axes'].map((t) => tierIndex(ch, get('S', t))), [0, 1]);
// giardino o piante senza locali rettangolari: nessuna catena
assert.deepEqual(dimensionChains({ ...plan, rooms: [{ id: 1, kind: 'garden', x: 0, y: 0, w: 10, h: 8 }] }), []);
console.log('dimensions ok');
