/*
 * Cucina completa: accanto al piano cucina si aggiungono le colonne con gli elettrodomestici incassati (frigo e congelatore, forno e
 * microonde, lavatrice) e sopra il piano i pensili. La cucina «base» è quella di prima (piano con lavello, cottura e cappa).
 *
 * `room.kitchenStyle = 'full'` segna i locali in cucina completa; gli arredi aggiunti portano `kitchenFull: true`, così tornare alla
 * cucina base li toglie tutti. Solo locali rettangolari. Ogni funzione ritorna { plan, notes }.
 */
import { opening } from './ajax';
import { itemPoint } from './electric';
import { againstOpening, furnitureRect } from './kitchenWindows';

export const COLUMN = 0.6;          // larghezza di una colonna
export const WALL_DEPTH = 0.35;     // profondità dei pensili
export const WALL_LIFT = 1.4;       // da terra al fondo del pensile
const COLUMN_TYPES = ['kitchen_fridge_tall', 'kitchen_oven_tall', 'kitchen_washer_tall'];
const LABEL = { kitchen_fridge_tall: 'frigo', kitchen_oven_tall: 'forno e microonde', kitchen_washer_tall: 'lavatrice' };
const round = (v) => Math.round(v * 1000) / 1000;
const overlap = (a, b, pad = 0.01) => a.x0 < b.x1 - pad && a.x1 > b.x0 + pad && a.y0 < b.y1 - pad && a.y1 > b.y0 + pad;
const rectToBox = (r) => ({ x0: r.x, x1: r.x + r.w, y0: r.y, y1: r.y + r.h });

export const isKitchenRoom = (r) => r && (r.kind === 'kitchen' || r.kind === 'living_kitchen');

/* Il piano cucina principale del locale: il più lungo contro un muro (con il fronte verso N, E, S o W). */
function counterOf(plan, roomId) {
  const list = plan.furniture.map((f, i) => ({ f, i })).filter(({ f }) => f.type === 'kitchen_counter' && f.room === roomId);
  return list.sort((a, b) => Math.max(b.f.w, b.f.h) - Math.max(a.f.w, a.f.h))[0] || null;
}

export const hasKitchenCounter = (plan, roomId) => !!counterOf(plan, roomId);

/* Torna alla cucina base: toglie colonne e pensili aggiunti e rimette il piano com'era. */
export function baseKitchen(plan, roomId) {
  const furniture = plan.furniture.filter((f) => !(f.kitchenFull && f.room === roomId)).map((f) => {
    if (f.room !== roomId || f.type !== 'kitchen_counter') return f;
    const { kitchenOrig, noFridge: _n, ...rest } = f;
    return { ...rest, ...(kitchenOrig || {}) };
  });
  const rooms = plan.rooms.map((r) => {
    if (r.id !== roomId) return r;
    const { kitchenStyle: _k, ...rest } = r;
    return rest;
  });
  return { plan: { ...plan, furniture, rooms }, notes: [] };
}

