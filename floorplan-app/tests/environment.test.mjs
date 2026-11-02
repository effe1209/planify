/* Terreno e ambiente dei render (lib/environment.js): quattro scelte, nessun bordo di terra in vista. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GROUNDS, addEnvironment } from '../src/lib/environment.js';

const house = () => {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 8), new THREE.MeshStandardMaterial());
  m.position.set(5, 2.5, 4);
  g.add(m);
  g.userData.grade = 0;
  return g;
};
const build = (mode, extra = {}) => { const scene = new THREE.Scene(); const model = house(); scene.add(model); const r = addEnvironment(THREE, scene, model, { mode, ...extra }); scene.updateMatrixWorld(true); return { scene, r }; };

assert.deepEqual(GROUNDS.map((g) => g.id), ['horizon', 'model', 'context', 'studio']);

// orizzonte: prato molto più grande della casa, niente nebbia (rovina gli effetti del render): il bordo sfuma in trasparenza (nel browser)
{
  const { scene, r } = build('horizon');
  const size = new THREE.Box3().setFromObject(r.ground).getSize(new THREE.Vector3());
  assert.ok(size.x > 100, `prato troppo piccolo: ${size.x}`);
  assert.equal(scene.fog, null);
  assert.ok(Math.abs(r.ground.position.y + 0.01) < 1e-9);
  assert.equal(r.ground.material.transparent, false);   // senza canvas (Node) resta pieno
}
// plastico: base con spessore e bordo, appena più grande della casa; sotto un fondale
{
  const { scene, r } = build('model');
  const bb = new THREE.Box3().setFromObject(r.ground);
  const sz = bb.getSize(new THREE.Vector3());
  assert.ok(sz.y > 0.2 && sz.y < 0.3 && sz.x > 10 && sz.x < 20 && sz.z > 8 && sz.z < 16, JSON.stringify(sz));
  const layers = []; scene.traverse((o) => o.userData?.layer && layers.push(o.userData.layer));
  assert.ok(layers.includes('TERRENO_BASE'));
  assert.equal(scene.fog, null);
}
// studio: pavimento senza fine
{
  const { scene, r } = build('studio');
  assert.equal(scene.fog, null);
  assert.ok(new THREE.Box3().setFromObject(r.ground).getSize(new THREE.Vector3()).x > 100);
}
// contesto: strada, marciapiede e due case vicine; la strada sta davanti all'ingresso (a sud: z oltre la casa)
{
  const { scene } = build('context', { front: 'S' });
  const bb = new THREE.Box3();
  let neigh = 0; let roads = 0;
  scene.traverse((o) => { if (o.isMesh && o.userData.layer === 'CONTESTO') { if (o.geometry.type === 'PlaneGeometry') { roads++; bb.expandByObject(o); } else neigh++; } });
  assert.ok(roads >= 4 && neigh >= 4, `${roads} ${neigh}`);
  assert.ok(bb.min.z > 8 - 0.01, 'la strada sta davanti al lotto');
  // l'ingresso a est ruota il contesto: la strada sta a est (x oltre la casa)
  const east = build('context', { front: 'E' }).scene;
  const be = new THREE.Box3();
  east.traverse((o) => { if (o.isMesh && o.userData.layer === 'CONTESTO' && o.geometry.type === 'PlaneGeometry') be.expandByObject(o); });
  assert.ok(be.min.x > 10 - 0.5, `strada a est: ${be.min.x}`);
}
console.log('environment ok');
