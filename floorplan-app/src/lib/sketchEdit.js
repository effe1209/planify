/*
 * Modifica diretta di una pianta disegnata a mano (stanze poligonali con `poly` e muri come `wallLines`): si trascinano vertici, lati e
 * stanze, si aggiungono, spostano e ridimensionano porte e finestre. Ogni funzione ritorna { plan } oppure { error }; i muri si
 * ricalcolano dai contorni delle stanze, interrotti dove ci sono le aperture (come fa lo schizzo).
 */
import * as G from './geometry.js';
import { cutWalls } from './sketchToPlan.js';
import { PANORAMIC_MAX } from './openings.js';

const GRID = 0.05;
const MIN_EDGE = 0.2;
const MIN_AREA = 1;
const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;
export const snapGrid = (v) => Math.round(v / GRID) * GRID;

/* Piante che si modificano così: stanze di forma libera con i muri disegnati (non i giardini né le facciate curve). */
export const isSketchPlan = (plan) => !!plan && !plan.curveBase && !!plan.wallLines?.length && plan.rooms.some((r) => r.poly);

const half = (plan) => plan.wallThickness / plan.scale / 2;

/* Corda di un'apertura (come la disegna lo schizzo): x,y è l'origine del rettangolo ruotato di rot, il muro è centrato sulla corda. */
export function chordOf(plan, o) {
  const a = (o.rot * Math.PI) / 180;
  const u = [Math.cos(a), Math.sin(a)];
  const n = G.normal(u);
  const start = G.add([o.x, o.y], G.mul(n, half(plan)));
  return { start, u, w: o.w };
}
const centreOf = (plan, o) => { const c = chordOf(plan, o); return G.add(c.start, G.mul(c.u, c.w / 2)); };

/* Apertura sul lato a→b con il centro al parametro t (0–1). */
function place(plan, a, b, t, w, kind, old = null, type = undefined) {
  const u = G.unit(G.sub(b, a));
  const n = G.normal(u);
  const centre = G.lerp(a, b, t);
  const start = G.sub(centre, G.mul(u, w / 2));
  const origin = G.sub(start, G.mul(n, half(plan)));
  return {
    ...(old || {}),
    x: r2(origin[0]), y: r2(origin[1]), w: r2(w),
    rot: r2((Math.atan2(u[1], u[0]) * 180) / Math.PI),
    ...(kind === 'door' && { openDir: old?.openDir ?? 1 }),
    ...(type && { type }),
  };
}

const wallLinesFor = (plan, rooms, doors, windows) => cutWalls(rooms.map((r) => r.poly), [...doors, ...windows].map((o) => chordOf(plan, o)));

function selfCrosses(poly) {
  const e = G.edges(poly);
  const hit = (p, q, r, s) => {
    const d1 = G.cross(G.sub(q, p), G.sub(r, p)); const d2 = G.cross(G.sub(q, p), G.sub(s, p));
    const d3 = G.cross(G.sub(s, r), G.sub(p, r)); const d4 = G.cross(G.sub(s, r), G.sub(q, r));
    return d1 * d2 < -1e-9 && d3 * d4 < -1e-9;
  };
  for (let i = 0; i < e.length; i++) {
    for (let j = i + 2; j < e.length; j++) {
      if (i === 0 && j === e.length - 1) continue;
      if (hit(e[i][0], e[i][1], e[j][0], e[j][1])) return true;
    }
  }
  return false;
}

