/* Stili nel 3D: kit distinti, facciata solo sul lato esterno dei muri, un solo stile di facciata per la casa. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildHouse, buildScene } from '../src/lib/scene3d.js';
import { STYLE_KITS, styleKit, uvMeters } from '../src/lib/style3d.js';
import { THEMES } from '../src/lib/themes.js';

// sei kit con facciate, tetti e pavimenti tutti diversi
const ids = Object.keys(STYLE_KITS);
assert.equal(ids.length, 6);
for (const key of ['facade', 'roof', 'floor']) {
  const vals = new Set(ids.map((i) => JSON.stringify(STYLE_KITS[i][key])));
  assert.equal(vals.size, 6, `${key} uguale tra due stili`);
}
assert.equal(styleKit('boh'), STYLE_KITS.modern);
assert.ok(ids.every((id) => THEMES[id].id === id));

// stanza 6×4 con quattro muri da 20 cm (coordinate in metri; scala 50 px/m)
const t = 0.2;
const plan = (extra = {}) => ({
  scale: 50, wallThickness: t * 50, dimensions: { width: 6, length: 4 },
  rooms: [{ id: 1, kind: 'living', name: 'Soggiorno', x: 0, y: 0, w: 6, h: 4 }],
  walls: [{ x: -t / 2, y: -t / 2, w: 6 + t, h: t }, { x: -t / 2, y: 4 - t / 2, w: 6 + t, h: t }, { x: -t / 2, y: -t / 2, w: t, h: 4 + t }, { x: 6 - t / 2, y: -t / 2, w: t, h: 4 + t }],
  doors: [], windows: [], furniture: [], ...extra,
});

const wallMeshes = (g) => { const out = []; g.traverse((o) => { if (o.isMesh && o.userData.layer === 'MURI' && Array.isArray(o.material)) out.push(o); }); return out; };
const colorOf = (m) => m.color.getHexString();

const facadeColors = new Set();
for (const id of ids) {
  const g = buildScene(THREE, plan(), THEMES[id]);
  const walls = wallMeshes(g);
  assert.equal(walls.length, 4, id);
  const north = walls.find((m) => m.position.z < 1);   // muro in alto: l'esterno è verso -z (faccia nz = 5), l'interno verso +z (pz = 4)
  assert.notEqual(colorOf(north.material[5]), colorOf(north.material[4]), `${id}: facciata uguale all'interno`);
  assert.equal(colorOf(north.material[4]), STYLE_KITS[id].wallIn.color.slice(1), `${id}: interno`);
  const west = walls.find((m) => m.position.x < 1 && m.geometry.parameters.depth > 3);   // esterno verso -x (faccia nx = 1)
  assert.notEqual(colorOf(west.material[1]), colorOf(west.material[0]), `${id}: facciata ovest`);
  facadeColors.add(colorOf(north.material[5]));
}
assert.equal(facadeColors.size, 6, 'le sei facciate hanno colori diversi');

// l'interno di un muro tra due locali resta chiaro su entrambe le facce
const two = plan({
  rooms: [{ id: 1, kind: 'living', name: 'A', x: 0, y: 0, w: 3, h: 4 }, { id: 2, kind: 'bed', name: 'B', x: 3, y: 0, w: 3, h: 4 }],
});
two.walls.push({ x: 3 - t / 2, y: 0, w: t, h: 4 });
const inner = wallMeshes(buildScene(THREE, two, THEMES.industrial)).find((m) => Math.abs(m.position.x - 3) < 0.01 && m.geometry.parameters.depth > 3);
assert.equal(new Set(inner.material.map(colorOf)).size, 1, 'muro interno con una facciata');

// casa a due piani con stili diversi: la facciata è quella del piano terra
const house = buildHouse(THREE, { floors: [
  { id: 'a', level: 0, name: 'PT', plan: plan(), meta: { style: 'classic' } },
  { id: 'b', level: 1, name: 'P1', plan: plan(), meta: { style: 'industrial' } },
] }, (f) => THEMES[f.meta.style]);
const outside = new Set();
house.traverse((o) => { if (o.isMesh && o.userData.layer === 'MURI' && Array.isArray(o.material) && o.position.z < 1) outside.add(colorOf(o.material[5])); });
assert.deepEqual([...outside], [STYLE_KITS.classic.facade.color.slice(1)], 'facciata del piano terra su tutti i piani');

// UV in metri sulle facce di un box
const geo = new THREE.BoxGeometry(4, 2.7, 0.2);
uvMeters(geo, 4, 2.7, 0.2);
const uv = geo.attributes.uv;
const us = Array.from({ length: 4 }, (_, k) => uv.getX(16 + k));   // faccia +z: larghezza 4 m
assert.ok(Math.abs(Math.max(...us) - 4) < 1e-9);
console.log('style3d ok');
