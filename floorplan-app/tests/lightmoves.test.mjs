/* Punti luce spostati a mano (project.lightMoves) e fronte del render dal lato del portoncino. */
import assert from 'node:assert/strict';
import { planElectric } from '../src/lib/electric.js';
import { cameraViews } from '../src/lib/renderStudio.js';
import { doorSide } from '../src/lib/project.js';

const t = 0.2;
const mk = (door) => ({
  scale: 50, wallThickness: t * 50, dimensions: { width: 10, length: 8 }, svgWidth: 500, svgHeight: 400,
  rooms: [{ id: 1, kind: 'living', name: 'Soggiorno', x: 0, y: 0, w: 10, h: 8 }],
  walls: [{ x: 0, y: 0, w: 10, h: t }, { x: 0, y: 8 - t, w: 10, h: t }, { x: 0, y: 0, w: t, h: 8 }, { x: 10 - t, y: 0, w: t, h: 8 }],
  doors: [door], windows: [{ x: 1, y: 0, w: 2, rot: 0 }], furniture: [],
});
const project = (door, extra = {}) => ({ name: 'p', floors: [{ id: 'a', name: 'Terra', level: 0, plan: mk(door), meta: { style: 'modern' } }], ...extra });

const base = planElectric(project({ x: 4, y: 7.8, w: 1, rot: 0, entrance: true }));
const lights = base.floors.a.points.filter((p) => p.kind === 'light');
assert.ok(lights.length >= 1 && lights.every((p) => p.moveKey));
const moved = planElectric(project({ x: 4, y: 7.8, w: 1, rot: 0, entrance: true }, { lightMoves: { [lights[0].moveKey]: { x: 2.5, y: 2.5 } } }));
const m0 = moved.floors.a.points.find((p) => p.moveKey === lights[0].moveKey);
assert.deepEqual([m0.x, m0.y], [2.5, 2.5]);
assert.ok(m0.moved);
// fuori dal locale: ignorato
const out = planElectric(project({ x: 4, y: 7.8, w: 1, rot: 0, entrance: true }, { lightMoves: { [lights[0].moveKey]: { x: 50, y: 50 } } }));
assert.deepEqual([out.floors.a.points.find((p) => p.moveKey === lights[0].moveKey).x], [lights[0].x]);

// fronte: dal lato del portoncino
assert.equal(doorSide(project({ x: 4, y: 7.8, w: 1, rot: 0, entrance: true })), 'S');
assert.equal(doorSide(project({ x: 4, y: 0, w: 1, rot: 0, entrance: true })), 'N');
assert.equal(doorSide(project({ x: 9.8, y: 3, w: 1, rot: 90, entrance: true })), 'E');
const front = (door) => cameraViews(project(door)).find((v) => v.id === 'front');
const f = front({ x: 4, y: 0, w: 1, rot: 0, entrance: true });
assert.ok(f.position[2] < f.target[2], 'porta a nord: la telecamera sta a nord');
const fe = front({ x: 9.8, y: 3, w: 1, rot: 90, entrance: true });
assert.ok(fe.position[0] > fe.target[0], 'porta a est: la telecamera sta a est');
console.log('lightmoves ok');
