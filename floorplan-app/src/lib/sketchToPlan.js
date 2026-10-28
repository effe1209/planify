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
const PASS_COST = { corridor: 0, entry: 0, garden: 0.5, living: 0.5, living_kitchen: 0.5, garage: 1, hotel_room: 1, kitchen: 1, dining: 1,
  study: 2, laundry: 3, bed: 3, bed_single: 3, storage: 5, closet: 6, bath: 8 };
const ENTRANCE_PREF = ['corridor', 'living_kitchen', 'living', 'hotel_room', 'kitchen', 'study', 'bed', 'bed_single', 'bath'];

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
// direzione (nel mondo) della destra locale di un arredo rivolto verso f: come LOCAL_RIGHT nel motore Python
const RIGHT = { S: [1, 0], N: [-1, 0], E: [0, -1], W: [0, 1] };
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

  free(rect, keep, gap, avoidWindows, ignore = null) {
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
      if (it === ignore) {
        if (G.rectsOverlap(rect, it.rect)) return false;
        continue;
      }
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

  /* Arredo appoggiato allo stesso muro di `anchor`, subito a destra o a sinistra (comodini, bidet). */
  beside(anchor, type, along, depth, { side = 'right', gap = 0.03, front = 0 } = {}) {
    const f = anchor.facing;
    const r = RIGHT[f].map((v) => (side === 'right' ? v : -v));
    const a = anchor.rect;
    const [w, h] = dims(along, depth, f);
    const back = backInfo(a, f).pts[0];   // un punto dello schienale: allinea gli schienali
    let x;
    let y;
    if (f === 'S' || f === 'N') {
      x = r[0] > 0 ? a.x + a.w + gap : a.x - gap - w;
      y = f === 'S' ? back[1] : back[1] - h;
    } else {
      y = r[1] > 0 ? a.y + a.h + gap : a.y - gap - h;
      x = f === 'E' ? back[0] : back[0] - w;
    }
    const rect = { x, y, w, h };
    const keep = keepRect(rect, f, front);
    if (!this.free(rect, keep, gap, false, anchor)) return null;
    const item = { type, rect, keep, facing: f, gap };
    this.items.push(item);
    return item;
  }

  /* Il disegno va specchiato se il muro laterale più vicino sta alla destra dell'arredo. */
  sideWallOnRight(it) {
    const c = G.rectCenter(it.rect);
    const r = RIGHT[it.facing];
    const half = (it.facing === 'S' || it.facing === 'N' ? it.rect.w : it.rect.h) / 2;
    const toRight = G.rayHit(G.add(c, G.mul(r, half)), r, this.poly);
    const toLeft = G.rayHit(G.sub(c, G.mul(r, half)), G.mul(r, -1), this.poly);
    return toRight < toLeft;
  }

  /* Fascia libera larga `width` sul fianco destro (o sinistro) dell'arredo. */
  stripFree(it, width, right = true) {
    const r = RIGHT[it.facing].map((v) => (right ? v : -v));
    const a = it.rect;
    const strip = r[0] > 0 ? { x: a.x + a.w, y: a.y, w: width, h: a.h }
      : r[0] < 0 ? { x: a.x - width, y: a.y, w: width, h: a.h }
        : r[1] > 0 ? { x: a.x, y: a.y + a.h, w: a.w, h: width }
          : { x: a.x, y: a.y - width, w: a.w, h: width };
    return this.free(strip, strip, 0, false, it);
  }

  remove(it) {
    this.items = this.items.filter((x) => x !== it);
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

/* Penisola: sullo stesso muro del piano cucina, accanto alla sua estremità libera, con spazio per gli sgabelli. */
function placePeninsula(P, counter) {
  const side = P.sideWallOnRight(counter) ? 'left' : 'right';  // l'estremità lontana dall'angolo
  const r = RIGHT[counter.facing].map((v) => (side === 'right' ? v : -v));
  const half = (counter.facing === 'S' || counter.facing === 'N' ? counter.rect.w : counter.rect.h) / 2;
  const end = G.add(G.rectCenter(counter.rect), G.mul(r, half + 0.5));
  const it = P.place({
    type: 'kitchen_peninsula',
    sizes: [[0.9, 2.0], [0.9, 1.6]],
    facings: [counter.facing],
    front: 0.9,
    gap: 0.05,
    score: ({ rect }) => G.dist(backInfo(rect, counter.facing).pts[2], end),
  });
  if (!it) return false;
  if (!P.stripFree(it, 0.6, true)) {
    if (P.stripFree(it, 0.6, false)) it.flip = true;
    else {
      P.remove(it);
      return false;
    }
  }
  it.gap = 0.8;   // passaggio attorno alla penisola per gli arredi successivi
  return true;
}

function placeLiving(P, room) {
  // il divano angolare solo dove resta spazio: con cucina e pranzo nella stessa stanza serve molta più superficie
  const big = room.area >= (room.kind === 'living_kitchen' ? 30 : 20);
  const sofaSpecs = big ? [{ type: 'sofa_corner', sizes: [[2.6, 1.7]] }] : [];
  sofaSpecs.push({ type: 'sofa', sizes: [[2.2, 0.9], [1.8, 0.9], [1.4, 0.8]] });
  let sofa = null;
  for (const sp of sofaSpecs) {
    sofa = P.place({ ...sp, front: 0.5, gap: 0.3, score: farFromDoor });
    if (sofa) break;
  }
  if (!sofa) return false;
  if (sofa.type === 'sofa_corner') sofa.flip = P.sideWallOnRight(sofa);   // la penisola del divano verso la stanza
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
  // tavolino davanti al divano e, nei soggiorni ampi, una poltrona di fianco
  const depth = sofa.facing === 'S' || sofa.facing === 'N' ? sofa.rect.h : sofa.rect.w;
  const front = G.add(sc, G.mul(fv, depth / 2 + 0.65));
  return P.place({
    type: 'coffee_table', sizes: [[1.0, 0.55], [0.8, 0.5]], wall: false, facings: [sofa.facing], gap: 0.35,
    score: ({ centre }) => G.dist(centre, front),
  }) || true;
}

/* Poltrona di fianco al tavolino, rivolta verso di lui: solo nei soggiorni ampi e dopo il tavolo da pranzo. */
function placeArmchair(P, room) {
  const table = P.items.find((it) => it.type === 'coffee_table');
  if (!table || room.area < 20) return;
  const tc = G.rectCenter(table.rect);
  P.place({
    type: 'armchair', sizes: [[0.8, 0.8]], wall: false, facings: ['S', 'N', 'E', 'W'], gap: 0.35,
    score: ({ centre, facing }) => {
      const v = G.sub(tc, centre);
      return Math.abs(G.len(v) - 1.1) + (G.dot(G.unit(v), FACE[facing]) > 0.7 ? 0 : 3);
    },
  });
}

/* Tavolo da pranzo: tondo negli spazi raccolti, rettangolare in quelli lunghi. */
function placeTable(P, near, room) {
  const bb = G.bounds(room.poly);
  const square = bb.w / bb.h > 0.75 && bb.w / bb.h < 1.33;
  const opts = square || room.area < 22
    ? [['table_round', [[1.1, 1.1], [0.9, 0.9]]], ['table', [[1.6, 0.9], [1.2, 0.8]]]]
    : [['table', [[1.6, 0.9], [1.2, 0.8]]], ['table_round', [[1.1, 1.1], [0.9, 0.9]]]];
  for (const [type, sizes] of opts) {
    const t = P.place({ type, sizes, wall: false, gap: 0.75, score: ({ centre }) => G.dist(centre, near) });
    if (t) return t;
  }
  return null;
}

function placeShower(P, room) {
  const bb = G.bounds(room.poly);
  if (room.area >= 5 && Math.max(bb.w, bb.h) >= 2.8) {
    const walk = P.place({ type: 'shower_walkin', sizes: [[1.4, 0.9]], front: 0.3, gap: 0.05, score: corner });
    if (walk) {
      walk.flip = P.sideWallOnRight(walk);
      return walk;
    }
  }
  const round = P.place({ type: 'shower_round', sizes: [[0.9, 0.9]], front: 0.2, gap: 0.05, score: corner });
  if (round) {
    round.flip = P.sideWallOnRight(round);
    return round;
  }
  return P.place({ type: 'shower', sizes: [[0.8, 0.8]], gap: 0.05, score: corner });
}

function furnishRoom(P, room, notes, opts) {
  const missing = (what) => notes.push(`${room.name}: ${what} non inserito (spazio insufficiente o forma troppo stretta)`);
  const label = room.label;
  const kitchenExtras = (counter) => {
    if (!opts.peninsula || !counter) return false;
    const ok = placePeninsula(P, counter);
    if (!ok) notes.push(`${room.name}: la penisola non entra in questa forma`);
    return ok;
  };
  switch (room.kind) {
    case 'bath': {
      const bb = G.bounds(room.poly);
      const tub = room.area >= 5.5 && Math.max(bb.w, bb.h) >= 2.1
        && P.place({ type: 'bathtub', sizes: [[1.7, 0.75]], front: 0.5, score: corner });
      if (!tub && !placeShower(P, room)) missing('doccia');
      const wc = P.place({ type: 'toilet', sizes: [[0.4, 0.7], [0.4, 0.6]], front: 0.5, gap: 0.2, score: farFromDoor });
      if (!wc) missing('WC');
      else if (!P.beside(wc, 'bidet', 0.38, 0.55, { side: 'right', gap: 0.25, front: 0.5 })) {
        P.beside(wc, 'bidet', 0.38, 0.55, { side: 'left', gap: 0.25, front: 0.5 });
      }
      const sinks = room.area >= 7 ? [[1.2, 0.5], [0.6, 0.5], [0.5, 0.4]] : [[0.6, 0.5], [0.5, 0.4]];
      if (!P.place({ type: 'sink', sizes: sinks, front: 0.45, gap: 0.1 })) missing('lavabo');
      break;
    }
    case 'bed':
    case 'bed_single':
    case 'hotel_room': {
      const single = room.kind === 'bed_single';
      const sizes = single ? [[0.9, 2.0]]
        : room.area >= 14 ? [[1.8, 2.0], [1.6, 2.0], [1.4, 2.0], [0.9, 2.0]]
          : room.area >= 10 ? [[1.6, 2.0], [1.4, 2.0], [0.9, 2.0]] : [[1.4, 2.0], [0.9, 2.0]];
      const bed = P.place({
        type: 'bed', sizes, front: 0.6, gap: single ? 0.3 : 0.45,
        // la singola va in un angolo, la matrimoniale lontano dalla porta con i due lati liberi
        score: (c) => farFromDoor(c) + nearWindow(c) * 0.1 + (single ? corner(c) : -corner(c) * 0.2),
      });
      if (!bed) missing('letto');
      else {
        const sides = single ? [P.sideWallOnRight(bed) ? 'left' : 'right'] : ['left', 'right'];
        for (const side of sides) P.beside(bed, 'nightstand', 0.45, 0.4, { side });
      }
      // meglio non davanti a una finestra, ma un armadio serve comunque
      const wardrobe = { type: 'wardrobe', front: 0.7, gap: 0.3, score: corner };
      if (!P.place({ ...wardrobe, sizes: single ? [[1.2, 0.6], [1.0, 0.6]] : [[2.4, 0.6], [1.8, 0.6], [1.2, 0.6]], avoidWindows: true })) {
        P.place({ ...wardrobe, sizes: [[1.2, 0.6]] });
      }
      if (room.area >= (single ? 8 : 13)) P.place({ type: 'desk', sizes: [[1.2, 0.6], [1.0, 0.55]], front: 0.6, gap: 0.3, score: nearWindow });
      break;
    }
    case 'living_kitchen': {
      const counter = placeCounter(P);
      if (!counter) missing('angolo cottura');
      const peninsula = kitchenExtras(counter);
      // zona pranzo vicino alla cucina, poi la zona living nello spazio che resta
      if (!peninsula) placeTable(P, counter ? G.rectCenter(counter.rect) : label, room);
      if (!placeLiving(P, room) && room.area >= 12) missing('divano');
      placeArmchair(P, room);
      break;
    }
    case 'living': {
      if (!placeLiving(P, room) && room.area >= 10) missing('divano');
      if (room.area >= 16) placeTable(P, label, room);
      placeArmchair(P, room);
      break;
    }
    case 'kitchen': {
      const counter = placeCounter(P);
      if (!counter) missing('piano cucina');
      const peninsula = kitchenExtras(counter);
      if (room.area >= 8 && !peninsula) placeTable(P, label, room);
      break;
    }
    case 'laundry': {
      const washer = P.place({ type: 'washer', sizes: [[0.6, 0.6]], front: 0.7, gap: 0.02, score: corner });
      if (!washer) missing('lavatrice');
      else if (!P.beside(washer, 'dryer', 0.6, 0.6, { side: 'right' })) P.beside(washer, 'dryer', 0.6, 0.6, { side: 'left' });
      P.place({ type: 'utility_sink', sizes: [[0.6, 0.5]], front: 0.5, gap: 0.1 });
      P.place({ type: 'laundry_basket', sizes: [[0.45, 0.45]], wall: false, gap: 0.1 });
      break;
    }
    case 'storage': {
      P.place({ type: 'shelving', sizes: [[2.0, 0.4], [1.6, 0.4], [1.0, 0.4]], front: 0.5 });
      P.place({ type: 'shelving', sizes: [[1.6, 0.4], [1.0, 0.4]], front: 0.5 });
      P.place({ type: 'vacuum', sizes: [[0.4, 0.4]], gap: 0.05, score: corner });
      break;
    }
    case 'garage': {
      for (let i = 0; i < 3; i++) {
        if (!P.place({ type: 'car', sizes: [[1.9, 4.5]], front: 0.4, gap: 0.5, score: farFromDoor })) {
          if (i === 0) missing('posto auto');
          break;
        }
      }
      P.place({ type: 'workbench', sizes: [[1.8, 0.6]], front: 0.6, gap: 0.3 });
      P.place({ type: 'shelving_heavy', sizes: [[2.0, 0.5]], front: 0.5, gap: 0.2 });
      break;
    }
    case 'garden': {
      P.place({ type: 'gazebo', sizes: [[3.0, 3.0], [2.5, 2.5]], wall: false, gap: 0.6, score: corner });
      for (let i = 0; i < 3; i++) P.place({ type: 'tree', sizes: [[1.4, 1.4]], wall: false, gap: 0.8, score: ({ centre }) => -G.dist(centre, label) });
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
export function sketchToPlan(shapes, { style = 'modern', peninsula = false } = {}) {
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
    if (['corridor', 'storage', 'closet', 'garden', 'entry'].includes(r.kind)) continue;   // locali senza finestre
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
    if (!windowsByRoom.get(r.id).length && !['bath', 'corridor', 'garage', 'laundry'].includes(r.kind)) {
      notes.push(`${r.name}: nessun muro esterno libero per una finestra.`);
    }
  }

  // 5) arredi
  const furniture = [];
  for (const r of rooms) {
    const P = new Placer(r, doorsByRoom.get(r.id), windowsByRoom.get(r.id));
    furnishRoom(P, r, notes, { peninsula });
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
        ...(it.flip && { flip: true }),
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
      bedrooms: kinds.filter((k) => k === 'bed' || k === 'bed_single').length,
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
