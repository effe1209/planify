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

function rdpIndices(pts, lo, hi, eps, out) {
  let idx = -1;
  let maxD = 0;
  for (let i = lo + 1; i < hi; i++) {
    const d = G.closestOnSegment(pts[i], pts[lo], pts[hi]).d;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps) {
    rdpIndices(pts, lo, idx, eps, out);
    out.push(idx);
    rdpIndices(pts, idx, hi, eps, out);
  }
}

/*
 * Il tratto è un lato dritto? Retta ai minimi quadrati sulla parte centrale (gli estremi sono
 * gli angoli, arrotondati dalla mano). Il tremolio resta entro pochi centimetri; un arco no.
 * Restituisce la retta {a, b} (estremi proiettati) oppure null.
 * `betweenCorners`: il tratto è chiuso da due angoli netti, quindi è quasi certamente un lato.
 */
function fitStraight(seg, betweenCorners) {
  const a0 = seg[0];
  const b0 = seg[seg.length - 1];
  const l = G.dist(a0, b0);
  if (l < 0.6) return null;
  const lo = Math.floor(seg.length * 0.12);
  const core = seg.slice(lo, Math.max(Math.ceil(seg.length * 0.88), lo + 2));
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
  const u = [Math.cos(ang), Math.sin(ang)];
  const n = G.normal(u);
  // parabola r = c0 + c1·t + c2·t² nelle coordinate della retta: c2 misura la curvatura sistematica
  const S = [0, 0, 0, 0, 0];
  const R = [0, 0, 0];
  let maxRes = 0;
  for (const p of core) {
    const v = G.sub(p, m);
    const t = G.dot(v, u);
    const r = G.dot(v, n);
    maxRes = Math.max(maxRes, Math.abs(r));
    for (let k = 0; k < 5; k++) S[k] += t ** k;
    for (let k = 0; k < 3; k++) R[k] += r * t ** k;
  }
  const det3 = (a) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
    - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const M = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
  const D = det3(M);
  const c2 = Math.abs(D) > 1e-12 ? det3(M.map((row, i) => [row[0], row[1], R[i]])) / D : 0;
  const sag = Math.abs(c2) * (l / 2) ** 2;
  // tra due spigoli vivi un lato può essere un po' incurvato dalla mano; dentro un arco no
  const tol = betweenCorners ? Math.max(0.1, 0.05 * l) : Math.max(0.03, 0.02 * l);
  if (sag > tol || maxRes > tol + 0.03) return null;
  const proj = (p) => G.add(m, G.mul(u, G.dot(G.sub(p, m), u)));
  return { a: proj(a0), b: proj(b0) };
}

/*
 * Tratto a mano libera → poligono che rispetta la forma disegnata.
 * I tratti quasi dritti diventano lati netti (e, se quasi orizzontali/verticali, perfettamente
 * allineati); le curve restano curve, solo ripulite dal tremolio della mano.
 */
export function strokeToPolygon(stroke, shapes) {
  if (stroke.length < 6) return { error: 'Tratto troppo corto: disegna il contorno completo della stanza.' };
  const closed = [...stroke, stroke[0]];
  let dense = G.smoothClosed(G.resample(closed, 0.08).slice(0, -1), 2);
  if (dense.length < 8) return { error: 'Tratto troppo corto: disegna il contorno completo della stanza.' };

  // vertici "di forma" (angoli) e, tra un angolo e l'altro, tratto dritto o curva
  let far = 0;
  dense.forEach((p, i) => {
    if (G.dist(p, dense[0]) > G.dist(dense[far], dense[0])) far = i;
  });
  dense = [...dense, dense[0]];
  const idx = [0];
  rdpIndices(dense, 0, far, 0.15, idx);
  idx.push(far);
  rdpIndices(dense, far, dense.length - 1, 0.15, idx);
  idx.push(dense.length - 1);

  const segs = idx.slice(0, -1).map((i, k) => dense.slice(i, idx[k + 1] + 1));
  const dirs = segs.map((sg) => G.unit(G.sub(sg[sg.length - 1], sg[0])));
  const sharp = (k) => G.dot(dirs[(k - 1 + segs.length) % segs.length], dirs[k]) < Math.cos((35 * Math.PI) / 180);
  const pieces = [];
  for (let k = 0; k < segs.length; k++) {
    const seg = segs[k];
    const line = fitStraight(seg, sharp(k) && sharp((k + 1) % segs.length));
    pieces.push(line ? { line: true, ...line } : { line: false, pts: G.simplifyOpen(seg, 0.012) });
  }
  // una curva cortissima tra due lati dritti è uno spigolo arrotondato dalla mano: diventa un angolo vivo
  const kept = pieces.filter((p, i) => {
    if (p.line) return true;
    const prev = pieces[(i - 1 + pieces.length) % pieces.length];
    const next = pieces[(i + 1) % pieces.length];
    return !(prev.line && next.line && G.dist(p.pts[0], p.pts[p.pts.length - 1]) < 0.5);
  });
  const poly = [];
  kept.forEach((p, i) => {
    const prev = kept[(i - 1 + kept.length) % kept.length];
    if (!p.line) {
      poly.push(...p.pts.slice(0, -1));
      return;
    }
    const corner = prev.line && prev !== p ? G.lineIntersection(prev.a, prev.b, p.a, p.b) : null;
    poly.push(corner && G.dist(corner, p.a) < 0.6 ? corner : p.a);
  });

  let out = G.straightenAxisEdges(poly, 8).map((p) => snapVertex(p, shapes)).map(roundPt);
  out = G.cleanPolygon(out);
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
