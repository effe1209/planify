/* Modifica della pianta: muri derivati dai locali, partizioni spostabili, porte e finestre (lib/walls.js). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addOpening, deriveWalls, flipDoor, moveOpening, movePartition, openingLine, partition, removeOpening, resizeOpening, runOf, wallRuns } from '../src/lib/walls.js';

const plans = JSON.parse(readFileSync(new URL('./fixtures/plans.json', import.meta.url)));
const houses = JSON.parse(readFileSync(new URL('./fixtures/houses.json', import.meta.url)));
const key = (w) => `${w.x},${w.y},${w.w},${w.h}`;

// 1) i muri derivati dai locali sono quelli del motore
for (const [i, p] of plans.entries()) {
  const mine = deriveWalls(p.rooms, p.dimensions.width, p.dimensions.length).map(key).sort();
  assert.deepEqual(mine, p.walls.map(key).sort(), `muri della pianta ${i}`);
}

const overlapArea = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const totalArea = (p) => p.rooms.reduce((s, r) => s + r.w * r.h, 0);

// 2) ogni muro (interno, esterno, a tratti): i locali non si sovrappongono, il contorno e i muri restano coerenti, le aperture restano sui muri
let moves = 0;
let outer = 0;
let pieces = 0;
for (const [i, p] of [...plans, ...houses.flat()].entries()) {
  for (const r of wallRuns(p)) {
    const part = partition(p, r.orient, r.line, r.a, r.b, [r.lo, r.hi]);
    if (part.error) continue;
    for (const d of [0.3, -0.3]) {
      const res = movePartition(p, part, d);
      if (res.error || !res.delta) continue;
      const q = res.plan;
      moves++;
      if (r.exterior) outer++;
      if (part.pieces) pieces++;
      for (let a = 0; a < q.rooms.length; a++) {
        const m = q.rooms[a].piece ? 0.45 : 0.85;
        assert.ok(q.rooms[a].w >= m && q.rooms[a].h >= m, `locale troppo piccolo (${i}): ${q.rooms[a].name} ${q.rooms[a].w}x${q.rooms[a].h}`);
        for (let b = a + 1; b < q.rooms.length; b++) assert.ok(overlapArea(q.rooms[a], q.rooms[b]) < 1e-3, `sovrapposti (${i}): ${q.rooms[a].name} / ${q.rooms[b].name}`);
      }
      if (!r.exterior) assert.ok(Math.abs(totalArea(q) - totalArea(p)) < 1e-6, 'area totale invariata dai muri interni');
      const maxX = Math.max(...q.rooms.map((x) => x.x + x.w));
      const maxY = Math.max(...q.rooms.map((x) => x.y + x.h));
      assert.ok(Math.abs(maxX - q.dimensions.width) < 1e-6 && Math.abs(maxY - q.dimensions.length) < 1e-6, 'il contorno segue i locali');
      assert.ok(Math.min(...q.rooms.map((x) => x.x)) === 0 && Math.min(...q.rooms.map((x) => x.y)) === 0, 'il contorno parte da 0');
      assert.deepEqual(deriveWalls(q.rooms, q.dimensions.width, q.dimensions.length).map(key).sort(), q.walls.map(key).sort());
      for (const o of [...q.doors, ...q.windows]) assert.ok(runOf(q, o), `apertura senza muro (${i})`);
    }
  }
}
assert.ok(moves >= 40 && outer >= 10 && pieces >= 3, `spostamenti ${moves}, esterni ${outer}, a tratti ${pieces}`);

// 3) i limiti: un locale non scende sotto la sua misura minima, il perimetro non si sposta
{
  const p = plans[0];
  const ext = wallRuns(p).find((r) => r.exterior);
  const ep = partition(p, ext.orient, ext.line, ext.a, ext.b, [ext.lo, ext.hi]);
  assert.ok(!ep.error && ep.exterior, 'i muri esterni si spostano');
  const inner = wallRuns(p).filter((r) => !r.exterior).map((r) => ({ r, part: partition(p, r.orient, r.line, r.a, r.b, [r.lo, r.hi]) })).find((x) => !x.part.error && x.part.max > 0);
  const big = movePartition(p, inner.part, 99);
  assert.ok(big.delta <= inner.part.max + 1e-9 && big.delta > 0);
}

// 4) le aperture sul muro spostato lo seguono
{
  const p = plans[0];
  for (const r of wallRuns(p).filter((x) => !x.exterior)) {
    const part = partition(p, r.orient, r.line, r.a, r.b, [r.lo, r.hi]);
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
  assert.ok(o.start + moved.windows[wi].w <= run.hi - 0.08 + 1e-6, 'resta dentro il muro');
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
// 6) porte e finestre dove vuoi: su ogni punto di ogni muro con spazio libero, senza toccare le altre aperture; mai dove non c'è posto
{
  let placed = 0;
  let refused = 0;
  for (const p of [...plans, ...houses.flat()]) {
    for (const r of wallRuns(p)) {
      const results = [];
      for (let at = r.lo + 0.05; at < r.hi; at += 0.1) results.push(addOpening(p, 'door', r, at));
      const okAll = results.every((x) => x.plan);
      const noneOk = results.every((x) => x.error);
      assert.ok(okAll || noneOk, 'o tutti i punti del tratto vanno bene o nessuno (tratto pieno o troppo corto)');
      if (noneOk) { refused++; continue; }
      for (const res of results) {
        placed++;
        const o = res.plan.doors[res.index];
        const q = openingLine(o, p.dimensions.width, p.dimensions.length);
        assert.ok(q.start >= r.lo + 0.08 - 1e-6 && q.start + o.w <= r.hi - 0.08 + 1e-6, 'dentro il tratto');
        for (const x of [...res.plan.doors.slice(0, -1), ...res.plan.windows]) {
          const y = openingLine(x, p.dimensions.width, p.dimensions.length);
          if (y.orient !== q.orient || Math.abs(y.line - q.line) > 0.02) continue;
          assert.ok(q.start + o.w <= y.start + 1e-6 || y.start + x.w <= q.start + 1e-6, 'senza sovrapporsi');
        }
      }
    }
  }
  assert.ok(placed > 3000 && refused > 0, `porte provate ${placed}, muri pieni ${refused}`);
}
console.log(`walls ok (${moves} spostamenti)`);

/* ── fase B: dividere, unire, aprire, spostare il vano scala, scegliere il tipo di scala ── */
import { canMerge, checkStair, mergeRooms, moveRoom, openWall, roomSlide, setStair, splitRoom, stairRoom } from '../src/lib/walls.js';
const noOverlap = (q, tag) => {
  for (let a = 0; a < q.rooms.length; a++) for (let b = a + 1; b < q.rooms.length; b++) assert.ok(overlapArea(q.rooms[a], q.rooms[b]) < 1e-3, `${tag}: sovrapposti ${q.rooms[a].name} / ${q.rooms[b].name}`);
};

