/*
 * Operazioni sulle forme dello schizzo (coordinate in metri): snap, conversione del tratto
 * a mano libera in poligono, spostamento con aggancio e validazione.
 */
import * as G from './geometry.js';
import { round } from './utils.js';

export const GRID = 0.25;     // passo della griglia di aggancio
export const MAGNET = 0.35;   // distanza entro cui un punto si aggancia a muri/spigoli esistenti
const MIN_AREA = 1.5;
const MAX_OVERLAP = 0.2;      // m² di sovrapposizione tollerati (imprecisione del tratto)

const roundPt = (p) => [round(p[0], 2), round(p[1], 2)];
const gridSnap = (v) => Math.round(v / GRID) * GRID;

/* Coordinate notevoli (x e y di tutti i vertici) delle altre forme, per allineare gli spigoli. */
function axisTargets(shapes) {
  const xs = new Set();
  const ys = new Set();
  for (const s of shapes) for (const [x, y] of s.poly) {
    xs.add(x);
    ys.add(y);
  }
  return { xs: [...xs], ys: [...ys] };
}

function nearest(v, list, maxD) {
  let best = null;
  for (const c of list) {
    const d = Math.abs(c - v);
    if (d <= maxD && (best === null || d < Math.abs(best - v))) best = c;
  }
  return best;
}

/*
 * Aggancio di un punto per il disegno a rettangoli: prima agli allineamenti con le stanze esistenti
 * (così due stanze vicine condividono esattamente il muro), altrimenti alla griglia.
 * Restituisce anche le linee guida da mostrare.
 */
export function snapPoint(p, shapes) {
  const { xs, ys } = axisTargets(shapes);
  const sx = nearest(p[0], xs, MAGNET);
  const sy = nearest(p[1], ys, MAGNET);
  return {
    pt: [sx ?? gridSnap(p[0]), sy ?? gridSnap(p[1])],
    guides: { x: sx, y: sy },
  };
}

/* Aggancio di un vertice libero (tratto a mano): a uno spigolo vicino o al punto più vicino di un muro. */
function snapVertex(p, shapes) {
  let best = null;
  for (const s of shapes) for (const v of s.poly) {
    const d = G.dist(p, v);
    if (d <= MAGNET && (!best || d < best.d)) best = { d, pt: v };
  }
  if (best) return best.pt;
  for (const s of shapes) for (const [a, b] of G.edges(s.poly)) {
    const c = G.closestOnSegment(p, a, b);
    if (c.d <= MAGNET && (!best || c.d < best.d)) best = c;
  }
  return best ? best.pt : p;
}

/* Aggancia tutti i vertici di un poligono ai muri delle forme vicine (usato anche per l'import DXF). */
export const snapPolygon = (poly, shapes) => G.cleanPolygon(poly.map((p) => roundPt(snapVertex(p, shapes))));

/* Correzione applicata al tratto a mano libera. */
export const CORRECTIONS = [
  { id: 'square', label: 'Squadrata', hint: 'Lati dritti a 90° (e 45° se inclinati di molto), curve come archi perfetti.' },
  { id: 'auto', label: 'Automatica', hint: 'Raddrizza i lati e li allinea a 0°/45°/90° quando sono vicini; arrotonda le curve.' },
  { id: 'free', label: 'Libera', hint: 'Ripulisce solo il tremolio: angoli e curve restano come li disegni.' },
];

const STEP = 0.05;          // passo di ricampionamento del tratto (m)
const DEG = Math.PI / 180;

const det3 = (a) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
  - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);

/*
 * Svolta (radianti) in ogni punto del contorno chiuso: angolo tra la direzione media del tratto
 * che precede (da `outer` a `inner` campioni prima) e di quello che segue. Ignorando i campioni
 * vicinissimi, un angolo arrotondato o smussato dalla mano conta per intero.
 */
function turning(pts, inner, outer) {
  const n = pts.length;
  const at = (i) => pts[((i % n) + n) % n];
  return pts.map((_, i) => {
    const a = G.unit(G.sub(at(i - inner), at(i - outer)));
    const b = G.unit(G.sub(at(i + outer), at(i + inner)));
    return Math.acos(Math.max(-1, Math.min(1, G.dot(a, b))));
  });
}

