/*
 * Schizzo → planimetria arredata, interamente nel browser (funziona anche senza backend).
 *
 * Ogni stanza è un poligono qualsiasi (rettangolo, cerchio, ferro di cavallo…), in metri.
 *   1. MURI     → il contorno di ogni stanza, tracciato a cavallo della linea disegnata
 *   2. PORTE    → solo dove due stanze condividono davvero un tratto di muro; un albero di
 *                 copertura (Prim) garantisce che ogni stanza sia raggiungibile dall'ingresso
 *   3. FINESTRE → sui tratti di muro che affacciano all'esterno, mai sopra le porte
 *   4. ARREDI   → rettangoli orientati, dentro il poligono, appoggiati ai muri, lontani dalle porte
 */
import { WALL, SCALE, roomColor } from '../constants.js';
import * as G from './geometry.js';
import { round, randomSeed } from './utils.js';

const HALF = WALL / 2;
const MIN_DOOR_SPAN = 0.95;       // tratto condiviso minimo per ricavare una porta
const DOOR_W = 0.9;
const DOOR_W_BATH = 0.8;

/* Quanto "costa" attraversare una stanza per raggiungerne un'altra: meglio passare dal disimpegno che dal bagno. */
const PASS_COST = { corridor: 0, living: 0.5, living_kitchen: 0.5, hotel_room: 1, kitchen: 1, study: 2, bed: 3, bath: 8 };
const ENTRANCE_PREF = ['corridor', 'living_kitchen', 'living', 'hotel_room', 'kitchen', 'study', 'bed', 'bath'];

/* ── Analisi dei lati ──────────────────────────────────────────────────── */
function analyzeSides(rooms) {
  const sides = [];
  for (const r of rooms) {
    G.edges(r.poly).forEach(([a, b], k) => {
      const shared = [];
      for (const o of rooms) {
        if (o === r) continue;
        for (const [c, d] of G.edges(o.poly)) {
          const iv = G.collinearOverlap(a, b, c, d);
          if (iv) shared.push({ iv, other: o.id });
        }
      }
      sides.push({
        key: `${r.id}:${k}`,
        room: r.id,
        a,
        b,
        length: G.dist(a, b),
        shared,
        exterior: G.complementIntervals(shared.map((s) => s.iv)),
      });
    });
  }
  return sides;
}

function adjacencies(sides) {
  const best = new Map();
  for (const s of sides) {
    for (const { iv, other } of s.shared) {
      if (other < s.room) continue; // ogni coppia una volta sola
      const span = (iv[1] - iv[0]) * s.length;
      const k = `${s.room}-${other}`;
      if (!best.has(k) || best.get(k).span < span) best.set(k, { a: s.room, b: other, side: s, iv, span });
    }
  }
  return [...best.values()];
}

/* ── Aperture (porte e finestre) ───────────────────────────────────────── */

/*
 * Il frontend disegna un'apertura con translate(x,y) rotate(rot): l'asse x locale corre lungo il muro,
 * l'asse y attraversa lo spessore (da 0 a wallThickness). Il muro è centrato sulla linea a→b.
 */
function opening(a, b, tMid, w, intoPoly) {
  const u = G.unit(G.sub(b, a));
  const n = G.normal(u);
  const centre = G.lerp(a, b, tMid);
  const start = G.sub(centre, G.mul(u, w / 2));
  const origin = G.sub(start, G.mul(n, HALF));
  const into = intoPoly && G.pointInPolygon(G.add(centre, G.mul(n, 0.25)), intoPoly) ? 1 : -1;
  return {
    x: round(origin[0]),
    y: round(origin[1]),
    w: round(w),
    rot: round((Math.atan2(u[1], u[0]) * 180) / Math.PI, 2),
    openDir: into,
    centre,
    chord: { start, u, w },
  };
}

/*
 * Muri come polilinee: il contorno di ogni stanza, interrotto dove c'è un'apertura. Su un arco
 * l'apertura sta sulla corda, quindi si toglie anche il tratto di curva che le sta dietro.
 */
