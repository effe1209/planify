/* Schizzi a mano: vetrata panoramica nel soggiorno e mensola dentro il poligono. */
import assert from 'node:assert/strict';
import { sketchToPlan } from '../src/lib/sketchToPlan.js';
import { autoDecoratePlan } from '../src/lib/accessories.js';
import * as G from '../src/lib/geometry.js';

const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const plan = sketchToPlan([
  { kind: 'living', name: 'Soggiorno', poly: rect(0, 0, 7, 5) },
  { kind: 'bed', name: 'Camera', poly: rect(7, 0, 4, 5) },
]);
const pano = plan.windows.filter((w) => w.type === 'panoramic');
assert.equal(pano.length, 1, 'una vetrata nel soggiorno');
assert.ok(pano[0].w >= 1.6 && pano[0].w <= 2.4);

const deco = autoDecoratePlan(plan);
const shelves = deco.furniture.filter((f) => f.type === 'wall_shelf');
assert.ok(shelves.length >= 1, 'mensole anche negli schizzi');
for (const sh of shelves) {
  const room = deco.rooms.find((r) => r.id === sh.room);
  for (const q of [[sh.x, sh.y], [sh.x + sh.w, sh.y], [sh.x, sh.y + sh.h], [sh.x + sh.w, sh.y + sh.h]]) assert.ok(G.pointInPolygon(q, room.poly), 'la mensola sta dentro la stanza');
}
console.log('sketchengine ok');