/* Angoli del contorno: in ogni gruppo di punti con svolta forte, il punto di svolta massima. */
function findCorners(pts) {
  const n = pts.length;
  const t = turning(pts, Math.round(0.2 / STEP), Math.round(0.7 / STEP));
  const hot = t.map((v) => v > 40 * DEG);
  if (hot.filter(Boolean).length > n * 0.5) return []; // forma piccola e tutta curva
  const start = hot.findIndex((h, i) => h && !hot[(i - 1 + n) % n]);
  if (start < 0) return [];
  const corners = [];
  let cur = null;
  for (let s = 0; s < n; s++) {
    const i = (start + s) % n;
    if (hot[i]) {
      if (cur === null || t[i] > t[cur]) cur = i;
    } else if (cur !== null) {
      corners.push(cur);
      cur = null;
    }
  }
  if (cur !== null) corners.push(cur);
  corners.sort((p, q) => p - q);
  // due angoli a meno di 50 cm (uno smusso) sono un angolo solo: si tiene quello che svolta di più
  const gap = Math.round(0.5 / STEP);
  const merged = [];
  for (const c of corners) {
    const last = merged[merged.length - 1];
    if (last !== undefined && c - last < gap) {
      if (t[c] > t[last]) merged[merged.length - 1] = c;
    } else merged.push(c);
  }
  if (merged.length > 1 && merged[0] + n - merged[merged.length - 1] < gap) {
    if (t[merged[0]] > t[merged[merged.length - 1]]) merged.pop();
    else merged.shift();
  }
  return merged;
}

/* Retta ai minimi quadrati sulla parte centrale del tratto (gli estremi sono gli angoli). */
function fitLine(seg) {
  const lo = Math.floor(seg.length * 0.1);
  const core = seg.slice(lo, Math.max(Math.ceil(seg.length * 0.9), lo + 2));
  const m = core.reduce((acc, p) => G.add(acc, G.mul(p, 1 / core.length)), [0, 0]);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of core) {
    const [dx, dy] = G.sub(p, m);
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const n = G.normal([Math.cos(ang), Math.sin(ang)]);
  const maxDev = core.reduce((acc, p) => Math.max(acc, Math.abs(G.dot(G.sub(p, m), n))), 0);
  return { m, ang, maxDev };
}

/* Porta l'angolo della retta su multipli di 90° o 45° quando ci è vicino. */
function snapAngle(ang, mode) {
  const near = (step, tol) => {
    const k = Math.round(ang / step) * step;
    return Math.abs(ang - k) <= tol ? k : null;
  };
  if (mode === 'square') return near(90 * DEG, 25 * DEG) ?? near(45 * DEG, 15 * DEG) ?? ang;
  if (mode === 'auto') return near(45 * DEG, 10 * DEG) ?? ang;
  return ang;
}

/* Cerchio ai minimi quadrati (metodo di Kåsa): { c, r, rms } oppure null. */
function fitCircle(pts) {
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const B = [0, 0, 0];
  for (const [x, y] of pts) {
    const row = [x, y, 1];
    const z = -(x * x + y * y);
    for (let i = 0; i < 3; i++) {
      B[i] += row[i] * z;
      for (let j = 0; j < 3; j++) S[i][j] += row[i] * row[j];
    }
  }
  const D = det3(S);
  if (Math.abs(D) < 1e-12) return null;
  const sol = [0, 1, 2].map((k) => det3(S.map((row, i) => row.map((v, j) => (j === k ? B[i] : v)))) / D);
  const c = [-sol[0] / 2, -sol[1] / 2];
  const r2 = c[0] * c[0] + c[1] * c[1] - sol[2];
  if (!(r2 > 0)) return null;
  const r = Math.sqrt(r2);
  const rms = Math.sqrt(pts.reduce((acc, p) => acc + (G.dist(p, c) - r) ** 2, 0) / pts.length);
  return { c, r, rms };
}