/* Piano con i contorni nuovi: riquadri, aree, etichette e misure ricalcolati; il disegno resta nel foglio (si sposta solo se esce a sinistra o in alto). */
function rebuild(plan, polys, extra = {}) {
  const h = half(plan);
  polys = new Map([...polysOf(plan), ...polys]);
  const all = [...polys.values()].flat();
  const b = G.bounds(all);
  const dx = b.x < h - 1e-6 ? r3(h - b.x) : 0;
  const dy = b.y < h - 1e-6 ? r3(h - b.y) : 0;
  const mv = ([x, y]) => [r3(x + dx), r3(y + dy)];
  const rooms = plan.rooms.map((r) => {
    const poly = polys.has(r.id) ? polys.get(r.id).map(mv) : r.poly?.map(mv);
    if (!poly) return { ...r, ...(dx || dy ? { x: r3(r.x + dx), y: r3(r.y + dy) } : {}) };
    const bb = G.bounds(poly);
    return { ...r, poly, x: r2(bb.x), y: r2(bb.y), w: r2(bb.w), h: r2(bb.h), area: r2(G.polygonArea(poly)), label: G.labelPoint(poly).map(r2) };
  });
  const shiftItem = (o) => (dx || dy ? { ...o, x: r3(o.x + dx), y: r3(o.y + dy) } : o);
  const doors = (extra.doors || plan.doors).map(shiftItem);
  const windows = (extra.windows || plan.windows).map(shiftItem);
  const furniture = (extra.furniture || plan.furniture).map(shiftItem);
  const W = r2(b.x2 + dx + h);
  const L = r2(b.y2 + dy + h);
  const next = {
    ...plan, rooms, doors, windows, furniture,
    dimensions: { width: W, length: L }, svgWidth: W * plan.scale, svgHeight: L * plan.scale,
    ...(plan.extStair && (dx || dy) ? { extStair: { ...plan.extStair, at: [r3(plan.extStair.at[0] + dx), r3(plan.extStair.at[1] + dy)] } } : {}),
  };
  next.wallLines = wallLinesFor(next, rooms, doors, windows);
  const kinds = rooms.map((r) => r.kind);
  next.stats = {
    ...(plan.stats || {}), grossArea: r2(rooms.reduce((a, r) => a + (r.area || 0), 0)), boundingBox: r2(W * L), rooms: rooms.length,
    bedrooms: kinds.filter((k) => k === 'bed' || k === 'bed_single').length, bathrooms: kinds.filter((k) => k === 'bath').length,
    doors: doors.length, windows: windows.length, furniture: furniture.length,
  };
  return next;
}

const polysOf = (plan) => new Map(plan.rooms.filter((r) => r.poly).map((r) => [r.id, r.poly]));

function check(polys) {
  for (const [id, poly] of polys) {
    if (G.polygonArea(poly) < MIN_AREA) return `Il locale diventerebbe troppo piccolo (meno di ${MIN_AREA} m²)`;
    if (G.edges(poly).some(([a, b]) => G.dist(a, b) < MIN_EDGE - 1e-6 && poly.length <= 12)) return 'Un lato diventerebbe troppo corto';
    if (selfCrosses(poly)) return 'Il contorno del locale si incrocerebbe';
    if (id == null) return 'Locale non valido';
  }
  return null;
}

/* Le aperture che il muro spostato si è lasciato alle spalle seguono il lato più vicino (stessa larghezza, se ci sta). */
function reattach(plan, rooms, list, kind) {
  const edges = rooms.flatMap((r) => (r.poly ? G.edges(r.poly) : []));
  return list.map((o) => {
    const c = centreOf(plan, o);
    let best = null;
    for (const [a, b] of edges) {
      const q = G.closestOnSegment(c, a, b);
      if (!best || q.d < best.d) best = { ...q, a, b };
    }
    if (!best || best.d < 0.04 || best.d > 0.7) return o;
    const len = G.dist(best.a, best.b);
    if (len < 0.6) return o;
    const w = Math.min(o.w, len - 0.1);
    const u0 = chordOf(plan, o).u;
    const [a, b] = G.dot(G.sub(best.b, best.a), u0) < 0 ? [best.b, best.a] : [best.a, best.b];
    const t = G.closestOnSegment(c, a, b).t;
    const tt = Math.min(1 - (w / 2 + 0.05) / len, Math.max((w / 2 + 0.05) / len, t));
    return place(plan, a, b, tt, w, kind, o);
  });
}

function apply(plan, polys, extra = {}) {
  const err = check(polys);
  if (err) return { error: err };
  const rooms = plan.rooms.map((r) => (polys.has(r.id) ? { ...r, poly: polys.get(r.id) } : r));
  const doors = reattach(plan, rooms, extra.doors || plan.doors, 'door');
  const windows = reattach(plan, rooms, extra.windows || plan.windows, 'window');
  return { plan: rebuild(plan, polys, { ...extra, doors, windows }) };
}

const same = (p, q) => Math.abs(p[0] - q[0]) < 0.002 && Math.abs(p[1] - q[1]) < 0.002;

