/*
 * Tetto: la sagoma dell'edificio si scompone in «ali» rettangolari (la L ha due ali, la U tre) e ogni ala ha il suo
 * tetto: a due falde con il colmo lungo il lato maggiore, oppure piano (terrazzo). Il padiglione su forme
 * irregolari non c'è: ogni ala è un tetto a sé.
 */
export const ROOF_TYPES = [
  { id: 'gable', label: 'Due falde' },
  { id: 'flat', label: 'Piano' },
];
export const ROOF_DEFAULTS = { type: 'gable', slope: 25, overhang: 0.4 };

const STEP = 0.05;
const snap = (v) => Math.round(v / STEP) * STEP;

/* Rettangolo dei locali che fanno parte dell'edificio (niente giardino, anche i locali di forma libera). */
function footprint(plan) {
  return plan.rooms.filter((r) => r.kind !== 'garden').map((r) => {
    if (!r.poly) return { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h };
    const xs = r.poly.map((p) => p[0]);
    const ys = r.poly.map((p) => p[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  });
}

/* Ali rettangolari che coprono l'edificio senza sovrapporsi: [{ x0, y0, x1, y1 }]. */
export function roofWings(plan) {
  const rects = footprint(plan);
  if (!rects.length) return [];
  const xs = [...new Set(rects.flatMap((r) => [snap(r.x0), snap(r.x1)]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap((r) => [snap(r.y0), snap(r.y1)]))].sort((a, b) => a - b);
  const filled = (i, j) => {
    const cx = (xs[i] + xs[i + 1]) / 2;
    const cy = (ys[j] + ys[j + 1]) / 2;
    return rects.some((r) => cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1);
  };
  // per ogni fascia orizzontale i tratti occupati; fasce consecutive con lo stesso tratto si uniscono
  const open = new Map();
  const out = [];
  for (let j = 0; j < ys.length - 1; j++) {
    const runs = [];
    for (let i = 0; i < xs.length - 1; i++) {
      if (!filled(i, j)) continue;
      const last = runs[runs.length - 1];
      if (last && last[1] === i) last[1] = i + 1;
      else runs.push([i, i + 1]);
    }
    const next = new Map();
    for (const [a, b] of runs) {
      const key = `${a}-${b}`;
      const w = open.get(key);
      if (w) { w.y1 = ys[j + 1]; next.set(key, w); } else {
        const nw = { x0: xs[a], y0: ys[j], x1: xs[b], y1: ys[j + 1] };
        out.push(nw);
        next.set(key, nw);
      }
    }
    open.clear();
    next.forEach((v, k) => open.set(k, v));
  }
  return out.filter((w) => w.x1 - w.x0 > 0.3 && w.y1 - w.y0 > 0.3);
}

/*
 * Falde di un'ala a due falde, come triangoli [x, y(quota), z] relativi alla quota delle gronde.
 * Ritorna { tris: [[a, b, c]], ridge } con il colmo alto (lato minore / 2 + sporto) · tan(pendenza).
 */
export function gableTriangles(w, { slope = 25, overhang = 0.4 } = {}) {
  const alongX = w.x1 - w.x0 >= w.y1 - w.y0;
  const o = overhang;
  const e = Math.min(o, 0.25);   // sporto sui lati dei timpani
  const half = (alongX ? w.y1 - w.y0 : w.x1 - w.x0) / 2;
  const rise = Math.tan((slope * Math.PI) / 180);
  const drop = o * rise;          // lo sporto scende sotto la gronda
  const ridge = half * rise;
  let t;
  if (alongX) {
    const a0 = w.x0 - e, a1 = w.x1 + e, z0 = w.y0 - o, z1 = w.y1 + o, zm = (w.y0 + w.y1) / 2;
    t = [
      [[a0, -drop, z0], [a1, -drop, z0], [a1, ridge, zm]], [[a0, -drop, z0], [a1, ridge, zm], [a0, ridge, zm]],
      [[a0, -drop, z1], [a1, ridge, zm], [a1, -drop, z1]], [[a0, -drop, z1], [a0, ridge, zm], [a1, ridge, zm]],
      [[w.x0, 0, w.y0], [w.x0, 0, w.y1], [w.x0, ridge, zm]], [[w.x1, 0, w.y0], [w.x1, ridge, zm], [w.x1, 0, w.y1]],
    ];
  } else {
    const a0 = w.y0 - e, a1 = w.y1 + e, x0 = w.x0 - o, x1 = w.x1 + o, xm = (w.x0 + w.x1) / 2;
    t = [
      [[x0, -drop, a0], [xm, ridge, a0], [xm, ridge, a1]], [[x0, -drop, a0], [xm, ridge, a1], [x0, -drop, a1]],
      [[x1, -drop, a0], [xm, ridge, a1], [xm, ridge, a0]], [[x1, -drop, a0], [x1, -drop, a1], [xm, ridge, a1]],
      [[w.x0, 0, w.y0], [xm, ridge, w.y0], [w.x1, 0, w.y0]], [[w.x0, 0, w.y1], [w.x1, 0, w.y1], [xm, ridge, w.y1]],
    ];
  }
  return { tris: t, ridge };
}
