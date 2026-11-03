/* Finestre d'angolo e tende dentro il muro libero (lib/cornerWindows.js, lib/decor.js). */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cornerPairs, withCornerWindows } from '../src/lib/cornerWindows.js';
import { decorFor } from '../src/lib/decor.js';
import { buildScene } from '../src/lib/scene3d.js';
import { THEMES } from '../src/lib/themes.js';

const room = { id: 1, name: 'Soggiorno', kind: 'living', x: 0, y: 0, w: 6, h: 4, color: '#f5f5f5' };
const walls = [{ x: 0, y: 0, w: 6, h: 0.2 }, { x: 0, y: 3.8, w: 6, h: 0.2 }, { x: 0, y: 0, w: 0.2, h: 4 }, { x: 5.8, y: 0, w: 0.2, h: 4 }];
const plan = (windows, doors = []) => ({ dimensions: { width: 6, length: 4 }, scale: 50, wallThickness: 10, rooms: [room], walls, doors, windows, furniture: [], stairs: [] });
// finestra A sul muro nord a 0,4 m dall'angolo ovest (bordo a 20 cm dal muro d'angolo), B sul muro ovest a 0,4 m dall'angolo nord
const A = { x: 0.4, y: 0, w: 1.4, rot: 0 };
const B = { x: 0.2, y: 0.4, w: 1.4, rot: 90 };

// vicine all'angolo: una finestra sola
let p = plan([A, B]);
assert.deepEqual(cornerPairs(p), [{ a: 0, b: 1, corner: 'NW' }]);
const merged = withCornerWindows(p);
assert.ok(merged.windows.every((w) => w.corner), 'segnate come finestra d\'angolo');
assert.equal(merged.windows[0].x, 0.1);                                          // arriva a 10 cm dall'angolo esterno
assert.ok(Math.abs(merged.windows[0].x + merged.windows[0].w - 1.8) < 1e-9);       // il bordo lontano non si muove
assert.equal(merged.windows[1].y, 0.1);
assert.ok(Math.abs(merged.windows[1].y + merged.windows[1].w - 1.8) < 1e-9);
assert.equal(p.windows[0].x, 0.4, 'la pianta salvata non cambia');

// lontane (oltre 30 cm) o su pareti non perpendicolari o di tipo diverso: restano due finestre
assert.deepEqual(cornerPairs(plan([{ ...A, x: 1.0 }, B])), []);
assert.deepEqual(cornerPairs(plan([A, { ...B, y: 1.0 }])), []);
assert.deepEqual(cornerPairs(plan([A, { ...B, type: 'panoramic' }])), [], 'finestra comune + panoramica: due aperture diverse');
assert.deepEqual(cornerPairs(plan([{ ...A, x: 0.75 }, B])), [], 'a 55 cm dall\'angolo non è più «vicina»');
assert.deepEqual(cornerPairs(plan([A, { x: 3, y: 0, w: 1.4, rot: 0 }])), []);
// tutti e quattro gli angoli
const four = plan([
  { x: 0.4, y: 0, w: 1, rot: 0 }, { x: 0.2, y: 0.4, w: 1, rot: 90 },                 // NW
  { x: 4.6, y: 0, w: 1, rot: 0 }, { x: 6, y: 0.4, w: 1, rot: 90 },                 // NE
  { x: 0.4, y: 3.8, w: 1, rot: 0 }, { x: 0.2, y: 2.6, w: 1, rot: 90 },               // SW
  { x: 4.6, y: 3.8, w: 1, rot: 0 }, { x: 6, y: 2.6, w: 1, rot: 90 },               // SE
]);
assert.deepEqual(cornerPairs(four).map((x) => x.corner).sort(), ['NE', 'NW', 'SE', 'SW']);

// 3D: tra le due finestre resta solo il montante d'angolo (due pezzi di muro di 10 cm che si incontrano), non il muro intero
const cornerPosts = (pl) => {
  const scene = buildScene(THREE, pl, THEMES.modern);
  const posts = [];
  scene.traverse((o) => {
    if (!o.isMesh || o.userData.layer !== 'MURI') return;
    const bb = new THREE.Box3().setFromObject(o);
    if (bb.min.x < 0.05 && bb.min.z < 0.05 && bb.max.x < 0.25 && bb.max.z < 0.25 && bb.max.y > 2) posts.push(bb);
  });
  return posts;
};
assert.ok(cornerPosts(plan([A, B])).length >= 1, 'il montante d\'angolo c\'è');
assert.ok(cornerPosts(plan([A, B])).every((bb) => Math.min(bb.max.x, bb.max.z) <= 0.11), 'ogni pezzo largo 10 cm');
assert.equal(cornerPosts(plan([{ ...A, x: 1.2 }, { ...B, y: 1.2 }])).length, 0, 'staccate: nessun pezzo corto all\'angolo (il muro è intero)');

