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
import { PANORAMIC_MAX, isPanoramic } from './openings';

export const WALL = 0.2;          // spessore dei muri del motore
export const SNAP = 0.05;         // passo di aggancio (m)
const EPS = 1e-6;
const TOL = 1e-3;
const OPEN_MARGIN = 0.08;         // distanza minima di una porta o finestra dal fondo del muro
const OPEN_GAP = 0.05;             // distanza minima tra due aperture
const round3 = (v) => Math.round(v * 1000) / 1000;
export const snap = (v, step = SNAP) => Math.round(v / step) * step;

const group = (r) => r.zone ?? r.id;

/* Misura minima di un locale (lato corto) quando si sposta un muro. */
const MIN_SIDE = { bath: 1.2, wc: 1.0, corridor: 0.9, entry: 0.9, closet: 0.9, storage: 0.9, laundry: 1.2, bed: 2.4, living: 2.4,
  living_kitchen: 2.4, kitchen: 1.8, study: 2.0, dining: 2.0 };
export const minSide = (r) => (r.piece ? 0.5 : MIN_SIDE[r.kind] ?? 1.2);

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

/* ── spostare un muro (interno o esterno) ── */

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


const isStairRoom = (plan, r) => plan.stairs?.[0]?.room === r.id;

/* Quanto può ridursi un locale (lungo la larghezza se `vertical`, altrimenti l'altezza) prima di diventare troppo piccolo. */
function shrinkLimit(plan, r, vertical) {
  const cur = vertical ? r.w : r.h;
  const st = isStairRoom(plan, r) ? plan.stairs[0] : null;
  if (st) {
    const [across, along] = STAIR_MIN[st.type];
    const ns = st.entry === 'N' || st.entry === 'S';
    const need = vertical ? (ns ? across : along) : (ns ? along : across);
    return Math.max(0, Math.min(cur - 1, (vertical ? st.core.w : st.core.h) - need));
  }
  return Math.max(0, cur - minSide(r));
}

/*
 * Divide il locale `roomId` lungo il muro in tratti, in modo che uno copra esattamente [lo, hi]: i tratti restano
 * della stessa zona (senza muro in mezzo, come i pezzi di un locale a L). Ritorna { plan, id } con l'id del tratto centrale.
 */
function isolate(plan, roomId, orient, lo, hi) {
  const r = roomOf(plan, roomId);
  const vertical = orient === 'v';
  const [r0, r1] = vertical ? [r.y, r.y + r.h] : [r.x, r.x + r.w];
  if (r0 >= lo - TOL && r1 <= hi + TOL) return { plan, id: roomId };
  if (isStairRoom(plan, r)) return { error: 'Il vano scala non si divide in tratti' };
  const cuts = [[r0, Math.max(r0, lo)], [Math.max(r0, lo), Math.min(r1, hi)], [Math.min(r1, hi), r1]].filter(([x0, x1]) => x1 - x0 > 0.05);
  let next = nextId(plan);
  let mid = roomId;
  const furniture = [...(plan.furniture || [])];
  const rooms = [];
  cuts.forEach(([x0, x1], i) => {
    const id = i === 0 ? roomId : next++;
    const piece = vertical ? { ...r, id, y: round3(x0), h: round3(x1 - x0) } : { ...r, id, x: round3(x0), w: round3(x1 - x0) };
    piece.area = round3(piece.w * piece.h);
    piece.piece = true;
    if (id !== roomId) piece.name = '';
    delete piece.label;
    if (Math.abs(x0 - Math.max(r0, lo)) < TOL && Math.abs(x1 - Math.min(r1, hi)) < TOL) mid = id;
    rooms.push(piece);
  });
  const pieceOf = (f) => rooms.find((q) => (vertical ? f.y + f.h / 2 >= q.y - TOL && f.y + f.h / 2 <= q.y + q.h + TOL : f.x + f.w / 2 >= q.x - TOL && f.x + f.w / 2 <= q.x + q.w + TOL));
  const items = furniture.map((f) => (f.room === roomId ? { ...f, room: (pieceOf(f) || rooms[0]).id } : f));
  return { plan: { ...plan, rooms: plan.rooms.flatMap((x) => (x.id === roomId ? rooms : [x])), furniture: items }, id: mid };
}

/*
 * Il muro che separa i locali `a` e `b` lungo la linea `line` (orient 'v': x costante, 'h': y costante); `b` null = muro
 * esterno. Ritorna i locali da spostare (before = quelli che finiscono sulla linea e crescono spostandola verso +, after = quelli
 * che partono dalla linea), il tratto coperto e i limiti { min, max } dello spostamento. Con `span` [lo, hi] (il tratto cliccato)
 * un muro più corto del locale lo divide in tratti della stessa zona. `error` solo se davvero non si può.
 */
