/* Materiali della casa (lib/materials.js) e struttura in legno (lib/timber.js). */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LOOKS, MATERIALS, cleanMaterials, kitWithMaterials } from '../src/lib/materials.js';
import { themeFor } from '../src/lib/palette.js';
import { buildHouse, buildRoof } from '../src/lib/scene3d.js';
import { STYLE_KITS, styleKit } from '../src/lib/style3d.js';
import { THEMES } from '../src/lib/themes.js';

// pulizia: solo scelte note
assert.equal(cleanMaterials(null), null);
assert.equal(cleanMaterials({ facade: 'oro', roof: 'x', structure: 'boh' }), null);
assert.deepEqual(cleanMaterials({ facade: 'log', structure: 'wood', foo: 1 }), { facade: 'log', structure: 'wood' });
// ogni voce del catalogo ha un aspetto completo
for (const [key, list] of Object.entries(MATERIALS)) for (const m of list) assert.ok(m.id && m.label && m.spec, `${key}/${m.id}`);
for (const l of LOOKS) assert.deepEqual(cleanMaterials(l.materials), l.materials, l.id);   // le combinazioni usano solo materiali veri

// senza scelte il kit non cambia
assert.equal(kitWithMaterials(STYLE_KITS.modern, null), STYLE_KITS.modern);
assert.equal(styleKit('modern'), STYLE_KITS.modern);
// materiale diverso: sostituisce; uguale a quello dello stile: lascia i colori dello stile
const k = kitWithMaterials(STYLE_KITS.modern, { facade: 'log', roof: 'shingle', walls: 'wood', floor: 'herringbone' });
assert.equal(k.facade.tex, 'logwall');
assert.equal(k.roof.kind, 'shingle');
assert.equal(k.wallIn.tex, 'cladding');
assert.equal(k.floor.kind, 'herringbone');
assert.equal(kitWithMaterials(STYLE_KITS.industrial, { facade: 'brick' }).facade, STYLE_KITS.industrial.facade);
// struttura in legno: infissi e porte nei toni del legno
const w = kitWithMaterials(STYLE_KITS.modern, { structure: 'wood' });
assert.notEqual(w.frame, STYLE_KITS.modern.frame);
assert.equal(w.facade, STYLE_KITS.modern.facade);

// la casa: un piano 10×8 con portoncino a sud
const t = 0.2;
const plan = {
  scale: 50, wallThickness: t * 50, dimensions: { width: 10, length: 8 },
  rooms: [{ id: 1, kind: 'living', name: 'Soggiorno', x: 0, y: 0, w: 10, h: 8 }],
  walls: [{ x: -t / 2, y: -t / 2, w: 10 + t, h: t }, { x: -t / 2, y: 8 - t / 2, w: 10 + t, h: t }, { x: -t / 2, y: -t / 2, w: t, h: 8 + t }, { x: 10 - t / 2, y: -t / 2, w: t, h: 8 + t }],
  doors: [{ x: 4, y: 8, w: 1, rot: 0, entrance: true }], windows: [], furniture: [],
};
const project = (extra = {}) => ({ floors: [{ id: 'a', level: 0, plan, meta: { style: 'modern' } }], ...extra });
const names = (g) => { const out = []; g.traverse((o) => { if (o.isMesh) out.push(o.userData.layer || ''); }); return out; };
const base = names(buildHouse(THREE, project(), (f) => themeFor(project(), f)));
assert.ok(!base.includes('STRUTTURA'));
const wood = project({ materials: { structure: 'wood' } });
const house = buildHouse(THREE, wood, (f) => themeFor(wood, f));
const n = names(house);
assert.equal(n.filter((x) => x === 'STRUTTURA').length > 8, true, 'pilastri, travi e portico');
assert.ok(house.getObjectByName('PORTICO'), 'portico');
let posts = 0; house.getObjectByName('STRUTTURA_LEGNO').children.forEach((c) => { if (c.isMesh && c.geometry.parameters.width === 0.24) posts++; });
assert.equal(posts, 4);   // quattro pilastri d'angolo
// il portico sta davanti al portoncino a sud (z oltre 8)
const por = house.getObjectByName('PORTICO');
assert.ok(Math.abs(por.position.x - 4.5) < 1e-6 && Math.abs(por.position.z - 8.1) < 1e-6 && Math.abs(por.rotation.y) < 1e-6);
// il tetto con travetti sotto la gronda
const roof = buildRoof(THREE, plan, 2.7, { style: 'modern', materials: { structure: 'wood' } });
assert.ok(names(roof).filter((x) => x === 'STRUTTURA').length > 10);
assert.equal(names(buildRoof(THREE, plan, 2.7, { style: 'modern' })).filter((x) => x === 'STRUTTURA').length, 0);
// materiali nella scena: facciata di tronchi
const logs = project({ materials: { facade: 'log' } });
const th = themeFor(logs, logs.floors[0]);
assert.equal(th.materials.facade, 'log');
assert.equal(themeFor(project(), project().floors[0]), THEMES.modern);
console.log('materials ok');
