/*
 * Prospetti e sezioni: disegni in elevazione dell'edificio, calcolati dalle piante dei piani (metri, y verso l'alto).
 * Ogni disegno è un elenco di forme: { kind: 'wall' | 'slab' | 'glass' | 'door' | 'roof' | 'ground' | 'room', pts, ... }
 * con x orizzontale (verso destra di chi guarda) e y la quota. Le altezze vengono dal dato del piano (meta.height,
 * 2,70 m se manca) più il solaio (30 cm); davanzale 0,90 m, finestra 1,40 m (come negli altri calcoli), porta 2,10 m.
 */
import { DEFAULT_HEIGHT, SLAB, WINDOW_H } from './compliance';
import { ROOF_DEFAULTS, gableTriangles, roofWings } from './roof';
import { bearing, sectorOf } from './orientation';
import { furnitureZ } from './scene3d';

export const SILL = 0.9;
export const DOOR_H = 2.1;
const WALL_T = 0.2;
// altezze del soppalco (le stesse di compliance.js): sotto, sopra, parapetto
const MEZZ_NORM = { under: 2.4, above: 2.2, parapet: 1.0 };
const RED = '#c62828';

/* Piani abitati dal basso: [{ floor, level, base, h }] con base = quota del pavimento (piano terra = 0). */
export function stack(project) {
  const floors = (project?.floors || []).filter((f) => typeof f.level === 'number' && f.plan?.rooms?.length
    && !f.plan.rooms.every((r) => r.kind === 'garden'))
    .sort((a, b) => a.level - b.level);
  const out = floors.map((f) => ({ floor: f, level: f.level, h: f.meta?.height ?? f.plan?.height ?? DEFAULT_HEIGHT, base: 0 }));
  const ground = out.findIndex((s) => s.level >= 0);
  const g = ground < 0 ? out.length : ground;
  for (let i = g + 1; i < out.length; i++) out[i].base = out[i - 1].base + out[i - 1].h + SLAB;
  for (let i = g - 1; i >= 0; i--) out[i].base = out[i + 1].base - out[i].h - SLAB;
  return out;
}

/* Lato del foglio da cui si guarda → asse orizzontale e verso. 'down' = guardando dalla parte bassa del foglio. */
const VIEW = {
  down: { axis: 'x', flip: false }, up: { axis: 'x', flip: true },
  right: { axis: 'y', flip: true }, left: { axis: 'y', flip: false },
};

const union = (iv) => {
  const s = [...iv].sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of s) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 1e-6) last[1] = Math.max(last[1], b); else out.push([a, b]);
  }
  return out;
};

/* Tetto sopra il piano più alto: poligoni [[x, quota]] per la vista data. wings = ali del piano. */
function roofShapes(wings, top, view, roof, c = null) {
  const { type, slope, overhang } = { ...ROOF_DEFAULTS, ...roof };
  const out = [];
  const tan = Math.tan((slope * Math.PI) / 180);
  for (const w of wings) {
    const hx = [w.x0, w.x1];
    const hy = [w.y0, w.y1];
    const [a0, a1] = view.axis === 'x' ? hx : hy;       // estensione lungo l'asse orizzontale
    const [b0, b1] = view.axis === 'x' ? hy : hx;       // profondità
    if (c != null && !(c > b0 && c < b1)) continue;      // sezione: solo le ali attraversate
    if (type === 'flat') {
      out.push([[a0 - overhang / 2, top], [a1 + overhang / 2, top], [a1 + overhang / 2, top + 0.25], [a0 - overhang / 2, top + 0.25]]);
      continue;
    }
    const alongX = w.x1 - w.x0 >= w.y1 - w.y0;
    const ridgeParallel = (view.axis === 'x') === alongX;   // il colmo corre lungo l'asse orizzontale della vista
    const half = (alongX ? w.y1 - w.y0 : w.x1 - w.x0) / 2;
    const ridge = half * tan;
    const drop = overhang * tan;
    if (ridgeParallel) {
      // falda vista di fronte (o sezione lungo il colmo: quota della falda nel punto del taglio)
      const mid = (b0 + b1) / 2;
      const hAt = c == null ? ridge : ridge * Math.max(0, 1 - Math.abs(c - mid) / half);
      const e = Math.min(overhang, 0.25);
      out.push(c == null
        ? [[a0 - e, top - drop], [a1 + e, top - drop], [a1 + e, top + hAt], [a0 - e, top + hAt]]
        : [[a0 - e, top], [a1 + e, top], [a1 + e, top + hAt], [a0 - e, top + hAt]]);
    } else {
      // timpano: triangolo con lo sporto
      const m = (a0 + a1) / 2;
      out.push([[a0 - overhang, top - drop], [m, top + ridge], [a1 + overhang, top - drop]]);
    }
  }
  return out;
}

