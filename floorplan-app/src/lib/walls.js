/*
 * Modifica diretta della pianta: muri interni, porte e finestre.
 *
 * I muri non sono un dato a sé: si ricavano dai bordi dei locali (come fa il motore con build_walls), così basta
 * spostare i locali e tutto il resto — 2D, 3D, sensori, impianti — resta coerente. Un «muro» spostabile è una
 * partizione interna: la linea che separa due gruppi di locali, estesa fino a dove i locali che la toccano
 * stanno insieme (se si sposta un bordo di A, anche i locali dall'altra parte devono cedere o prendere
 * spazio per lo stesso tratto, altrimenti si sovrapporrebbero a un terzo locale).
 * Tutte le funzioni sono pure: prendono una pianta e ne danno una nuova (o un errore leggibile).
 */

export const WALL = 0.2;          // spessore dei muri del motore
export const SNAP = 0.05;         // passo di aggancio (m)
const EPS = 1e-6;
const TOL = 1e-3;
const OPEN_MARGIN = 0.15;         // distanza minima di una porta o finestra dal fondo del muro
const OPEN_GAP = 0.1;             // distanza minima tra due aperture
const round3 = (v) => Math.round(v * 1000) / 1000;
export const snap = (v, step = SNAP) => Math.round(v / step) * step;

const group = (r) => r.zone ?? r.id;

/* Misura minima di un locale (lato corto) quando si sposta un muro. */
const MIN_SIDE = { bath: 1.2, wc: 1.0, corridor: 0.9, entry: 0.9, closet: 0.9, storage: 0.9, laundry: 1.2, bed: 2.4, living: 2.4,
  living_kitchen: 2.4, kitchen: 1.8, study: 2.0, dining: 2.0 };
export const minSide = (r) => MIN_SIDE[r.kind] ?? 1.2;

/* ── muri derivati dai locali (porta di build_walls del motore) ── */

function groupAt(rooms, px, py) {
  for (const r of rooms) {
    if (r.x - EPS <= px && px <= r.x + r.w + EPS && r.y - EPS <= py && py <= r.y + r.h + EPS) return group(r);
  }
  return null;
}

/* Segmenti elementari: bordi tra locali di gruppi diversi o verso l'esterno, prima dell'unione. */
function rawSegments(rooms) {
  const xs = [...new Set(rooms.flatMap((r) => [round3(r.x), round3(r.x + r.w)]))].sort((a, b) => a - b);
  const ys = [...new Set(rooms.flatMap((r) => [round3(r.y), round3(r.y + r.h)]))].sort((a, b) => a - b);
  const hs = [];
  const vs = [];
  for (const y of ys) {
    for (let i = 0; i < xs.length - 1; i++) {
      const xm = (xs[i] + xs[i + 1]) / 2;
      const a = groupAt(rooms, xm, y - 0.01);
      const b = groupAt(rooms, xm, y + 0.01);
      if (a !== b) hs.push({ line: y, lo: xs[i], hi: xs[i + 1], per: a == null || b == null, a, b });
    }
  }
  for (const x of xs) {
    for (let j = 0; j < ys.length - 1; j++) {
      const ym = (ys[j] + ys[j + 1]) / 2;
      const a = groupAt(rooms, x - 0.01, ym);
      const b = groupAt(rooms, x + 0.01, ym);
      if (a !== b) vs.push({ line: x, lo: ys[j], hi: ys[j + 1], per: a == null || b == null, a, b });
    }
  }
  return { hs, vs };
}

function merge(segs) {
  const sorted = [...segs].sort((p, q) => p.line - q.line || Number(p.per) - Number(q.per) || p.lo - q.lo);
  const out = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && last.line === s.line && last.per === s.per && Math.abs(last.hi - s.lo) < 1e-6) last.hi = s.hi;
    else out.push({ ...s });
  }
  return out;
}

