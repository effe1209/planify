/* Misure e colore di un singolo arredo, e colore di porte e finestre (lib/furnitureEdit.js, lib/furnitureColor.js, lib/scene3d.js). */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { resizeItem } from '../src/lib/furnitureEdit.js';
import { shade, tintTheme, validColor } from '../src/lib/furnitureColor.js';
import { THEMES } from '../src/lib/themes.js';
import { buildScene } from '../src/lib/scene3d.js';
import { buildDxf } from '../src/lib/dxf.js';

const plan = {
  dimensions: { width: 6, length: 4 }, scale: 50, wallThickness: 10, height: 2.7,
  rooms: [{ id: 'r', x: 0, y: 0, w: 6, h: 4, kind: 'living', name: 'Salotto', color: '#f5f5f5' }],
  walls: [], wallLines: [], stairs: [],
  doors: [{ x: 2, y: 0, w: 0.9, rot: 0, openDir: 1, color: '#aa3322' }],
  windows: [{ x: 4, y: 0, w: 1.2, rot: 0, color: '#223344' }],
  furniture: [{ id: 's', room: 'r', type: 'sofa', x: 2, y: 1, w: 2, h: 0.9, facing: 'S', color: '#336699' }],
};
const it = plan.furniture[0];

// misure: centrate sul posto, proporzioni bloccate, limiti e dentro il locale
let r = resizeItem(plan, it, { w: 3 }, true);
assert.equal(r.w, 3);
assert.ok(Math.abs(r.h - 1.35) < 0.02, 'proporzioni bloccate');
assert.ok(Math.abs((r.x + r.w / 2) - 3) < 0.01, 'resta centrato');
r = resizeItem(plan, it, { w: 3 }, false);
assert.equal(r.h, 0.9);
assert.equal(resizeItem(plan, it, { w: 50 }).w, 5.6, 'non esce dal locale (filo muro)');
assert.equal(resizeItem(plan, it, { w: 0.01 }).w, 0.1, 'minimo 10 cm');

// colore
assert.equal(validColor('#ABCDEF'), '#abcdef');
assert.equal(validColor('rosso'), null);
assert.notEqual(shade('#808080', 0.2), '#808080');
const t = tintTheme(THEMES.modern, 'sofa', '#336699');
assert.equal(t.fabric, '#336699');
assert.equal(tintTheme(THEMES.modern, 'sofa', 'x'), THEMES.modern);
assert.equal(tintTheme(THEMES.modern, 'table', '#336699').wood, '#336699');

// 3D: nessun errore e il colore arriva ai materiali
const g = buildScene(THREE, plan, THEMES.modern);
const colors = new Set();
g.traverse((o) => { if (o.isMesh) [].concat(o.material).forEach((m) => m.color && colors.add(m.color.getHexString())); });
assert.ok(colors.has('336699'), 'divano colorato');
assert.ok(colors.has('aa3322'), 'porta colorata');
assert.ok(colors.has('223344'), 'finestra colorata');
console.log('itemedit ok');

// rotazione libera
{
  const { itemBox, itemProblems, normAngle, rotateItemBy, setItemRot, snapItem } = await import('../src/lib/furnitureEdit.js');
  assert.deepEqual(itemBox({ x: 1, y: 1, w: 2, h: 1 }), { x: 1, y: 1, w: 2, h: 1 }, 'senza rot: com\'è');
  const b45 = itemBox({ x: 0, y: 0, w: 2, h: 1, rot: 45 });
  assert.ok(Math.abs(b45.w - 3 / Math.SQRT2) < 1e-9 && Math.abs(b45.h - 3 / Math.SQRT2) < 1e-9, 'ingombro a 45°');
  assert.ok(Math.abs(b45.x + b45.w / 2 - 1) < 1e-9, 'resta centrato');
  const b90 = itemBox({ x: 0, y: 0, w: 2, h: 1, rot: 90 });
  assert.ok(Math.abs(b90.w - 1) < 1e-9 && Math.abs(b90.h - 2) < 1e-9);
  assert.equal(normAngle(-15), 345);
  assert.equal(normAngle(375), 15);
  assert.equal(setItemRot({ rot: 30 }, 360).rot, undefined, '0° toglie il campo');
  assert.equal(rotateItemBy({ rot: 350 }, 15).rot, 5);
  assert.equal(rotateItemBy({}, -15).rot, 345);
  // aggancio: l'ingombro ruotato si appoggia al muro (alla sinistra del locale c'è 0,2 m di muro)
  const it45 = { x: 1, y: 1, w: 2, h: 1, rot: 45, type: 'table', room: 'r' };
  const snapped = snapItem(plan, it45, 0.18, 1);
  const bb = itemBox({ ...it45, x: snapped.x, y: snapped.y });
  assert.ok(Math.abs(bb.x - 0.2) < 0.001, `bordo dell'ingombro a filo muro (${bb.x})`);
  // problemi: ruotato esce dal locale dove dritto ci sta
  const room = plan.rooms[0];
  const tight = { id: 't', room: 'r', type: 'table', x: room.x + 0.2, y: room.y + 0.2, w: room.w - 0.4, h: 0.4 };
  const p2 = { ...plan, rooms: [{ ...room, id: 'r' }], furniture: [tight], doors: [], windows: [] };
  assert.deepEqual(itemProblems(p2, 0), [], 'dritto: nessun problema');
  assert.ok(itemProblems(p2, 0, { ...tight, rot: 30 }).some((x) => /Esce/.test(x)), 'ruotato: esce dal locale');
  // 3D e DXF
  const rotated = { ...plan, furniture: [{ ...plan.furniture[0], rot: 30 }] };
  const g3 = buildScene(THREE, rotated, THEMES.modern);
  let ok3 = false;
  g3.traverse((o) => { if (o.userData.itemIndex === 0 && Math.abs(Math.abs(o.rotation.y) - (30 * Math.PI) / 180) < 0.9 && o.rotation.y !== 0) ok3 = true; });
  assert.ok(ok3, 'l\'arredo ruotato ha una rotazione nel 3D');
  const dxf = buildDxf({ ...rotated, wallThickness: 10, scale: 50 });
  assert.ok(dxf.includes('ARREDI'), 'il DXF resta valido con un arredo ruotato');
}
console.log('itemedit rotazione ok');
