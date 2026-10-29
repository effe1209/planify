// Test del motore di copertura: node --import ./tests/loader.mjs tests/coverage.test.mjs [pianta.json]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { coverFloor, obstacles, CELL_STATE } from '../src/lib/coverage.js';
import { planSecurity } from '../src/lib/ajax.js';

const T = 0.2;
/* Locale rettangolare chiuso da muri, pianta in metri (scale 1). */
function box(W, L, extra = {}) {
  return {
    scale: 1, wallThickness: T, dimensions: { width: W, length: L },
    rooms: [{ id: 1, name: 'Soggiorno', kind: 'living', x: 0, y: 0, w: W, h: L }],
    walls: [
      { x: 0, y: 0, w: W, h: T }, { x: 0, y: L - T, w: W, h: T },
      { x: 0, y: 0, w: T, h: L }, { x: W - T, y: 0, w: T, h: L },
    ],
    doors: [], windows: [], furniture: [], ...extra,
  };
}
const sensorAt = (x, y, dir, model = 'motionprotect') => ({ id: 's', model, floor: 'f', room: 1, x, y, dir });
const cellAt = (room, x, y) => room.cells[Math.floor((y - room.y0) / room.ch) * room.nx + Math.floor((x - room.x0) / room.cw)];
let ok = 0;
const test = (name, fn) => { fn(); ok++; console.log('  ✓', name); };

console.log('Copertura — casi costruiti');
test('locale vuoto: tutto coperto tranne sotto il rilevatore', () => {
  const r = coverFloor(box(6, 4), [sensorAt(0.3, 0.3, 33.7)]).rooms[0];
  assert.ok(r.pct >= 85, `copertura ${r.pct}%`);
  assert.equal(cellAt(r, 5, 3), CELL_STATE.covered);
  assert.ok(r.blindCauses.some((c) => c.kind === 'below'), 'manca la zona sotto il rilevatore');
});
test('armadio alto: ombra dietro, attribuita all\'armadio', () => {
  const plan = box(6, 4, { furniture: [{ type: 'wardrobe', x: 2.5, y: 1.5, w: 0.6, h: 1.8 }] });
  const r = coverFloor(plan, [sensorAt(0.3, 0.3, 33.7)]).rooms[0];
  assert.equal(cellAt(r, 3.6, 3.0), CELL_STATE.blind, 'dietro l\'armadio dovrebbe essere cieco');
  const w = r.blindCauses.find((c) => c.label === 'Armadio');
  assert.ok(w && w.area > 0.5, `ombra dell'armadio ${w?.area} m²`);
});
test('divano basso: nessuna ombra piena dietro (la persona sporge)', () => {
  const plan = box(6, 4, { furniture: [{ type: 'sofa', x: 2.5, y: 1.5, w: 0.9, h: 2.0 }] });
  const r = coverFloor(plan, [sensorAt(0.3, 0.3, 33.7)]).rooms[0];
  assert.notEqual(cellAt(r, 3.8, 3.0), CELL_STATE.blind, 'dietro il divano non dovrebbe essere cieco');
  assert.ok(!r.blindCauses.some((c) => c.label === 'Divano' && c.area > 0.3), 'il divano non deve fare ombra piena');
});
test('porta chiusa blocca, porta aperta lascia vedere la stanza accanto', () => {
  const plan = box(10, 4);
  plan.rooms = [{ id: 1, name: 'A', kind: 'living', x: 0, y: 0, w: 5, h: 4 }, { id: 2, name: 'B', kind: 'corridor', x: 5, y: 0, w: 5, h: 4 }];
  plan.walls.push({ x: 4.9, y: 0, w: T, h: 4 });
  plan.doors = [{ x: 5.1, y: 1.6, w: 0.9, rot: 90 }];
  const s = [sensorAt(0.3, 2.0, 0)];
  const closed = coverFloor(plan, s, { doors: 'closed' }).rooms[1];
  const open = coverFloor(plan, s, { doors: 'open' }).rooms[1];
  assert.equal(closed.pctAny, 0, 'con la porta chiusa B non si vede');
  assert.ok(open.pctAny > 3, `con la porta aperta B si vede in parte (${open.pctAny}%)`);
});
test('vetrata: il PIR non vede oltre il vetro', () => {
  const plan = box(6, 4, { windows: [{ x: 2, y: 3.8, w: 2.4, rot: 0 }] });
  plan.rooms.push({ id: 2, name: 'Giardino', kind: 'garden', x: 0, y: 4, w: 6, h: 3 });
  const r = coverFloor(plan, [sensorAt(0.3, 0.3, 50)]);
  assert.equal(r.rooms[1].pctAny, 0, 'il giardino oltre la vetrata non deve risultare coperto');
  const g = obstacles(plan).filter((b) => b.kind === 'glass');
  assert.equal(g.length, 1);
});
test('varchi: finestra senza protezioni segnalata', () => {
  const plan = box(6, 4, { windows: [{ x: 2, y: 3.8, w: 1.2, rot: 0 }] });
  plan.rooms.push({ id: 2, name: 'Giardino', kind: 'garden', x: 0, y: 4, w: 6, h: 3 });
  const none = coverFloor(plan, []).openings;
  assert.equal(none.length, 1);
  assert.equal(none[0].ok, false);
  const withPir = coverFloor(plan, [sensorAt(0.3, 0.3, 50)]).openings[0];
  assert.ok(withPir.by.includes('Volumetrico'), withPir.by.join(','));
});

const file = process.argv[2];
if (file) {
  console.log(`\nPianta generata: ${file}`);
  const plan = JSON.parse(readFileSync(file, 'utf8'));
  const project = { floors: [{ id: 'f', name: 'Piano terra', level: 0, plan }] };
  const { devices } = planSecurity(project);
  const t0 = performance.now();
  const cov = coverFloor(plan, devices.filter((d) => d.floor === 'f'));
  const ms = performance.now() - t0;
  for (const r of cov.rooms) {
    const why = r.blindCauses.slice(0, 3).map((c) => `${c.label} ${c.area} m²`).join(', ');
    console.log(`  ${r.name.padEnd(22)} ${String(r.pct).padStart(3)}% coperto, ${String(r.pctAny).padStart(3)}% con parziale · sensori ${r.sensors} · ${why}`);
  }
  for (const o of cov.openings) console.log(`  varco ${o.type} ${o.roomName} ${o.w} m: ${o.ok ? o.by.join(' + ') : 'NON PROTETTO'}`);
  console.log(`  sensori ${cov.sensors.length}, volumi ${cov.boxes.length}, calcolo ${ms.toFixed(0)} ms`);
}
console.log(`\n${ok} test superati`);