/* Rettangoli dei muri [{ x, y, w, h }] di una pianta, come li dà il motore. */
export function deriveWalls(rooms, W, L, t = WALL) {
  const { hs, vs } = rawSegments(rooms);
  const walls = [];
  for (const s of merge(hs)) {
    if (s.per && (s.line <= EPS || s.line >= L - EPS)) walls.push({ x: s.lo, y: s.line <= EPS ? 0 : L - t, w: s.hi - s.lo, h: t });
    else {
      const a = Math.max(0, s.lo - t / 2);
      const b = Math.min(W, s.hi + t / 2);
      walls.push({ x: a, y: s.line - t / 2, w: b - a, h: t });
    }
  }
  for (const s of merge(vs)) {
    if (s.per && (s.line <= EPS || s.line >= W - EPS)) walls.push({ x: s.line <= EPS ? 0 : W - t, y: s.lo, w: t, h: s.hi - s.lo });
    else {
      const a = Math.max(0, s.lo - t / 2);
      const b = Math.min(L, s.hi + t / 2);
      walls.push({ x: s.line - t / 2, y: a, w: t, h: b - a });
    }
  }
  return walls.map((w) => ({ x: round3(w.x), y: round3(w.y), w: round3(w.w), h: round3(w.h) }));
}

/* Origine (lato minore) del muro la cui mezzeria è `line`, come _wall_origin del motore. */
export function wallOrigin(line, extent) {
  if (line <= EPS) return 0;
  if (line >= extent - EPS) return extent - WALL;
  return line - WALL / 2;
}

/* Linea (mezzeria) del muro di un'apertura, e il suo verso: 'h' (muro lungo x) o 'v'. */
export function openingLine(o, W, L) {
  const horiz = !o.rot;
  const org = horiz ? o.y : o.x - WALL;
  const extent = horiz ? L : W;
  const line = org <= EPS ? 0 : org >= extent - WALL - 1e-3 ? extent : org + WALL / 2;
  return { orient: horiz ? 'h' : 'v', line, start: horiz ? o.x : o.y };
}

/* Un'apertura portata su un'altra linea del muro (stessa pianta, stessa larghezza). */
export function placeOpening(o, orient, line, start, W, L) {
  const org = wallOrigin(line, orient === 'h' ? L : W);
  return orient === 'h' ? { ...o, x: round3(start), y: round3(org) } : { ...o, x: round3(org + WALL), y: round3(start) };
}

/* ── tratti di muro (per trascinare e per mettere le aperture) ── */

/* Tratti di muro con i locali ai due lati: [{ orient, line, lo, hi, a, b, exterior }] (a, b = id locali, b null = esterno). */
export function wallRuns(plan) {
  const rooms = plan.rooms.filter((r) => r.kind !== 'garden');
  const { hs, vs } = rawSegments(rooms);
  const roomAt = (px, py) => rooms.find((r) => r.x - EPS <= px && px <= r.x + r.w + EPS && r.y - EPS <= py && py <= r.y + r.h + EPS)?.id ?? null;
  const tag = (list, orient) => list.map((s) => {
    const m = (s.lo + s.hi) / 2;
    const p = orient === 'h' ? (d) => roomAt(m, s.line + d) : (d) => roomAt(s.line + d, m);
    const before = p(-0.01);
    const after = p(0.01);
    return { orient, line: s.line, lo: s.lo, hi: s.hi, a: before ?? after, b: before == null || after == null ? null : after,
      exterior: before == null || after == null };
  });
  const runs = [];
  for (const s of [...tag(hs, 'h'), ...tag(vs, 'v')].sort((p, q) => (p.orient < q.orient ? -1 : p.orient > q.orient ? 1 : 0) || p.line - q.line || p.lo - q.lo)) {
    const last = runs[runs.length - 1];
    if (last && last.orient === s.orient && last.line === s.line && last.a === s.a && last.b === s.b && Math.abs(last.hi - s.lo) < 1e-6) last.hi = s.hi;
    else runs.push({ ...s });
  }
  return runs;
}

/* Il tratto di muro che contiene un'apertura (stessa linea e stessa coppia di locali), o null. */
export function runOf(plan, o) {
  const { orient, line, start } = openingLine(o, plan.dimensions.width, plan.dimensions.length);
  const mid = start + o.w / 2;
  return wallRuns(plan).find((r) => r.orient === orient && Math.abs(r.line - line) < 0.02 && mid >= r.lo - 0.02 && mid <= r.hi + 0.02) || null;
}

