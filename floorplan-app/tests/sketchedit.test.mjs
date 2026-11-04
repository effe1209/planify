/* Modifica diretta della pianta disegnata a mano (lib/sketchEdit.js). */
import assert from 'node:assert/strict';
import { sketchToPlan } from '../src/lib/sketchToPlan.js';
import { addBalcony, addOpening, setOpeningType, flipOpening, isSketchPlan, moveEdge, moveOpening, moveRoom, moveVertex, removeOpening, resizeOpening } from '../src/lib/sketchEdit.js';
import * as G from '../src/lib/geometry.js';

const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const plan = sketchToPlan([
  { kind: 'living', name: 'Soggiorno', poly: rect(0, 0, 5, 4) },
  { kind: 'bed', name: 'Camera', poly: rect(5, 0, 4, 4) },
]);
assert.ok(isSketchPlan(plan));
const area = (p, id) => p.rooms.find((r) => r.id === id).area;
const a0 = area(plan, 1);
const b0 = area(plan, 2);

// il lato in comune si sposta: un locale cresce, l'altro cala della stessa misura, il muro resta unico
const shared = plan.rooms[0].poly.findIndex(([x, y], i, poly) => x === poly[(i + 1) % 4][0] && x > 4);
const m = moveEdge(plan, 1, shared, [0.5, 0]);
assert.ok(m.plan, m.error);
assert.ok(Math.abs(area(m.plan, 1) - (a0 + 2)) < 0.05, 'soggiorno più grande');
assert.ok(Math.abs(area(m.plan, 2) - (b0 - 2)) < 0.05, 'camera più piccola');
assert.ok(m.plan.wallLines.length > 0);
// la porta tra i due locali segue il muro spostato
const door = m.plan.doors.find((d) => !d.entrance);
if (door) assert.ok(Math.abs(door.rot % 180) === 90 || Math.abs(door.rot) === 90 || Math.abs(Math.abs(door.rot) - 90) < 1, 'porta ancora verticale');

// un vertice trascinato fuori a sinistra: il disegno si sposta e le misure restano coerenti
const v = moveVertex(plan, 1, 0, [plan.rooms[0].poly[0][0] - 1, plan.rooms[0].poly[0][1]]);
assert.ok(v.plan, v.error);
assert.ok(G.bounds(v.plan.rooms.flatMap((r) => r.poly)).x > 0);
// contorno che si incrocia: rifiutato
assert.ok(moveVertex(plan, 1, 0, [4, 5]).error);

// stanza spostata con i suoi arredi
const mv = moveRoom(plan, 2, [0, 0.5]);
assert.ok(mv.plan);
assert.ok(mv.plan.furniture.filter((f) => f.room === 2).every((f, i) => Math.abs(f.y - plan.furniture.filter((g) => g.room === 2)[i].y - 0.5) < 0.01));

// finestre: solo sui muri esterni; si aggiungono, si spostano, si ridimensionano, si tolgono
const n0 = plan.windows.length;
const w = addOpening(plan, 'window', [2.5, 0.1]);
assert.ok(w.plan && w.plan.windows.length === n0 + 1);
assert.ok(addOpening(plan, 'window', [5, 2]).error, 'non sul muro in comune');
const wm = moveOpening(w.plan, 'window', w.index, [3.5, 0.1]);
assert.ok(wm.plan);
const wr = resizeOpening(wm.plan, 'window', w.index, 2);
assert.ok(Math.abs(wr.plan.windows[w.index].w - 2) < 0.01);
const wx = removeOpening(wr.plan, 'window', w.index);
assert.equal(wx.plan.windows.length, n0);
if (plan.doors.length) assert.equal(flipOpening(plan, 0).plan.doors[0].openDir, -plan.doors[0].openDir);

// vetrata panoramica e scorrevole come negli schizzi generati; il tipo si cambia dopo
const pano = addOpening(plan, 'panoramic', [3, 0.1]);
assert.ok(pano.plan, pano.error);
assert.equal(pano.plan.windows[pano.index].type, 'panoramic');
assert.ok(pano.plan.windows[pano.index].w >= 1.5);
assert.ok(addOpening(plan, 'panoramic', [5.1, 2]).error, 'la vetrata fissa non sta tra due locali');
const sl = addOpening(plan, 'sliding', [5.1, 2]);
assert.ok(sl.plan && sl.plan.doors[sl.index].type === 'sliding', 'scorrevole anche tra due locali');
const conv = setOpeningType(pano.plan, 'window', pano.index, 'sliding');
assert.equal(conv.selected.kind, 'door');
assert.equal(conv.plan.windows.length, pano.plan.windows.length - 1);
assert.equal(conv.plan.doors[conv.selected.index].type, 'sliding');
assert.ok(setOpeningType(plan, 'door', plan.doors.findIndex((d) => d.entrance), 'window').error, 'il portoncino resta tale');

// balcone: locale esterno appoggiato al muro, con la sua vetrata scorrevole
const bal = addBalcony(plan, [3, 4.1]);
assert.ok(bal.plan, bal.error);
const br = bal.plan.rooms.find((r) => r.id === bal.room);
assert.equal(br.kind, 'balcony');
assert.ok(Math.abs(br.h - 1.2) < 0.01 && br.w <= 3.01);
assert.equal(bal.plan.windows.length, plan.windows.length + 1, 'una finestra sul muro del balcone');
assert.equal(bal.plan.doors.length, plan.doors.length);
assert.equal(bal.plan.rooms.length, plan.rooms.length + 1);
assert.ok(bal.plan.dimensions.length > plan.dimensions.length, 'la pianta cresce col balcone');
assert.ok(addBalcony(plan, [5.1, 2]).error, 'non sul muro tra due locali');
console.log('sketchedit ok');

// il balcone non ha muri propri: nessuna polilinea dei muri lo contorna (solo il parapetto)
{
  const withBal = addBalcony(plan, [3, 4.1]);
  const br2 = withBal.plan.rooms.find((r) => r.id === withBal.room);
  const ys = withBal.plan.wallLines.flatMap((l) => l.pts.map((q) => q[1]));
  assert.ok(Math.max(...ys) < Math.max(...br2.poly.map((q) => q[1])) - 0.5, 'nessun muro attorno al balcone');
  const skBal = sketchToPlan([{ kind: 'living', name: 'S', poly: rect(0, 0, 5, 4) }, { kind: 'balcony', name: 'Balcone', poly: rect(0, 4, 5, 1.5) }]);
  assert.ok(skBal.wallLines.every((l) => l.pts.every((q) => q[1] < 4.3)), 'anche disegnato a mano nello schizzo');
}
console.log('sketchedit balcone ok');
