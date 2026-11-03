/* Portico d'ingresso della casa in legno: si spegne con materials.porch = false (lib/materials.js, lib/timber.js, lib/scene3d.js). */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cleanMaterials } from '../src/lib/materials.js';
import { themeWithPalette } from '../src/lib/palette.js';
import { THEMES } from '../src/lib/themes.js';
import { buildScene } from '../src/lib/scene3d.js';

assert.deepEqual(cleanMaterials({ structure: 'wood', porch: false }), { structure: 'wood', porch: false });
assert.deepEqual(cleanMaterials({ structure: 'wood' }), { structure: 'wood' });
assert.equal(cleanMaterials({ porch: false }), null, 'senza struttura in legno il portico non c\'entra');
assert.deepEqual(cleanMaterials({ structure: 'wood', porch: true }), { structure: 'wood' }, 'acceso è lo stato di serie: non si salva');

const plan = {
  dimensions: { width: 8, length: 6 }, scale: 50, wallThickness: 10,
  rooms: [{ id: 1, name: 'Soggiorno', kind: 'living', x: 0, y: 0, w: 8, h: 6, color: '#f5f5f5' }],
  walls: [{ x: 0, y: 0, w: 8, h: 0.2 }, { x: 0, y: 5.8, w: 8, h: 0.2 }, { x: 0, y: 0, w: 0.2, h: 6 }, { x: 7.8, y: 0, w: 0.2, h: 6 }],
  doors: [{ x: 3, y: 5.8, w: 1, rot: 0, openDir: -1, entrance: true }], windows: [], furniture: [], stairs: [],
};
const has = (materials) => {
  const scene = buildScene(THREE, plan, themeWithPalette(THEMES.modern, null, materials));
  let n = 0;
  scene.traverse((o) => { if (o.name === 'PORTICO') n++; });
  return n;
};
assert.equal(has({ structure: 'wood' }), 1, 'la casa in legno ha la tettoia all\'ingresso');
assert.equal(has({ structure: 'wood', porch: false }), 0, 'spenta: niente tettoia (pilastri e travi restano)');
assert.equal(has(null), 0);
console.log('porch ok');