const goodArc = (fit, tol) => fit && fit.r < 30 && fit.rms <= Math.max(tol, 0.035 * fit.r);

/* Punti di un arco da a a b sul cerchio, dalla parte del punto intermedio `via`. */
function arcPoints({ c, r }, a, b, via) {
  const ang = (p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  const a0 = ang(a);
  const norm = (x) => ((x - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  let sweep = norm(ang(b));
  if (norm(ang(via)) > sweep) sweep -= 2 * Math.PI; // il punto intermedio sta dall'altra parte
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / (7.5 * DEG)));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = a0 + (sweep * i) / n;
    return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)];
  });
}

/* Levigatura di Chaikin su polilinea aperta (gli estremi restano fermi). */
function chaikin(pts, rounds = 2) {
  let out = pts;
  for (let k = 0; k < rounds; k++) {
    const next = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      next.push(G.lerp(out[i], out[i + 1], 0.25), G.lerp(out[i], out[i + 1], 0.75));
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}

const projectOn = (p, line) => {
  const u = [Math.cos(line.ang), Math.sin(line.ang)];
  return G.add(line.m, G.mul(u, G.dot(G.sub(p, line.m), u)));
};
const lineHits = (l1, l2) => {
  const u1 = [Math.cos(l1.ang), Math.sin(l1.ang)];
  const u2 = [Math.cos(l2.ang), Math.sin(l2.ang)];
  return G.lineIntersection(l1.m, G.add(l1.m, u1), l2.m, G.add(l2.m, u2));
};

/* Contorno chiuso senza angoli: cerchio perfetto se ci somiglia, altrimenti curva levigata. */
function smoothLoop(dense, mode) {
  const fit = fitCircle(dense);
  if (mode !== 'free' && goodArc(fit, 0.06)) {
    const n = Math.max(24, Math.round((2 * Math.PI * fit.r) / 0.25));
    return Array.from({ length: n }, (_, i) => [
      fit.c[0] + fit.r * Math.cos((2 * Math.PI * i) / n),
      fit.c[1] + fit.r * Math.sin((2 * Math.PI * i) / n),
    ]);
  }
  return G.simplifyClosed(G.smoothClosed(dense, mode === 'free' ? 3 : 6), 0.015);
}

/*
 * Lo snap alle stanze vicine sposta solo alcuni vertici: un lato che era orizzontale o verticale
 * resterebbe storto. Si ri-allinea l'altro estremo, tenendo fermo il vertice agganciato.
 */
function squareAfterSnap(before, after) {
  const out = after.map((p) => p.slice());
  const moved = after.map((p, i) => G.dist(p, before[i]) > 1e-6);
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [a, b] = [out[i], out[j]];
    const dx = Math.abs(b[0] - a[0]);
    const dy = Math.abs(b[1] - a[1]);
    const axis = dy < dx * Math.tan(10 * DEG) ? 1 : dx < dy * Math.tan(10 * DEG) ? 0 : -1;
    if (axis < 0 || Math.hypot(dx, dy) < 0.3) continue;
    if (moved[i] && !moved[j]) b[axis] = a[axis];
    else if (moved[j] && !moved[i]) a[axis] = b[axis];
  }
  return out;
}

/*
 * Tratto a mano libera → poligono pulito.
 *   1. si trovano gli angoli veri (dove il tratto svolta bruscamente)
 *   2. tra due angoli: se il tratto si scosta poco da una retta è un lato dritto, raddrizzato e
 *      allineato a 0°/45°/90°; altrimenti è una curva, resa arco perfetto se somiglia a un cerchio
 *   3. gli angoli diventano l'intersezione esatta dei lati adiacenti
 */