// tende: non entrano mai nel muro d'angolo né in un'altra apertura
const curtainsOf = (pl) => decorFor(pl).filter((d) => d.kind === 'curtain');
const inside = (pl, d) => {   // l'estremo lontano del pannello sta dentro il locale, a più di 20 cm dai muri
  const ex = d.x + d.ux * d.len;
  const ey = d.y + d.uy * d.len;
  return ex > 0.2 && ex < 5.8 && ey > 0.2 && ey < 3.8;
};
for (const w of [{ x: 0.3, y: 0, w: 1.4, rot: 0 }, { x: 4.3, y: 0, w: 1.4, rot: 0 }, { x: 2.5, y: 0, w: 1.0, rot: 0 }, { x: 0.2, y: 1.0, w: 1.4, rot: 90 }]) {
  const pl = plan([w]);
  const cs = curtainsOf(pl);
  assert.ok(cs.length >= 1, 'almeno un pannello');
  for (const d of cs) assert.ok(inside(pl, d), `tenda nel muro: ${JSON.stringify([w, d])}`);
}
// una finestra a 15 cm dal muro d'angolo: il pannello da quel lato si accorcia a quel che resta (non entra nel muro), dall'altro è intero
const tight = curtainsOf(plan([{ x: 0.35, y: 0, w: 1.4, rot: 0 }]));
assert.equal(tight.length, 2, JSON.stringify(tight));
assert.ok(Math.min(...tight.map((d) => d.len)) <= 0.21 && Math.max(...tight.map((d) => d.len)) >= 0.3);
// a 5 cm dal muro d'angolo non c'è posto: solo il pannello dell'altro lato
assert.equal(curtainsOf(plan([{ x: 0.25, y: 0, w: 1.4, rot: 0 }])).length, 1);
// due finestre vicine sullo stesso muro: il pannello tra loro non entra nell'altra
const twins = curtainsOf(plan([{ x: 0.6, y: 0, w: 1.2, rot: 0 }, { x: 2.0, y: 0, w: 1.2, rot: 0 }]));
for (const d of twins) {
  const ex = d.x + d.ux * d.len;
  assert.ok(!(ex > 2.0 - 0.01 && ex < 3.2 && d.x < 2.0 && d.ux > 0) && !(ex < 1.8 + 0.01 && ex > 0.6 && d.x > 1.8 && d.ux < 0), `tenda sull'altra finestra: ${JSON.stringify(d)}`);
}
// vetrata panoramica scorrevole: pannelli ai due estremi, dentro la larghezza del vetro
const pano = curtainsOf(plan([], [{ x: 1, y: 0, w: 3, rot: 0, openDir: 1, type: 'sliding', entrance: false }]));
assert.equal(pano.length, 2);
for (const d of pano) {
  const ex = d.x + d.ux * d.len;
  assert.ok(ex >= 1 - 1e-6 && ex <= 4 + 1e-6 && d.x >= 1 - 0.05 && d.x <= 4 + 0.05, `pannello fuori dal vetro: ${JSON.stringify(d)}`);
}
console.log('cornerwindows ok');

// vetrata scorrevole (porta sul balcone) + finestra panoramica nell'angolo: un'apertura sola con il montante piccolo
{
  const door = { x: 0.6, y: 0, w: 1.8, rot: 0, type: 'sliding' };
  const pano = { x: 0.2, y: 0.55, w: 1.6, rot: 90, type: 'panoramic' };
  const pl = plan([pano], [door]);
  assert.deepEqual(cornerPairs(pl), [{ a: 0, b: 0, corner: 'NW', aDoor: true }]);
  const m = withCornerWindows(pl);
  assert.equal(m.doors[0].x, 0.1, 'la vetrata scorrevole arriva al montante');
  assert.equal(m.windows[0].y, 0.1, 'la panoramica arriva al montante');
  assert.ok(m.doors[0].corner && m.windows[0].corner);
  assert.equal(pl.doors[0].x, 0.6, 'la pianta salvata non cambia');
  assert.ok(cornerPosts(pl).length >= 1 && cornerPosts(pl).every((bb) => Math.min(bb.max.x, bb.max.z) <= 0.11), 'in 3D resta il montante da 10 cm');
}
console.log('cornerwindows vetrata + panoramica ok');