export function partition(plan, orient, line, a, b, span = null, depth = 0) {
  const vertical = orient === 'v';
  const rooms = plan.rooms.filter((r) => r.kind !== 'garden');
  const near = (v) => Math.abs(v - line) < TOL;
  const before = rooms.filter((r) => near(vertical ? r.x + r.w : r.y + r.h));
  const after = rooms.filter((r) => near(vertical ? r.x : r.y));
  const A = before.find((r) => r.id === a) || after.find((r) => r.id === a);
  const B = b == null ? null : before.find((r) => r.id === b) || after.find((r) => r.id === b);
  if (!A || (b != null && !B)) return { error: 'Questo muro non si può spostare' };
  if (!B) return outerPartition(plan, orient, line, A, before, after);
  const inBefore = new Set([A, B].filter((r) => before.includes(r)));
  const inAfter = new Set([A, B].filter((r) => after.includes(r)));
  // chiusura: ogni locale sulla linea che tocca il tratto spostato si sposta con gli altri
  for (let changed = true; changed;) {
    changed = false;
    const covB = unionOf([...inBefore].map((r) => span2(r, vertical)));
    const covA = unionOf([...inAfter].map((r) => span2(r, vertical)));
    for (const r of after) if (!inAfter.has(r) && covB.some((x) => overlaps(x, span2(r, vertical)))) { inAfter.add(r); changed = true; }
    for (const r of before) if (!inBefore.has(r) && covA.some((x) => overlaps(x, span2(r, vertical)))) { inBefore.add(r); changed = true; }
  }
  const covB = unionOf([...inBefore].map((r) => span2(r, vertical)));
  const covA = unionOf([...inAfter].map((r) => span2(r, vertical)));
  if (!inBefore.size || !inAfter.size || !same(covB, covA)) {
    // il muro finisce contro un altro locale: i due locali si dividono in tratti e si sposta solo quello
    if (depth) return { error: 'Questo muro non si può spostare' };
    const [lo, hi] = span || (() => { const e = sharedSpan(A, B, vertical); return e; })();
    const ia = isolate(plan, A.id, orient, lo, hi);
    if (ia.error) return ia;
    const ib = isolate(ia.plan, B.id, orient, lo, hi);
    if (ib.error) return ib;
    const sub = partition(ib.plan, orient, line, ia.id, ib.id, [lo, hi], 1);
    return sub.error ? sub : { ...sub, plan: ib.plan, pieces: true };
  }
  const moving = [...inBefore, ...inAfter];
  const sameZone = [...inBefore].some((r) => [...inAfter].some((q) => group(q) === group(r)));
  if (sameZone && !moving.some((r) => r.piece)) return { error: 'Questi locali sono un\u2019unica zona aperta' };
  const lo = -Math.min(...[...inBefore].map((r) => shrinkLimit(plan, r, vertical)));   // spostando verso il lato minore cedono i locali «before»
  const hi = Math.min(...[...inAfter].map((r) => shrinkLimit(plan, r, vertical)));
  return { orient, line, before: [...inBefore].map((r) => r.id), after: [...inAfter].map((r) => r.id), spans: covB, min: lo, max: hi,
    rooms: moving.map((r) => roomOf(plan, r.id)), stairs: moving.some((r) => isStairRoom(plan, r)) };
}

const span2 = span;
function sharedSpan(A, B, vertical) {
  const [a0, a1] = span(A, vertical);
  const [b0, b1] = span(B, vertical);
  return [Math.max(a0, b0), Math.min(a1, b1)];
}

/* Muro esterno: si sposta tutto il tratto di facciata (i locali che si toccano lungo la linea); fuori deve esserci spazio libero. */
function outerPartition(plan, orient, line, A, before, after) {
  const vertical = orient === 'v';
  const side = before.includes(A) ? 'before' : 'after';
  const mine = side === 'before' ? before : after;
  const other = side === 'before' ? after : before;
  const set = new Set([A]);
  for (let changed = true; changed;) {
    changed = false;
    for (const r of mine) {
      if (set.has(r)) continue;
      const [r0, r1] = span(r, vertical);
      if ([...set].some((q) => { const [q0, q1] = span(q, vertical); return Math.min(r1, q1) - Math.max(r0, q0) > -TOL; })) { set.add(r); changed = true; }
    }
  }
  const cov = unionOf([...set].map((r) => span(r, vertical)));
  if (other.some((r) => cov.some((x) => overlaps(x, span(r, vertical))))) return { error: 'Questo muro non è esterno' };
  const ids = [...set].map((r) => r.id);
  const shrink = Math.min(...[...set].map((r) => shrinkLimit(plan, r, vertical)));
  // spazio libero fuori: il primo locale che incontra il tratto spostandolo verso l'esterno
  const out = plan.rooms.filter((r) => r.kind !== 'garden' && !set.has(r));
  let free = 30;
  for (const r of out) {
    const [r0, r1] = span(r, vertical);
    if (!cov.some((x) => overlaps(x, [r0, r1]))) continue;
    const [e0, e1] = vertical ? [r.x, r.x + r.w] : [r.y, r.y + r.h];
    if (side === 'before' && e0 >= line - TOL) free = Math.min(free, e0 - line);
    if (side === 'after' && e1 <= line + TOL) free = Math.min(free, line - e1);
  }
  const part = { orient, line, exterior: true, spans: cov, rooms: [...set].map((r) => roomOf(plan, r.id)),
    stairs: [...set].some((r) => isStairRoom(plan, r)),
    before: side === 'before' ? ids : [], after: side === 'after' ? ids : [] };
  return side === 'before' ? { ...part, min: -shrink, max: free } : { ...part, min: -free, max: shrink };
}