/* ── spostare un muro interno ── */

const span = (r, vertical) => (vertical ? [r.y, r.y + r.h] : [r.x, r.x + r.w]);
const overlaps = (p, q) => Math.min(p[1], q[1]) - Math.max(p[0], q[0]) > TOL;
const unionOf = (list) => {
  const sorted = list.map((x) => [...x]).sort((p, q) => p[0] - q[0]);
  const out = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1] + TOL) last[1] = Math.max(last[1], s[1]);
    else out.push(s);
  }
  return out;
};
const same = (p, q) => p.length === q.length && p.every((s, i) => Math.abs(s[0] - q[i][0]) < TOL && Math.abs(s[1] - q[i][1]) < TOL);

/*
 * Il muro interno che separa i locali `a` e `b` lungo la linea `line` (orient 'v': x costante, 'h': y costante):
 * locali da spostare (before = dal lato minore, after = dal lato maggiore) e tratto coperto. Con `error` se non è
 * una partizione interna spostabile (perimetro, vano scala, tratto che finisce contro un terzo locale).
 */
export function partition(plan, orient, line, a, b) {
  const vertical = orient === 'v';
  const rooms = plan.rooms.filter((r) => r.kind !== 'garden');
  const near = (v) => Math.abs(v - line) < TOL;
  const before = rooms.filter((r) => near(vertical ? r.x + r.w : r.y + r.h));
  const after = rooms.filter((r) => near(vertical ? r.x : r.y));
  const A = before.find((r) => r.id === a) || after.find((r) => r.id === a);
  const B = before.find((r) => r.id === b) || after.find((r) => r.id === b);
  if (!A || !B) return { error: 'Questo muro non si può spostare' };
  const inBefore = new Set([A, B].filter((r) => before.includes(r)));
  const inAfter = new Set([A, B].filter((r) => after.includes(r)));
  // chiusura: ogni locale sulla linea che tocca il tratto spostato si sposta con gli altri
  for (let changed = true; changed;) {
    changed = false;
    const covB = unionOf([...inBefore].map((r) => span(r, vertical)));
    const covA = unionOf([...inAfter].map((r) => span(r, vertical)));
    for (const r of after) if (!inAfter.has(r) && covB.some((s) => overlaps(s, span(r, vertical)))) { inAfter.add(r); changed = true; }
    for (const r of before) if (!inBefore.has(r) && covA.some((s) => overlaps(s, span(r, vertical)))) { inBefore.add(r); changed = true; }
  }
  const covB = unionOf([...inBefore].map((r) => span(r, vertical)));
  const covA = unionOf([...inAfter].map((r) => span(r, vertical)));
  if (!inBefore.size || !inAfter.size || !same(covB, covA)) return { error: 'Muro perimetrale o tratto che finisce contro un altro locale: non si sposta' };
  const moving = [...inBefore, ...inAfter];
  if (moving.some((r) => r.kind === 'stairs')) return { error: 'Il vano scala non si ridimensiona: sposta la scala' };
  if ([...inBefore].some((r) => group(r) === [...inAfter].map(group).find((g) => g === group(r)))) return { error: 'Questi locali sono un’unica zona aperta' };
  const room = (r) => plan.rooms.find((x) => x.id === r.id);
  const lim = (r) => (vertical ? r.w : r.h) - minSide(r);
  const lo = -Math.min(...[...inBefore].map(lim));      // spostando verso il lato minore cedono i locali «before»
  const hi = Math.min(...[...inAfter].map(lim));
  return { orient, line, before: [...inBefore].map((r) => r.id), after: [...inAfter].map((r) => r.id), spans: covB, min: lo, max: hi,
    rooms: moving.map(room) };
}

/*
 * Sposta una partizione (da `partition`) di `delta` metri (agganciato a SNAP, entro i limiti): ridimensiona i locali, sposta le
 * aperture sul muro, riaggiusta quelle sui muri che si accorciano e ricalcola i muri.
 * Ritorna { plan, delta, moved: [id locali cambiati], dropped: [testi] }.
 */