function cutWalls(polys, chords) {
  const STEP = 0.02;
  const TOL = ARC_TOL + 0.06;
  const cut = (p) => chords.some(({ start, u, w }) => {
    const v = G.sub(p, start);
    const t = G.dot(v, u);
    return t > 0.01 && t < w - 0.01 && Math.abs(G.dot(v, G.normal(u))) < TOL;
  });
  const lines = [];
  for (const poly of polys) {
    const pts = [];
    for (const [a, b] of G.edges(poly)) {
      const n = Math.max(1, Math.ceil(G.dist(a, b) / STEP));
      for (let i = 0; i < n; i++) pts.push(G.lerp(a, b, i / n));
    }
    const flags = pts.map(cut);
    const first = flags.indexOf(true);
    if (first < 0) {
      lines.push({ pts: poly, closed: true });
      continue;
    }
    let run = null;
    const flush = () => {
      if (run && run.length > 1) lines.push({ pts: G.simplifyOpen(run, 0.003).map((p) => p.map((v) => round(v))), closed: false });
      run = null;
    };
    for (let i = 1; i <= pts.length; i++) {
      const j = (first + i) % pts.length;
      if (flags[j]) flush();
      else (run ??= []).push(pts[j]);
    }
    flush();
  }
  return lines;
}

/* Posizione della porta lungo il tratto condiviso: vicino a un'estremità se il muro è lungo, così resta parete utile. */
function doorParam(iv, sideLen, w) {
  const span = (iv[1] - iv[0]) * sideLen;
  if (span < w + 1.4) return (iv[0] + iv[1]) / 2;
  return iv[0] + (0.3 + w / 2) / sideLen;
}

/*
 * Tratti di muro esterno su cui si può aprire una porta o una finestra. I lati interamente esterni
 * consecutivi (es. un arco disegnato a mano) vengono riuniti e sostituiti da corde che si scostano
 * dalla curva meno di ARC_TOL: così anche una stanza tonda ha tratti abbastanza lunghi per le aperture.
 */
const ARC_TOL = 0.1;
function exteriorRuns(sides, roomId) {
  const rs = sides.filter((s) => s.room === roomId);
  const isFull = (s) => s.exterior.length === 1 && s.exterior[0][0] < 1e-6 && s.exterior[0][1] > 1 - 1e-6;
  const runs = [];
  const push = (a, b, key) => runs.push({ key, a, b, length: G.dist(a, b) });

  rs.forEach((s) => {
    if (!isFull(s)) s.exterior.forEach(([t0, t1], k) => push(G.lerp(s.a, s.b, t0), G.lerp(s.a, s.b, t1), `${s.key}:${k}`));
  });

  // catene di lati esterni che proseguono senza spigoli vivi (svolta < 30°): archi e tratti dritti
  const n = rs.length;
  const full = rs.map(isFull);
  const turn = (i) => {
    const p = rs[(i - 1 + n) % n];
    const u = G.unit(G.sub(p.b, p.a));
    const v = G.unit(G.sub(rs[i].b, rs[i].a));
    return Math.acos(Math.max(-1, Math.min(1, G.dot(u, v))));
  };
  const cont = rs.map((_, i) => full[i] && full[(i - 1 + n) % n] && turn(i) < Math.PI / 6);
  let starts = rs.map((_, i) => i).filter((i) => full[i] && !cont[i]);
  if (!starts.length && full.every(Boolean)) starts = [0]; // contorno chiuso e liscio (cerchio, ovale)
  for (const s0 of starts) {
    const chain = [rs[s0].a, rs[s0].b];
    for (let i = (s0 + 1) % n; i !== s0 && cont[i]; i = (i + 1) % n) chain.push(rs[i].b);
    const pts = G.greedyChords(G.resample(chain, 0.05).concat([chain[chain.length - 1]]), ARC_TOL);
    for (let k = 0; k < pts.length - 1; k++) push(pts[k], pts[k + 1], `${rs[s0].key}~${k}`);
  }
  return runs;
}

function longestRun(runs, minLen) {
  return runs.reduce((best, r) => (r.length >= minLen && (!best || r.length > best.length) ? r : best), null);
}

/* ── Arredi ─────────────────────────────────────────────────────────────── */
const FACE = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] };
const OPP = { S: 'N', N: 'S', E: 'W', W: 'E' };
const PAD = HALF + 0.02;        // distanza minima dalla linea del muro

const dims = (along, depth, f) => (f === 'S' || f === 'N' ? [along, depth] : [depth, along]);

