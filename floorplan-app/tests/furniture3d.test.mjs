/* Arredi 3D come oggetti e blocchi nel DXF 3D (lib/furniture3d.js, lib/dxf3d.js). */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildScene } from '../src/lib/scene3d.js';
import { sceneToDxf } from '../src/lib/dxf3d.js';
import { buildObject, hasObject, localSize, objectKey } from '../src/lib/furniture3d.js';
import { THEMES } from '../src/lib/themes.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, ...extra });
const M = new Proxy({}, { get: (t, k) => (t[k] ||= mat('#cccccc')) });

// ogni tipo con un modello è un gruppo con nome, misure locali e più pezzi; la rotazione segue il lato
for (const type of ['bed', 'wardrobe', 'dresser', 'shelving', 'shelving_heavy', 'bookcase', 'car', 'motorbike', 'toilet', 'bidet', 'sink',
  'shower', 'shower_round', 'shower_walkin', 'bathtub', 'office_chair']) {
  assert.ok(hasObject(type), type);
  const it = { type, x: 1, y: 2, w: type === 'car' ? 1.9 : 1.2, h: type === 'car' ? 4.5 : 0.6, facing: 'E' };
  const g = buildObject(THREE, it, M, mat);
  assert.ok(g && g.userData.furniture.type === type, type);
  const meshes = []; g.traverse((o) => o.isMesh && meshes.push(o));
  assert.ok(meshes.length >= 3, `${type}: ${meshes.length} pezzi`);
  assert.deepEqual(localSize(it), [it.h, it.w]);                 // a est la larghezza è la profondità del rettangolo
  assert.ok(Math.abs(g.rotation.y - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(g.position.x - (it.x + it.w / 2)) < 1e-9);
  // il modello sta nell'ingombro (tolti sporgenze come le ante o i pomelli)
  const bb = new THREE.Box3().setFromObject(g);
  assert.ok(bb.max.y > 0.3 && bb.min.y > -0.01, `${type}: quota ${bb.min.y}..${bb.max.y}`);
}
assert.equal(objectKey('bed', 1.6, 2.0), 'LETTO_160X200');

// scena con due letti uguali e un'auto: DXF con due blocchi e tre inserimenti, facce nei blocchi
const plan = {
  scale: 50, wallThickness: 10, dimensions: { width: 8, length: 6 },
  rooms: [{ id: 1, kind: 'bed', name: 'Camera', x: 0, y: 0, w: 8, h: 6 }], walls: [], doors: [], windows: [],
  furniture: [
    { type: 'bed', x: 1, y: 1, w: 1.6, h: 2, facing: 'S' }, { type: 'bed', x: 5, y: 1, w: 1.6, h: 2, facing: 'N' },
    { type: 'car', x: 3, y: 1, w: 1.9, h: 4.5, facing: 'S' }, { type: 'table', x: 3, y: 5, w: 1, h: 0.6 },
  ],
};
const scene = buildScene(THREE, plan, THEMES.modern);
const dxf = sceneToDxf(THREE, scene);
assert.deepEqual([...dxf.blocks].sort(), ['AUTO_190X450', 'LETTO_160X200']);
assert.equal(dxf.inserts, 3);
const text = dxf.text;
assert.equal((text.match(/\nINSERT\n/g) || []).length, 3);
assert.equal((text.match(/\nBLOCK\n/g) || []).length, 2);
assert.ok(text.indexOf('BLOCKS') < text.indexOf('ENTITIES'));
// il letto ruotato verso nord è inserito a 180°
assert.ok(/\n50\n180\n/.test(text), 'rotazione 180');
if (process.argv[2]) writeFileSync(process.argv[2], text);
console.log(`furniture3d ok: ${dxf.faces} facce, blocchi ${dxf.blocks.join(', ')}`);