export function movePartition(plan, part, delta) {
  const d = Math.max(part.min, Math.min(part.max, snap(delta)));
  const vertical = part.orient === 'v';
  const before = new Set(part.before);
  const after = new Set(part.after);
  const rooms = plan.rooms.map((r) => {
    if (!before.has(r.id) && !after.has(r.id)) return r;
    const n = { ...r };
    if (before.has(r.id)) { if (vertical) n.w = round3(r.w + d); else n.h = round3(r.h + d); }
    else if (vertical) { n.x = round3(r.x + d); n.w = round3(r.w - d); }
    else { n.y = round3(r.y + d); n.h = round3(r.h - d); }
    n.area = round3(n.w * n.h);
    return n;
  });
  const { width: W, length: L } = plan.dimensions;
  const onLine = (o, orientWanted) => {
    const ol = openingLine(o, W, L);
    return ol.orient === orientWanted && Math.abs(ol.line - part.line) < 0.02
      && part.spans.some(([s0, s1]) => ol.start + o.w / 2 >= s0 - 0.02 && ol.start + o.w / 2 <= s1 + 0.02);
  };
  const shift = (o) => (onLine(o, part.orient) ? placeOpening(o, part.orient, part.line + d, openingLine(o, W, L).start, W, L) : o);
  const moved = { ...plan, rooms, doors: plan.doors.map(shift), windows: plan.windows.map(shift) };
  return { ...finish(moved, [...before, ...after]), delta: d };
}

/* Riaggiusta le aperture sui muri cambiati, ricalcola i muri e il resto dei dati derivati. */
function finish(plan, touched) {
  const dropped = [];
  const runs = wallRuns(plan);
  const { width: W, length: L } = plan.dimensions;
  const fix = (o, label) => {
    const { orient, line, start } = openingLine(o, W, L);
    const mid = start + o.w / 2;
    const cands = runs.filter((r) => r.orient === orient && Math.abs(r.line - line) < 0.02);
    const run = cands.find((r) => mid >= r.lo - 0.02 && mid <= r.hi + 0.02)
      || cands.sort((p, q) => Math.min(Math.abs(mid - p.lo), Math.abs(mid - p.hi)) - Math.min(Math.abs(mid - q.lo), Math.abs(mid - q.hi)))[0];
    if (!run || (o.entrance && !run.exterior)) { dropped.push(`${label} tolta: il muro non c’è più`); return null; }
    const room = Math.max(0.4, Math.min(o.w, run.hi - run.lo - 2 * OPEN_MARGIN));
    if (run.hi - run.lo - 2 * OPEN_MARGIN < 0.4) { dropped.push(`${label} tolta: muro troppo corto`); return null; }
    const s = Math.max(run.lo + OPEN_MARGIN, Math.min(run.hi - OPEN_MARGIN - room, start));
    if (room < o.w - TOL) dropped.push(`${label} ristretta a ${room.toFixed(2).replace('.', ',')} m`);
    return placeOpening({ ...o, w: round3(room) }, orient, line, round3(s), W, L);
  };
  const doors = plan.doors.map((o) => fix(o, o.entrance ? 'Porta d’ingresso' : 'Porta')).filter(Boolean);
  const windows = plan.windows.map((o) => fix(o, 'Finestra')).filter(Boolean);
  const out = { ...plan, doors, windows, walls: deriveWalls(plan.rooms.filter((r) => r.kind !== 'garden'), W, L) };
  out.stats = { ...(plan.stats || {}), doors: doors.length, windows: windows.length };
  return { plan: out, moved: [...new Set(touched)], dropped };
}

/* ── porte e finestre ── */