/* Prospetto visto da `side` del foglio ('up' | 'down' | 'left' | 'right'). */
export function elevation(project, side, { north = 0, roof = null } = {}) {
  const view = VIEW[side];
  const levels = stack(project);
  const shapes = [];
  if (!levels.length) return { shapes, width: 0, minY: 0, maxY: 0, title: '' };
  const sign = view.flip ? -1 : 1;
  const bbox = { min: Infinity, max: -Infinity };
  const hx = (v) => sign * v;   // lo specchio per chi guarda da dietro
  let top = 0;
  for (const s of levels) {
    const { plan } = s.floor;
    const rooms = plan.rooms.filter((r) => r.kind !== 'garden');
    const span = union(rooms.map((r) => (view.axis === 'x' ? [r.x, r.x + r.w] : [r.y, r.y + r.h])));
    for (const [a, b] of span) {
      shapes.push({ kind: s.level < 0 ? 'below' : 'wall', level: s.level, pts: [[hx(a), s.base], [hx(b), s.base], [hx(b), s.base + s.h], [hx(a), s.base + s.h]] });
      bbox.min = Math.min(bbox.min, hx(a), hx(b));
      bbox.max = Math.max(bbox.max, hx(a), hx(b));
    }
    // solaio sotto il piano (tranne il più basso)
    if (s !== levels[0]) {
      const [a, b] = [Math.min(...span.map((q) => hx(q[0])), ...span.map((q) => hx(q[1]))), Math.max(...span.map((q) => hx(q[0])), ...span.map((q) => hx(q[1])))];
      shapes.push({ kind: 'slab', pts: [[a, s.base - SLAB], [b, s.base - SLAB], [b, s.base], [a, s.base]] });
    }
    // aperture sulla facciata che guarda l'osservatore
    const { width: W, length: L } = plan.dimensions;
    const facing = (o) => {
      if (side === 'down') return o.rot !== 90 && o.y >= L / 2;
      if (side === 'up') return o.rot !== 90 && o.y < L / 2;
      if (side === 'right') return o.rot === 90 && o.x >= W / 2;
      return o.rot === 90 && o.x < W / 2;
    };
    const lo = (o) => (view.axis === 'x' ? o.x : o.y);
    for (const w of (plan.windows || []).filter(facing)) {
      const a = hx(lo(w)), b = hx(lo(w) + w.w);
      shapes.push({ kind: 'glass', pts: [[a, s.base + SILL], [b, s.base + SILL], [b, s.base + SILL + WINDOW_H], [a, s.base + SILL + WINDOW_H]] });
    }
    for (const d of (plan.doors || []).filter((x) => x.entrance || x.kind === 'garage').filter(facing)) {
      const a = hx(lo(d)), b = hx(lo(d) + d.w);
      const h = d.kind === 'garage' ? 2.2 : DOOR_H;
      shapes.push({ kind: 'door', garage: d.kind === 'garage', pts: [[a, s.base], [b, s.base], [b, s.base + h], [a, s.base + h]] });
    }
    if (s.level >= 0) top = Math.max(top, s.base + s.h);
  }
  if (roof) {
    const topFloor = levels.filter((s) => s.level >= 0).pop();
    if (topFloor && !topFloor.floor.plan.rooms.every((r) => r.kind === 'garage')) {
      for (const pts of roofShapes(roofWings(topFloor.floor.plan), topFloor.base + topFloor.h, view, roof)) {
        const p = pts.map(([x, y]) => [hx(x), y]);
        shapes.push({ kind: 'roof', pts: p });
        p.forEach(([x]) => { bbox.min = Math.min(bbox.min, x); bbox.max = Math.max(bbox.max, x); });
      }
    }
  }
  const minY = Math.min(0, ...levels.map((s) => s.base - (s === levels[0] ? 0 : SLAB)));
  const maxY = Math.max(top, ...shapes.filter((s) => s.kind === 'roof').flatMap((s) => s.pts.map((p) => p[1])));
  const name = { N: 'nord', E: 'est', S: 'sud', O: 'ovest' }[sectorOf(bearing(side === 'down' ? 'down' : side === 'up' ? 'up' : side, north))];
  return { shapes, minX: bbox.min, maxX: bbox.max, minY, maxY, title: `Prospetto ${name}` };
}

