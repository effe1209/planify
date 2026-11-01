// Test del DXF a layer: node --import ./tests/loader.mjs tests/dxf.test.mjs
import assert from 'node:assert/strict';
import { buildDxf, DXF_LAYERS, parseDxfClientSide } from '../src/lib/dxf.js';
import { coverFloor } from '../src/lib/coverage.js';
import { elevation, levelMarks, section } from '../src/lib/elevation.js';
import { VIEW_LAYERS } from '../src/lib/dxfViews.js';

const T = 0.2;
const plan = {
  scale: 1, wallThickness: T, dimensions: { width: 8, length: 5 }, shape: 'rect',
  rooms: [{ id: 1, name: 'Soggiorno', kind: 'living', x: 0, y: 0, w: 5, h: 5 }, { id: 2, name: 'Camera', kind: 'bed', x: 5, y: 0, w: 3, h: 5 }],
  walls: [{ x: 0, y: 0, w: 8, h: T }, { x: 0, y: 4.8, w: 8, h: T }, { x: 0, y: 0, w: T, h: 5 }, { x: 7.8, y: 0, w: T, h: 5 }, { x: 4.9, y: 0, w: T, h: 5 }],
  doors: [{ x: 5.1, y: 2, w: 0.8, rot: 90, openDir: 1 }],
  windows: [{ x: 1, y: 4.8, w: 1.5, rot: 0 }],
  furniture: [{ type: 'wardrobe', x: 6, y: 0.3, w: 1.6, h: 0.6, room: 2 }],
};
const devices = [{ id: 'a', model: 'motionprotect', floor: 'f', room: 1, roomName: 'Soggiorno', x: 0.3, y: 0.3, dir: 45, purpose: '' },
  { id: 'b', model: 'doorprotect_plus', floor: 'f', room: 1, roomName: 'Soggiorno', x: 1.2, y: 4.6, purpose: '' }];
const txt = buildDxf(plan, { devices, codes: { a: 'R1' }, coverage: coverFloor(plan, devices) });
let ok = 0;
const test = (name, fn) => { fn(); ok++; console.log('  ✓', name); };
console.log('DXF a layer');
test('R12 con tabella dei layer e sezioni', () => {
  assert.match(txt, /\$ACADVER\n1\nAC1009/);
  for (const [name] of DXF_LAYERS) assert.ok(txt.includes(`\n2\n${name}\n70\n0\n62\n`), `manca il layer ${name}`);
  assert.equal(txt.trim().split('\n').slice(-2).join(' '), '0 EOF');
});
test('sensori come blocchi con attributi', () => {
  assert.match(txt, /0\nBLOCK\n8\n0\n2\nAJAX_MP/);
  assert.match(txt, /0\nINSERT\n8\nSENSORI\n66\n1\n2\nAJAX_MP/);
  assert.match(txt, /1\nR1\n2\nCODICE/);
  assert.match(txt, /0\nINSERT\n8\nDISPOSITIVI\n66\n1\n2\nAJAX_DP/);
});
test('copertura, zone cieche, porte e finestre presenti', () => {
  for (const l of ['COPERTURA', 'ZONE_CIECHE', 'PORTE', 'FINESTRE', 'SENSORI_CAMPO']) assert.ok(txt.includes(`\n8\n${l}\n`), l);
});
test('testi non ASCII codificati', () => {
  assert.ok(txt.includes('m\\U+00B2'));
  assert.ok([...txt].every((c) => c.charCodeAt(0) < 128), 'il file deve essere ASCII');
});
test('si reimporta: le stanze dal layer AREE', () => {
  const back = parseDxfClientSide(txt);
  assert.equal(back.rooms.length, 2);
});
test('quote in cm a catene sul layer QUOTE: totale, interassi e aperture', () => {
  const q = [...txt.matchAll(/0\nTEXT\n8\nQUOTE\n(?:[^\n]*\n){8}1\n([^\n]*)\n/g)].map((m) => m[1]);
  for (const v of ['800', '500', '300', '150', '100']) assert.ok(q.includes(v), `manca la quota ${v} cm: ${q}`);
});
test('prospetti e sezioni sotto la pianta, ognuno sui suoi layer, anche con il loft fuori norma', () => {
  const mz = { x: 4.4, y: 0, w: 3.6, h: 5, elev: 2.5, slab: 0.2, parapet: 0.8, open: ['W'], stair: { x: 1, y: 4, w: 3.4, h: 0.9, up: 'E', type: 'straight', risers: 13 } };
  const lp = { ...plan, height: 4.5, mezzanine: mz, furniture: [{ type: 'bed', x: 5.6, y: 1, w: 2, h: 1.6, facing: 'W', elev: 2.5, room: 1 }] };
  const project = { floors: [{ id: 'f', name: 'Loft', level: 0, plan: lp }] };
  const drawings = [...['down', 'up', 'right', 'left'].map((s) => elevation(project, s, { roof: { type: 'gable', slope: 25, overhang: 0.4 } })),
    section(project, 'x', 4.45), section(project, 'y', 6)];
  const out = buildDxf(lp, { views: { drawings, marks: levelMarks(project) } });
  for (const [name] of [...DXF_LAYERS, ...VIEW_LAYERS]) assert.ok(out.includes(`\n2\n${name}\n70\n0\n62\n`), `manca il layer ${name}`);
  for (const l of ['PROSPETTI_MURI', 'PROSPETTI_APERTURE', 'PROSPETTI_TETTO', 'SEZIONI_MURI', 'SEZIONI_SOLAI', 'SEZIONI_SCALE', 'SEZIONI_PARAPETTI', 'SEZIONI_ARREDI', 'VISTE_TERRENO']) {
    assert.ok(out.includes(`\n8\n${l}\n`), `nessun elemento sul layer ${l}`);
  }
  // sotto 2,30 m e parapetto 80 cm: fuori norma, sul layer rosso e con la scritta
  assert.ok(out.includes('\n8\nSEZIONI_QUOTE_FUORI_NORMA\n'));
  assert.ok(out.includes('FUORI NORMA') && out.includes('parapetto 80 cm'));
  assert.ok(out.includes('Sezione longitudinale') && out.includes('Prospetto sud'));
  assert.ok([...out].every((c) => c.charCodeAt(0) < 128), 'ASCII');
  // l'ingombro del disegno scende sotto la pianta
  const m = out.match(/\$EXTMIN\n10\n-3\n20\n(-?[\d.]+)/);
  assert.ok(m && Number(m[1]) < -5, `EXTMIN ${m?.[1]}`);
  // senza viste il DXF è quello di prima: niente layer in più
  assert.ok(!buildDxf(lp).includes('PROSPETTI_MURI'));
  // la pianta si reimporta lo stesso (le stanze dal layer AREE)
  assert.equal(parseDxfClientSide(out).rooms.length, 2);
});
console.log(`\n${ok} test superati`);