/* Sposta di `d` tutti i vertici che coincidono con uno dei punti `picks` (i locali vicini seguono: il muro in comune non si stacca). */
function moveGroup(plan, picks, d, extra = {}) {
  const polys = new Map();
  for (const [id, poly] of polysOf(plan)) polys.set(id, poly.map((p) => (picks.some((q) => same(p, q)) ? [r3(p[0] + d[0]), r3(p[1] + d[1])] : p)));
  return apply(plan, polys, extra);
}

export function moveVertex(plan, roomId, index, to) {
  const p = plan.rooms.find((r) => r.id === roomId)?.poly?.[index];
  if (!p) return { error: 'Locale non trovato' };
  return moveGroup(plan, [p], [to[0] - p[0], to[1] - p[1]]);
}

/* Lato che si sposta in avanti o indietro (perpendicolare a sé stesso), con i suoi due vertici. */
export function moveEdge(plan, roomId, index, delta) {
  const poly = plan.rooms.find((r) => r.id === roomId)?.poly;
  if (!poly) return { error: 'Locale non trovato' };
  const a = poly[index];
  const b = poly[(index + 1) % poly.length];
  const n = G.normal(G.unit(G.sub(b, a)));
  const k = G.dot(delta, n);
  return moveGroup(plan, [a, b], [n[0] * k, n[1] * k]);
}

/* Stanza intera: contorno, arredi e aperture che stanno solo sul suo muro vanno insieme. */
export function moveRoom(plan, roomId, d) {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room?.poly) return { error: 'Locale non trovato' };
  const polys = polysOf(plan);
  polys.set(roomId, room.poly.map((p) => [r3(p[0] + d[0]), r3(p[1] + d[1])]));
  const onWall = (poly, c) => poly.length && G.distToPolygon(c, poly) < 0.08;
  const others = plan.rooms.filter((r) => r.id !== roomId && r.poly);
  const own = (plan2, o) => { const c = centreOf(plan2, o); return onWall(room.poly, c) && !others.some((r) => onWall(r.poly, c)); };
  const shift = (o) => ({ ...o, x: r2(o.x + d[0]), y: r2(o.y + d[1]) });
  return apply(plan, polys, {
    furniture: plan.furniture.map((f) => (f.room === roomId ? shift(f) : f)),
    doors: plan.doors.map((o) => (own(plan, o) ? shift(o) : o)),
    windows: plan.windows.map((o) => (own(plan, o) ? shift(o) : o)),
  });
}

/* ── porte e finestre ── */

function nearestEdge(plan, p, maxD = 0.6) {
  let best = null;
  for (const r of plan.rooms) {
    if (!r.poly) continue;
    for (const [a, b] of G.edges(r.poly)) {
      const q = G.closestOnSegment(p, a, b);
      if (G.dist(a, b) >= 0.7 && (!best || q.d < best.d)) best = { ...q, a, b, room: r };
    }
  }
  return best && best.d <= maxD ? best : null;
}

const sides = (plan, centre, n) => plan.rooms.filter((r) => r.poly).map((r) => ({
  r, pos: G.pointInPolygon(G.add(centre, G.mul(n, 0.25)), r.poly), neg: G.pointInPolygon(G.add(centre, G.mul(n, -0.25)), r.poly),
}));

/* Un lato di locale che dà all'esterno (o sul balcone: lì un locale non conta come «dentro»). */
const insideRooms = (plan, centre, n, sign) => plan.rooms.some((r) => r.poly && r.kind !== 'balcony' && G.pointInPolygon(G.add(centre, G.mul(n, 0.25 * sign)), r.poly));

const OPENINGS = {   // strumento → lista, tipo e larghezza di partenza
  door: { list: 'doors', kind: 'door', w: 0.9 },
  window: { list: 'windows', kind: 'window', w: 1.2 },
  panoramic: { list: 'windows', kind: 'window', type: 'panoramic', w: 2.2 },
  sliding: { list: 'doors', kind: 'door', type: 'sliding', w: 1.8 },
};

