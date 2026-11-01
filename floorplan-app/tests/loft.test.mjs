/* Loft con soppalco (planner → scena 3D) e requisiti per tutto il complesso (lib/compliance.js). */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { checkCompliance } from '../src/lib/compliance.js';
import { buildScene } from '../src/lib/scene3d.js';
import { THEMES } from '../src/lib/themes.js';

const room = (id, name, kind, x, y, w, h) => ({ id, name, kind, x, y, w, h });
const floor = (rooms, extra = {}) => ({ rooms, windows: [{ x: 0.5, y: 0, w: 3, rot: 0 }, { x: 6, y: 0, w: 3, rot: 0 }], doors: [], ...extra });
const ids = (r) => r.items.map((i) => i.id);

// bagno completo di 6 m² in un solo piano: l'altro piano può non averne
const day = floor([room(1, 'Soggiorno', 'living', 0, 0, 8, 5), room(2, 'Bagno', 'bath', 8, 0, 2.5, 2.4)]);
const night = floor([room(3, 'Camera', 'bed', 0, 0, 4, 4), room(4, 'Camera 2', 'bed', 4, 0, 4, 4)]);
let r = checkCompliance(night, { type: 'apartment', complex: [{ plan: day, type: 'apartment' }] });
assert.ok(!ids(r).includes('bath'), 'il bagno del piano sotto vale per tutto il complesso');
assert.ok(!ids(r).includes('bath-size'), JSON.stringify(r.items));
assert.ok(r.ok.some((t) => t.includes('Bagno completo')));
// senza bagni in tutto il complesso manca
r = checkCompliance(night, { type: 'apartment' });
assert.ok(ids(r).includes('bath'));
// bagno più piccolo di 6 m² ovunque: attenzione
const small = floor([room(1, 'Soggiorno', 'living', 0, 0, 8, 5), room(2, 'Bagno', 'bath', 8, 0, 2, 2)]);
assert.ok(ids(checkCompliance(small, { type: 'apartment' })).includes('bath-size'));
// la superficie dell'alloggio si somma sui piani: 20 m² da soli non bastano, con l'altro piano sì
const tiny = floor([room(1, 'Camera', 'bed', 0, 0, 5, 4)]);
assert.ok(ids(checkCompliance(tiny, { type: 'apartment' })).includes('dwelling'));
assert.ok(!checkCompliance(tiny, { type: 'apartment', complex: [{ plan: day, type: 'apartment' }] }).items.some((i) => i.id === 'dwelling' && i.level === 'fail'));
// un garage non è un piano abitato
assert.ok(ids(checkCompliance(night, { type: 'apartment', complex: [{ plan: day, type: 'garage' }] })).includes('bath'));

// loft con soppalco
const mezz = { x: 8.4, y: 0, w: 3.6, h: 8, elev: 2.6, slab: 0.2, parapet: 1, open: ['W'],
  stair: { x: 4.35, y: 6.9, w: 4.05, h: 0.9, up: 'E', type: 'straight', risers: 15 } };
const loft = { ...floor([room(1, 'Soggiorno', 'living', 0, 0, 8.4, 8), room(2, 'Bagno', 'bath', 8.4, 0, 3.6, 3), room(3, 'Cucina', 'kitchen', 8.4, 3, 3.6, 5)],
  { windows: [{ x: 0.5, y: 0, w: 4, rot: 0 }, { x: 5, y: 0, w: 3, rot: 0 }, { x: 0.5, y: 8, w: 4, rot: 0 }] }),
  height: 5, mezzanine: mezz, scale: 50, wallThickness: 10, furniture: [{ type: 'bed', x: 10, y: 1, w: 2, h: 1.6, facing: 'W', room: 1, elev: 2.6 }] };
r = checkCompliance(loft, { type: 'open-space', height: 5 });
assert.ok(!r.items.some((i) => i.id.startsWith('mezz')), JSON.stringify(r.items));
assert.ok(r.ok.some((t) => t.includes('Soppalco')) && r.ok.some((t) => t.includes('Parapetto')));
assert.ok(ids(checkCompliance({ ...loft, mezzanine: { ...mezz, w: 6.5 } }, { type: 'open-space', height: 5 })).includes('mezz-area'));
assert.ok(ids(checkCompliance(loft, { type: 'open-space', height: 4.2 })).includes('mezz-above'));
assert.ok(ids(checkCompliance({ ...loft, mezzanine: { ...mezz, parapet: 0.8 } }, { type: 'open-space', height: 5 })).includes('mezz-parapet'));

// 3D: muri alti come il loft, solaio del soppalco, parapetto con il varco della scala, letto alla quota del soppalco
const g = buildScene(THREE, { ...loft, walls: [{ x: 0, y: 0, w: 12, h: 0.2 }], doors: [], windows: [] }, THEMES.industrial);
const box = new THREE.Box3().setFromObject(g);
assert.ok(box.max.y > 4.9, `muri alti ${box.max.y}`);
const layersOf = (grp, n) => grp.children.filter((c) => c.userData.layer === n);
const layers = (n) => layersOf(g, n);
assert.equal(layers('SOLAI').length, 1);
assert.ok(layers('RINGHIERE').length >= 2, 'parapetto');
const bedObj = g.children.find((c) => Math.abs(c.position.y - 2.6) < 1e-6 && !c.userData.layer);
assert.ok(bedObj, 'il letto sta sul soppalco');
const steps = layers('SCALE');
assert.ok(steps.length === 15 && Math.max(...steps.map((c) => new THREE.Box3().setFromObject(c).max.y)) <= 2.61, `gradini ${steps.length}`);
// la ringhiera segue la rampa del soppalco; i tramezzi che toccano il perimetro con un'estremità restano bassi sotto il soppalco
const rails = layers('RINGHIERE');
assert.ok(rails.some((c) => Math.abs(c.rotation.z) > 0.1 || Math.abs(c.rotation.x) > 0.1), 'ringhiera inclinata sulla scala');
const part = buildScene(THREE, { ...loft, walls: [{ x: 8.4, y: 0, w: 0.2, h: 8 }, { x: 8.4, y: 3, w: 3.6, h: 0.2 }], doors: [], windows: [] }, THEMES.industrial);
const pbox = new THREE.Box3().setFromObject(part);
assert.ok(layersOf(part, 'MURI').every((c) => new THREE.Box3().setFromObject(c).max.y <= 2.41), 'tramezzi sotto il soppalco bassi');
console.log('loft ok');
