/* Impianto del loft: luci a parete sul soppalco, luci sotto il soppalco sotto il solaio, nulla dentro le finestre; tende e specchi nel 3D. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { planElectric } from '../src/lib/electric.js';
import { opening } from '../src/lib/ajax.js';
import { buildScene } from '../src/lib/scene3d.js';
import { THEMES } from '../src/lib/themes.js';

const room = (id, name, kind, x, y, w, h) => ({ id, name, kind, x, y, w, h });
const mezz = { x: 8.4, y: 0, w: 3.6, h: 8, elev: 2.6, slab: 0.2, parapet: 1, open: ['W'],
  stair: { x: 4.35, y: 6.9, w: 4.05, h: 0.9, up: 'E', type: 'straight', risers: 15 } };
const plan = {
  scale: 50, wallThickness: 10, dimensions: { width: 12, length: 8 }, height: 5, mezzanine: mezz,
  rooms: [room(1, 'Soggiorno', 'living', 0, 0, 8.4, 8), room(2, 'Bagno', 'bath', 8.4, 0, 3.6, 3), room(3, 'Cucina', 'kitchen', 8.4, 3, 3.6, 5)],
  windows: [{ x: 0.5, y: 0, w: 4, rot: 0 }, { x: 5, y: 0, w: 3, rot: 0 }, { x: 0.5, y: 8, w: 4, rot: 0 }],
  doors: [{ x: 6.5, y: 8, w: 1, rot: 0, openDir: 1, entrance: true }],
  walls: [{ x: 0, y: 0, w: 12, h: 0.2 }, { x: 0, y: 7.8, w: 12, h: 0.2 }],
  furniture: [
    { type: 'bed', x: 10, y: 1, w: 2, h: 1.6, facing: 'W', room: 1, elev: 2.6 },
    { type: 'nightstand', x: 11.5, y: 0.5, w: 0.45, h: 0.4, facing: 'S', room: 1, elev: 2.6 },
    { type: 'sink', x: 10.2, y: 5.5, w: 0.6, h: 0.45, facing: 'S', room: 1, elev: 2.6 },
    { type: 'sink', x: 9, y: 0.3, w: 0.6, h: 0.45, facing: 'N', room: 2 },
  ],
};
const ep = planElectric({ floors: [{ id: 'f', level: 0, name: 'Loft', plan }] }, { level: 2 }).floors.f;

const up = ep.points.filter((p) => p.elev);
assert.ok(up.filter((p) => p.kind === 'light_wall').length >= 2, 'luci a parete sul soppalco');
assert.ok(!up.some((p) => p.kind === 'light'), 'sul soppalco niente luci a soffitto');
assert.ok(up.every((p) => p.elev === 2.6 && (p.nx || p.ny)), 'tutti a parete');
assert.ok(up.some((p) => p.kind === 'switch'), 'comando vicino alla scala');
const under = ep.points.filter((p) => p.kind === 'light' && p.x > mezz.x && p.x < mezz.x + mezz.w && p.y < mezz.y + mezz.h);
assert.ok(under.every((p) => p.ceil <= 2.4 + 1e-9), 'luci sotto il soppalco sotto il solaio');
const glass = plan.windows.map((w) => opening(plan, w));
for (const p of ep.points.filter((q) => !q.elev && (q.nx || q.ny))) {
  assert.ok(!glass.some((op) => Math.abs((p.x - op.cx) * op.ux + (p.y - op.cy) * op.uy) < op.w / 2 + 0.15
    && Math.abs((p.x - op.cx) * op.nx + (p.y - op.cy) * op.ny) < op.t / 2 + 0.3 && Math.abs(p.nx * op.nx + p.ny * op.ny) > 0.5), `${p.kind} dentro una finestra`);
}

const g = buildScene(THREE, { ...plan, doors: [] }, THEMES.modern);
const arredi = g.children.filter((c) => c.userData.layer === 'ARREDI');
assert.ok(arredi.length > 10, 'tende e specchi nel 3D');
assert.ok(g.children.some((c) => c.userData.layer === 'LUCI'), 'luce sopra lo specchio');
console.log('soppalco-impianti ok');