/* Rettangoli del riquadro non occupati da locali (rientranze): come compute_notches del motore. */
export function computeNotches(rooms, W, L) {
  const real = rooms.filter((r) => r.kind !== 'garden');
  const xs = [...new Set([0, round3(W), ...real.flatMap((r) => [round3(r.x), round3(r.x + r.w)])])].sort((p, q) => p - q);
  const ys = [...new Set([0, round3(L), ...real.flatMap((r) => [round3(r.y), round3(r.y + r.h)])])].sort((p, q) => p - q);
  const out = [];
  let open = new Map();
  for (let j = 0; j < ys.length - 1; j++) {
    const ym = (ys[j] + ys[j + 1]) / 2;
    const runs = [];
    let cur = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const xm = (xs[i] + xs[i + 1]) / 2;
      if (groupAt(real, xm, ym) == null) {
        if (cur && Math.abs(cur[1] - xs[i]) < 1e-6) cur[1] = xs[i + 1];
        else { cur = [xs[i], xs[i + 1]]; runs.push(cur); }
      } else cur = null;
    }
    const next = new Map();
    for (const run of runs) {
      const k = `${run[0]}:${run[1]}`;
      const prev = open.get(k);
      if (prev && Math.abs(prev[3] - ys[j]) < 1e-6) { prev[3] = ys[j + 1]; next.set(k, prev); }
      else { const r = [run[0], ys[j], run[1], ys[j + 1]]; out.push(r); next.set(k, r); }
    }
    open = next;
  }
  return out.map(([x0, y0, x1, y1]) => ({ x: round3(x0), y: round3(y0), w: round3(x1 - x0), h: round3(y1 - y0) }));
}

/*
 * Sposta un muro (da `partition`) di `delta` metri (agganciato a SNAP, entro i limiti): ridimensiona i locali, sposta le aperture
 * sul muro, aggiorna scala, contorno e rientranze, riaggiusta le aperture dei muri che cambiano e ricalcola i muri.
 * Ritorna { plan, delta, moved: [id locali cambiati], dropped: [testi] } oppure { error }.
 */
export function movePartition(plan0, part, delta) {
  const plan = part.plan || plan0;
  const d = part.max < part.min ? 0 : Math.max(part.min, Math.min(part.max, snap(delta)));
  if (!d) return { plan: plan0, delta: 0, moved: [], dropped: [] };
  const vertical = part.orient === 'v';
  const before = new Set(part.before);
  const after = new Set(part.after);
  const { width: W, length: L } = plan.dimensions;
  // le aperture si ricordano come (linea, inizio): dopo lo spostamento e l'eventuale traslazione si rimettono sui muri
  const describe = (o) => {
    const q = openingLine(o, W, L);
    const mid = q.start + o.w / 2;
    const onWall = q.orient === part.orient && Math.abs(q.line - part.line) < 0.02 && part.spans.some(([s0, s1]) => mid >= s0 - 0.02 && mid <= s1 + 0.02);
    return { o, ...q, line: onWall ? q.line + d : q.line };
  };
  const doors = plan.doors.map(describe);
  const windows = plan.windows.map(describe);
  let rooms = plan.rooms.map((r) => {
    if (!before.has(r.id) && !after.has(r.id)) return r;
    const n = { ...r };
    if (before.has(r.id)) { if (vertical) n.w = round3(r.w + d); else n.h = round3(r.h + d); }
    else if (vertical) { n.x = round3(r.x + d); n.w = round3(r.w - d); }
    else { n.y = round3(r.y + d); n.h = round3(r.h - d); }
    n.area = round3(n.w * n.h);
    return n;
  });
  // scala: il suo ingombro cambia con il vano
  const stairs = (plan.stairs || []).map((st) => {
    const r0 = roomOf(plan, st.room);
    const r1 = rooms.find((r) => r.id === st.room);
    if (!r0 || !r1 || (r0.x === r1.x && r0.y === r1.y && r0.w === r1.w && r0.h === r1.h)) return st;
    const dx = r1.x - r0.x; const dy = r1.y - r0.y; const dw = r1.w - r0.w; const dh = r1.h - r0.h;
    return { ...st, x: round3(st.x + dx), y: round3(st.y + dy), w: round3(st.w + dw), h: round3(st.h + dh),
      core: { ...st.core, x: round3(st.core.x + dx), y: round3(st.core.y + dy), w: round3(st.core.w + dw), h: round3(st.core.h + dh) } };
  });
  // contorno nuovo: il riquadro si adatta e tutto si trasla perché parta da 0
  const minX = Math.min(...rooms.map((r) => r.x));
  const minY = Math.min(...rooms.map((r) => r.y));
  const W2 = round3(Math.max(...rooms.map((r) => r.x + r.w)) - minX);
  const L2 = round3(Math.max(...rooms.map((r) => r.y + r.h)) - minY);
  const sx = round3(-minX);
  const sy = round3(-minY);
  const grow = W2 !== W || L2 !== L || sx || sy;
  const mv = (o, key, by) => (by ? { ...o, [key]: round3(o[key] + by) } : o);
  const shift = (o) => mv(mv(o, 'x', sx), 'y', sy);
  if (sx || sy) rooms = rooms.map((r) => shift(r));
  const place = ({ o, orient, line, start }) => (orient === 'v'
    ? placeOpening(o, 'v', line + sx, start + sy, W2, L2) : placeOpening(o, 'h', line + sy, start + sx, W2, L2));
  const moved = {
    ...plan, rooms,
    furniture: (plan.furniture || []).map(shift),
    stairs: stairs.map((st) => ({ ...shift(st), core: shift(st.core) })),
    doors: doors.map(place), windows: windows.map(place),
    ...(plan.mezzanine ? { mezzanine: { ...shift(plan.mezzanine), stair: shift(plan.mezzanine.stair),
      ...(plan.mezzanine.bath ? { bath: { walls: plan.mezzanine.bath.walls.map(shift), door: shift(plan.mezzanine.bath.door) } } : {}) } } : {}),
  };
  if (grow) {
    const notches = computeNotches(rooms, W2, L2);
    const scale = plan.scale || 45;
    Object.assign(moved, { dimensions: { ...plan.dimensions, width: W2, length: L2 }, svgWidth: round3(W2 * scale), svgHeight: round3(L2 * scale), notches,
      shape: notches.length ? (plan.shape && plan.shape !== 'rect' ? plan.shape : 'l') : 'rect' });
  }
  const done = finish(moved, [...before, ...after]);
  if (part.stairs && plan.stairs?.length) {
    const c = checkStair(done.plan, {});
    if (!c.ok) return { error: c.why };
  }
  return { ...done, delta: d };
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
    if (!run || (o.entrance && !run.exterior)) { dropped.push(`${label} tolta: il muro non c\u2019è più`); return null; }
    const room = Math.max(0.4, Math.min(o.w, run.hi - run.lo - 2 * OPEN_MARGIN));
    if (run.hi - run.lo - 2 * OPEN_MARGIN < 0.4) { dropped.push(`${label} tolta: muro troppo corto`); return null; }
    const s = Math.max(run.lo + OPEN_MARGIN, Math.min(run.hi - OPEN_MARGIN - room, start));
    if (room < o.w - TOL) dropped.push(`${label} ristretta a ${room.toFixed(2).replace('.', ',')} m`);
    return placeOpening({ ...o, w: round3(room) }, orient, line, round3(s), W, L);
  };
  const doors = plan.doors.map((o) => fix(o, o.entrance ? 'Porta d\u2019ingresso' : 'Porta')).filter(Boolean);
  const windows = plan.windows.map((o) => fix(o, 'Finestra')).filter(Boolean);
  const out = { ...plan, doors, windows, walls: deriveWalls(plan.rooms.filter((r) => r.kind !== 'garden'), W, L) };
  out.stats = { ...(plan.stats || {}), doors: doors.length, windows: windows.length };
  return { plan: out, moved: [...new Set(touched)], dropped };
}

