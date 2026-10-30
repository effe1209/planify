/*
 * Gradini delle scale per il 3D: stessa geometria del disegno in pianta (PlanSvg: EngineStair per le scale del
 * motore, Stair per quelle del progetto), alzate uguali che salgono di `height` (da pavimento a pavimento).
 * stairSteps(st, height) → [{ x0, x1, z0, z1, top }]: scatole piene dalla quota del piano fino a `top` (in metri),
 * in coordinate della pianta (x, z = y della pianta).
 */
import { L_LEG, LANDING, STRAIGHT_RUN, TREAD, U_RUN } from './stairs';

const AXIS = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] };

/* Locale (lx lungo la rampa, ly attraverso) → pianta, per le scale del motore e per quelle del progetto. */
function frame(st) {
  if (st.entry) {
    const ox = st.entry === 'E' || st.hand === 'E' ? st.x + st.w : st.x;
    const oy = st.entry === 'S' || st.hand === 'S' ? st.y + st.h : st.y;
    const [dx, dy] = AXIS[st.entry];
    const [ax, ay] = AXIS[st.hand];
    return (lx, ly) => [ox + dx * lx + ax * ly, oy + dy * lx + ay * ly];
  }
  return {
    E: (lx, ly) => [st.x + lx, st.y + ly],
    W: (lx, ly) => [st.x + st.w - lx, st.y + st.h - ly],
    S: (lx, ly) => [st.x + st.w - ly, st.y + lx],
    N: (lx, ly) => [st.x + ly, st.y + st.h - lx],
  }[st.up || 'E'];
}

export function stairSteps(st, height) {
  const at = frame(st);
  const out = [];
  let r = 0;   // alzata
  const box = (l0, l1, y0, y1, top) => {
    const [xa, za] = at(l0, y0);
    const [xb, zb] = at(l1, y1);
    out.push({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Math.min(za, zb), z1: Math.max(za, zb), top });
  };
  if (st.entry) {
    const ns = st.entry === 'N' || st.entry === 'S';
    const D = ns ? st.h : st.w;
    const A = ns ? st.w : st.h;
    const fw = Math.min(1.0, A / 2);
    if (st.type === 'u') {
      const gap = 0.1;
      const half = (A - gap) / 2;
      const x0 = Math.max(0, D - U_RUN);
      const fEnd = D - LANDING;
      const n = Math.floor((fEnd - x0) / TREAD + 1e-6);
      r = height / (2 * n + 2);
      for (let k = 1; k <= n; k++) box(x0 + (k - 1) * TREAD, x0 + k * TREAD, 0, half, k * r);
      box(fEnd, D, 0, A, (n + 1) * r);
      for (let k = 1; k <= n; k++) box(fEnd - k * TREAD, fEnd - (k - 1) * TREAD, half + gap, A, (n + 1 + k) * r);
    } else if (st.type === 'l') {
      const fEnd = D - fw;
      const x0 = Math.max(0, fEnd - L_LEG);
      const n1 = Math.floor(Math.min(L_LEG, fEnd) / TREAD + 1e-6);
      const n2 = Math.floor((A - fw) / TREAD + 1e-6);
      r = height / (n1 + n2 + 2);
      for (let k = 1; k <= n1; k++) box(x0 + (k - 1) * TREAD, x0 + k * TREAD, 0, fw, k * r);
      box(fEnd, D, 0, fw, (n1 + 1) * r);
      for (let k = 1; k <= n2; k++) box(fEnd, D, fw + (k - 1) * TREAD, fw + k * TREAD, (n1 + 1 + k) * r);
    } else {
      const len = Math.min(STRAIGHT_RUN, D);
      const x0 = Math.max(0, Math.min(0.3, D - len));
      const n = Math.max(1, Math.floor(len / TREAD + 1e-6));
      r = height / n;
      for (let k = 1; k <= n; k++) box(x0 + (k - 1) * TREAD, x0 + k * TREAD, 0, fw, k * r);
    }
    return out;
  }
  // scala del progetto: rampa unica o a U, salendo verso `up`
  const horiz = st.up === 'E' || st.up === 'W';
  const run = horiz ? st.w : st.h;
  const wid = horiz ? st.h : st.w;
  if (st.type === 'u') {
    const gap = 0.1;
    const half = (wid - gap) / 2;
    const flight = run - LANDING;
    const n = Math.floor(flight / TREAD + 1e-6);
    r = height / (2 * n + 2);
    for (let k = 1; k <= n; k++) box((k - 1) * TREAD, k * TREAD, 0, half, k * r);
    box(flight, run, 0, wid, (n + 1) * r);
    for (let k = 1; k <= n; k++) box(flight - k * TREAD, flight - (k - 1) * TREAD, half + gap, wid, (n + 1 + k) * r);
  } else {
    const n = Math.max(1, Math.floor(run / TREAD + 1e-6));
    r = height / n;
    for (let k = 1; k <= n; k++) box((k - 1) * TREAD, k * TREAD, 0, wid, k * r);
  }
  return out;
}

/*
 * Apertura da lasciare nel solaio e nel pavimento del piano di sopra: l'ingombro dei gradini che stanno sotto il
 * piano (l'ultimo gradino è a filo del pavimento di sopra e fa da pavimento). Il resto del vano, cioè lo spazio
 * di arrivo e il passaggio accanto alla rampa, resta con il pavimento: da lì si esce dalla scala.
 * Ritorna rettangoli [{ x, y, w, h }] in coordinate della pianta.
 */
export function stairHoles(st, height) {
  const steps = stairSteps(st, height).filter((b) => b.top < height - 1e-3);
  if (!steps.length) return [];
  const rect = (list) => ({
    x: Math.min(...list.map((b) => b.x0)), y: Math.min(...list.map((b) => b.z0)),
    w: Math.max(...list.map((b) => b.x1)) - Math.min(...list.map((b) => b.x0)),
    h: Math.max(...list.map((b) => b.z1)) - Math.min(...list.map((b) => b.z0)),
  });
  if (st.entry && st.type === 'l') {
    // due bracci: il primo e (pianerottolo + secondo), separati dal passaggio accanto alla rampa
    const ns = st.entry === 'N' || st.entry === 'S';
    const D = ns ? st.h : st.w;
    const fw = Math.min(1.0, (ns ? st.w : st.h) / 2);
    const leg1 = steps.filter((b) => {
      const along = ns ? (st.entry === 'N' ? b.z0 - st.y : st.y + st.h - b.z1) : (st.entry === 'W' ? b.x0 - st.x : st.x + st.w - b.x1);
      return along + 1e-6 < D - fw;
    });
    const rest = steps.filter((b) => !leg1.includes(b));
    return [leg1, rest].filter((l) => l.length).map(rect);
  }
  return [rect(steps)];
}
