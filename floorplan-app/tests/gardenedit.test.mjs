/* Cancelli e camminamenti del giardino spostabili (lib/gardenEdit.js). */
import assert from 'node:assert/strict';
import { gardenParts, moveGardenPart } from '../src/lib/gardenEdit.js';

const f = (type, x, y, w, h) => ({ type, x, y, w, h, rot: 0, facing: 'N', room: 1, flip: false });
const plan = {
  scale: 50, wallThickness: 10, dimensions: { width: 16, length: 10 }, rooms: [{ id: 1, kind: 'garden', name: 'Giardino', x: 0, y: 0, w: 16, h: 10 }],
  walls: [], windows: [], doors: [{ x: 7, y: 9.8, w: 1, rot: 0, kind: 'gate' }],
  furniture: [f('fence', 0, 9.85, 7, 0.15), f('fence', 8, 9.85, 4.4, 0.15), f('fence', 15.4, 9.85, 0.6, 0.15),
    f('gate_driveway', 12.4, 9.85, 3, 0.15), f('gate_pedestrian', 7, 9.85, 1, 0.15), f('path', 7, 0.3, 1, 9.5), f('path', 12.4, 4, 3, 5.85), f('tree', 2, 2, 1.4, 1.4)],
};
const parts = gardenParts(plan);
assert.deepEqual([parts.walk.x, parts.drive.x, parts.path.x], [7, 12.4, 7]);

const m = moveGardenPart(plan, 'walk', 3);
assert.ok(m.plan, m.error);
const at = (p, type) => p.furniture.filter((q) => q.type === type);
assert.equal(at(m.plan, 'gate_pedestrian')[0].x, 3);
assert.equal(m.plan.doors[0].x, 3, 'la porta del cancello segue');
assert.ok(at(m.plan, 'path').some((q) => q.x === 3 && q.w === 1), 'il camminamento segue il cancellino');
assert.ok(at(m.plan, 'path').some((q) => q.x === 12.4), 'il vialetto carrabile resta');
// la recinzione si ricalcola: nessuna siepe nei varchi, e copre il resto
const fences = at(m.plan, 'fence').sort((a, b) => a.x - b.x);
for (const fe of fences) for (const g of [...at(m.plan, 'gate_pedestrian'), ...at(m.plan, 'gate_driveway')]) assert.ok(fe.x + fe.w <= g.x + 1e-6 || fe.x >= g.x + g.w - 1e-6, 'siepe nel varco');
assert.ok(fences[0].x === 0 && Math.abs(fences[0].w - 3) < 1e-6);

// contro l'altro cancello: rifiutato; ai bordi: bloccato dentro la siepe laterale
assert.ok(moveGardenPart(plan, 'walk', 11.6).error);
assert.equal(moveGardenPart(plan, 'walk', -5).plan.furniture.find((q) => q.type === 'gate_pedestrian').x, 0.6);
// cancello carrabile con il suo vialetto; il camminamento da solo
const d = moveGardenPart(plan, 'drive', 9);
assert.ok(d.plan && at(d.plan, 'gate_driveway')[0].x === 9 && at(d.plan, 'path').some((q) => q.x === 9 && q.w === 3));
assert.equal(d.plan.doors[0].x, 7, 'la porta del cancello pedonale non si muove');
const pth = moveGardenPart(plan, 'path', 5);
assert.ok(pth.plan && at(pth.plan, 'gate_pedestrian')[0].x === 7 && at(pth.plan, 'path').some((q) => q.x === 5));
assert.equal(moveGardenPart({ ...plan, furniture: [] }, 'walk', 3).error, 'Questa parte non c\'è nel giardino');
console.log('gardenedit ok');