/*
 * Sezione con un piano di taglio verticale: axis 'x' = linea orizzontale sulla pianta a y = c (si guarda dal basso);
 * axis 'y' = linea verticale a x = c (si guarda da destra).
 */
export function section(project, axis, c, { roof = null } = {}) {
  const view = axis === 'x' ? VIEW.down : VIEW.left;
  const levels = stack(project);
  const shapes = [];
  const dims = [];   // quote verticali: { y0, y1, label, bad }
  if (!levels.length) return { shapes, minX: 0, maxX: 0, minY: 0, maxY: 0, title: '' };
  let min = Infinity, max = -Infinity, top = 0;
  for (const s of levels) {
    const rooms = s.floor.plan.rooms.filter((r) => r.kind !== 'garden');
    const cut = rooms.map((r) => {
      const [a0, a1, b0, b1] = axis === 'x' ? [r.x, r.x + r.w, r.y, r.y + r.h] : [r.y, r.y + r.h, r.x, r.x + r.w];
      return c > b0 && c < b1 ? { a0, a1, r } : null;
    }).filter(Boolean);
    if (!cut.length) continue;
    const span = union(cut.map((q) => [q.a0, q.a1]));
    const [lo, hi] = [span[0][0], span[span.length - 1][1]];
    min = Math.min(min, lo - WALL_T / 2); max = Math.max(max, hi + WALL_T / 2);
    for (const q of cut) shapes.push({ kind: 'room', pts: [[q.a0, s.base], [q.a1, s.base], [q.a1, s.base + s.h], [q.a0, s.base + s.h]], name: q.r.name, h: s.h, level: s.level });
    const edges = [...new Set(cut.flatMap((q) => [Math.round(q.a0 * 100) / 100, Math.round(q.a1 * 100) / 100]))];
    for (const e of edges) shapes.push({ kind: 'wall', pts: [[e - WALL_T / 2, s.base], [e + WALL_T / 2, s.base], [e + WALL_T / 2, s.base + s.h], [e - WALL_T / 2, s.base + s.h]] });
    if (s !== levels[0]) shapes.push({ kind: 'slab', pts: [[lo - WALL_T / 2, s.base - SLAB], [hi + WALL_T / 2, s.base - SLAB], [hi + WALL_T / 2, s.base], [lo - WALL_T / 2, s.base]] });
    sectionDetails(s, axis, c, shapes, dims);
    if (s.level >= 0) top = Math.max(top, s.base + s.h);
  }
  if (roof) {
    const topFloor = levels.filter((s) => s.level >= 0).pop();
    if (topFloor) {
      for (const pts of roofShapes(roofWings(topFloor.floor.plan), topFloor.base + topFloor.h, view, roof, c)) shapes.push({ kind: 'roof', pts });
    }
  }
  const all = shapes.flatMap((s) => s.pts);
  const minY = Math.min(0, ...levels.map((s) => s.base - (s === levels[0] ? 0 : SLAB)));
  return {
    shapes, dims, minX: Math.min(min, ...all.map((p) => p[0])), maxX: Math.max(max, ...all.map((p) => p[0])), minY,
    maxY: Math.max(top, ...all.map((p) => p[1])),
    title: axis === 'x' ? 'Sezione longitudinale A–A' : 'Sezione trasversale B–B',
  };
}

const box = (a0, a1, y0, y1) => [[a0, y0], [a1, y0], [a1, y1], [a0, y1]];

/*
 * Dentro un piano tagliato: arredi tagliati, e nel loft il soppalco (solaio, parapetto, scala a gradini, pareti del bagnetto)
 * con le quote delle altezze libere; le altezze fuori norma vanno in rosso.
 * axis 'x': profilo lungo x per il taglio a y = c; axis 'y': profilo lungo y per il taglio a x = c.
 */