/* Porta, finestra, vetrata panoramica o vetrata scorrevole nel punto `p` del muro più vicino. Finestre e vetrate fisse solo sui muri esterni o verso il balcone. */
export function addOpening(plan, tool, p, w = null) {
  const spec = OPENINGS[tool];
  if (!spec) return { error: 'Strumento non valido' };
  const e = nearestEdge(plan, p);
  if (!e) return { error: 'Clicca vicino a un muro' };
  const len = G.dist(e.a, e.b);
  const ww = Math.min(w ?? spec.w, len - 0.2, PANORAMIC_MAX);
  if (ww < 0.5) return { error: 'Il muro è troppo corto' };
  const t = Math.min(1 - (ww / 2 + 0.1) / len, Math.max((ww / 2 + 0.1) / len, e.t));
  const centre = G.lerp(e.a, e.b, t);
  const n = G.normal(G.unit(G.sub(e.b, e.a)));
  const inPos = insideRooms(plan, centre, n, 1);
  const inNeg = insideRooms(plan, centre, n, -1);
  if (spec.kind === 'window' && inPos && inNeg) return { error: 'Le finestre e le vetrate vanno sui muri esterni o verso il balcone' };
  const pos = G.pointInPolygon(G.add(centre, G.mul(n, 0.25)), e.room.poly);
  const o = place(plan, e.a, e.b, t, ww, spec.kind, spec.kind === 'door' ? { openDir: pos ? 1 : -1, entrance: false } : null, spec.type);
  return { plan: rebuild(plan, new Map(), { [spec.list]: [...plan[spec.list], o] }), index: plan[spec.list].length, kind: spec.kind };
}

/* Cambia il tipo di un'apertura: porta, finestra, vetrata panoramica (fissa) o vetrata scorrevole. */
export function setOpeningType(plan, kind, index, type) {
  const from = kind === 'door' ? 'doors' : 'windows';
  const o = plan[from][index];
  if (!o) return { error: 'Apertura non trovata' };
  if (o.entrance) return { error: 'Il portoncino non si può cambiare in una finestra' };
  const toKind = type === 'sliding' || type === 'door' ? 'door' : 'window';
  const to = toKind === 'door' ? 'doors' : 'windows';
  const { type: _t, entrance: _e, openDir, ...rest } = o;
  const next = { ...rest, ...(type === 'panoramic' || type === 'sliding' ? { type } : {}), ...(toKind === 'door' ? { openDir: openDir ?? 1, entrance: false } : {}) };
  if (to === from) return { plan: rebuild(plan, new Map(), { [from]: plan[from].map((x, i) => (i === index ? next : x)) }), selected: { kind, index } };
  return { plan: rebuild(plan, new Map(), { [from]: plan[from].filter((_, i) => i !== index), [to]: [...plan[to], next] }), selected: { kind: toKind, index: plan[to].length } };
}

const AXIS = 1e-3;

/*
 * Balcone sul muro esterno più vicino a `p`: un locale «Balcone» appoggiato al muro (profondità `depth`, larghezza fino a `width`),
 * con una vetrata scorrevole che lo collega al locale. Solo su muri dritti orizzontali o verticali.
 */
export function addBalcony(plan, p, { depth = 1.2, width = 3 } = {}) {
  const e = nearestEdge(plan, p, 1.5);
  if (!e || e.room.kind === 'balcony') return { error: 'Clicca vicino a un muro esterno della casa' };
  const horiz = Math.abs(e.a[1] - e.b[1]) < AXIS;
  const vert = Math.abs(e.a[0] - e.b[0]) < AXIS;
  if (!horiz && !vert) return { error: 'Il balcone si mette solo su muri dritti' };
  const len = G.dist(e.a, e.b);
  if (len < 1.2) return { error: 'Il muro è troppo corto per un balcone' };
  const u = G.unit(G.sub(e.b, e.a));
  const n = G.normal(u);
  const mid = G.lerp(e.a, e.b, e.t);
  const probeIn = G.pointInPolygon(G.add(mid, G.mul(n, 0.25)), e.room.poly);
  const out = probeIn ? G.mul(n, -1) : n;                    // verso l'esterno del locale
  if (insideRooms(plan, mid, out, 1)) return { error: 'Su questo muro c\'è già un altro locale: scegli un muro esterno' };
  const bw = Math.min(width, len - 0.1);
  const t0 = Math.min(len - bw / 2, Math.max(bw / 2, G.dot(G.sub(mid, e.a), u)));
  const c = G.add(e.a, G.mul(u, t0));
  const A = G.add(c, G.mul(u, -bw / 2));
  const B = G.add(c, G.mul(u, bw / 2));
  const poly = [A, B, G.add(B, G.mul(out, depth)), G.add(A, G.mul(out, depth))].map((q) => [r3(q[0]), r3(q[1])]);
  const cen = [poly.reduce((x, q) => x + q[0], 0) / 4, poly.reduce((x, q) => x + q[1], 0) / 4];
  const probes = [cen, ...poly.map((q) => G.lerp(q, cen, 0.1))];
  if (plan.rooms.some((r) => r.poly && r.kind !== 'balcony' && probes.some((q) => G.pointInPolygon(q, r.poly)))) {
    return { error: 'Il balcone finirebbe dentro un altro locale' };
  }
  const id = Math.max(0, ...plan.rooms.map((r) => r.id)) + 1;
  const room = { id, name: 'Balcone', kind: 'balcony', zone: id, color: '#e6ecef', poly };
  const sw = Math.min(1.8, bw - 0.2);
  const door = place(plan, e.a, e.b, t0 / len, sw, 'door', { openDir: probeIn ? 1 : -1, entrance: false }, 'sliding');
  const withRoom = { ...plan, rooms: [...plan.rooms, room] };
  const next = rebuild(withRoom, new Map([[id, poly]]), { doors: [...plan.doors, door] });
  return { plan: next, room: id };
}