/* ── porte e finestre ── */

/* Aperture dello stesso muro (stessa linea e verso) di `o`, con posizione e larghezza. */
function neighboursOnWall(plan, o, run) {
  const { width: W, length: L } = plan.dimensions;
  return [...plan.doors, ...plan.windows].filter((x) => x !== o)
    .map((x) => ({ ...openingLine(x, W, L), w: x.w }))
    .filter((x) => x.orient === run.orient && Math.abs(x.line - run.line) < 0.02);
}

/*
 * Posizione valida più vicina a `start` per un'apertura larga `w` dentro il tratto `run`, senza toccare le altre aperture del muro.
 * Ritorna null se non c'è spazio.
 */
function nearestFree(run, others, w, start) {
  const lo = run.lo + OPEN_MARGIN;
  const hi = run.hi - OPEN_MARGIN - w;
  if (hi < lo - 1e-6) return null;
  // intervalli liberi tra le altre aperture
  const busy = others.map((x) => [x.start - OPEN_GAP - w, x.start + x.w + OPEN_GAP]).sort((p, q) => p[0] - q[0]);
  let best = null;
  const consider = (v) => {
    const c = Math.max(lo, Math.min(hi, v));
    if (busy.some(([b0, b1]) => c > b0 + 1e-6 && c < b1 - 1e-6)) return;
    if (best === null || Math.abs(c - start) < Math.abs(best - start)) best = c;
  };
  consider(start);
  consider(lo);
  consider(hi);
  for (const [b0, b1] of busy) { consider(b0); consider(b1); }
  return best;
}

/* Sposta un'apertura lungo il suo muro: `start` è la nuova posizione (m), tenuta dentro il tratto e lontana dalle altre. */
export function moveOpening(plan, kind, index, start) {
  const list = kind === 'door' ? plan.doors : plan.windows;
  const o = list[index];
  if (!o) return plan;
  const { width: W, length: L } = plan.dimensions;
  const run = runOf(plan, o);
  if (!run) return plan;
  const s = nearestFree(run, neighboursOnWall(plan, o, run), o.w, snap(start));
  if (s === null) return plan;
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
  const w = Math.max(0.6, Math.min(snap(width), run.hi - run.lo - 2 * OPEN_MARGIN, isPanoramic(o) ? PANORAMIC_MAX : kind === 'door' ? 2.4 : 4));
  const resized = { ...o, w: round3(w) };
  const apply = (l) => l.map((x, i) => (i === index ? resized : x));
  const next = kind === 'door' ? { ...plan, doors: apply(plan.doors) } : { ...plan, windows: apply(plan.windows) };
  return moveOpening(next, kind, index, start + o.w / 2 - w / 2);
}

/*
 * Cambia il tipo di un'apertura: 'window' (finestra), 'panoramic' (vetrata panoramica fissa), 'sliding' (vetrata scorrevole, una porta),
 * 'door' (porta a battente). Passando da finestra a porta (o al contrario) l'apertura cambia elenco e resta nello stesso posto.
 * Ritorna { plan, selected: { kind, index } }.
 */