/* Punti campione dello schienale e direzione "verso il muro" per un arredo che guarda verso f. */
function backInfo(r, f) {
  const { x, y, w, h } = r;
  const ts = [0, 0.25, 0.5, 0.75, 1];
  if (f === 'S') return { pts: ts.map((t) => [x + w * t, y]), dir: [0, -1] };
  if (f === 'N') return { pts: ts.map((t) => [x + w * t, y + h]), dir: [0, 1] };
  if (f === 'E') return { pts: ts.map((t) => [x, y + h * t]), dir: [-1, 0] };
  return { pts: ts.map((t) => [x + w, y + h * t]), dir: [1, 0] };
}

function sideRays(r, f, poly) {
  const c = G.rectCenter(r);
  const pairs = f === 'S' || f === 'N'
    ? [[[r.x, c[1]], [-1, 0]], [[r.x + r.w, c[1]], [1, 0]]]
    : [[[c[0], r.y], [0, -1]], [[c[0], r.y + r.h], [0, 1]]];
  return Math.min(...pairs.map(([p, d]) => G.rayHit(p, d, poly)));
}

function keepRect(r, f, front) {
  if (!front) return r;
  if (f === 'S') return { ...r, h: r.h + front };
  if (f === 'N') return { ...r, y: r.y - front, h: r.h + front };
  if (f === 'E') return { ...r, w: r.w + front };
  return { ...r, x: r.x - front, w: r.w + front };
}

class Placer {
  constructor(room, doors, windows) {
    this.room = room;
    this.poly = room.poly;
    this.bb = G.bounds(room.poly);
    this.doors = doors;       // [{ centre, w, inward, swings }]
    this.windows = windows;   // [{ centre, w }]
    this.items = [];          // [{ type, rect, keep, facing, gap }]
  }

  free(rect, keep, gap, avoidWindows) {
    if (!G.rectInPolygon(rect, this.poly, HALF + 0.005)) return false;
    if (keep !== rect && !G.rectInPolygon(keep, this.poly, 0)) return false;
    for (const d of this.doors) {
      // da questo lato: se l'anta apre qui, tutto il suo arco; altrimenti solo il passaggio
      const zone = d.swings
        ? [G.add(d.centre, G.mul(d.inward, d.w / 2)), d.w * 0.72]
        : [G.add(d.centre, G.mul(d.inward, 0.3)), d.w / 2 + 0.1];
      if (G.rectHitsCircle(rect, ...zone)) return false;
    }
    if (avoidWindows) for (const w of this.windows) if (G.rectHitsCircle(rect, w.centre, w.w / 2 + 0.1)) return false;
    for (const it of this.items) {
      const g = Math.max(gap, it.gap);
      if (G.rectsOverlap(rect, it.keep, g) || G.rectsOverlap(keep, it.rect, g)) return false;
    }
    return true;
  }

  /* Prova ogni misura (dalla più grande) e tiene la posizione col punteggio migliore. */
  place(spec) {
    const { type, sizes, wall = true, front = 0, gap = 0.05, avoidWindows = false, score = () => 0 } = spec;
    const facings = spec.facings || (wall ? ['S', 'N', 'E', 'W'] : ['S', 'E']);
    const step = 0.1;
    for (const [along, depth] of sizes) {
      let best = null;
      for (const f of facings) {
        const [w, h] = dims(along, depth, f);
        for (let x = this.bb.x + PAD; x <= this.bb.x2 - PAD - w + 1e-9; x += step) {
          for (let y = this.bb.y + PAD; y <= this.bb.y2 - PAD - h + 1e-9; y += step) {
            let rect = { x, y, w, h };
            if (wall) {
              // appoggia lo schienale al muro. Si misura dal rettangolo già allargato dello spessore
              // del muro: su un muro curvo il primo contatto è uno spigolo, non il centro dello schienale.
              const { pts, dir } = backInfo(G.expandRect(rect, PAD), f);
              const d = Math.min(...pts.map((p) => G.rayHit(p, dir, this.poly)));
              if (!(d < 0.45)) continue;
              const k = d - 0.01;
              rect = { x: x + dir[0] * k, y: y + dir[1] * k, w, h };
            }
            const keep = keepRect(rect, f, front);
            if (!this.free(rect, keep, gap, avoidWindows)) continue;
            const s = score({ rect, facing: f, centre: G.rectCenter(rect), placer: this });
            if (!best || s < best.s) best = { s, rect, keep, f };
          }
        }
      }
      if (best) {
        const item = { type, rect: best.rect, keep: best.keep, facing: best.f, gap };
        this.items.push(item);
        return item;
      }
    }
    return null;
  }

