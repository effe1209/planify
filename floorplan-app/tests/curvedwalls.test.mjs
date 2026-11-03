/* Muri curvi in 3D (scene3d.js): polilinee come muri, aperture oblique con vetro, stipiti e anta. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildScene } from '../src/lib/scene3d.js';
import { THEMES } from '../src/lib/themes.js';

// stanza tonda di raggio 2 m centrata in (3, 3): il contorno in 48 punti, le pareti come polilinea chiusa
const R = 2;
const ring = Array.from({ length: 48 }, (_, i) => [3 + R * Math.cos((i / 48) * 2 * Math.PI), 3 + R * Math.sin((i / 48) * 2 * Math.PI)]);
const S = 50;
const plan = {
  dimensions: { width: 6, length: 6 }, scale: S, wallThickness: 0.2 * S,
  rooms: [{ id: 1, name: 'Torre', kind: 'living', x: 1, y: 1, w: 4, h: 4, poly: ring, color: '#f5f5f5' }],
  walls: [], wallLines: [{ pts: ring, closed: true }],
  doors: [], windows: [{ x: 3 + R - 0.1, y: 2.3, w: 1.0, rot: 90, openDir: 1 }, { x: 2.2, y: 1.1, w: 0.8, rot: 17, openDir: 1 }],
  furniture: [], stairs: [],
};
const scene = buildScene(THREE, plan, THEMES.modern);
let walls = 0; let glass = 0; let rotated = 0;
scene.traverse((o) => {
  if (!o.isMesh) return;
  if (o.userData.layer === 'MURI') { walls++; if (Math.abs(o.rotation.y) > 0.01) rotated++; }
  if (o.userData.layer === 'VETRI') glass++;
});
assert.ok(walls >= 48, `un tratto di muro per segmento: ${walls}`);
assert.ok(rotated >= 40, 'i tratti sono ruotati lungo la curva');
assert.ok(glass >= 2, `una finestra verticale e una obliqua hanno il vetro: ${glass}`);
const bb = new THREE.Box3().setFromObject(scene);
assert.ok(bb.max.x < 5.3 && bb.min.x > 0.7 && bb.max.z < 5.3 && bb.min.z > 0.7, 'il cilindro resta dentro il suo ingombro');
// l'esterno ha la faccia dello stile: i tratti hanno un materiale diverso su un lato
let facade = 0;
scene.traverse((o) => { if (o.isMesh && o.userData.layer === 'MURI' && Array.isArray(o.material) && o.material[4] !== o.material[5]) facade++; });
assert.ok(facade >= 40, `faccia esterna su un lato: ${facade}`);
console.log('curvedwalls ok');