export function strokeToPolygon(stroke, shapes, mode = 'auto') {
  if (stroke.length < 6) return { error: 'Tratto troppo corto: disegna il contorno completo della stanza.' };
  const dense = G.smoothClosed(G.resample([...stroke, stroke[0]], STEP).slice(0, -1), 2);
  if (dense.length < 12) return { error: 'Tratto troppo corto: disegna il contorno completo della stanza.' };

  const n = dense.length;
  const corners = findCorners(dense);
  let poly;
  if (corners.length < 2) {
    poly = smoothLoop(dense, mode);
  } else {
    const straightTol = (l) => (mode === 'free' ? Math.max(0.04, 0.02 * l) : Math.max(0.1, 0.06 * l));
    const pieces = corners.map((ci, k) => {
      const cj = corners[(k + 1) % corners.length];
      const seg = [];
      for (let i = ci; ; i = (i + 1) % n) {
        seg.push(dense[i]);
        if (i === cj) break;
      }
      const chord = G.dist(seg[0], seg[seg.length - 1]);
      const line = fitLine(seg);
      if (chord >= 0.3 && line.maxDev <= straightTol(chord)) {
        return { line: true, m: line.m, ang: snapAngle(line.ang, mode), a: seg[0] };
      }
      const fit = mode === 'free' ? null : fitCircle(seg);
      const pts = goodArc(fit, 0.05)
        ? arcPoints(fit, seg[0], seg[seg.length - 1], seg[Math.floor(seg.length / 2)])
        : chaikin(G.simplifyOpen(seg, 0.03));
      return { line: false, pts };
    });

    poly = [];
    pieces.forEach((p, i) => {
      const prev = pieces[(i - 1 + pieces.length) % pieces.length];
      if (p.line) {
        // vertice d'inizio del lato: intersezione col lato precedente, o proiezione dell'angolo
        const hit = prev.line ? lineHits(prev, p) : null;
        poly.push(hit && G.dist(hit, p.a) < 1.0 ? hit : projectOn(p.a, p));
      } else {
        const pts = p.pts.slice(0, -1);
        if (prev.line) pts[0] = projectOn(pts[0], prev);
        poly.push(...pts);
      }
    });
  }

  let out = poly.map((p) => snapVertex(p, shapes));
  if (mode !== 'free') out = squareAfterSnap(poly, out);
  out = G.cleanPolygon(out.map(roundPt));
  if (out.length < 3) return { error: 'Non riesco a ricavare una stanza da questo tratto.' };
  if (!G.isSimplePolygon(out)) return { error: 'Il contorno si incrocia: disegna una forma chiusa senza intrecci.' };
  if (G.polygonArea(out) < MIN_AREA) return { error: 'Stanza troppo piccola (minimo 1,5 m²).' };
  return { poly: out };
}

export function boxToPolygon(a, b) {
  const x0 = Math.min(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]);
  const w = Math.abs(a[0] - b[0]);
  const h = Math.abs(a[1] - b[1]);
  if (w < 1 || h < 1) return { error: 'Stanza troppo piccola: ogni lato deve essere almeno 1 m.' };
  return { poly: G.rectPoly(x0, y0, w, h).map(roundPt) };
}

/* Spostamento con aggancio: il riquadro della forma si allinea agli spigoli delle altre stanze. */
export function snapMove(poly, delta, others) {
  const moved = poly.map(([x, y]) => [x + delta[0], y + delta[1]]);
  const b = G.bounds(moved);
  const { xs, ys } = axisTargets(others);
  // correzione più piccola che porta uno dei due bordi su un allineamento esistente
  const fix = (vals, list) => {
    let best = null;
    for (const v of vals) {
      const c = nearest(v, list, MAGNET);
      if (c !== null && (!best || Math.abs(c - v) < Math.abs(best.d))) best = { d: c - v, line: c };
    }
    return best;
  };
  const fx = fix([b.x, b.x2], xs);
  const fy = fix([b.y, b.y2], ys);
  return {
    poly: moved.map(([x, y]) => roundPt([x + (fx?.d ?? 0), y + (fy?.d ?? 0)])),
    guides: { x: fx?.line ?? null, y: fy?.line ?? null },
  };
}

/* La nuova forma si sovrappone in modo significativo a una esistente? Restituisce quella forma. */
export function findOverlap(poly, shapes) {
  return shapes.find((s) => G.overlapArea(poly, s.poly) > MAX_OVERLAP) || null;
}