// dividere: area invariata, due locali, una porta tra i due; unire riporta un locale solo
{
  const p = plans[0];
  const big = [...p.rooms].filter((r) => r.kind !== 'stairs').sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const orient = big.w >= big.h ? 'v' : 'h';
  const res = splitRoom(p, big.id, orient, orient === 'v' ? big.x + big.w / 2 : big.y + big.h / 2);
  assert.ok(!res.error, res.error);
  const q = res.plan;
  assert.equal(q.rooms.length, p.rooms.length + 1);
  assert.ok(Math.abs(totalArea(q) - totalArea(p)) < 1e-6);
  noOverlap(q, 'split');
  assert.equal(q.doors.length, p.doors.length + 1, 'porta tra le due parti');
  assert.ok(canMerge(q, big.id, res.moved[1]));
  const back = mergeRooms(q, big.id, res.moved[1]);
  assert.ok(!back.error, back.error);
  assert.equal(back.plan.rooms.length, p.rooms.length);
  assert.ok(Math.abs(totalArea(back.plan) - totalArea(p)) < 1e-6);
  assert.deepEqual(deriveWalls(back.plan.rooms, p.dimensions.width, p.dimensions.length).map(key).sort(), p.walls.map(key).sort(), 'i muri tornano quelli di prima');
  assert.ok(splitRoom(p, big.id, orient, big.x + 0.2).plan, 'taglio portato dentro i limiti');
  assert.ok(splitRoom(p, p.rooms.find((r) => r.kind === 'stairs')?.id ?? -1, 'v', 1).error);
}

// aprire un muro: i due locali diventano una zona, il muro sparisce
{
  const p = plans[0];
  const run = wallRuns(p).find((r) => !r.exterior && p.rooms.find((x) => x.id === r.a).kind === 'living' || (!r.exterior && p.rooms.find((x) => x.id === r.b)?.kind === 'kitchen'));
  const res = openWall(p, run.a, run.b);
  assert.ok(!res.error, res.error);
  assert.ok(res.plan.walls.length < p.walls.length || res.plan.walls.map(key).join() !== p.walls.map(key).join());
  assert.ok(openWall(res.plan, run.a, run.b).error, 'già zona unica');
}

// scale delle case generate: la combinazione attuale è valida (le porte non cadono sulla rampa)
let slid = 0;
for (const [hi, floors] of houses.entries()) {
  for (const [fi, p] of floors.entries()) {
    const found = stairRoom(p);
    if (!found) continue;
    assert.ok(checkStair(p, {}).ok, `scala attuale non valida (casa ${hi}, piano ${fi}): ${checkStair(p, {}).why} ${JSON.stringify(checkStair(p, {}).debug)}`);
    for (const axis of ['x', 'y']) {
      const slide = roomSlide(p, found.room.id, axis);
      if (slide.error || slide.max < 0.1) continue;
      const res = moveRoom(p, found.room.id, axis, Math.min(0.3, slide.max));
      const q = res.plan;
      assert.ok(res.delta > 0);
      slid++;
      noOverlap(q, `scala casa ${hi} piano ${fi}`);
      assert.ok(Math.abs(totalArea(q) - totalArea(p)) < 1e-6, 'area invariata');
      assert.equal(q.stairs[0].core[axis], +(p.stairs[0].core[axis] + res.delta).toFixed(3));
      assert.deepEqual(deriveWalls(q.rooms, q.dimensions.width, q.dimensions.length).map(key).sort(), q.walls.map(key).sort());
      for (const o of [...q.doors, ...q.windows]) assert.ok(runOf(q, o), 'apertura senza muro dopo lo spostamento della scala');
    }
    // tipo e verso: si accettano solo combinazioni che entrano e senza porte sulla rampa
    const alt = ['u', 'l', 'straight'].filter((t) => t !== found.stair.type).map((t) => checkStair(p, { type: t }));
    for (const c of alt) assert.ok(c.ok || typeof c.why === 'string');
    const same = setStair(p, { type: found.stair.type });
    assert.equal(same.plan.stairs[0].type, found.stair.type);
  }
}
assert.ok(slid >= 1, `spostamenti della scala provati: ${slid}`);
console.log(`walls fase B ok (${slid} scale spostate)`);
