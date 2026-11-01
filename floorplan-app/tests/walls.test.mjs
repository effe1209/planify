/* Modifica della pianta: muri derivati dai locali, partizioni spostabili, porte e finestre (lib/walls.js). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addOpening, deriveWalls, flipDoor, moveOpening, movePartition, openingLine, partition, removeOpening, resizeOpening, runOf, wallRuns } from '../src/lib/walls.js';

const plans = JSON.parse(readFileSync(new URL('./fixtures/plans.json', import.meta.url)));
const key = (w) => `${w.x},${w.y},${w.w},${w.h}`;

// 1) i muri derivati dai locali sono quelli del motore
for (const [i, p] of plans.entries()) {
  const mine = deriveWalls(p.rooms, p.dimensions.width, p.dimensions.length).map(key).sort();
  assert.deepEqual(mine, p.walls.map(key).sort(), `muri della pianta ${i}`);
}

const overlapArea = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const totalArea = (p) => p.rooms.reduce((s, r) => s + r.w * r.h, 0);

// 2) ogni partizione interna spostabile: i locali non si sovrappongono, l'area totale resta, le aperture restano sui muri
let moves = 0;
for (const [i, p] of plans.entries()) {
  const runs = wallRuns(p).filter((r) => !r.exterior);
  for (const r of runs) {
    const part = partition(p, r.orient, r.line, r.a, r.b);
    if (part.error) continue;
    for (const d of [0.3, -0.3]) {
      const res = movePartition(p, part, d);
      const q = res.plan;
      if (!res.delta) continue;
      moves++;
      for (let a = 0; a < q.rooms.length; a++) {
        assert.ok(q.rooms[a].w >= 0.9 && q.rooms[a].h >= 0.9, `locale troppo piccolo (${i})`);
        for (let b = a + 1; b < q.rooms.length; b++) assert.ok(overlapArea(q.rooms[a], q.rooms[b]) < 1e-3, `sovrapposti (${i}): ${q.rooms[a].name} / ${q.rooms[b].name}`);
      }
      assert.ok(Math.abs(totalArea(q) - totalArea(p)) < 1e-6, 'area totale invariata');
      assert.deepEqual(deriveWalls(q.rooms, q.dimensions.width, q.dimensions.length).map(key).sort(), q.walls.map(key).sort());
      for (const o of [...q.doors, ...q.windows]) assert.ok(runOf(q, o), `apertura senza muro (${i})`);
    }
  }
}
assert.ok(moves >= 10, `spostamenti provati: ${moves}`);

// 3) i limiti: un locale non scende sotto la sua misura minima, il perimetro non si sposta
{
  const p = plans[0];
  const ext = wallRuns(p).find((r) => r.exterior);
  assert.ok(partition(p, ext.orient, ext.line, ext.a, ext.b).error);
  const inner = wallRuns(p).filter((r) => !r.exterior).map((r) => ({ r, part: partition(p, r.orient, r.line, r.a, r.b) })).find((x) => !x.part.error);
  const big = movePartition(p, inner.part, 99);
  assert.ok(big.delta <= inner.part.max + 1e-9 && big.delta > 0);
}

// 4) le aperture sul muro spostato lo seguono
{
  const p = plans[0];
  for (const r of wallRuns(p).filter((x) => !x.exterior)) {
    const part = partition(p, r.orient, r.line, r.a, r.b);
    if (part.error || part.max < 0.3) continue;
    const onWall = p.doors.filter((d) => { const o = openingLine(d, p.dimensions.width, p.dimensions.length); return o.orient === r.orient && Math.abs(o.line - r.line) < 0.02; });
    if (!onWall.length) continue;
    const q = movePartition(p, part, 0.3).plan;
    const after = q.doors.filter((d) => { const o = openingLine(d, q.dimensions.width, q.dimensions.length); return o.orient === r.orient && Math.abs(o.line - (r.line + 0.3)) < 0.02; });
    assert.ok(after.length >= onWall.length, 'le porte seguono il muro');
    break;
  }
}

// 5) aperture: sposta, ridimensiona, inverti, rimuovi, aggiungi
{
  const p = plans[0];
  const wi = 0;
  const run = runOf(p, p.windows[wi]);
  const moved = moveOpening(p, 'window', wi, 99);
  const o = openingLine(moved.windows[wi], p.dimensions.width, p.dimensions.length);
  assert.ok(o.start + moved.windows[wi].w <= run.hi - 0.15 + 1e-6, 'resta dentro il muro');
  const small = resizeOpening(p, 'window', wi, 0.8);
  assert.equal(small.windows[wi].w, 0.8);
  const di = p.doors.findIndex((d) => !d.entrance);
  assert.equal(flipDoor(p, di).doors[di].openDir, -p.doors[di].openDir);
  assert.equal(removeOpening(p, 'window', wi).windows.length, p.windows.length - 1);
  const ext = wallRuns(p).find((r) => r.exterior && r.hi - r.lo > 3 && !p.windows.some((w) => runOf(p, w) && runOf(p, w).line === r.line && runOf(p, w).lo === r.lo));
  if (ext) {
    const added = addOpening(p, 'window', ext, (ext.lo + ext.hi) / 2);
    assert.equal(added.plan.windows.length, p.windows.length + 1);
  }
  const inside = wallRuns(p).find((r) => !r.exterior);
  assert.ok(addOpening(p, 'window', inside, inside.lo + 1).error);
}
console.log(`walls ok (${moves} spostamenti)`);
