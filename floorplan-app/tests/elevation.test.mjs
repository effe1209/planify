/* Prospetti e sezioni (lib/elevation.js). */
import assert from 'node:assert/strict';
import { elevation, levelMarks, section, stack } from '../src/lib/elevation.js';

const room = (id, x, y, w, h, name = 'Locale') => ({ id, kind: 'living', name, x, y, w, h });
const plan = (windows = []) => ({
  dimensions: { width: 10, length: 8 },
  rooms: [room(1, 0, 0, 5, 8, 'A'), room(2, 5, 0, 5, 8, 'B')],
  windows, doors: [{ x: 4, y: 8, w: 1, rot: 0, entrance: true }],
});
const project = {
  floors: [
    { id: 'a', name: 'Piano terra', level: 0, plan: plan([{ x: 1, y: 8, w: 1.5, rot: 0 }, { x: 6, y: 0, w: 1.5, rot: 0 }]) },
    { id: 'b', name: 'Piano primo', level: 1, plan: plan([{ x: 1, y: 8, w: 1.5, rot: 0 }]) },
  ],
};

// quote: piano terra a 0, piano primo a 2,70 + 0,30 = 3,00
const st = stack(project);
assert.deepEqual(st.map((s) => s.base), [0, 3]);
assert.deepEqual(levelMarks(project).map((m) => m.label), ['+0,00', '+3,00']);

// prospetto sud (guardando dal basso del foglio): le finestre e il portoncino stanno sul lato basso
let e = elevation(project, 'down', { north: 0 });
assert.equal(e.title, 'Prospetto sud');
assert.equal(e.shapes.filter((s) => s.kind === 'glass').length, 2);   // una per piano
assert.equal(e.shapes.filter((s) => s.kind === 'door').length, 2);
assert.equal(e.maxY, 5.7);
// dal lato alto (nord) la finestra del piano terra a y=0 è l'unica
e = elevation(project, 'up', { north: 0 });
assert.equal(e.title, 'Prospetto nord');
assert.equal(e.shapes.filter((s) => s.kind === 'glass').length, 1);
// con il nord ruotato di 180° i nomi si scambiano
assert.equal(elevation(project, 'down', { north: 180 }).title, 'Prospetto nord');

// tetto a due falde: colmo sopra i muri
e = elevation(project, 'down', { north: 0, roof: { type: 'gable', slope: 25, overhang: 0.4 } });
assert.ok(e.maxY > 5.7 && e.shapes.some((s) => s.kind === 'roof'));

// sezione longitudinale: due locali, solaio, muri alle estremità e al centro, altezza netta 2,70
const sec = section(project, 'x', 4);
assert.equal(sec.shapes.filter((s) => s.kind === 'room').length, 4);
assert.equal(sec.shapes.filter((s) => s.kind === 'slab').length, 1);
assert.ok(sec.shapes.filter((s) => s.kind === 'wall').length >= 6);
assert.ok(sec.shapes.filter((s) => s.kind === 'room').every((s) => s.h === 2.7));
console.log('elevation ok');
