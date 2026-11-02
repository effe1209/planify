/* Render: viste automatiche, sole e sfondo (lib/renderStudio.js). */
import assert from 'node:assert/strict';
import { cameraViews, gardenFrame, backgroundFor, houseBounds, sunFor, shiftView, EYE, SIZES } from '../src/lib/renderStudio.js';
import { FLOOR_H } from '../src/lib/scene3d.js';

const plan = (rooms, extra = {}) => ({ dimensions: { width: 10, length: 8 }, rooms, doors: [{ x: 4, y: 8, w: 1, rot: 0, entrance: true }], windows: [], furniture: [], ...extra });
const rm = (id, name, kind, x, y, w, h) => ({ id, name, kind, x, y, w, h });
const project = { floors: [
  { id: 'a', name: 'Piano terra', level: 0, plan: plan([rm(1, 'Soggiorno', 'living', 0, 0, 6, 8), rm(2, 'Bagno', 'bath', 6, 0, 2, 2), rm(3, 'Scala', 'stairs', 8, 0, 2, 4)]) },
  { id: 'b', name: 'Primo', level: 1, plan: plan([rm(4, 'Camera', 'bed', 0, 0, 5, 4)]) },
] };

const b = houseBounds(project);
assert.deepEqual([b.W, b.L], [10, 8]);
assert.equal(b.top, FLOOR_H + 2.7);

const views = cameraViews(project);
const ids = views.map((v) => v.id);
assert.deepEqual(ids.slice(0, 3), ['three-quarter', 'plan3d', 'front']);
assert.equal(new Set(ids).size, ids.length, 'identificativi distinti');
// i locali piccoli (< 5 m²) e la scala non hanno vista; gli altri sì, a 1,6 m dal pavimento del loro piano
assert.equal(views.filter((v) => v.kind === 'inside').length, 2);
const cam = views.find((v) => v.floor === 'b');
assert.ok(Math.abs(cam.position[1] - (FLOOR_H + EYE)) < 1e-9 && cam.level === 1);
const liv = views.find((v) => v.label.startsWith('Interno: Soggiorno'));
assert.ok(liv.position[0] > 0 && liv.position[0] < 6 && liv.position[2] > 0 && liv.position[2] < 8, 'dentro il locale');
assert.ok(liv.position[2] < 1, 'dall\'angolo opposto alla porta (che sta a sud)');
// un mobile nell'angolo scelto sposta l'occhio in un altro angolo libero
const blocked = { floors: [{ ...project.floors[0], plan: { ...project.floors[0].plan, furniture: [{ type: 'floor_lamp', x: liv.position[0] - 0.3, y: liv.position[2] - 0.3, w: 0.6, h: 0.6 }] } }] };
const liv2 = cameraViews(blocked).find((v) => v.label.startsWith('Interno: Soggiorno'));
assert.ok(Math.hypot(liv2.position[0] - liv.position[0], liv2.position[2] - liv.position[2]) > 2, 'angolo libero');
// esterne: fuori dalla casa, guardano il centro
const tq = views[0];
assert.deepEqual(tq.target, b.center);
assert.ok(tq.position[1] > b.top && Math.hypot(tq.position[0] - 5, tq.position[2] - 4) > 5);
// pianta 3D: dritta sopra il centro, perpendicolare (inclinazione sotto 0,2°), ortografica e a tutto quadro nel lato che lo limita
const pv = views[1];
assert.ok(pv.ortho && Math.abs(pv.position[0] - 5) < 1e-9 && Math.abs(pv.target[0] - 5) < 1e-9 && pv.target[1] === 0, 'sopra il centro');
const tilt = Math.atan2(Math.abs(pv.position[2] - pv.target[2]), pv.position[1]) * 180 / Math.PI;
assert.ok(tilt > 0 && tilt < 0.2, `inclinazione ${tilt}°`);       // appena inclinata, per orientare il foglio col nord in alto
assert.ok(pv.position[2] > pv.target[2], 'il basso del foglio è verso +z');
assert.ok(Math.abs(pv.ortho.height - Math.max(8 * 1.03, (10 * 1.03) / (16 / 9))) < 1e-9, `altezza ${pv.ortho.height}`);   // 10 × 8 m, 16:9: limita l'altezza
// una casa molto larga: limita la larghezza
const wide = cameraViews({ floors: [{ id: 'w', name: 'W', level: 0, plan: plan([rm(1, 'Sala', 'living', 0, 0, 30, 8)], { dimensions: { width: 30, length: 8 } }) }] });
assert.ok(Math.abs(wide[1].ortho.height - (30 * 1.03) / (16 / 9)) < 1e-9, 'lato largo');

