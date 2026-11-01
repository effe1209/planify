/* Scena per il path tracing (lib/pathTrace.js): geometrie uniformi, una mesh per materiale, tetto e soffitti presenti. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PathTracingSceneGenerator } from 'three-gpu-pathtracer';
import { buildRenderScene } from '../src/lib/renderScene.js';
import { preparePathTraceScene } from '../src/lib/pathTrace.js';

const room = (id, name, kind, x, y, w, h) => ({ id, name, kind, x, y, w, h });
const plan = {
  scale: 50, wallThickness: 10, dimensions: { width: 12, length: 8 }, height: 5,
  rooms: [room(1, 'Soggiorno', 'living', 0, 0, 12, 8)],
  windows: [{ x: 1, y: 0, w: 3, rot: 0 }], doors: [{ x: 6, y: 8, w: 1, rot: 0, openDir: 1, entrance: true }],
  walls: [{ x: 0, y: 0, w: 12, h: 0.2 }, { x: 0, y: 7.8, w: 12, h: 0.2 }, { x: 0, y: 0, w: 0.2, h: 8 }, { x: 11.8, y: 0, w: 0.2, h: 8 }],
  furniture: [{ type: 'sofa', x: 2, y: 3, w: 2.2, h: 0.9, facing: 'S', room: 1 }, { type: 'table', x: 6, y: 3, w: 1.6, h: 0.9, facing: 'S', room: 1 }],
};
const project = { name: 'prova', floors: [{ id: 'f', name: 'Loft', level: 0, plan, meta: { style: 'industrial' } }] };
const built = buildRenderScene(THREE, project, { time: 'afternoon', roof: true });
const before = [];
built.model.traverse((o) => { if (o.isMesh) before.push(o); });
assert.ok(before.some((o) => Array.isArray(o.material)), 'i muri hanno una faccia per lato (più materiali)');
const split = preparePathTraceScene(THREE, built.model);
assert.ok(split > 0, 'mesh a più materiali divise');
const after = [];
built.model.traverse((o) => { if (o.isMesh) after.push(o); });
assert.ok(after.every((o) => !Array.isArray(o.material)), 'un materiale per mesh');
assert.ok(after.every((o) => !o.geometry.index && o.geometry.attributes.uv && o.geometry.attributes.normal), 'non indicizzate, con uv e normali');
assert.ok(after.some((o) => o.userData.layer === 'TETTO'), 'il tetto c\'è');
assert.ok(after.some((o) => o.userData.layer === 'SOFFITTI'), 'i soffitti ci sono');
// il path tracing le vede tutte: l'ingombro della geometria arriva alla cima del tetto
const res = new PathTracingSceneGenerator(built.scene).generate(() => {});
const g = res.bvh.geometry;
g.computeBoundingBox();
const roofTop = new THREE.Box3().setFromObject(built.model).max.y;
assert.ok(g.boundingBox.max.y >= roofTop - 1e-3, `tetto nel path tracing: ${g.boundingBox.max.y} ≥ ${roofTop}`);
assert.ok(res.bvh.geometry.attributes.position.count / 3 >= after.reduce((a, o) => a + o.geometry.attributes.position.count / 3, 0) * 0.9, 'triangoli persi');
console.log('pathtrace ok');