/* Il piano di lavoro in cucina completa; `plan.furniture` senza gli arredi già aggiunti. */
export function completeKitchen(plan0, roomId) {
  const notes = [];
  const room = plan0.rooms.find((r) => r.id === roomId);
  if (!isKitchenRoom(room)) return { plan: plan0, notes: ['Qui non c\'è una cucina.'] };
  if (room.poly) return { plan: plan0, notes: ['La cucina completa serve un locale rettangolare.'] };
  const plan = baseKitchen(plan0, roomId).plan;   // si riparte sempre dalla cucina base: niente doppioni
  const found = counterOf(plan, roomId);
  if (!found) return { plan: plan0, notes: ['Serve prima un piano cucina nel locale.'] };
  const t = plan.wallThickness / plan.scale;
  const inner = { x0: room.x + t / 2 - 0.005, x1: room.x + room.w - t / 2 + 0.005, y0: room.y + t / 2 - 0.005, y1: room.y + room.h - t / 2 + 0.005 };

  let counter = { ...found.f };
  const axis = counter.facing === 'S' || counter.facing === 'N' ? 'x' : 'y';
  const depth = axis === 'x' ? counter.h : counter.w;
  const len0 = axis === 'x' ? counter.w : counter.h;
  const start0 = axis === 'x' ? counter.x : counter.y;
  const others = plan.furniture.filter((f, i) => i !== found.i && f.type !== 'rug' && !f.decor && !f.elev && !f.supportId).map((f) => furnitureRect(f));
  const doors = plan.doors.filter((d) => d.kind !== 'gate').map((d) => ({ d, op: opening(plan, d) }));
  const windows = plan.windows.map((w) => opening(plan, w));
  const slotRect = (a0) => (axis === 'x' ? { x: round(a0), y: counter.y, w: COLUMN, h: depth } : { x: counter.x, y: round(a0), w: depth, h: COLUMN });
  const free = (r, used) => {
    const b = rectToBox(r);
    if (b.x0 < inner.x0 || b.x1 > inner.x1 || b.y0 < inner.y0 || b.y1 > inner.y1) return false;
    if (others.some((o) => overlap(b, { x0: o.x0, x1: o.x1, y0: o.y0, y1: o.y1 })) || used.some((u) => overlap(b, u))) return false;
    if (doors.some(({ d, op }) => againstOpening(b, op, { depth: d.w + 0.1, margin: 0.05 }))) return false;
    return !windows.some((op) => againstOpening(b, op, { depth: 0.45, margin: 0.02 }));
  };
  const alongOf = (p) => (axis === 'x' ? p.x : p.y);
  const lenOf = (c) => (axis === 'x' ? c.w : c.h);
  // posizione della cottura (e quindi della cappa) lungo il muro: dal disegno in pianta e dal modello 3D
  const hobAlong = [itemPoint(counter, counter.parts?.hob ?? lenOf(counter) * 0.4, 0), itemPoint(counter, lenOf(counter) * 0.75, 0)].map(alongOf);
  const hobMid = hobAlong[0];

  const used = [];
  const slotsFor = (side) => {
    // colonne contigue al piano dal lato `side` (-1 = prima, +1 = dopo): ci si ferma al primo ingombro
    const out = [];
    for (let k = 1; k <= 3; k++) {
      const a0 = side < 0 ? start0 - COLUMN * k : start0 + len0 + COLUMN * (k - 1);
      const r = slotRect(a0);
      if (!free(r, [])) break;   // gli spazi già presi si contano con `taken`, non si ricalcolano come ingombro
      out.push(r);
    }
    return out;
  };
  const centre = (side) => (side < 0 ? start0 - COLUMN / 2 : start0 + len0 + COLUMN / 2);
  // il frigo sta all'estremo più lontano dalla cottura, il forno dall'altra parte
  const sides = [-1, 1].sort((a, b) => Math.abs(centre(b) - hobMid) - Math.abs(centre(a) - hobMid));
  const taken = new Map([[-1, 0], [1, 0]]);
  const added = [];
  const place = (type, preferred) => {
    for (const side of [preferred, -preferred]) {
      const slots = slotsFor(side);
      const idx = taken.get(side);
      if (idx < slots.length) {
        const r = slots[idx];
        taken.set(side, idx + 1);
        used.push(rectToBox(r));
        added.push({ type, ...r, rot: 0, facing: counter.facing, room: roomId, kitchenFull: true });
        return true;
      }
    }
    return false;
  };
  const wanted = ['kitchen_fridge_tall', 'kitchen_oven_tall', 'kitchen_washer_tall'];
  const missing = [];
  for (const [i, type] of wanted.entries()) if (!place(type, sides[i % 2])) missing.push(type);

  // se non c'è posto accanto al piano, si accorcia il piano (2,4 m ne restano almeno) e la colonna prende il suo posto
  let shrink = 0;
  const loc = [itemPoint(counter, 0, 0), itemPoint(counter, lenOf(counter), 0)].map(alongOf);
  const localLeftIsLow = loc[0] < loc[1];
  for (const type of [...missing]) {
    if (len0 - shrink - COLUMN < 2.4) break;
    // dal lato più lontano dalla cottura
    const farSide = sides[0];
    const a0 = farSide < 0 ? start0 + shrink : start0 + len0 - shrink - COLUMN;
    const r = slotRect(a0);
    added.push({ type, ...r, rot: 0, facing: counter.facing, room: roomId, kitchenFull: true });
    used.push(rectToBox(r));
    shrink += COLUMN;
    missing.splice(missing.indexOf(type), 1);
    // il piano si accorcia da quel lato; le posizioni di lavello e cottura (dalla sinistra del disegno) si adattano
    const cutLow = farSide < 0;
    const cutLocalLeft = cutLow === localLeftIsLow;
    const orig = counter.kitchenOrig || { x: counter.x, y: counter.y, w: counter.w, h: counter.h, ...(counter.parts && { parts: counter.parts }) };
    const next = { ...counter, kitchenOrig: orig };
    if (axis === 'x') { next.w = round(counter.w - COLUMN); if (cutLow) next.x = round(counter.x + COLUMN); } else { next.h = round(counter.h - COLUMN); if (cutLow) next.y = round(counter.y + COLUMN); }
    if (counter.parts && cutLocalLeft) next.parts = Object.fromEntries(Object.entries(counter.parts).map(([k, v]) => [k, typeof v === 'number' ? round(v - COLUMN) : v]));
    counter = next;
  }
  for (const type of missing) notes.push(`Colonna ${LABEL[type]} non inserita: manca posto accanto al piano.`);

  // pensili sopra il piano, lasciando liberi finestre, cappa e colonne
  const cs = axis === 'x' ? counter.x : counter.y;
  const ce = cs + (axis === 'x' ? counter.w : counter.h);
  const blocks = [];
  for (const op of windows) {
    const probe = axis === 'x' ? { x0: cs, x1: ce, y0: counter.y, y1: counter.y + counter.h } : { x0: counter.x, x1: counter.x + counter.w, y0: cs, y1: ce };
    if (againstOpening(probe, op, { depth: 0.6, margin: 0.05 })) {
      const a = (axis === 'x' ? op.cx : op.cy);
      blocks.push([a - op.w / 2 - 0.08, a + op.w / 2 + 0.08]);
    }
  }
  for (const h of hobAlong) blocks.push([h - 0.45, h + 0.45]);
  blocks.sort((a, b) => a[0] - b[0]);
  const segs = [];
  let cur = cs;
  for (const [a, b] of blocks) {
    if (a > cur + 0.01) segs.push([cur, Math.min(a, ce)]);
    cur = Math.max(cur, b);
  }
  if (cur < ce - 0.01) segs.push([cur, ce]);
  const backAt = (type) => ({ S: counter.y, N: counter.y + counter.h - WALL_DEPTH, E: counter.x, W: counter.x + counter.w - WALL_DEPTH })[counter.facing];
  let cabinets = 0;
  for (const [a, b] of segs) {
    const L = b - a;
    if (L < 0.4) continue;
    const n = Math.ceil(L / 0.9 - 1e-6);
    const w = L / n;
    for (let i = 0; i < n; i++) {
      const a0 = a + w * i;
      const r = axis === 'x' ? { x: round(a0), y: round(backAt()), w: round(w), h: WALL_DEPTH } : { x: round(backAt()), y: round(a0), w: WALL_DEPTH, h: round(w) };
      added.push({ type: 'wall_cabinet', ...r, rot: 0, facing: counter.facing, room: roomId, kitchenFull: true, wallMounted: true, mountHeight: WALL_LIFT, z: [WALL_LIFT, round(WALL_LIFT + 0.7)] });
      cabinets += 1;
    }
  }
  if (!cabinets) notes.push('Nessun pensile: il muro dietro il piano è occupato da finestre o dalla cappa.');

  const furniture = plan.furniture.map((f, i) => (i === found.i ? { ...counter, noFridge: true } : f)).concat(added);
  const rooms = plan.rooms.map((r) => (r.id === roomId ? { ...r, kitchenStyle: 'full' } : r));
  return { plan: { ...plan, furniture, rooms }, notes, added: added.length };
}

/* Colonne e pensili di un locale (per il pannello). */
export function kitchenSummary(plan, roomId) {
  const mine = plan.furniture.filter((f) => f.room === roomId && f.kitchenFull);
  return { columns: mine.filter((f) => COLUMN_TYPES.includes(f.type)).map((f) => LABEL[f.type]), cabinets: mine.filter((f) => f.type === 'wall_cabinet').length };
}
