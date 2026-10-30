/* Tetto: ali rettangolari e falde (lib/roof.js). */
import assert from 'node:assert/strict';
import { gableTriangles, roofWings } from '../src/lib/roof.js';

const room = (x, y, w, h, kind = 'living') => ({ kind, x, y, w, h });
const area = (ws) => ws.reduce((a, w) => a + (w.x1 - w.x0) * (w.y1 - w.y0), 0);

// pianta rettangolare con quattro locali: un'ala sola
let ws = roofWings({ rooms: [room(0, 0, 5, 4), room(5, 0, 5, 4), room(0, 4, 4, 4), room(4, 4, 6, 4)] });
assert.equal(ws.length, 1);
assert.deepEqual(ws[0], { x0: 0, y0: 0, x1: 10, y1: 8 });

// L: bbox 10×8 senza l'angolo in alto a destra (4×3): due ali che coprono 68 m²
ws = roofWings({ rooms: [room(0, 0, 6, 3), room(0, 3, 10, 5)] });
assert.equal(ws.length, 2);
assert.ok(Math.abs(area(ws) - (6 * 3 + 10 * 5)) < 1e-6);

// il giardino non ha tetto
assert.equal(roofWings({ rooms: [room(0, 0, 10, 8, 'garden')] }).length, 0);

// falde: ala 10×6 con 25°: colmo lungo x, alto 3 · tan25° ≈ 1,40 m; sei triangoli (4 falde sporto + 2 timpani)
const { tris, ridge } = gableTriangles({ x0: 0, y0: 0, x1: 10, y1: 6 }, { slope: 25, overhang: 0.4 });
assert.equal(tris.length, 6);
assert.ok(Math.abs(ridge - 3 * Math.tan((25 * Math.PI) / 180)) < 1e-9);
assert.ok(tris.flat().every(([, y]) => y <= ridge + 1e-9));
// il colmo è lungo il lato maggiore: stesse z per i due vertici alti
const high = tris.flat().filter(([, y]) => Math.abs(y - ridge) < 1e-9);
assert.ok(high.every(([, , z]) => Math.abs(z - 3) < 1e-9));
console.log('roof ok');
