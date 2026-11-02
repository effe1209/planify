/* Luci bilanciate: la potenza di un punto luce segue la superficie del locale, e l'applique del bagno si centra sullo specchio. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildOverlays } from '../src/lib/overlays3d.js';
import { THEMES } from '../src/lib/themes.js';

const plan = {
  scale: 50, wallThickness: 10, dimensions: { width: 12, length: 6 },
  rooms: [{ id: 1, kind: 'living', name: 'Soggiorno', x: 0, y: 0, w: 9, h: 6 }, { id: 2, kind: 'bath', name: 'Bagno', x: 9, y: 0, w: 3, h: 2 }],
  walls: [], doors: [], windows: [],
  furniture: [{ type: 'sink', x: 10.2, y: 0.05, w: 0.8, h: 0.5, facing: 'S', room: 2 }],
};
const pt = (kind, room, x, y, nx = 0, ny = 0) => ({ id: `${kind}${x}${y}`, floor: 'f1', room, kind, x, y, nx, ny, circuit: 'L' });
const electric = { floors: { f1: { points: [pt('light', 1, 2, 3), pt('light', 1, 5, 3), pt('light', 1, 7, 3), pt('light', 2, 10.5, 1), pt('light_wall', 2, 9.4, 0.06, 0, 1)], links: [] } } };
const ov = buildOverlays(THREE, { floors: [{ floor: { id: 'f1' }, y: 0, plan }], devices: [], electric, theme: THEMES.modern });
const ks = ov.lightPoints.map((l) => l.k);
assert.ok(ks.every((k) => k >= 0.3 && k <= 1.5));
const living = ov.lightPoints.filter((l) => l.x < 9 && l.y > 1.5);
const bath = ov.lightPoints.filter((l) => l.x > 9);
// un locale grande con più punti non resta spento, un bagno con due punti non brucia: sono vicini, con il bagno un po' più basso
const avg = (a) => a.reduce((s, l) => s + l.k, 0) / a.length;
assert.ok(avg(living) > avg(bath) && avg(living) < 1.6 && avg(bath) >= 0.3, `${avg(living)} ${avg(bath)}`);
assert.ok(avg(living) / avg(bath) < 3.5, 'differenza contenuta');
assert.ok(!ov.lightPoints.some((l) => l.plan), 'niente riferimenti alla pianta nei punti');
// l'applique del bagno è centrata sul lavabo (x = 10,2 + 0,4) e sopra la barra dello specchio
const sconce = ov.lights.children.find((c) => c.name === 'IMP_LIGHT_WALL');
assert.ok(sconce, 'applique');
const bb = new THREE.Box3().setFromObject(sconce);
assert.ok(Math.abs((bb.min.x + bb.max.x) / 2 - 10.6) < 0.05, `centro x ${(bb.min.x + bb.max.x) / 2}`);
assert.ok(bb.min.y > 1.9, 'sopra la barra luce');
console.log('lights ok');