  minDoorDist(p) {
    return this.doors.length ? Math.min(...this.doors.map((d) => G.dist(p, d.centre))) : 0;
  }

  minWindowDist(p) {
    return this.windows.length ? Math.min(...this.windows.map((w) => G.dist(p, w.centre))) : 0;
  }
}

const farFromDoor = ({ centre, placer }) => -placer.minDoorDist(centre);
const nearWindow = ({ centre, placer }) => placer.minWindowDist(centre);
const corner = ({ rect, facing, placer }) => sideRays(rect, facing, placer.poly) * 2 - placer.minDoorDist(G.rectCenter(rect)) * 0.3;

function placeCounter(P) {
  return P.place({
    type: 'kitchen_counter',
    sizes: [[3.0, 0.6], [2.4, 0.6], [1.8, 0.6], [1.2, 0.6]],
    front: 0.9,
    gap: 0.1,
    avoidWindows: true,
    score: (c) => farFromDoor(c) + corner(c) * 0.3,
  });
}

function placeLiving(P) {
  const sofa = P.place({ type: 'sofa', sizes: [[2.2, 0.9], [1.8, 0.9], [1.4, 0.8]], front: 0.5, gap: 0.3, score: farFromDoor });
  if (!sofa) return false;
  const sc = G.rectCenter(sofa.rect);
  const fv = FACE[sofa.facing];
  P.place({
    type: 'tv',
    sizes: [[1.6, 0.25], [1.2, 0.25]],
    gap: 0.05,
    avoidWindows: true,
    // la TV guarda il divano: stessa linea d'asse, verso opposto, ad almeno ~1,8 m
    score: ({ centre, facing }) => {
      const v = G.sub(centre, sc);
      const along = G.dot(v, fv);
      const lateral = Math.abs(G.cross(fv, v));
      return lateral * 2 + (facing === OPP[sofa.facing] ? 0 : 6) + (along < 1.8 ? 8 : 0) + Math.abs(along - 2.8) * 0.3;
    },
  });
  return true;
}

function placeTable(P, near, sizes = [[1.6, 0.9], [1.2, 0.8]]) {
  return P.place({
    type: 'table',
    sizes,
    wall: false,
    gap: 0.75,
    score: ({ centre }) => G.dist(centre, near),
  });
}

function furnishRoom(P, room, notes) {
  const missing = (what) => notes.push(`${room.name}: ${what} non inserito (spazio insufficiente o forma troppo stretta)`);
  const label = room.label;
  switch (room.kind) {
    case 'bath': {
      const shower = P.place({ type: 'shower', sizes: [[0.9, 0.9], [0.8, 0.8]], front: 0.4, gap: 0.05, score: corner });
      if (!shower && room.area >= 4.5) P.place({ type: 'bathtub', sizes: [[1.7, 0.75], [1.5, 0.7]], front: 0.5, score: corner });
      if (!P.place({ type: 'toilet', sizes: [[0.4, 0.7], [0.4, 0.6]], front: 0.5, gap: 0.15, score: farFromDoor })) missing('WC');
      if (!P.place({ type: 'sink', sizes: [[0.6, 0.5], [0.5, 0.4]], front: 0.4, gap: 0.1 })) missing('lavabo');
      break;
    }
    case 'bed':
    case 'hotel_room': {
      const sizes = room.area >= 12 ? [[1.6, 2.0], [1.4, 2.0], [0.9, 2.0]] : [[1.4, 2.0], [0.9, 2.0]];
      if (!P.place({ type: 'bed', sizes, front: 0.6, gap: 0.4, score: (c) => farFromDoor(c) + nearWindow(c) * 0.1 })) missing('letto');
      P.place({ type: 'wardrobe', sizes: [[1.8, 0.6], [1.2, 0.6]], front: 0.7, gap: 0.3, avoidWindows: true, score: corner });
      if (room.area >= 11) P.place({ type: 'desk', sizes: [[1.2, 0.6]], front: 0.7, gap: 0.3, score: nearWindow });
      break;
    }
    case 'living_kitchen': {
      const counter = placeCounter(P);
      if (!counter) missing('angolo cottura');
      if (!placeLiving(P) && room.area >= 12) missing('divano');
      placeTable(P, counter ? G.rectCenter(counter.rect) : label);
      break;
    }
    case 'living': {
      if (!placeLiving(P) && room.area >= 10) missing('divano');
      if (room.area >= 16) placeTable(P, label);
      break;
    }
    case 'kitchen': {
      const counter = placeCounter(P);
      if (!counter) missing('piano cucina');
      if (room.area >= 8) placeTable(P, label, [[1.2, 0.8], [0.9, 0.7]]);
      break;
    }
    case 'study': {
      if (!P.place({ type: 'desk', sizes: [[1.4, 0.7], [1.2, 0.6]], front: 0.7, gap: 0.3, score: nearWindow })) missing('scrivania');
      break;
    }
    default:
      break;
  }
}