/* Sposta un'apertura lungo il suo muro: `start` è la nuova posizione (m), tenuta dentro il tratto e lontana dalle altre. */
export function moveOpening(plan, kind, index, start) {
  const list = kind === 'door' ? plan.doors : plan.windows;
  const o = list[index];
  if (!o) return plan;
  const { width: W, length: L } = plan.dimensions;
  const run = runOf(plan, o);
  if (!run) return plan;
  const others = [...plan.doors, ...plan.windows].filter((x) => x !== o)
    .map((x) => ({ ...openingLine(x, W, L), w: x.w }))
    .filter((x) => x.orient === run.orient && Math.abs(x.line - run.line) < 0.02);
  let s = Math.max(run.lo + OPEN_MARGIN, Math.min(run.hi - OPEN_MARGIN - o.w, snap(start)));
  // senza sovrapporsi alle altre aperture dello stesso muro
  for (const x of others) {
    if (s < x.start + x.w + OPEN_GAP && s + o.w > x.start - OPEN_GAP) {
      const left = x.start - OPEN_GAP - o.w;
      const right = x.start + x.w + OPEN_GAP;
      s = Math.abs(s - left) < Math.abs(s - right) ? left : right;
      s = Math.max(run.lo + OPEN_MARGIN, Math.min(run.hi - OPEN_MARGIN - o.w, s));
    }
  }
  const next = placeOpening(o, run.orient, run.line, round3(s), W, L);
  const apply = (l) => l.map((x, i) => (i === index ? next : x));
  return kind === 'door' ? { ...plan, doors: apply(plan.doors) } : { ...plan, windows: apply(plan.windows) };
}

/* Larghezza nuova di un'apertura (centrata sul punto di prima, dentro il tratto). */
export function resizeOpening(plan, kind, index, width) {
  const list = kind === 'door' ? plan.doors : plan.windows;
  const o = list[index];
  if (!o) return plan;
  const { width: W, length: L } = plan.dimensions;
  const run = runOf(plan, o);
  if (!run) return plan;
  const { start } = openingLine(o, W, L);
  const w = Math.max(0.6, Math.min(snap(width), run.hi - run.lo - 2 * OPEN_MARGIN, kind === 'door' ? 2.4 : 4));
  const resized = { ...o, w: round3(w) };
  const apply = (l) => l.map((x, i) => (i === index ? resized : x));
  const next = kind === 'door' ? { ...plan, doors: apply(plan.doors) } : { ...plan, windows: apply(plan.windows) };
  return moveOpening(next, kind, index, start + o.w / 2 - w / 2);
}

/* Verso di apertura della porta (verso l'altro locale). */
export function flipDoor(plan, index) {
  return { ...plan, doors: plan.doors.map((d, i) => (i === index ? { ...d, openDir: -d.openDir } : d)) };
}

export function removeOpening(plan, kind, index) {
  const key = kind === 'door' ? 'doors' : 'windows';
  const next = { ...plan, [key]: plan[key].filter((_, i) => i !== index) };
  next.stats = { ...(plan.stats || {}), [key]: next[key].length };
  return next;
}

/*
 * Aggiunge una porta o una finestra sul tratto `run` (da wallRuns) vicino a `at` (m lungo il muro).
 * Finestra: solo sui muri esterni. Porta: tra due locali (si apre verso quello più vicino al centro) o ingresso sul perimetro.
 */
export function addOpening(plan, kind, run, at) {
  const { width: W, length: L } = plan.dimensions;
  if (kind === 'window' && !run.exterior) return { error: 'Le finestre vanno sui muri esterni' };
  const w = kind === 'door' ? (run.exterior ? 0.9 : 0.8) : Math.min(1.4, run.hi - run.lo - 2 * OPEN_MARGIN);
  if (run.hi - run.lo - 2 * OPEN_MARGIN < Math.min(w, 0.6)) return { error: 'Muro troppo corto' };
  const room = plan.rooms.find((r) => r.id === run.a);
  const horiz = run.orient === 'h';
  const into = horiz ? (room && room.y + room.h / 2 > run.line ? 1 : -1) : (room && room.x + room.w / 2 > run.line ? 1 : -1);
  const base = placeOpening({ x: 0, y: 0, w: round3(w), rot: horiz ? 0 : 90 }, run.orient, run.line, 0, W, L);
  const o = kind === 'door' ? { ...base, openDir: horiz ? into : -into, entrance: run.exterior } : base;
  const list = kind === 'door' ? [...plan.doors, o] : [...plan.windows, o];
  const key = kind === 'door' ? 'doors' : 'windows';
  const next = moveOpening({ ...plan, [key]: list }, kind, list.length - 1, at - w / 2);
  next.stats = { ...(plan.stats || {}), [key]: list.length };
  return { plan: next, index: list.length - 1 };
}
