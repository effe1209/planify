/* Clic nel 3D: gli arredi, le aperture e i locali portano l'etichetta che permette di riconoscerli (lib/scene3d.js). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildScene } from '../src/lib/scene3d.js';
import { THEMES } from '../src/lib/themes.js';

const plans = JSON.parse(readFileSync(new URL('./fixtures/plans.json', import.meta.url)));
const base = plans.find((p) => p.doors.length && p.windows.length && p.furniture.length > 5);
const plan = { ...base, wallThickness: 10, scale: 50 };
const g = buildScene(THREE, plan, THEMES.modern);

const items = new Set();
const doors = new Set();
const windows = new Set();
const rooms = new Set();
g.traverse((o) => {
  const u = o.userData;
  if (u.itemIndex !== undefined) items.add(u.itemIndex);
  if (u.openingKind === 'door') doors.add(u.openingIndex);
  if (u.openingKind === 'window') windows.add(u.openingIndex);
  if (u.roomId !== undefined) rooms.add(u.roomId);
});
const solid = plan.furniture.map((f, i) => [f, i]).filter(([f]) => f.type !== 'rug');
assert.ok(items.size >= solid.length * 0.8, `arredi etichettati: ${items.size} su ${solid.length}`);
for (const i of items) assert.ok(i >= 0 && i < plan.furniture.length, 'indice valido');
assert.ok(doors.size >= plan.doors.filter((d) => d.kind !== 'gate').length - 1, 'porte etichettate');
assert.equal(windows.size, plan.windows.length, 'finestre etichettate');
assert.equal(rooms.size, plan.rooms.filter((r) => r.kind !== 'garden').length, 'locali etichettati');
for (const d of doors) assert.ok(plan.doors[d] && plan.doors[d].kind !== 'gate', 'indice porta valido');
console.log(`pick3d ok (${items.size} arredi, ${doors.size} porte, ${windows.size} finestre, ${rooms.size} locali)`);
