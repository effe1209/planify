/* Libreria di materiali: lettura del CSV, assegnazione ai locali e preventivo di acquisto (lib/materialLibrary.js). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { libraryTemplateCsv, libraryToCsv, normCategory, normColor, parseLibraryCsv, parsePrice, purchaseQuote, quoteToCsv } from '../src/lib/materialLibrary.js';

// prezzi e colori
assert.equal(parsePrice('62,50'), 62.5);
assert.equal(parsePrice('€ 1.250,00'), 1250);
assert.equal(parsePrice('1,250.50'), 1250.5);
assert.ok(Number.isNaN(parsePrice('boh')));
assert.equal(normColor('C9A77A'), '#c9a77a');
assert.equal(normColor('#fa0'), '#ffaa00');
assert.equal(normColor('rosso'), '');
assert.equal(normCategory('Parquet'), 'pavimento');
assert.equal(normCategory('Gres'), 'rivestimento');
assert.equal(normCategory('Pittura'), 'pittura');
assert.equal(normCategory('Fabric'), 'tessuto');
assert.equal(normCategory('chissà'), 'altro');

// il file d'esempio si rilegge senza errori e fa un giro completo
const tpl = parseLibraryCsv(libraryTemplateCsv());
assert.deepEqual(tpl.errors, []);
assert.equal(tpl.items.length, 5);
const round = parseLibraryCsv(libraryToCsv(tpl.items));
assert.deepEqual(round.items, tpl.items, 'esporta e rileggi: identico');
assert.equal(tpl.items[0].texture, 'plank');
assert.equal(tpl.items[3].texture, undefined, 'le pitture non hanno texture');

// file reali: separatore virgola, virgolette, colonne in altro ordine, errori per riga
const csv = `Nome,Prezzo,Marchio,Codice,Categoria,Colore,UM
"Rovere, naturale",62.5,Acme,R1,Parquet,#c9a77a,mq
,10,Acme,R2,Parquet,,mq
Gres grigio,abc,Acme,R3,Gres,,mq
Gres bianco,30,Acme,R4,Gres,verdino,mq
Rovere doppio,60,Acme,R1,Parquet,,mq
`;
const r = parseLibraryCsv(csv);
assert.equal(r.items.length, 2, 'entrano solo le righe valide');
assert.equal(r.items[0].name, 'Rovere, naturale');
assert.equal(r.items[0].unit, 'm2');
assert.equal(r.items[1].color, undefined);
assert.deepEqual(r.errors.map((e) => e.line), [3, 4, 5, 6]);
assert.match(r.errors[1].why, /Prezzo non valido/);
assert.match(r.errors[2].why, /Colore non valido/);
assert.match(r.errors[3].why, /doppia/);
assert.equal(parseLibraryCsv('a;b\n1;2').errors[0].why.includes('obbligatorie'), true);
assert.equal(parseLibraryCsv('').errors.length, 1);
assert.equal(parseLibraryCsv('﻿nome;prezzo\nA;5').items.length, 1, 'accetta il BOM di Excel');

// preventivo di acquisto
const plans = JSON.parse(readFileSync(new URL('./fixtures/plans.json', import.meta.url)));
const plan = { ...plans.find((p) => p.doors.length && p.windows.length), wallThickness: 10, scale: 50 };
const [floorItem, , , paintItem] = tpl.items;
const rooms = plan.rooms.map((room, i) => (i < 2 ? { ...room, finish: { floor: floorItem, wall: paintItem } } : room));
const project = { name: 'P', floors: [{ id: 'f', name: 'Piano terra', level: 0, plan: { ...plan, rooms }, meta: {} }] };
const q = purchaseQuote(project, { vat: 22 });
assert.equal(q.rows.length, 2);
const fl = q.rows.find((x) => x.id === floorItem.id);
const area = rooms.slice(0, 2).reduce((s, x) => s + (x.area ?? x.w * x.h), 0);
assert.ok(Math.abs(fl.net - area) < 0.02, 'metri quadri del pavimento');
assert.equal(fl.waste, 10);
assert.ok(fl.qty >= area * 1.1 - 0.05 && fl.qty <= area * 1.1 + 0.15, 'con lo sfrido del 10%');
assert.equal(fl.total, Math.round(fl.qty * 62.5 * 100) / 100);
const paint = q.rows.find((x) => x.id === paintItem.id);
assert.equal(paint.waste, 0);
assert.ok(paint.net > fl.net, 'le pareti sono più dei pavimenti');
assert.equal(fl.uses.length, 2);
assert.equal(q.vat, 22);
assert.equal(q.total, Math.round((q.subtotal + q.tax) * 100) / 100);
assert.deepEqual(purchaseQuote({ floors: [{ id: 'f', name: 'x', plan }] }).rows, [], 'senza materiali scelti non c’è nulla');
const out = quoteToCsv(q);
assert.ok(out.startsWith('marchio;codice;') && out.includes('Totale') && out.includes('Piano terra'));
console.log(`library ok (${q.rows.length} voci, ${q.total} €)`);

// 3D: il pavimento del locale prende il colore del materiale scelto
{
  const THREE = await import('three');
  const { buildScene } = await import('../src/lib/scene3d.js');
  const { THEMES } = await import('../src/lib/themes.js');
  const gres = tpl.items[1];   // #9a9a96
  const p3 = { ...plan, rooms: plan.rooms.map((room, i) => (i === 0 ? { ...room, kind: 'living', finish: { floor: gres } } : room)) };
  const g = buildScene(THREE, p3, THEMES.modern);
  const hexes = new Set();
  g.traverse((o) => { if (o.isMesh && o.userData.layer === 'PAVIMENTI') [].concat(o.material).forEach((m) => hexes.add(m.color.getHexString())); });
  assert.ok(hexes.has('9a9a96'), 'pavimento del materiale scelto');
  console.log('library 3D ok');
}
