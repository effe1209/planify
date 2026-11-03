/*
 * Scala esterna al giardino: per la casa che comincia al primo piano (o ha un piano rialzato) e si scende in giardino da fuori.
 * Sta nel piano come `plan.extStair = { at: [x, y], out: [ox, oy], w, mode, flip, rise }`:
 *   at    il punto sul muro (faccia esterna) dove sta il centro del pianerottolo davanti alla porta
 *   out   il verso verso l'esterno (vettore unitario orizzontale o verticale)
 *   w     larghezza della rampa (m)
 *   mode  'straight' la rampa prosegue verso l'esterno · 'side' la rampa corre lungo la facciata (poco ingombro verso il giardino)
 *   flip  per 'side': da che parte parte la rampa
 *   rise  dislivello tra il pavimento del piano e il giardino (m)
 * Il pianerottolo sta a quota del pavimento, i gradini scendono fino al giardino. Misure in metri, coordinate della pianta.
 */
export const FLOOR_RISE = 3.0;   // dislivello di un piano (come FLOOR_H in lib/scene3d.js)
export const RISER = 0.18;
export const TREAD = 0.28;
export const LANDING = 1.2;
const EPS = 0.02;

const round = (v) => Math.round(v * 1000) / 1000;

/* Punto di coordinate locali (d verso l'esterno, v lungo la facciata) rispetto al punto d'attacco. */
function frame(es) {
  const [ox, oy] = es.out;
  const ux = -oy;
  const uy = ox;
  return (d, v) => [es.at[0] + ox * d + ux * v, es.at[1] + oy * d + uy * v];
}
const rectOf = (p, q) => ({ x: round(Math.min(p[0], q[0])), y: round(Math.min(p[1], q[1])), w: round(Math.abs(p[0] - q[0])), h: round(Math.abs(p[1] - q[1])) });

/*
 * Geometria: { landing, steps: [{ x, y, w, h, top }], rise, count, bounds }; `top` = quota del gradino sopra il giardino.
 * Il pianerottolo è alla quota `rise`; l'ultimo gradino alza di un'alzata da terra.
 */
export function extStairGeometry(es) {
  const rise = es.rise ?? FLOOR_RISE;
  const W = es.w ?? 1;
  const f = frame(es);
  const n = Math.max(2, Math.round(rise / RISER));
  const R = rise / n;
  const LW = Math.max(W, 1.2);
  const landing = rectOf(f(0, -LW / 2), f(LANDING, LW / 2));
  const steps = [];
  const side = es.flip ? -1 : 1;
  for (let k = 1; k < n; k++) {
    const top = round(rise - k * R);
    if (es.mode === 'side') {
      const v0 = side * (LW / 2 + (k - 1) * TREAD);
      const v1 = side * (LW / 2 + k * TREAD);
      steps.push({ ...rectOf(f(LANDING - W, v0), f(LANDING, v1)), top });
    } else {
      const d0 = LANDING + (k - 1) * TREAD;
      const d1 = LANDING + k * TREAD;
      steps.push({ ...rectOf(f(d0, -W / 2), f(d1, W / 2)), top });
    }
  }
  const all = [landing, ...steps];
  const x0 = Math.min(...all.map((r) => r.x));
  const y0 = Math.min(...all.map((r) => r.y));
  const x1 = Math.max(...all.map((r) => r.x + r.w));
  const y1 = Math.max(...all.map((r) => r.y + r.h));
  const last = steps[steps.length - 1] || landing;
  const arrowFrom = es.mode === 'side' ? f(LANDING - W / 2, side * (LW / 2 + 0.1)) : f(LANDING + 0.1, 0);
  const arrowTo = [last.x + last.w / 2, last.y + last.h / 2];
  return { landing, steps, rise, count: n, bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, arrow: [arrowFrom, arrowTo] };
}

/* Ingombro della scala fuori dalla pianta, in metri (null se non c'è). */
export const extStairBounds = (plan) => (plan?.extStair ? extStairGeometry(plan.extStair).bounds : null);

/* ── scelta del lato ── */

const roomRect = (r) => (r.poly ? r.poly : [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]]);

function inside(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/* Lati esterni dritti della casa che guardano verso `side` (N, S, E, W): [{ a, b, out, line }], dal più esterno. */
export function facadeEdges(plan, side) {
  const out = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[side];
  if (!out) return [];
  const polys = plan.rooms.filter((r) => r.kind !== 'garden').map(roomRect);
  const found = [];
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const horiz = Math.abs(a[1] - b[1]) < 1e-3;
      const vert = Math.abs(a[0] - b[0]) < 1e-3;
      if ((out[1] !== 0 && !horiz) || (out[0] !== 0 && !vert)) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1.4) continue;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const probe = [mid[0] + out[0] * 0.2, mid[1] + out[1] * 0.2];
      const back = [mid[0] - out[0] * 0.2, mid[1] - out[1] * 0.2];
      if (!inside(back, poly) || polys.some((q) => inside(probe, q))) continue;
      found.push({ a, b, out, len, line: out[1] !== 0 ? a[1] : a[0] });
    }
  }
  const key = (e) => (out[1] !== 0 ? e.line * out[1] : e.line * out[0]);
  return found.sort((p, q) => key(q) - key(p) || q.len - p.len);
}

/*
 * Scala esterna sul lato `side`; `t` (0–1) è la posizione lungo il lato più esterno e lungo. Ritorna { plan } oppure { error }.
 * `rise` = dislivello dal giardino (m). La faccia esterna del muro: sulle piante a rettangoli i muri esterni stanno dentro il perimetro,
 * su quelle disegnate a mano sono centrati sulla linea.
 */
export function setExtStair(plan, side, { t = 0.5, w = 1, mode = 'straight', flip = false, rise = FLOOR_RISE } = {}) {
  const e = facadeEdges(plan, side)[0];
  if (!e) return { error: 'Su questo lato non c\'è un muro esterno dritto abbastanza lungo' };
  const half = plan.wallLines?.length ? plan.wallThickness / plan.scale / 2 : 0;
  const along = Math.min(1 - 0.7 / e.len, Math.max(0.7 / e.len, t));
  const p = [e.a[0] + (e.b[0] - e.a[0]) * along, e.a[1] + (e.b[1] - e.a[1]) * along];
  const at = [round(p[0] + e.out[0] * half), round(p[1] + e.out[1] * half)];
  return { plan: { ...plan, extStair: { at, out: e.out, w: Math.min(1.6, Math.max(0.8, w)), mode: mode === 'side' ? 'side' : 'straight', flip: !!flip, rise: Math.min(6, Math.max(0.5, rise)), side, t: round(along) } } };
}

export function removeExtStair(plan) {
  const { extStair: _e, ...rest } = plan;
  return rest;
}

/* Lato su cui sta la scala (per il pannello). */
export const extStairSide = (plan) => plan?.extStair?.side || null;
