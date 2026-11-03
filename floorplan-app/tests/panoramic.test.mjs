/* Vetrata panoramica e vetrata scorrevole: tipo dell'apertura, modifica, abaco, computo, 3D (lib/openings.js, walls.js, scene3d.js). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { addOpening, moveOpening, openingRuns, resizeOpening, runOf, setOpeningType, wallRuns } from '../src/lib/walls.js';
import { glassSpan, glassHeight, isPanoramic, isSliding } from '../src/lib/openings.js';
import { scheduleFor } from '../src/lib/schedule.js';
import { buildScene } from '../src/lib/scene3d.js';
import { THEMES } from '../src/lib/themes.js';

const plans = JSON.parse(readFileSync(new URL('./fixtures/plans.json', import.meta.url)));
const plan = plans.find((p) => p.windows.length >= 2 && p.doors.length >= 2);

// tipi: senza `type` tutto è come prima
assert.ok(!isPanoramic({ w: 1.4 }) && isPanoramic({ type: 'panoramic' }) && isPanoramic({ type: 'sliding' }) && isSliding({ type: 'sliding' }));
assert.deepEqual(glassSpan({}, 2.7), { sill: 0.9, top: 2.1 });
assert.deepEqual(glassSpan({ type: 'panoramic' }, 2.7), { sill: 0, top: 2.4 });
assert.equal(glassSpan({ type: 'panoramic' }, 2.4).top, 2.3, 'sotto un soffitto basso la vetrata resta sotto l\'architrave');
assert.ok(Math.abs(glassHeight({ type: 'panoramic' }) - 2.4) < 1e-9 && Math.abs(glassHeight({}) - 1.2) < 1e-9);

// finestra → vetrata panoramica (resta finestra, cambia il tipo e può allargarsi oltre i 4 m)
let r = setOpeningType(plan, 'window', 0, 'panoramic');
assert.equal(r.plan.windows[0].type, 'panoramic');
assert.deepEqual(r.selected, { kind: 'window', index: 0 });
assert.equal(plan.windows[0].type, undefined, 'la pianta di partenza non cambia');
// … e di nuovo finestra: il tipo sparisce
r = setOpeningType(r.plan, 'window', 0, 'window');
assert.ok(!('type' in r.plan.windows[0]));

// finestra → vetrata scorrevole: diventa una porta nello stesso posto (non è il portoncino), e conta come porta
const w0 = plan.windows[0];
r = setOpeningType(plan, 'window', 0, 'sliding');
assert.equal(r.plan.windows.length, plan.windows.length - 1);
assert.equal(r.plan.doors.length, plan.doors.length + 1);
const moved = r.plan.doors[r.selected.index];
assert.deepEqual([moved.x, moved.y, moved.w, moved.rot], [w0.x, w0.y, w0.w, w0.rot]);
assert.equal(moved.type, 'sliding');
assert.equal(moved.entrance, false);
assert.equal(r.plan.stats.doors, r.plan.doors.length);
// vetrata scorrevole → porta a battente: torna una porta senza tipo
const back = setOpeningType(r.plan, 'door', r.selected.index, 'door');
assert.ok(!('type' in back.plan.doors[back.selected.index]));
// porta interna → vetrata fissa: passa alle finestre
const interior = plan.doors.findIndex((d) => !d.entrance && !d.kind);
r = setOpeningType(plan, 'door', interior, 'panoramic');
assert.equal(r.selected.kind, 'window');
assert.equal(r.plan.windows[r.selected.index].type, 'panoramic');
assert.equal(r.plan.doors.length, plan.doors.length - 1);

// larghezza: una vetrata arriva a 6 m dove un muro lo permette, una finestra no oltre 4
const long = wallRuns(plan).filter((x) => x.exterior).sort((a, b) => (b.hi - b.lo) - (a.hi - a.lo))[0];
const added = addOpening({ ...plan, windows: [], doors: plan.doors.filter((d) => runOf(plan, d) !== long) }, 'window', long, (long.lo + long.hi) / 2, 'panoramic');
assert.ok(!added.error, added.error);
assert.equal(added.plan.windows[0].type, 'panoramic');
assert.ok(added.plan.windows[0].w >= 1.6, 'larga di serie almeno 1,6 m dove c\'è posto');
const wide = resizeOpening(added.plan, 'window', 0, 5.4);
assert.ok(wide.windows[0].w > 4 || (long.hi - long.lo - 0.16) < 4.2, 'oltre 4 m solo per la vetrata');

// abaco: tipo, altezza e apertura
const sched = scheduleFor({ floors: [{ id: 'a', name: 'PT', plan: { ...plan, windows: [{ ...w0, type: 'panoramic', w: 3.2 }], doors: [{ ...plan.doors[0], type: 'sliding', entrance: false, w: 1.8 }] } }] });
const panoRow = sched.rows.find((x) => x.type === 'Vetrata panoramica');
const slideRow = sched.rows.find((x) => x.type === 'Vetrata scorrevole');
assert.ok(panoRow && panoRow.h === 2.4 && panoRow.open === 'fissa');
assert.ok(slideRow && slideRow.h === 2.4 && slideRow.open === 'scorrevole');

// 3D: il vetro arriva quasi a terra (nessun muro sotto), i montanti ci sono, lo scorrevole ha le sue ante
const room = { id: 1, name: 'Soggiorno', kind: 'living', x: 0, y: 0, w: 6, h: 4, color: '#f5f5f5' };
const base = {
  dimensions: { width: 6, length: 4 }, scale: 50, wallThickness: 10, rooms: [room], furniture: [], stairs: [],
  walls: [{ x: 0, y: 0, w: 6, h: 0.2 }, { x: 0, y: 3.8, w: 6, h: 0.2 }, { x: 0, y: 0, w: 0.2, h: 4 }, { x: 5.8, y: 0, w: 0.2, h: 4 }],
  doors: [],
};
const glassOf = (scene) => { const g = []; scene.traverse((o) => { if (o.isMesh && o.userData.layer === 'VETRI') { const bb = new THREE.Box3().setFromObject(o); g.push(bb); } }); return g; };
const fixed = glassOf(buildScene(THREE, { ...base, windows: [{ x: 1, y: 0, w: 4, rot: 0, type: 'panoramic' }] }, THEMES.modern));
assert.ok(fixed.length >= 1 && fixed.some((bb) => bb.min.y < 0.05 && bb.max.y > 2.3), 'vetro dal pavimento a 2,4 m');
const std = glassOf(buildScene(THREE, { ...base, windows: [{ x: 1, y: 0, w: 2, rot: 0 }] }, THEMES.modern));
assert.ok(std.every((bb) => bb.min.y > 0.85), 'la finestra comune ha il davanzale a 0,9 m');
const slide = buildScene(THREE, { ...base, windows: [], doors: [{ x: 1, y: 0, w: 3, rot: 0, openDir: 1, type: 'sliding', entrance: false }] }, THEMES.modern);
assert.ok(glassOf(slide).some((bb) => bb.min.y < 0.05 && bb.max.y > 2.3), 'anche la porta scorrevole è un vetro a tutta altezza');
let leafFrames = 0; let swingLeaves = 0;
slide.traverse((o) => { if (o.isMesh && o.userData.layer !== 'VETRI' && o.userData.layer !== 'MURI') leafFrames++; if (o.userData.layer === 'PORTE') swingLeaves++; });
assert.ok(leafFrames >= 10 && swingLeaves === 0, `ante e telaio, nessuna anta a battente (${leafFrames}, ${swingLeaves})`);

// a cavallo di due locali della stessa zona aperta: sul muro esterno davanti a soggiorno e cucina senza muro in mezzo il tratto è uno solo
const open = plans[4];
const zone = new Map(open.rooms.map((r) => [r.id, r.zone ?? r.id]));
const ext = wallRuns(open).filter((r) => r.exterior);
const first = ext.find((a) => ext.some((b) => b !== a && b.orient === a.orient && a.line === b.line && Math.abs(a.hi - b.lo) < 1e-6 && zone.get(a.a) === zone.get(b.a)));
assert.ok(first, 'nella pianta di prova due tratti esterni contigui sono della stessa zona');
const second = ext.find((b) => b !== first && b.orient === first.orient && first.line === b.line && Math.abs(first.hi - b.lo) < 1e-6 && zone.get(first.a) === zone.get(b.a));
const split = [first, second];
const joined = openingRuns(open).find((r) => r.exterior && r.orient === split[0].orient && r.line === split[0].line && r.lo <= split[0].lo + 1e-6 && r.hi >= split[1].hi - 1e-6);
assert.ok(joined && joined.rooms.length >= 2, 'un tratto solo per i due locali');
const seam = split[0].hi;
const noOthers = { ...open, windows: [], doors: open.doors.filter((d) => { const r = runOf(open, d); return !(r && r.exterior && r.orient === joined.orient && r.line === joined.line); }) };
const straddle = addOpening(noOthers, 'window', split[0], seam, 'panoramic');
assert.ok(!straddle.error, straddle.error);
const sw = straddle.plan.windows[0];
assert.ok(sw.x < seam - 0.3 && sw.x + sw.w > seam + 0.3, `la vetrata sta a cavallo del confine a ${seam} m: ${sw.x}…${sw.x + sw.w}`);
// e si può spostare e allargare sopra il confine
const moved2 = moveOpening(straddle.plan, 'window', 0, seam - 0.5);
assert.ok(moved2.windows[0].x < seam && moved2.windows[0].x + moved2.windows[0].w > seam);
// un muro vero in mezzo (gruppi diversi) resta un limite
const walled = { ...noOthers, rooms: noOthers.rooms.map((r) => (r.id === split[1].a ? { ...r, zone: 99 } : r)) };
assert.ok(!openingRuns(walled).some((r) => r.rooms), 'locali di zone diverse: due tratti');
console.log('panoramic ok');
