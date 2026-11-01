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
// nel 3D nessuna luce o cavo sotto il soppalco sale oltre il solaio (2,60 m): né plafoniere né tubi
import { buildOverlays } from '../src/lib/overlays3d.js';
{
  const ov = buildOverlays(THREE, { floors: [{ floor: { id: 'f' }, y: 0, plan }], electric: { floors: { f: ep } }, theme: THEMES.industrial });
  const underMezz = (o) => { const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()); return c.x > mezz.x && c.x < mezz.x + mezz.w && c.z < mezz.y + mezz.h; };
  const lamps = ov.lights.children.filter((o) => o.name === 'PLAFONIERA' && underMezz(o));
  assert.ok(lamps.length >= 2, 'plafoniere sotto il soppalco');
  for (const o of lamps) assert.ok(new THREE.Box3().setFromObject(o).max.y <= 2.4 + 1e-6, 'plafoniera sotto il solaio');
  for (const o of ov.cables.children.filter((c) => c.position.x > mezz.x && c.position.y < 2.5)) assert.ok(o.position.y <= 2.4, 'cavo sotto il solaio');
  const upCables = ov.cables.children.filter((c) => Math.abs(c.position.y - (2.6 + 2.3)) < 1e-6);
  assert.ok(upCables.length >= 1, 'cavi del soppalco in quota sul soppalco');
}
console.log('soppalco-impianti ok');

// porta scorrevole del bagnetto: tutta dentro il bagno, anta sul varco sul filo interno del muro, binario che non esce dal muro
import { slideDoor } from '../src/lib/mezz.js';
import { itemProblems } from '../src/lib/furnitureEdit.js';
const bathMz = { ...mezz, bath: { walls: [{ x: 10.6, y: 1.5, w: 1.4, h: 0.1 }, { x: 10.6, y: 0, w: 0.1, h: 0.1 }, { x: 10.6, y: 0.85, w: 0.1, h: 0.75 }], door: { x: 10.6, y: 0.1, w: 0.1, h: 0.75 } } };
const sd = slideDoor(bathMz);
assert.ok(sd && sd.vertical && sd.closed.x >= 10.7 && sd.closed.h >= 0.75, JSON.stringify(sd));   // dentro il bagno (lato +x), copre il varco
assert.ok(sd.open.y > sd.closed.y, 'scorre verso il tratto di muro più lungo');
assert.ok(sd.rail.y >= 0 - 1e-9 && sd.rail.y + sd.rail.h <= 1.6 + 1e-9, 'il binario non esce dal muro del bagno');
assert.ok(sd.open.y + sd.open.h <= 1.6 + 0.05, 'anta aperta ancora dentro il tratto di muro');
for (const q of [sd.closed, sd.open, sd.rail]) assert.ok(q.x > 10.6, 'niente fuori dal bagno, verso il letto');
const gs = buildScene(THREE, { ...plan, doors: [], mezzanine: bathMz }, THEMES.modern);
assert.ok(gs.children.filter((c) => c.userData.layer === 'PORTE').length === 2, 'anta e binario nel 3D');

// TV davanti a una finestra: segnalata; su una parete piena no
const tvPlan = { ...plan, furniture: [{ type: 'tv', x: 1, y: 0.15, w: 1.6, h: 0.25, facing: 'S', room: 1 }, { type: 'tv', x: 6, y: 7.5, w: 1.6, h: 0.25, facing: 'N', room: 1 }] };
assert.ok(itemProblems(tvPlan, 0).some((q) => q.includes('finestra')), 'TV sulla finestra');
assert.ok(!itemProblems(tvPlan, 1).some((q) => q.includes('finestra')), 'TV su parete piena');
console.log('soppalco-impianti 2 ok');