function sectionDetails(s, axis, c, shapes, dims) {
  const plan = s.floor.plan;
  const ax = (o) => (axis === 'x' ? [o.x, o.x + o.w, o.y, o.y + o.h] : [o.y, o.y + o.h, o.x, o.x + o.w]);   // [lungo, lungo+, trasversale, trasversale+]
  const mz = plan.mezzanine;
  const e = mz ? s.base + mz.elev : null;
  for (const f of plan.furniture || []) {
    const [a0, a1, b0, b1] = ax(f);
    if (!(c > b0 && c < b1) || f.type === 'rug') continue;
    const [z0, z1] = furnitureZ(f.type);
    const lift = f.elev ? s.base + f.elev : s.base;
    shapes.push({ kind: 'furn', pts: box(a0, a1, lift + z0, lift + z1), name: f.type });
  }
  if (!mz) return;
  const [m0, m1, n0, n1] = ax(mz);
  if (!(c > n0 && c < n1)) return;
  const st = ax(mz.stair);
  const onStair = c > st[2] && c < st[3];
  const run = mz.stair.up === 'E' || mz.stair.up === 'W' ? 'x' : 'y';
  const along = run === axis;   // la rampa corre lungo il profilo
  // solaio, interrotto dal vano della scala dove il taglio la attraversa lungo il suo percorso
  const gaps = onStair && along ? [[st[0], st[1]]] : [];
  let from = m0;
  for (const [g0, g1] of [...gaps, [m1, m1]]) {
    if (g0 > from + 1e-6) shapes.push({ kind: 'slab', pts: box(from, g0, e - mz.slab, e) });
    from = Math.max(from, g1);
  }
  // parapetto sui lati aperti che il taglio attraversa
  for (const side of mz.open || []) {
    const edge = axis === 'x' ? (side === 'W' ? m0 : side === 'E' ? m1 : null) : (side === 'N' ? m0 : side === 'S' ? m1 : null);
    if (edge == null) continue;
    shapes.push({ kind: 'glass', pts: box(edge - 0.02, edge + 0.02, e, e + mz.parapet) });
    shapes.push({ kind: 'slab', pts: box(edge - 0.03, edge + 0.03, e + mz.parapet - 0.04, e + mz.parapet) });
  }
  // scala: gradini lungo il profilo, oppure l'altezza della rampa nel punto del taglio
  if (onStair) {
    const n = mz.stair.risers || 13;
    if (along) {
      const rising = mz.stair.up === 'E' || mz.stair.up === 'S' ? 1 : -1;
      const len = st[1] - st[0];
      for (let i = 0; i < n; i++) {
        const t0 = (i * len) / n;
        const t1 = ((i + 1) * len) / n;
        const [x0, x1] = rising > 0 ? [st[0] + t0, st[0] + t1] : [st[1] - t1, st[1] - t0];
        shapes.push({ kind: 'stair', pts: box(x0, x1, s.base, s.base + (mz.elev * (i + 1)) / n) });
      }
    } else {
      const t = ((c - st[2]) / (st[3] - st[2]));
      const k = Math.min(1, (mz.stair.up === 'E' || mz.stair.up === 'S' ? t : 1 - t));
      shapes.push({ kind: 'stair', pts: box(st[0], st[1], s.base, s.base + mz.elev * Math.max(0.1, k)) });
    }
  }
  // pareti del bagnetto sul soppalco
  for (const q of mz.bath?.walls || []) {
    const [a0, a1, b0, b1] = ax(q);
    if (c > b0 && c < b1) shapes.push({ kind: 'wall', pts: box(a0, a1, e, e + 2.2) });
  }
  // altezze libere: sotto il soppalco, sopra (fino al soffitto) e parapetto
  const ceil = s.base + s.h;
  const under = mz.elev - mz.slab;
  const above = s.h - mz.elev;
  dims.push({ y0: s.base, y1: s.base + under, label: 'sotto', bad: under < MEZZ_NORM.under - 1e-6 });
  dims.push({ y0: e, y1: ceil, label: 'sopra', bad: above < MEZZ_NORM.above - 1e-6 });
  dims.push({ y0: e, y1: e + mz.parapet, label: 'parapetto', bad: mz.parapet < MEZZ_NORM.parapet - 1e-6 });
}

/* Quote dei piani per le scritte laterali: [{ label, y }] con +0,00 = piano terra. */
export function levelMarks(project) {
  return stack(project).map((s) => ({ label: `${s.base >= 0 ? '+' : '−'}${Math.abs(s.base).toFixed(2).replace('.', ',')}`, y: s.base, name: s.floor.name }));
}

export { gableTriangles };