/* ── API ────────────────────────────────────────────────────────────────── */

/**
 * @param {Array<{kind:string,name:string,poly:number[][]}>} shapes  stanze in metri
 * @returns piano nello stesso formato di /generate-plan, con in più `room.poly` e `wallLines`
 */
export function sketchToPlan(shapes, { style = 'modern' } = {}) {
  if (!shapes.length) throw new Error('Lo schizzo è vuoto: disegna almeno una stanza.');
  const b = G.bounds(shapes.flatMap((s) => s.poly));
  // il muro esterno sporge di mezzo spessore oltre la linea disegnata
  const off = [HALF - b.x, HALF - b.y];
  const W = round(b.w + WALL, 2);
  const L = round(b.h + WALL, 2);
  const notes = [];

  const rooms = shapes.map((s, i) => {
    const poly = s.poly.map(([x, y]) => [round(x + off[0]), round(y + off[1])]);
    const bb = G.bounds(poly);
    return {
      id: i + 1,
      name: s.name,
      kind: s.kind,
      x: round(bb.x),
      y: round(bb.y),
      w: round(bb.w),
      h: round(bb.h),
      area: round(G.polygonArea(poly), 2),
      zone: i + 1,
      color: roomColor(s.kind, style),
      poly,
      label: G.labelPoint(poly).map((v) => round(v)),
    };
  });
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const sides = analyzeSides(rooms);
  const adj = adjacencies(sides);

  const doors = [];
  const doorsByRoom = new Map(rooms.map((r) => [r.id, []]));
  const runsByRoom = new Map(rooms.map((r) => [r.id, exteriorRuns(sides, r.id)]));
  const usedRuns = new Map();       // run.key → intervalli [t0,t1] occupati da ingressi
  const addDoor = (side, t, w, into, rooms2, entrance = false) => {
    const o = opening(side.a, side.b, t, w, into.poly);
    doors.push({ ...o, entrance });
    const n = G.normal(o.chord.u);
    for (const id of rooms2) {
      const inside = G.pointInPolygon(G.add(o.centre, G.mul(n, 0.25)), byId.get(id).poly);
      doorsByRoom.get(id).push({ centre: o.centre, w, inward: inside ? n : G.mul(n, -1), swings: id === into.id });
    }
  };
  const addEntrance = (room) => {
    const run = longestRun(runsByRoom.get(room.id), 1.0);
    if (!run) return false;
    const w = Math.min(DOOR_W, run.length - 0.2);
    addDoor(run, 0.5, w, room, [room.id], true);
    const half = (w / 2 + 0.1) / run.length;
    usedRuns.set(run.key, [...(usedRuns.get(run.key) || []), [0.5 - half, 0.5 + half]]);
    return true;
  };

  // 1) ingresso principale
  const kindRank = (k) => (ENTRANCE_PREF.indexOf(k) + 1 || 99);
  const candidates = [...rooms].sort((p, q) => kindRank(p.kind) - kindRank(q.kind) || q.area - p.area);
  const entranceRoom = candidates.find((r) => addEntrance(r));
  if (!entranceRoom) notes.push('Nessun muro esterno abbastanza lungo per la porta d’ingresso.');

  // 2) porte interne: albero di copertura a costo minimo (Prim) partendo dall'ingresso
  const reached = new Set(entranceRoom ? [entranceRoom.id] : []);
  const usable = adj.filter((e) => e.span >= MIN_DOOR_SPAN);
  for (;;) {
    let best = null;
    for (const e of usable) {
      const inA = reached.has(e.a);
      if (inA === reached.has(e.b)) continue;
      const from = byId.get(inA ? e.a : e.b);
      const to = byId.get(inA ? e.b : e.a);
      const c = (PASS_COST[from.kind] ?? 2) - e.span * 0.01;
      if (!best || c < best.c) best = { c, e, from, to };
    }
    if (!best) break;
    const { e, from, to } = best;
    reached.add(to.id);
    const w = Math.min(from.kind === 'bath' || to.kind === 'bath' ? DOOR_W_BATH : DOOR_W, e.span - 0.2);
    addDoor(e.side, doorParam(e.iv, e.side.length, w), w, to, [from.id, to.id]);
  }

  // 3) stanze isolate: ingresso indipendente + avviso
  for (const r of rooms) {
    if (reached.has(r.id)) continue;
    const touching = adj.some((e) => e.a === r.id || e.b === r.id);
    if (rooms.length > 1) notes.push(touching
      ? `${r.name}: il muro in comune è troppo corto per una porta (serve almeno 1 m).`
      : `${r.name} non confina con altre stanze: avvicinala, lo snap la aggancia al muro vicino.`);
    if (addEntrance(r)) reached.add(r.id);
  }

  // 4) finestre sui tratti esterni liberi
  const windows = [];
  const windowsByRoom = new Map(rooms.map((r) => [r.id, []]));
  for (const r of rooms) {
    if (r.kind === 'corridor') continue;
    const spans = [];
    for (const run of runsByRoom.get(r.id)) {
      // togli dal tratto le porte d'ingresso
      for (const [t0, t1] of G.complementIntervals(usedRuns.get(run.key) || [])) {
        spans.push({ run, t0, t1, len: (t1 - t0) * run.length });
      }
    }
    spans.sort((p, q) => q.len - p.len);
    const max = r.kind === 'bath' ? 1 : r.area > 22 ? 3 : 2;
    for (const sp of spans) {
      if (windowsByRoom.get(r.id).length >= max) break;
      const w = r.kind === 'bath' ? 0.6 : Math.min(1.4, sp.len - 0.4);
      if (w < 0.6 || sp.len < w + 0.3) continue;
      const o = opening(sp.run.a, sp.run.b, (sp.t0 + sp.t1) / 2, round(w, 2), null);
      windows.push({ x: o.x, y: o.y, w: o.w, rot: o.rot, chord: o.chord });
      windowsByRoom.get(r.id).push({ centre: o.centre, w: o.w });
    }
    if (!windowsByRoom.get(r.id).length && !['bath', 'corridor'].includes(r.kind)) {
      notes.push(`${r.name}: nessun muro esterno libero per una finestra.`);
    }
  }

  // 5) arredi
  const furniture = [];
  for (const r of rooms) {
    const P = new Placer(r, doorsByRoom.get(r.id), windowsByRoom.get(r.id));
    furnishRoom(P, r, notes);
    for (const it of P.items) {
      furniture.push({
        type: it.type,
        x: round(it.rect.x),
        y: round(it.rect.y),
        w: round(it.rect.w),
        h: round(it.rect.h),
        rot: 0,
        facing: it.facing,
        room: r.id,
      });
    }
  }

  const kinds = rooms.map((r) => r.kind);
  return {
    dimensions: { width: W, length: L },
    svgWidth: W * SCALE,
    svgHeight: L * SCALE,
    scale: SCALE,
    wallThickness: WALL * SCALE,
    shape: 'sketch',
    seed: randomSeed(),
    stats: {
      grossArea: round(rooms.reduce((a, r) => a + r.area, 0), 2),
      boundingBox: round(W * L, 2),
      rooms: rooms.length,
      bedrooms: kinds.filter((k) => k === 'bed').length,
      bathrooms: kinds.filter((k) => k === 'bath').length,
      doors: doors.length,
      windows: windows.length,
      furniture: furniture.length,
    },
    notches: [],
    rooms,
    walls: [],
    wallLines: cutWalls(rooms.map((r) => r.poly), [...doors, ...windows].map((o) => o.chord)),
    doors: doors.map(({ centre: _c, chord: _ch, ...d }) => d),
    windows: windows.map(({ chord: _ch, ...w }) => w),
    furniture,
    notes,
  };
}
