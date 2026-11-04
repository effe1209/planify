/* Finestra dietro il piano cucina: davanzale a 1,20 m, nessuna tenda; tende che non attraversano arredi né si toccano. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { raiseKitchenWindows, KITCHEN_SILL } from '../src/lib/kitchenWindows.js';
import { decorFor } from '../src/lib/decor.js';
import { glassSpan } from '../src/lib/openings.js';
import { buildScene } from '../src/lib/scene3d.js';
import { THEMES } from '../src/lib/themes.js';

const t = 0.2;
const plan = (furniture, windows) => ({
  scale: 50, wallThickness: t * 50, dimensions: { width: 6, length: 4 }, svgWidth: 300, svgHeight: 200,
  rooms: [{ id: 1, kind: 'living_kitchen', name: 'Cucina', x: 0, y: 0, w: 6, h: 4 }],
  walls: [{ x: 0, y: 0, w: 6, h: t }, { x: 0, y: 4 - t, w: 6, h: t }, { x: 0, y: 0, w: t, h: 4 }, { x: 6 - t, y: 0, w: t, h: 4 }],
  doors: [], windows, furniture,
});
const win = { x: 1.2, y: 0, w: 1.6, rot: 0 };
const counter = { type: 'kitchen_counter', x: 0.8, y: t, w: 2.4, h: 0.6, rot: 0, facing: 'S', room: 1 };

// dietro il piano: finestra alta e niente tenda
const k = raiseKitchenWindows(plan([counter], [win]));
assert.equal(k.windows[0].sill, KITCHEN_SILL);
assert.equal(k.windows[0].kitchen, true);
assert.equal(glassSpan(k.windows[0]).sill, KITCHEN_SILL);
assert.equal(decorFor(plan([counter], [win])).filter((d) => d.kind === 'curtain').length, 0, 'nessuna tenda dietro il piano cucina');
// senza piano cucina: finestra normale, con le sue tende
const free = plan([], [win]);
assert.equal(raiseKitchenWindows(free), free);
assert.equal(glassSpan(free.windows[0]).sill, 0.9);
assert.ok(decorFor(free).filter((d) => d.kind === 'curtain').length >= 1);
// una tenda non attraversa un armadio contro il muro
const wardrobe = { type: 'wardrobe', x: 2.8, y: t, w: 0.9, h: 0.6, rot: 0, facing: 'S', room: 1 };
const withW = decorFor(plan([wardrobe], [win])).filter((d) => d.kind === 'curtain');
assert.ok(withW.every((c) => { const x1 = c.x + c.ux * c.len; return !(Math.max(c.x, x1) > 2.8 && Math.min(c.x, x1) < 3.7); }), 'la tenda non entra nell\'armadio');
// due finestre vicine: i pannelli non si sovrappongono
const two = decorFor(plan([], [{ x: 1, y: 0, w: 1.4, rot: 0 }, { x: 2.5, y: 0, w: 1.4, rot: 0 }])).filter((d) => d.kind === 'curtain');
const spans = two.map((c) => [Math.min(c.x, c.x + c.ux * c.len), Math.max(c.x, c.x + c.ux * c.len)]).sort((a, b) => a[0] - b[0]);
for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] >= spans[i - 1][1] - 0.006, 'tende che si toccano');
// 3D: il vetro della finestra dietro il piano parte da 1,20 m
const scene = buildScene(THREE, plan([counter], [win]), THEMES.modern);
let lowGlass = Infinity;
scene.updateMatrixWorld(true);
scene.traverse((o) => { if (o.isMesh && o.material?.transparent && o.material.opacity < 0.5 && o.geometry.type === 'BoxGeometry') { const bb = new THREE.Box3().setFromObject(o); if (bb.max.y - bb.min.y > 0.5 && bb.min.z < 0.5) lowGlass = Math.min(lowGlass, bb.min.y); } });
assert.ok(Math.abs(lowGlass - KITCHEN_SILL) < 0.02, `vetro da ${lowGlass}`);
console.log('kitchenwindows ok');
