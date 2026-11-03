/* Balcone: i parapetti stanno solo sui lati che non toccano altri locali (lib/balcony.js). */
import assert from 'node:assert/strict';
import { balconyRailings } from '../src/lib/balcony.js';

const plan = {
  rooms: [
    { id: 1, kind: 'bed', x: 0, y: 1.65, w: 4.2, h: 2.6 },
    { id: 2, kind: 'balcony', x: 0, y: 0, w: 4.2, h: 1.65 },
  ],
};
const r = balconyRailings(plan);
assert.equal(r.length, 3, 'tre lati liberi: alto, sinistro e destro (il basso tocca la camera)');
assert.ok(r.some((l) => l.y1 === 0 && l.y2 === 0 && l.x1 === 0 && l.x2 === 4.2), 'fronte');
assert.ok(r.some((l) => l.x1 === 0 && l.x2 === 0 && l.y1 === 0 && l.y2 === 1.65), 'fianco sinistro');
assert.ok(r.some((l) => l.x1 === 4.2 && l.x2 === 4.2), 'fianco destro');
assert.ok(!r.some((l) => l.y1 === 1.65), 'sul lato della casa non c\'è parapetto');

// balcone più stretto della facciata: il lato verso la casa è coperto solo in parte
const narrow = { rooms: [{ kind: 'living', x: 0, y: 2, w: 6, h: 3 }, { kind: 'balcony', x: 1, y: 0, w: 3, h: 2 }] };
assert.equal(balconyRailings(narrow).length, 3);
assert.deepEqual(balconyRailings({ rooms: [{ kind: 'living', x: 0, y: 0, w: 4, h: 4 }] }), []);
console.log('balcony ok');

// poltrone e tavolino in rattan sul balcone, tappeto tondo di juta sotto i divani piccoli
{
  const { rugsFor } = await import('../src/lib/rugs.js');
  const plan = { rooms: [{ id: 'r', x: 0, y: 0, w: 6, h: 5, kind: 'living' }],
    furniture: [{ id: 's', room: 'r', type: 'sofa_round', x: 2, y: 1.5, w: 1.2, h: 1.2, facing: 'S' }] };
  const rugs = rugsFor(plan);
  assert.equal(rugs.length, 1);
  assert.ok(rugs[0].round, 'il tappeto sotto il divano tondo è tondo');
  console.log('balcony rattan/rug ok');
}

// il balcone è all'aperto: nessun punto luce sospeso al soffitto (il lampadario non può stare fuori)
{
  const { planElectric } = await import('../src/lib/electric.js');
  const rooms = [
    { id: 1, name: 'Soggiorno', kind: 'living', x: 0, y: 0, w: 5, h: 4, color: '#fff', zone: 1 },
    { id: 2, name: 'Balcone', kind: 'balcony', x: 0, y: 4, w: 5, h: 1.6, color: '#eee', zone: 2 },
  ];
  const walls = [{ x: 0, y: 0, w: 5, h: 0.2 }, { x: 0, y: 0, w: 0.2, h: 5.6 }, { x: 4.8, y: 0, w: 0.2, h: 5.6 }];
  const pl = { dimensions: { width: 5, length: 5.6 }, scale: 50, wallThickness: 10, rooms, walls, windows: [],
    doors: [{ x: 1, y: 3.9, w: 2, rot: 0, type: 'sliding' }],
    furniture: [{ room: 2, type: 'table_rattan', x: 2.2, y: 4.5, w: 0.6, h: 0.6, facing: 'S' }, { room: 1, type: 'table', x: 1, y: 1, w: 1.6, h: 0.9, facing: 'S' }], stairs: [] };
  const el = planElectric({ floors: [{ id: 'f', name: 'T', level: 0, plan: pl, meta: {} }] }, { level: 2 });
  const pts = Object.values(el.floors).flatMap((f) => f.points);
  assert.equal(pts.filter((p) => p.kind === 'light' && p.room === 2).length, 0, 'niente luce sospesa sul balcone');
  assert.ok(pts.filter((p) => p.kind === 'light' && p.room === 1).length >= 1, 'il soggiorno ha le sue luci');
  console.log('balcony luci ok');
}
