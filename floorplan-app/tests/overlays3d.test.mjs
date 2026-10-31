/* Sensori, impianto e luci nel 3D (lib/overlays3d.js) e nel DXF 3D. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildOverlays, setLights } from '../src/lib/overlays3d.js';
import { buildScene } from '../src/lib/scene3d.js';
import { sceneToDxf } from '../src/lib/dxf3d.js';
import { THEMES } from '../src/lib/themes.js';

const plan = {
  scale: 50, wallThickness: 10, dimensions: { width: 6, length: 4 },
  rooms: [{ id: 1, kind: 'living', name: 'Soggiorno', x: 0, y: 0, w: 6, h: 4 }], walls: [], doors: [], windows: [], furniture: [],
};
const floor = { id: 'f1' };
const devices = [
  { id: 'd1', model: 'hub2_plus', floor: 'f1', x: 1, y: 1 },
  { id: 'd2', model: 'motionprotect', floor: 'f1', x: 5.8, y: 2, dir: 180 },
  { id: 'd3', model: 'fireprotect2_co', floor: 'f1', x: 3, y: 2 },
  { id: 'dX', model: 'motionprotect', floor: 'altro', x: 1, y: 1 },     // di un altro piano: non compare
];
const pt = (kind, x, y, nx = 0, ny = 0) => ({ id: `${kind}${x}${y}`, floor: 'f1', room: 1, kind, x, y, nx, ny, circuit: 'L' });
const electric = { floors: { f1: {
  points: [pt('light', 2, 2), pt('light', 4, 2), pt('switch', 0.1, 1, 1, 0), pt('socket', 0.1, 3, 1, 0), pt('socket', 5.9, 3, -1, 0), pt('panel', 0.1, 0.5, 1, 0), pt('light_wall', 3, 0.05, 0, 1)],
  links: [{ kind: 'cmd', points: [[0.1, 1], [2, 2]] }, { kind: 'feed', points: [[0.1, 0.5], [0.1, 3]] }],
} } };

const ov = buildOverlays(THREE, { floors: [{ floor, y: 0, plan }], devices, electric, theme: THEMES.classic });
const names = (g) => g.children.map((c) => c.name);
assert.deepEqual(names(ov.sensors).sort(), ['AJAX_FIREPROTECT2_CO', 'AJAX_HUB2_PLUS', 'AJAX_MOTIONPROTECT']);
assert.equal(ov.electric.children.filter((c) => c.name === 'IMP_SOCKET').length, 2);
assert.equal(ov.lights.children.filter((c) => c.name === 'PLAFONIERA').length, 2);

// quote reali
const y = (g, n) => g.children.find((c) => c.name === n).position.y;
assert.equal(y(ov.electric, 'IMP_SWITCH'), 1.05);
assert.equal(y(ov.electric, 'IMP_SOCKET'), 0.3);
assert.equal(y(ov.electric, 'IMP_PANEL'), 1.5);
assert.equal(y(ov.sensors, 'AJAX_MOTIONPROTECT'), 2.4);
assert.equal(y(ov.sensors, 'AJAX_HUB2_PLUS'), 1.4);
assert.equal(y(ov.sensors, 'AJAX_FIREPROTECT2_CO'), 2.7);
// la presa a muro guarda verso l'interno (+x → rotazione π/2; -x → -π/2)
const sockets = ov.electric.children.filter((c) => c.name === 'IMP_SOCKET');
assert.ok(sockets.some((s) => Math.abs(s.rotation.y - Math.PI / 2) < 1e-6) && sockets.some((s) => Math.abs(s.rotation.y + Math.PI / 2) < 1e-6));
// cono del MotionProtect e due collegamenti
assert.ok(ov.cones.children.length >= 1);
assert.equal(ov.cables.children.length, 2);

// luci: spente tutto a zero, accese emissive e luci puntuali vere
assert.ok(ov.realLights.length >= 1 && ov.realLights.length <= 10);
setLights(ov, true);
assert.ok(ov.realLights.every((l) => l.intensity > 0));
assert.ok(ov.glow.every((m) => m.emissiveIntensity > 1));
setLights(ov, false);
assert.ok(ov.realLights.every((l) => l.intensity === 0));

// DXF: sensori e impianto sono blocchi su layer propri; nascosti, non escono
const scene = buildScene(THREE, plan, THEMES.classic);
for (const g of [ov.sensors, ov.electric, ov.cables, ov.cones, ov.lights]) scene.add(g);
const on = sceneToDxf(THREE, scene);
for (const l of ['SENSORI', 'IMP_PRESE', 'IMP_COMANDI', 'IMP_QUADRI', 'IMP_LUCI']) assert.ok(on.layers.includes(l), l);
assert.ok(on.blocks.some((b) => b.startsWith('AJAX_MOTIONPROTECT')));
ov.sensors.visible = false;
ov.electric.visible = false;
const off = sceneToDxf(THREE, scene);
assert.ok(!off.layers.includes('SENSORI') && !off.layers.includes('IMP_PRESE'));
console.log('overlays3d ok');
