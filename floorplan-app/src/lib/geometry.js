/*
 * Geometria 2D per poligoni. Punti come [x, y] in metri, y verso il basso.
 * Usata dallo schizzo (snap, forme libere) e dal convertitore schizzo → planimetria.
 */

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const mul = (a, k) => [a[0] * k, a[1] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
export const len = (a) => Math.hypot(a[0], a[1]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const unit = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
/* Normale "a sinistra" del verso a→b nelle coordinate SVG: coincide con l'asse +y locale di rotate(θ). */
export const normal = (u) => [-u[1], u[0]];

export function signedArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) s += cross(poly[i], poly[(i + 1) % poly.length]);
  return s / 2;
}
export const polygonArea = (poly) => Math.abs(signedArea(poly));

export function bounds(pts) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, x2: x1, y2: y1 };
}

export const edges = (poly) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);

export function pointInPolygon([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function closestOnSegment(p, a, b) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
  const q = lerp(a, b, t);
  return { pt: q, t, d: dist(p, q) };
}

export function distToPolygon(p, poly) {
  let best = Infinity;
  for (const [a, b] of edges(poly)) best = Math.min(best, closestOnSegment(p, a, b).d);
  return best;
}

/* Distanza lungo il raggio (origin + t·dir, t>0) fino al primo lato del poligono. */
export function rayHit(origin, dir, poly) {
  let best = Infinity;
  for (const [a, b] of edges(poly)) {
    const e = sub(b, a);
    const den = cross(dir, e);
    if (Math.abs(den) < 1e-12) continue;
    const ao = sub(a, origin);
    const t = cross(ao, e) / den;
    const s = cross(ao, dir) / den;
    if (t > 1e-9 && s >= -1e-9 && s <= 1 + 1e-9 && t < best) best = t;
  }
  return best;
}

/* Il segmento a→b attraversa l'interno (aperto) del rettangolo? (Liang–Barsky) */
export function segmentHitsRect(a, b, r) {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const checks = [
    [-dx, a[0] - r.x],
    [dx, r.x + r.w - a[0]],
    [-dy, a[1] - r.y],
    [dy, r.y + r.h - a[1]],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-12) {
      if (q <= 0) return false;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t1 - t0 > 1e-9;
}

/* Intersezione delle rette a1→a2 e b1→b2 (null se quasi parallele, sotto ~10°). */
export function lineIntersection(a1, a2, b1, b2) {
  const r = sub(a2, a1);
  const q = sub(b2, b1);
  const den = cross(r, q);
  if (Math.abs(den) < Math.sin(Math.PI / 18) * len(r) * len(q)) return null;
  return add(a1, mul(r, cross(sub(b1, a1), q) / den));
}

export const expandRect = (r, d) => ({ x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d });
export const rectCorners = (r) => [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
export const rectCenter = (r) => [r.x + r.w / 2, r.y + r.h / 2];
export const rectsOverlap = (a, b, gap = 0) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

export function rectHitsCircle(r, c, radius) {
  const nx = Math.max(r.x, Math.min(c[0], r.x + r.w));
  const ny = Math.max(r.y, Math.min(c[1], r.y + r.h));
  return Math.hypot(c[0] - nx, c[1] - ny) < radius;
}

/* Il rettangolo, allargato di `pad`, sta tutto dentro il poligono (anche se concavo)? */
export function rectInPolygon(r, poly, pad = 0) {
  const big = expandRect(r, pad);
  if (!rectCorners(big).every((c) => pointInPolygon(c, poly))) return false;
  const core = expandRect(big, -0.004);
  for (const [a, b] of edges(poly)) if (segmentHitsRect(a, b, core)) return false;
  return true;
}

/*
 * Parte del lato a→b che si sovrappone (collineare) al lato c→d: [t0, t1] sul parametro di a→b,
 * oppure null. `tol` = distanza massima dalla retta per considerarli lo stesso muro.
 */
export function collinearOverlap(a, b, c, d, tol = 0.03) {
  const ab = sub(b, a);
  const l = len(ab);
  if (l < 1e-9) return null;
  const u = mul(ab, 1 / l);
  const n = normal(u);
  if (Math.abs(dot(sub(c, a), n)) > tol || Math.abs(dot(sub(d, a), n)) > tol) return null;
  const tc = dot(sub(c, a), u) / l;
  const td = dot(sub(d, a), u) / l;
  const t0 = Math.max(0, Math.min(tc, td));
  const t1 = Math.min(1, Math.max(tc, td));
  return (t1 - t0) * l > 0.05 ? [t0, t1] : null;
}

/* Sottrae da [0,1] l'unione degli intervalli dati. */
export function complementIntervals(intervals) {
  const sorted = [...intervals].sort((p, q) => p[0] - q[0]);
  const out = [];
  let cur = 0;
  for (const [a, b] of sorted) {
    if (a > cur + 1e-6) out.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < 1 - 1e-6) out.push([cur, 1]);
  return out;
}

/* ── Elaborazione del tratto a mano libera ─────────────────────────────── */

/* Ricampiona una polilinea a passo costante. */
export function resample(pts, step) {
  if (pts.length < 2) return pts.slice();
  const out = [pts[0]];
  let acc = 0; // distanza percorsa dall'ultimo punto emesso
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = dist(a, b);
    let start = 0;
    while (acc + (l - start) >= step) {
      start += step - acc;
      out.push(lerp(a, b, start / l));
      acc = 0;
    }
    acc += l - start;
  }
  return out;
}

/* Media mobile circolare: toglie il tremolio della mano senza cambiare la forma. */
export function smoothClosed(pts, k = 2) {
  const n = pts.length;
  if (n < 2 * k + 1) return pts.slice();
  return pts.map((_, i) => {
    let sx = 0;
    let sy = 0;
    for (let j = -k; j <= k; j++) {
      const p = pts[(i + j + n) % n];
      sx += p[0];
      sy += p[1];
    }
    return [sx / (2 * k + 1), sy / (2 * k + 1)];
  });
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  let idx = -1;
  let maxD = 0;
  const a = pts[0];
  const b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = closestOnSegment(pts[i], a, b).d;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}

export const simplifyOpen = rdp;

/* Corde più lunghe possibili lungo una polilinea, con scarto massimo `tol` dalla curva. */
export function greedyChords(pts, tol) {
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = i + 1;
    while (j + 1 < pts.length) {
      const a = pts[i];
      const b = pts[j + 1];
      let ok = true;
      for (let k = i + 1; k <= j && ok; k++) ok = closestOnSegment(pts[k], a, b).d <= tol;
      if (!ok) break;
      j++;
    }
    out.push(pts[j]);
    i = j;
  }
  return out;
}

/* Ramer–Douglas–Peucker su poligono chiuso: parte dal punto più lontano dal primo per non tagliare angoli. */
export function simplifyClosed(pts, eps) {
  if (pts.length < 4) return pts.slice();
  let far = 0;
  let farD = -1;
  pts.forEach((p, i) => {
    const d = dist(p, pts[0]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  });
  const first = rdp(pts.slice(0, far + 1), eps);
  const second = rdp([...pts.slice(far), pts[0]], eps);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

/*
 * Raddrizza i lati quasi orizzontali/verticali (entro `tolDeg`): un quadrato fatto a mano
 * diventa un quadrato pulito, mentre archi e diagonali restano come disegnati.
 */
export function straightenAxisEdges(poly, tolDeg = 9) {
  const out = poly.map((p) => p.slice());
  const tol = Math.tan((tolDeg * Math.PI) / 180);
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const a = out[i];
    const b = out[(i + 1) % n];
    const dx = Math.abs(b[0] - a[0]);
    const dy = Math.abs(b[1] - a[1]);
    if (dx > 0.3 && dy / dx < tol) {
      const y = (a[1] + b[1]) / 2;
      a[1] = y;
      b[1] = y;
    } else if (dy > 0.3 && dx / dy < tol) {
      const x = (a[0] + b[0]) / 2;
      a[0] = x;
      b[0] = x;
    }
  }
  return out;
}

/* Toglie vertici doppi o allineati (lati collineari consecutivi). */
export function cleanPolygon(poly, minEdge = 0.05) {
  let pts = poly.filter((p, i) => dist(p, poly[(i + 1) % poly.length]) > minEdge);
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[(i - 1 + pts.length) % pts.length];
      const q = pts[i];
      const r = pts[(i + 1) % pts.length];
      if (Math.abs(cross(sub(q, p), sub(r, q))) < 1e-4 && dot(sub(q, p), sub(r, q)) > 0) {
        pts = pts.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

/* Un poligono il cui lato non si incrocia con altri lati (non adiacenti). */
export function isSimplePolygon(poly) {
  const es = edges(poly);
  for (let i = 0; i < es.length; i++) {
    for (let j = i + 1; j < es.length; j++) {
      if (j === i + 1 || (i === 0 && j === es.length - 1)) continue;
      const [a, b] = es[i];
      const [c, d] = es[j];
      const d1 = cross(sub(b, a), sub(c, a));
      const d2 = cross(sub(b, a), sub(d, a));
      const d3 = cross(sub(d, c), sub(a, c));
      const d4 = cross(sub(d, c), sub(b, c));
      if (d1 * d2 < 0 && d3 * d4 < 0) return false;
    }
  }
  return true;
}

/* Punto interno più lontano dai lati (per l'etichetta): funziona anche su forme a U o a ferro di cavallo. */
export function labelPoint(poly) {
  const b = bounds(poly);
  let best = [b.x + b.w / 2, b.y + b.h / 2];
  let bestD = -1;
  const N = 24;
  for (let i = 1; i < N; i++) {
    for (let j = 1; j < N; j++) {
      const p = [b.x + (b.w * i) / N, b.y + (b.h * j) / N];
      if (!pointInPolygon(p, poly)) continue;
      // leggera preferenza per il centro, così nei rettangoli l'etichetta resta centrata
      const d = distToPolygon(p, poly) - 0.02 * dist(p, [b.x + b.w / 2, b.y + b.h / 2]);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}

/* Area di sovrapposizione stimata a campionamento (sufficiente per validare lo schizzo). */
export function overlapArea(pa, pb, step = 0.1) {
  const ba = bounds(pa);
  const bb = bounds(pb);
  const x0 = Math.max(ba.x, bb.x);
  const y0 = Math.max(ba.y, bb.y);
  const x1 = Math.min(ba.x2, bb.x2);
  const y1 = Math.min(ba.y2, bb.y2);
  if (x1 <= x0 || y1 <= y0) return 0;
  let n = 0;
  for (let x = x0 + step / 2; x < x1; x += step) {
    for (let y = y0 + step / 2; y < y1; y += step) {
      if (pointInPolygon([x, y], pa) && pointInPolygon([x, y], pb)) n++;
    }
  }
  return n * step * step;
}

export const rectPoly = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

export const polyPath = (poly, s = 1) =>
  `M${poly.map(([x, y]) => `${(x * s).toFixed(2)} ${(y * s).toFixed(2)}`).join('L')}Z`;

/* Un poligono a 4 vertici con lati assiali è un rettangolo. */
export function isAxisRect(poly) {
  if (poly.length !== 4) return false;
  return edges(poly).every(([a, b]) => Math.abs(a[0] - b[0]) < 1e-6 || Math.abs(a[1] - b[1]) < 1e-6);
}
