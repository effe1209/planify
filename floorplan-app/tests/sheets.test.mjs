/* Tavole in scala (formati e scale, DXF con cornice e cartiglio) ed esportazione IFC (lib/techSheet.js, lib/dxf.js, lib/ifc.js). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHEET_FORMATS, drawingArea, fitScale, sheetFormat, sheetLayout } from '../src/lib/techSheet.js';
import { buildDxf } from '../src/lib/dxf.js';
import { buildIfc, ifcGuid } from '../src/lib/ifc.js';

const plans = JSON.parse(readFileSync(new URL('./fixtures/plans.json', import.meta.url)));
const base = plans.find((p) => p.doors.length && p.windows.length) || plans[0];
const plan = { ...base, wallThickness: base.wallThickness ?? 10, scale: base.scale ?? 50 };

// formati e scale
assert.deepEqual(Object.keys(SHEET_FORMATS), ['A4', 'A3', 'A2', 'A1']);
assert.equal(sheetFormat('A1').w, 841);
assert.equal(sheetFormat('boh').id, 'A4', 'formato sconosciuto: A4');
const small = fitScale(300, 200, 50, drawingArea(sheetFormat('A1')), [20, 50, 100]);   // 6 × 4 m
assert.equal(small.n, 20, 'su un A1 una pianta piccola entra a 1:20');
assert.equal(fitScale(300, 200, 50).n, 100, 'A4 di serie come prima: 1:100');

// foglio nel DXF
const L = sheetLayout(plan, { format: 'A3', scale: 100 });
assert.equal(L.n, 100);
assert.equal(L.k, 0.1);
assert.ok(L.unified);
assert.ok(sheetLayout(plan, { format: 'A3', scale: 'auto' }).n <= 200);
assert.equal(sheetLayout({ ...plan, dimensions: { width: 200, length: 100 } }, { format: 'A4' }).unified, false, 'troppo grande: scala non unificata');
const plain = buildDxf(plan);
assert.ok(!plain.includes('CARTIGLIO'), 'senza foglio il DXF è quello di prima');
const dxf = buildDxf(plan, { sheet: { format: 'A3', scale: 100, project: { name: 'Casa Prova' }, branding: { name: 'Studio X', client: 'Rossi', designer: '', ref: '12' }, floor: 'Piano terra', date: '1/1/2027' } });
for (const w of ['CORNICE', 'CARTIGLIO', 'Casa Prova', 'Studio X', 'Rossi', 'A3', '1:100']) assert.ok(dxf.includes(w), `nel DXF manca ${w}`);
assert.ok(!dxf.includes('NaN'));

// IFC
assert.equal(ifcGuid('a').length, 22);
assert.equal(ifcGuid('a'), ifcGuid('a'));
assert.notEqual(ifcGuid('a'), ifcGuid('b'));
const project = { id: 'p1', name: "Casa dell'Esempio è bella", floors: [{ id: 'f1', name: 'Piano terra', level: 0, plan, meta: {} }, { id: 'f2', name: 'Piano primo', level: 1, plan, meta: {} }] };
const { text, counts } = buildIfc(project, { author: 'Test', now: 1767225600000 });
assert.match(text, /^ISO-10303-21;\nHEADER;/);
assert.ok(text.includes("FILE_SCHEMA(('IFC2X3'))"));
assert.ok(text.trimEnd().endsWith('END-ISO-10303-21;'));
assert.ok(!text.includes('NaN') && !text.includes('undefined'));
assert.ok(text.includes('\\X2\\00E8\\X0\\'), 'le lettere accentate sono scritte in STEP');
const data = text.split('DATA;\n')[1].split('ENDSEC;')[0].trim().split('\n');
const ids = new Set(data.map((l) => l.match(/^#(\d+)=/)[1]));
assert.equal(ids.size, data.length, 'identificativi unici');
for (const l of data) for (const m of l.matchAll(/#(\d+)/g)) if (m.index > 0 && l[m.index - 1] !== undefined) assert.ok(ids.has(m[1]), `riferimento rotto #${m[1]} in ${l.slice(0, 60)}`);
const count = (k) => data.filter((l) => l.includes(`=${k}(`)).length;
assert.equal(count('IFCBUILDINGSTOREY'), 2);
assert.equal(count('IFCWALL'), counts.walls);
assert.ok(counts.walls >= plan.walls.length * 2);
assert.equal(count('IFCDOOR'), 2 * plan.doors.filter((o) => o.kind !== 'gate').length);
assert.equal(count('IFCWINDOW'), 2 * plan.windows.length);
assert.equal(count('IFCRELFILLSELEMENT'), count('IFCDOOR') + count('IFCWINDOW'), 'ogni porta e finestra riempie un vano');
assert.ok(count('IFCRELVOIDSELEMENT') >= (count('IFCDOOR') + count('IFCWINDOW')) * 0.9, 'quasi ogni vano buca un muro');
assert.equal(count('IFCSPACE'), 2 * plan.rooms.filter((r) => r.kind !== 'garden').length);
assert.equal(buildIfc(project, { author: 'Test', now: 1767225600000 }).text, text, 'deterministico');
console.log(`sheets ok (IFC: ${data.length} entità, ${counts.walls} muri, ${counts.doors} porte, ${counts.windows} finestre)`);