export function moveOpening(plan, kind, index, p) {
  const list = kind === 'door' ? 'doors' : 'windows';
  const o = plan[list][index];
  if (!o) return { error: 'Apertura non trovata' };
  const e = nearestEdge(plan, p, 1.2);
  if (!e) return { plan };
  const len = G.dist(e.a, e.b);
  const w = Math.min(o.w, len - 0.2);
  const [a, b] = G.dot(G.sub(e.b, e.a), chordOf(plan, o).u) < 0 ? [e.b, e.a] : [e.a, e.b];
  const t0 = G.closestOnSegment(p, a, b).t;
  const t = Math.min(1 - (w / 2 + 0.1) / len, Math.max((w / 2 + 0.1) / len, t0));
  const next = place(plan, a, b, t, w, kind, o);
  return { plan: rebuild(plan, new Map(), { [list]: plan[list].map((x, i) => (i === index ? next : x)) }) };
}

export function resizeOpening(plan, kind, index, w) {
  const list = kind === 'door' ? 'doors' : 'windows';
  const o = plan[list][index];
  if (!o) return { error: 'Apertura non trovata' };
  const c = centreOf(plan, o);
  const e = nearestEdge(plan, c, 0.3);
  if (!e) return { error: 'Apertura non su un muro' };
  const len = G.dist(e.a, e.b);
  const ww = Math.min(Math.max(0.5, w), len - 0.2);
  const [a, b] = G.dot(G.sub(e.b, e.a), chordOf(plan, o).u) < 0 ? [e.b, e.a] : [e.a, e.b];
  const t0 = G.closestOnSegment(c, a, b).t;
  const t = Math.min(1 - (ww / 2 + 0.05) / len, Math.max((ww / 2 + 0.05) / len, t0));
  const next = place(plan, a, b, t, ww, kind, o);
  return { plan: rebuild(plan, new Map(), { [list]: plan[list].map((x, i) => (i === index ? next : x)) }) };
}

/* Il verso di apertura della porta (verso l'altro locale). */
export function flipOpening(plan, index) {
  const o = plan.doors[index];
  if (!o) return { error: 'Porta non trovata' };
  return { plan: { ...plan, doors: plan.doors.map((x, i) => (i === index ? { ...x, openDir: -(x.openDir || 1) } : x)) } };
}

export function removeOpening(plan, kind, index) {
  const list = kind === 'door' ? 'doors' : 'windows';
  return { plan: rebuild(plan, new Map(), { [list]: plan[list].filter((_, i) => i !== index) }) };
}

/* Lo schizzo salvato nel piano segue le modifiche dirette: «Modifica schizzo» riparte dalla forma attuale dei locali. */
export function syncShapes(shapes, plan) {
  if (!Array.isArray(shapes) || shapes.length !== plan.rooms.length) return shapes;
  return shapes.map((sh, i) => (plan.rooms[i].poly ? { ...sh, poly: plan.rooms[i].poly, name: plan.rooms[i].name, kind: plan.rooms[i].kind } : sh));
}