export function setOpeningType(plan, kind, index, type) {
  const o = (kind === 'door' ? plan.doors : plan.windows)[index];
  if (!o) return { plan, selected: { kind, index } };
  const toKind = type === 'sliding' || type === 'door' ? 'door' : 'window';
  const { type: _t, openDir: _od, entrance: _en, ...rest } = o;
  const typed = type === 'panoramic' || type === 'sliding' ? { type } : {};
  if (toKind === kind) {
    const next = kind === 'door'
      ? { ...rest, ...typed, openDir: o.openDir, entrance: type === 'sliding' ? false : o.entrance }
      : { ...rest, ...typed };
    const key = kind === 'door' ? 'doors' : 'windows';
    return { plan: { ...plan, [key]: plan[key].map((x, i) => (i === index ? next : x)) }, selected: { kind, index } };
  }
  const key = kind === 'door' ? 'doors' : 'windows';
  const otherKey = toKind === 'door' ? 'doors' : 'windows';
  const { kind: _dk, ...clean } = rest;
  const moved = toKind === 'door' ? { ...clean, ...typed, openDir: 1, entrance: false } : { ...clean, ...typed };
  const next = { ...plan, [key]: plan[key].filter((_, i) => i !== index), [otherKey]: [...plan[otherKey], moved] };
  next.stats = { ...(plan.stats || {}), doors: next.doors.length, windows: next.windows.length };
  return { plan: next, selected: { kind: toKind, index: next[otherKey].length - 1 } };
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
export function addOpening(plan, kind, run, at, type = '') {
  const { width: W, length: L } = plan.dimensions;
  // il balcone è fuori: una finestra o una vetrata verso di lui vale come un muro esterno
  const toBalcony = [run.a, run.b].some((id) => plan.rooms.find((r) => r.id === id)?.kind === 'balcony');
  if (kind === 'window' && !run.exterior && !toBalcony) return { error: 'Le finestre vanno sui muri esterni' };
  const avail = run.hi - run.lo - 2 * OPEN_MARGIN;
  const pano = type === 'panoramic' || type === 'sliding';
  const w = round3(Math.min(kind === 'door' ? (pano ? 1.8 : run.exterior ? 0.9 : 0.8) : pano ? 2.4 : 1.4, avail));
  if (w < 0.55) return { error: 'Muro troppo corto per metterci un\u2019apertura' };
  const room = plan.rooms.find((r) => r.id === run.a);
  const horiz = run.orient === 'h';
  const into = horiz ? (room && room.y + room.h / 2 > run.line ? 1 : -1) : (room && room.x + room.w / 2 > run.line ? 1 : -1);
  const base = placeOpening({ x: 0, y: 0, w, rot: horiz ? 0 : 90 }, run.orient, run.line, 0, W, L);
  const typed = type ? { ...base, type } : base;
  const o = kind === 'door' ? { ...typed, openDir: horiz ? into : -into, entrance: run.exterior && type !== 'sliding' } : typed;
  const others = neighboursOnWall(plan, null, run);
  const s = nearestFree(run, others, w, snap(at - w / 2));
  if (s === null) return { error: 'Su questo muro non c\u2019è spazio libero per l\u2019apertura' };
  const placed = placeOpening(o, run.orient, run.line, round3(s), W, L);
  const key = kind === 'door' ? 'doors' : 'windows';
  const next = { ...plan, [key]: [...plan[key], placed] };
  next.stats = { ...(plan.stats || {}), [key]: next[key].length };
  return { plan: next, index: next[key].length - 1 };
}

/* ── fase B: dividere, unire, aprire, spostare locali e scale ── */

const nextId = (plan) => Math.max(0, ...plan.rooms.map((r) => r.id)) + 1;
const roomOf = (plan, id) => plan.rooms.find((r) => r.id === id);
const editable = (r) => r && r.kind !== 'garden' && !r.poly;

/* Divide un locale con un muro: orient 'v' (taglio verticale a x = at) o 'h' (y = at). Il nuovo locale prende il nome «… 2», ha una porta verso l'altro. */
export function splitRoom(plan, roomId, orient, at) {
  const r = roomOf(plan, roomId);
  if (!editable(r)) return { error: 'Questo locale non si può dividere' };
  if (r.kind === 'stairs') return { error: 'Il vano scala non si divide' };
  const vertical = orient === 'v';
  const part = Math.min(minSide(r), 1.5);   // ogni parte almeno così larga (soggiorno e camere si dividono in zone più piccole)
  const lo = (vertical ? r.x : r.y) + part;
  const hi = (vertical ? r.x + r.w : r.y + r.h) - part;
  if (hi < lo - TOL) return { error: `Il locale è troppo ${vertical ? 'stretto per un muro verticale' : 'basso per un muro orizzontale'}: prova ${vertical ? 'orizzontale' : 'verticale'} o un altro locale` };
  const cut = Math.max(lo, Math.min(hi, snap(at)));
  const id = nextId(plan);
  const first = vertical ? { ...r, w: round3(cut - r.x) } : { ...r, h: round3(cut - r.y) };
  const second = vertical
    ? { ...r, id, name: `${r.name} 2`, x: round3(cut), w: round3(r.x + r.w - cut), zone: id }
    : { ...r, id, name: `${r.name} 2`, y: round3(cut), h: round3(r.y + r.h - cut), zone: id };
  first.area = round3(first.w * first.h);
  second.area = round3(second.w * second.h);
  delete second.label;
  const inSecond = (f) => (vertical ? f.x + f.w / 2 >= cut : f.y + f.h / 2 >= cut);
  const furniture = (plan.furniture || []).map((f) => (f.room === roomId && inSecond(f) ? { ...f, room: id } : f));
  const rooms = plan.rooms.flatMap((x) => (x.id === roomId ? [first, second] : [x]));
  const base = { ...plan, rooms, furniture };
  const done = finish(base, [roomId, id]);
  // una porta tra le due parti, al centro del nuovo muro
  const run = wallRuns(done.plan).find((w) => w.orient === orient && Math.abs(w.line - cut) < 0.02
    && ((w.a === roomId && w.b === id) || (w.a === id && w.b === roomId)));
  let out = done.plan;
  let opening = null;
  if (run) {
    const added = addOpening(out, 'door', run, (run.lo + run.hi) / 2);
    if (added.plan) { out = added.plan; opening = { kind: 'door', index: added.index }; }
  }
  return { plan: out, moved: [roomId, id], dropped: done.dropped, opening, wall: run || null };
}

/* Due locali che si toccano lungo un muro: coppia { a, b, vertical, line }, o null. */
function neighbours(plan, a, b) {
  const A = roomOf(plan, a);
  const B = roomOf(plan, b);
  if (!A || !B) return null;
  const touchV = Math.abs(A.x + A.w - B.x) < TOL || Math.abs(B.x + B.w - A.x) < TOL;
  const touchH = Math.abs(A.y + A.h - B.y) < TOL || Math.abs(B.y + B.h - A.y) < TOL;
  return { A, B, touchV, touchH };
}

/* I due locali separati da un muro formano un rettangolo? (bordo comune lungo quanto i lati di entrambi) */
export function canMerge(plan, a, b) {
  const n = neighbours(plan, a, b);
  if (!n || !editable(n.A) || !editable(n.B)) return false;
  if (n.A.kind === 'stairs' || n.B.kind === 'stairs') return false;
  const sameY = Math.abs(n.A.y - n.B.y) < TOL && Math.abs(n.A.h - n.B.h) < TOL;
  const sameX = Math.abs(n.A.x - n.B.x) < TOL && Math.abs(n.A.w - n.B.w) < TOL;
  return (n.touchV && sameY) || (n.touchH && sameX);
}

/* Unisce due locali in uno: resta il più grande (nome, uso), l'altro sparisce con le sue porte sul muro tolto. */
export function mergeRooms(plan, a, b) {
  if (!canMerge(plan, a, b)) return { error: 'I due locali non formano un rettangolo: allinea prima i muri' };
  const A = roomOf(plan, a);
  const B = roomOf(plan, b);
  const [keep, drop] = A.w * A.h >= B.w * B.h ? [A, B] : [B, A];
  const x = Math.min(A.x, B.x);
  const y = Math.min(A.y, B.y);
  const w = round3(Math.max(A.x + A.w, B.x + B.w) - x);
  const h = round3(Math.max(A.y + A.h, B.y + B.h) - y);
  const merged = { ...keep, x, y, w, h, area: round3(w * h) };
  delete merged.label;
  const { width: W, length: L } = plan.dimensions;
  const vertical = Math.abs(A.x + A.w - B.x) < TOL || Math.abs(B.x + B.w - A.x) < TOL;
  const line = vertical ? (Math.abs(A.x + A.w - B.x) < TOL ? B.x : A.x) : (Math.abs(A.y + A.h - B.y) < TOL ? B.y : A.y);
  const onSeam = (o) => { const q = openingLine(o, W, L); return q.orient === (vertical ? 'v' : 'h') && Math.abs(q.line - line) < 0.02; };
  const rooms = plan.rooms.filter((r) => r.id !== drop.id).map((r) => (r.id === keep.id ? merged : r));
  const furniture = (plan.furniture || []).map((f) => (f.room === drop.id ? { ...f, room: keep.id } : f));
  const base = { ...plan, rooms, furniture, doors: plan.doors.filter((o) => !onSeam(o)), windows: plan.windows.filter((o) => !onSeam(o)) };
  const done = finish(base, [keep.id]);
  return { plan: done.plan, moved: [keep.id], dropped: done.dropped };
}

/* Apre il muro tra due locali (zona unica, come soggiorno e cucina): il muro e le sue porte spariscono, i locali restano. */
export function openWall(plan, a, b) {
  const n = neighbours(plan, a, b);
  if (!n || !(n.touchV || n.touchH)) return { error: 'Questi locali non si toccano' };
  if (n.A.kind === 'stairs' || n.B.kind === 'stairs') return { error: 'Il muro del vano scala non si apre' };
  const keepZone = group(n.A);
  const from = group(n.B);
  if (keepZone === from) return { error: 'Sono già una zona unica' };
  const { width: W, length: L } = plan.dimensions;
  const runs = wallRuns(plan).filter((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
  const onSeam = (o) => {
    const q = openingLine(o, W, L);
    const mid = q.start + o.w / 2;
    return runs.some((r) => r.orient === q.orient && Math.abs(r.line - q.line) < 0.02 && mid >= r.lo - 0.02 && mid <= r.hi + 0.02);
  };
  const rooms = plan.rooms.map((r) => (group(r) === from ? { ...r, zone: keepZone } : r));
  const base = { ...plan, rooms, doors: plan.doors.filter((o) => !onSeam(o)), windows: plan.windows.filter((o) => !onSeam(o)) };
  const done = finish(base, [a, b]);
  return { plan: done.plan, moved: [a, b], dropped: done.dropped };
}

/* ── spostare un locale (il vano scala) lungo un asse, scambiando spazio con i locali ai due lati ── */

/* Quanto si può far scorrere il locale lungo `axis` ('x' | 'y'): { min, max, lead, trail } o { error }. */
export function roomSlide(plan, roomId, axis) {
  const S = roomOf(plan, roomId);
  if (!editable(S)) return { error: 'Questo locale non si sposta' };
  const x = axis === 'x';
  const lo = x ? S.y : S.x;
  const hi = x ? S.y + S.h : S.x + S.w;
  const end = x ? S.x + S.w : S.y + S.h;
  const start = x ? S.x : S.y;
  const rooms = plan.rooms.filter((r) => r.id !== roomId && r.kind !== 'garden');
  const at = (r, side) => Math.abs((x ? (side ? r.x + r.w : r.x) : (side ? r.y + r.h : r.y)) - (side ? start : end)) < TOL;
  const lead = rooms.filter((r) => at(r, 0));
  const trail = rooms.filter((r) => at(r, 1));
  const within = (r) => (x ? r.y : r.x) >= lo - TOL && (x ? r.y + r.h : r.x + r.w) <= hi + TOL;
  const cover = (list) => same(unionOf(list.map((r) => (x ? [r.y, r.y + r.h] : [r.x, r.x + r.w]))), [[lo, hi]]);
  const ok = (list) => list.length && list.every(within) && cover(list);
  if (!ok(lead) || !ok(trail)) return { error: 'Il locale non ha su due lati opposti locali che possano cedere e prendere spazio' };
  if ([...lead, ...trail].some((r) => r.kind === 'stairs')) return { error: 'Accanto c’è un altro vano scala' };
  const size = (r) => (x ? r.w : r.h) - minSide(r);
  return { min: -Math.min(...trail.map(size)), max: Math.min(...lead.map(size)), lead: lead.map((r) => r.id), trail: trail.map((r) => r.id) };
}

/* Sposta il locale di `delta` m (agganciato, entro i limiti): i locali davanti si accorciano, quelli dietro si allungano. */
export function moveRoom(plan, roomId, axis, delta, slide = roomSlide(plan, roomId, axis)) {
  if (slide.error) return slide;
  const d = Math.max(slide.min, Math.min(slide.max, snap(delta)));
  const x = axis === 'x';
  const S = roomOf(plan, roomId);
  const { width: W, length: L } = plan.dimensions;
  const lead = new Set(slide.lead);
  const trail = new Set(slide.trail);
  const rooms = plan.rooms.map((r) => {
    if (r.id === roomId) return { ...r, [x ? 'x' : 'y']: round3((x ? r.x : r.y) + d) };
    if (lead.has(r.id)) return x ? { ...r, x: round3(r.x + d), w: round3(r.w - d), area: round3((r.w - d) * r.h) } : { ...r, y: round3(r.y + d), h: round3(r.h - d), area: round3(r.w * (r.h - d)) };
    if (trail.has(r.id)) return x ? { ...r, w: round3(r.w + d), area: round3((r.w + d) * r.h) } : { ...r, h: round3(r.h + d), area: round3(r.w * (r.h + d)) };
    return r;
  });
  // aperture sul bordo del locale (i quattro lati) vanno con lui
  const span = x ? [S.y, S.y + S.h] : [S.x, S.x + S.w];
  const lines = x ? [S.x, S.x + S.w] : [S.y, S.y + S.h];
  const shift = (o) => {
    const q = openingLine(o, W, L);
    const mid = q.start + o.w / 2;
    if (q.orient === (x ? 'v' : 'h')) {
      // muri che attraversano l'asse del movimento: cambiano linea
      return lines.some((l) => Math.abs(q.line - l) < 0.02) && mid >= span[0] - 0.02 && mid <= span[1] + 0.02
        ? placeOpening(o, q.orient, q.line + d, q.start, W, L) : o;
    }
    // muri paralleli al movimento (sopra e sotto il locale): scorrono lungo il muro
    const own = x ? [S.x, S.x + S.w] : [S.y, S.y + S.h];
    const lineAt = x ? [S.y, S.y + S.h] : [S.x, S.x + S.w];
    return lineAt.some((l) => Math.abs(q.line - l) < 0.02) && mid >= own[0] - 0.02 && mid <= own[1] + 0.02
      ? placeOpening(o, q.orient, q.line, q.start + d, W, L) : o;
  };
  const furniture = (plan.furniture || []).map((f) => (f.room === roomId ? { ...f, [x ? 'x' : 'y']: round3(f[x ? 'x' : 'y'] + d) } : f));
  const stairs = (plan.stairs || []).map((st) => (st.room === roomId
    ? { ...st, [x ? 'x' : 'y']: round3(st[x ? 'x' : 'y'] + d), core: { ...st.core, [x ? 'x' : 'y']: round3(st.core[x ? 'x' : 'y'] + d) } } : st));
  const moved = { ...plan, rooms, furniture, stairs, doors: plan.doors.map(shift), windows: plan.windows.map(shift) };
  return { ...finish(moved, [...slide.lead, ...slide.trail]), delta: d };
}

/* ── scala: tipo, ingresso e verso, con la verifica che le porte del vano restino libere ── */

const STAIR_MIN = { u: [2.3, 3.4], l: [3.2, 3.4], straight: [2.2, 4.6] };   // (larghezza, profondità) minime del vano (come STAIR_SLOT)
const U_RUN = 3.2;

/* Tratto libero (da, a) lungo il muro `side` del vano dove non ci sono gradini, o null: porta di _stair_free del motore. */
export function stairFree(kind, entry, hand, geo, side) {
  const ns = entry === 'N' || entry === 'S';
  const D = ns ? geo.h : geo.w;
  const A = ns ? geo.w : geo.h;
  const fw = Math.min(1.0, A / 2);
  const ends = ns ? ['N', 'S'] : ['E', 'W'];
  const whole = side === 'N' || side === 'S' ? [geo.x, geo.x + geo.w] : [geo.y, geo.y + geo.h];
  if (ends.includes(side)) {
    if (kind === 'u') return side === entry && D - U_RUN >= 1.1 ? whole : null;
    if (kind === 'l' && side !== entry) return null;
    if (ns) return hand === 'E' ? [geo.x, geo.x + geo.w - fw] : [geo.x + fw, geo.x + geo.w];
    return hand === 'S' ? [geo.y, geo.y + geo.h - fw] : [geo.y + fw, geo.y + geo.h];
  }
  if (kind !== 'u' && side === hand) return null;
  const freeLen = kind === 'u' ? D - U_RUN : kind === 'l' ? D - fw - 0.1 : D;
  const [lo, hi] = ns ? [geo.y, geo.y + geo.h] : [geo.x, geo.x + geo.w];
  return entry === 'N' || entry === 'W' ? [lo, lo + freeLen] : [hi - freeLen, hi];
}

/* Il vano scala di una pianta: { room, stair } o null. */
export function stairRoom(plan) {
  const st = plan.stairs?.[0];
  const room = st && roomOf(plan, st.room);
  return room ? { room, stair: st } : null;
}

/* Combinazioni valide di tipo / ingresso / verso per il vano di questa pianta, con il motivo se non va: { ok, why }. */
export function checkStair(plan, patch) {
  const found = stairRoom(plan);
  if (!found) return { ok: false, why: 'Nessun vano scala' };
  const { room, stair } = found;
  const type = patch.type ?? stair.type;
  const entry = patch.entry ?? stair.entry;
  let hand = patch.hand ?? stair.hand;
  const ns = entry === 'N' || entry === 'S';
  if (ns ? !['E', 'W'].includes(hand) : !['N', 'S'].includes(hand)) hand = ns ? 'W' : 'N';   // il verso segue il nuovo asse
  const core = stair.core;
  const [a, d] = STAIR_MIN[type];
  const A = ns ? core.w : core.h;
  const D = ns ? core.h : core.w;
  if (A < a - 0.01 || D < d - 0.01) return { ok: false, why: `Il vano (${core.w.toFixed(1)} × ${core.h.toFixed(1)} m) è troppo piccolo per questa scala` };
  const geo = { x: core.x + 0.1, y: core.y + 0.1, w: core.w - 0.2, h: core.h - 0.2 };
  const { width: W, length: L } = plan.dimensions;
  for (const run of wallRuns(plan).filter((r) => r.a === room.id || r.b === room.id)) {
    const side = run.orient === 'v' ? (Math.abs(run.line - room.x) < 0.02 ? 'W' : 'E') : (Math.abs(run.line - room.y) < 0.02 ? 'N' : 'S');
    for (const o of plan.doors) {   // le finestre possono stare dietro i gradini
      const q = openingLine(o, W, L);
      if (q.orient !== run.orient || Math.abs(q.line - run.line) > 0.02 || q.start < run.lo - 0.02 || q.start + o.w > run.hi + 0.02) continue;
      const free = stairFree(type, entry, hand, geo, side);
      const lo = q.start;
      if (!free || lo < free[0] - 0.06 || lo + o.w > free[1] + 0.06) return { ok: false, why: 'Una porta del vano finirebbe sulla rampa', debug: { side, free, lo, w: o.w, type, entry, hand } };
    }
  }
  return { ok: true, patch: { type, entry, hand } };
}

/* Applica tipo / ingresso / verso alla scala di questa pianta (scala e core). */
export function setStair(plan, patch) {
  const c = checkStair(plan, patch);
  if (!c.ok) return { error: c.why };
  const stairs = plan.stairs.map((st, i) => (i ? st : { ...st, ...c.patch, core: { ...st.core, ...c.patch } }));
  return { plan: { ...plan, stairs } };
}

/* Avviso se una porta cade sulla rampa del vano scala (si può mettere comunque): testo o null. */
export function doorWarning(plan, sel) {
  if (sel?.kind !== 'door') return null;
  const o = plan.doors[sel.index];
  const found = stairRoom(plan);
  if (!o || !found) return null;
  const run = runOf(plan, o);
  if (!run || (run.a !== found.room.id && run.b !== found.room.id)) return null;
  const { room, stair } = found;
  const side = run.orient === 'v' ? (Math.abs(run.line - room.x) < 0.02 ? 'W' : 'E') : (Math.abs(run.line - room.y) < 0.02 ? 'N' : 'S');
  const c = stair.core;
  const geo = { x: c.x + 0.1, y: c.y + 0.1, w: c.w - 0.2, h: c.h - 0.2 };
  const free = stairFree(stair.type, stair.entry, stair.hand, geo, side);
  const { start } = openingLine(o, plan.dimensions.width, plan.dimensions.length);
  return !free || start < free[0] - 0.06 || start + o.w > free[1] + 0.06
    ? 'Questa porta cade sulla rampa della scala: spostala dove la rampa non c\u2019è, oppure cambia verso o tipo di scala.' : null;
}