// loft con soppalco: vista dall'alto del soppalco verso il soggiorno, a 1,6 m sopra il suo pavimento
const loft = { floors: [{ id: 'l', name: 'Loft', level: 0, plan: plan([rm(1, 'Soggiorno', 'living', 0, 0, 12, 8)], { dimensions: { width: 12, length: 8 }, height: 5,
  mezzanine: { x: 8.4, y: 0, w: 3.6, h: 8, elev: 2.6, slab: 0.2, parapet: 1, open: ['W'], stair: { x: 4.35, y: 6.9, w: 4.05, h: 0.9, up: 'E' } } }) }] };
const mv = cameraViews(loft).find((v) => v.id === 'mezz-l');
assert.ok(mv && Math.abs(mv.position[1] - (2.6 + EYE)) < 1e-9 && mv.target[0] < mv.position[0], 'guarda verso il lato aperto');

// una telecamera di un piano solo: si toglie la quota
const sh = shiftView(cam, -FLOOR_H);
assert.ok(Math.abs(sh.position[1] - EYE) < 1e-9 && Math.abs(sh.target[1] - (EYE - 0.4)) < 1e-9);

// sole: il pomeriggio guarda a sud-ovest, il tramonto è basso, la sera è fioca e il nord ruota la scena
const aft = sunFor('afternoon', 0, [5, 3, 4], 14);
assert.ok(aft.position[0] < 5 && aft.position[2] > 4 && aft.position[1] > 4);
const ss = sunFor('sunset', 0, [5, 3, 4], 14);
assert.ok(ss.position[1] < aft.position[1] && ss.position[0] < 5 - 10, 'tramonto: da ovest e basso');
assert.ok(sunFor('evening', 0, [0, 0, 0], 14).intensity < 0.6);
const rot = sunFor('afternoon', 90, [5, 3, 4], 14);
assert.ok(Math.hypot(rot.position[0] - aft.position[0], rot.position[2] - aft.position[2]) > 7, 'il nord ruota il sole');

// sfondo
assert.deepEqual(backgroundFor('white', 'noon'), { color: '#ffffff', alpha: false });
assert.equal(backgroundFor('sky', 'evening').color, '#1e2a47');
assert.equal(backgroundFor('transparent', 'noon').alpha, true);
assert.deepEqual(SIZES.map((s) => s.w), [960, 1920, 3840]);

// giardino davanti alla casa (ingresso a sud): due viste in più, davanti alla facciata (z oltre la pianta) e rivolte alla casa
{
  const garden = { dimensions: { width: 14, length: 10 }, rooms: [{ id: 9, kind: 'garden', name: 'Prato', x: 0, y: 0, w: 14, h: 10 }], doors: [], windows: [], furniture: [], house: { x: 2, w: 10 } };
  const withGarden = { floors: [...project.floors, { id: 'g', name: 'Giardino', level: 'out', plan: garden, meta: { type: 'garden' } }] };
  const gf = gardenFrame(withGarden);
  assert.deepEqual(gf.toWorld(2, 0), [0, 8]);              // l'angolo sinistro della facciata sta all'inizio della casa, sul filo sud
  assert.deepEqual(gf.toWorld(7, 10), [5, 18]);            // il fondo del giardino sta 10 m oltre la facciata
  assert.equal(gardenFrame(project), null);
  const gv = cameraViews(withGarden);
  const aerial = gv.find((v) => v.id === 'garden-aerial');
  const eye = gv.find((v) => v.id === 'garden-view');
  assert.ok(aerial && eye && aerial.kind === 'outside' && eye.kind === 'outside');
  assert.ok(aerial.position[1] > 5 && aerial.position[2] > 8, 'dall\'alto, dal lato del giardino');
  assert.ok(Math.abs(eye.position[1] - (EYE + 0.1)) < 1e-9 && eye.position[2] > 8 + 5, 'a quota d\'occhi in fondo al giardino');
  assert.ok(eye.target[2] <= 8 + 1e-9, 'rivolta alla facciata');
  assert.ok(gv.every((v) => v.position.every(Number.isFinite) && v.target.every(Number.isFinite)));
  assert.equal(cameraViews(project).some((v) => v.id.startsWith('garden')), false);
}
console.log('renderstudio ok');
