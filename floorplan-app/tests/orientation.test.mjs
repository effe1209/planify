/* Nord e orientamento (lib/orientation.js). */
import assert from 'node:assert/strict';
import { bearing, exposures, normNorth, sectorOf, sunDirection } from '../src/lib/orientation.js';

assert.equal(normNorth(-90), 270);
assert.equal(normNorth(370), 10);
// nord in alto: l'alto del foglio guarda a nord, il basso a sud
assert.equal(sectorOf(bearing('up', 0)), 'N');
assert.equal(sectorOf(bearing('down', 0)), 'S');
assert.equal(sectorOf(bearing('right', 0)), 'E');
// nord ruotato di 90° in senso orario: la freccia punta a destra, quindi la destra del foglio guarda a nord
assert.equal(sectorOf(bearing('right', 90)), 'N');
assert.equal(sectorOf(bearing('up', 90)), 'O');

const plan = {
  dimensions: { width: 10, length: 8 },
  windows: [{ x: 2, y: 0, w: 2, rot: 0 }, { x: 5, y: 8, w: 1, rot: 0 }, { x: 10, y: 2, w: 1, rot: 90 }],
};
let ex = exposures(plan, 0);
assert.ok(Math.abs(ex.N - 2.8) < 1e-9 && Math.abs(ex.S - 1.4) < 1e-9 && Math.abs(ex.E - 1.4) < 1e-9 && ex.O === 0, JSON.stringify(ex));
ex = exposures(plan, 180);   // casa girata: le finestre in alto guardano a sud
assert.ok(Math.abs(ex.S - 2.8) < 1e-9 && Math.abs(ex.N - 1.4) < 1e-9, JSON.stringify(ex));

// il sole di pomeriggio sta a sud-ovest: con il nord in alto è in basso a sinistra del foglio
const s0 = sunDirection(0);
assert.ok(s0.dx < 0 && s0.dz > 0);
console.log('orientation ok');
