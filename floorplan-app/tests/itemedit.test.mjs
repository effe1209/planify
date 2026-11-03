/* Misure e colore di un singolo arredo, e colore di porte e finestre (lib/furnitureEdit.js, lib/furnitureColor.js, lib/scene3d.js). */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { resizeItem } from '../src/lib/furnitureEdit.js';
import { shade, tintTheme, validColor } from '../src/lib/furnitureColor.js';
import { THEMES } from '../src/lib/themes.js';
import { buildScene } from '../src/lib/scene3d.js';

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
