/*
 * Spostare e ruotare gli arredi a mano: aggancio alla griglia e ai muri, controllo di sovrapposizioni,
 * porte bloccate e arredi fuori dal locale. Tutto in metri, come plan.furniture.
 */
import { pointInPolygon } from './geometry';
import { opening } from './ajax';

export const GRID = 0.05;        // passo di spostamento e aggancio
const WALL_SNAP = 0.15;          // entro 15 cm dal muro l'arredo si appoggia al muro
const GROUND = new Set(['path', 'ramp', 'hedge', 'fence', 'rug']);   // elementi del giardino a terra: non contano come ostacoli

const round = (v) => Math.round(v / GRID) * GRID;
const contains = (r, x, y) =>
  r.poly ? pointInPolygon([x, y], r.poly) : x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
export const roomAtPoint = (plan, x, y) => plan.rooms.find((r) => contains(r, x, y)) || null;

/* Il filo interno dei muri di un locale (rettangolo): metà muro sui lati interni, il muro intero sul perimetro. */
function innerBox(plan, r) {
  const t = plan.wallThickness / plan.scale;
  const { width: W, length: L } = plan.dimensions;
  const edge = (v, max) => v < 1e-3 || Math.abs(v - max) < 1e-3;
  return {
    x0: r.x + (edge(r.x, W) ? t : t / 2),
    y0: r.y + (edge(r.y, L) ? t : t / 2),
    x1: r.x + r.w - (edge(r.x + r.w, W) ? t : t / 2),
    y1: r.y + r.h - (edge(r.y + r.h, L) ? t : t / 2),
  };
}

/*
 * Rotazione libera: `rot` in gradi (senso orario visto dall'alto) sopra il verso (`facing`), attorno al centro dell'arredo.
 * Per collisioni, aggancio e limiti del locale conta l'ingombro del rettangolo ruotato (il più piccolo rettangolo dritto che lo contiene).
 */
export const normAngle = (deg) => ((Math.round(deg * 10) / 10 % 360) + 360) % 360;
export function itemBox(it) {
  if (!it.rot) return { x: it.x, y: it.y, w: it.w, h: it.h };
  const a = (it.rot * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const w = it.w * c + it.h * s;
  const h = it.w * s + it.h * c;
  return { x: it.x + it.w / 2 - w / 2, y: it.y + it.h / 2 - h / 2, w, h };
}
/* Arredo con la rotazione libera impostata (0 = nessuna: il campo sparisce). */
export function setItemRot(it, deg) {
  const r = normAngle(deg);
  const next = { ...it, rot: r };
  if (!r) delete next.rot;
  return next;
}
export const rotateItemBy = (it, delta) => setItemRot(it, (it.rot || 0) + delta);

/* Posizione agganciata per un arredo spostato in (x, y): griglia di 5 cm e muri vicini. */
/* Il soppalco: l'arredo in quota si aggancia ai suoi bordi (muri sui lati chiusi) e resta del locale sotto cui è nato. */
function mezzBox(plan) {
  const m = plan.mezzanine;
  const t = plan.wallThickness / plan.scale;
  const { width: W, length: L } = plan.dimensions;
  const edge = (v, max) => v < 1e-3 || Math.abs(v - max) < 1e-3;
  return {
    x0: m.x + (edge(m.x, W) ? t : 0.05), y0: m.y + (edge(m.y, L) ? t : 0.05),
    x1: m.x + m.w - (edge(m.x + m.w, W) ? t : 0.05), y1: m.y + m.h - (edge(m.y + m.h, L) ? t : 0.05),
  };
}

export function snapItem(plan, item, x, y) {
  let nx = round(x);
  let ny = round(y);
  // l'ingombro (ruotato) si appoggia ai muri: dx, dy = scarto del suo bordo sinistro/alto rispetto al rettangolo dell'arredo
  const bb = itemBox(item);
  const dx = bb.x - item.x;
  const dy = bb.y - item.y;
  if (item.elev && plan.mezzanine) {
    const b = mezzBox(plan);
    nx = Math.max(b.x0 - dx, Math.min(b.x1 - bb.w - dx, nx));
    ny = Math.max(b.y0 - dy, Math.min(b.y1 - bb.h - dy, ny));
    if (Math.abs(nx + dx - b.x0) < WALL_SNAP) nx = b.x0 - dx;
    else if (Math.abs(nx + dx + bb.w - b.x1) < WALL_SNAP) nx = b.x1 - bb.w - dx;
    if (Math.abs(ny + dy - b.y0) < WALL_SNAP) ny = b.y0 - dy;
    else if (Math.abs(ny + dy + bb.h - b.y1) < WALL_SNAP) ny = b.y1 - bb.h - dy;
    return { x: +nx.toFixed(3), y: +ny.toFixed(3), room: item.room };
  }
  const room = roomAtPoint(plan, nx + item.w / 2, ny + item.h / 2);
  if (room && room.kind !== 'garden') {
    const b = innerBox(plan, room);
    if (Math.abs(nx + dx - b.x0) < WALL_SNAP) nx = b.x0 - dx;
    else if (Math.abs(nx + dx + bb.w - b.x1) < WALL_SNAP) nx = b.x1 - bb.w - dx;
    if (Math.abs(ny + dy - b.y0) < WALL_SNAP) ny = b.y0 - dy;
    else if (Math.abs(ny + dy + bb.h - b.y1) < WALL_SNAP) ny = b.y1 - bb.h - dy;
  }
  return { x: +nx.toFixed(3), y: +ny.toFixed(3), room: room?.id ?? item.room };
}

/*
 * Arredo con nuove misure (m): resta centrato dov'è, dentro 0,1–6 m e dentro il locale (a filo muro se sporge).
 * `lock` mantiene le proporzioni: si passa solo il lato che cambia (w o h) e l'altro lo segue.
 */
export const SIZE_MIN = 0.1;
export const SIZE_MAX = 6;
export function resizeItem(plan, item, { w, h }, lock = false) {
  const ratio = item.w / item.h;
  let nw = w ?? item.w;
  let nh = h ?? item.h;
  if (lock) {
    if (w != null) nh = nw / ratio;
    else nw = nh * ratio;
  }
  const clamp = (v) => Math.min(SIZE_MAX, Math.max(SIZE_MIN, round2(v)));
  nw = clamp(nw);
  nh = clamp(nh);
  let x = item.x + item.w / 2 - nw / 2;
  let y = item.y + item.h / 2 - nh / 2;
  const room = plan.rooms.find((r) => r.id === item.room);
  if (room && room.kind !== 'garden' && !room.poly && !item.elev) {
    const b = innerBox(plan, room);
    nw = Math.min(nw, b.x1 - b.x0);
    nh = Math.min(nh, b.y1 - b.y0);
    x = Math.max(b.x0, Math.min(b.x1 - nw, x));
    y = Math.max(b.y0, Math.min(b.y1 - nh, y));
  }
  const next = { ...item, w: +nw.toFixed(3), h: +nh.toFixed(3), x: +x.toFixed(3), y: +y.toFixed(3) };
  if (item.wallMounted) next.mountSize = item.facing === 'E' || item.facing === 'W' ? { w: next.h, h: next.w } : { w: next.w, h: next.h };
  return next;
}
const round2 = (v) => Math.round(v * 100) / 100;

/* Arredo ruotato di 90°: larghezza e profondità si scambiano attorno al centro, il fronte gira in senso orario. */
const NEXT = { S: 'W', W: 'N', N: 'E', E: 'S' };
export function rotateItem(item) {
  const cx = item.x + item.w / 2;
  const cy = item.y + item.h / 2;
  return { ...item, w: item.h, h: item.w, x: +(cx - item.h / 2).toFixed(3), y: +(cy - item.w / 2).toFixed(3),
    facing: NEXT[item.facing || 'S'] || 'S' };
}

const overlap = (a0, b0) => {
  const a = itemBox(a0);
  const b = itemBox(b0);
  return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.02 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.02;
};

/* Cosa non va nella posizione dell'arredo `index` (eventualmente spostato in `it`): elenco di frasi. */
export function itemProblems(plan, index, it0 = plan.furniture[index]) {
  if (!it0 || GROUND.has(it0.type) || it0.decor || it0.wallMounted) return [];
  const it = { ...it0, ...itemBox(it0), rot: 0 };   // x, y, w, h = ingombro (già ruotato); `overlap` ricalcola quello degli altri
  const out = [];
  if (it.elev && plan.mezzanine) {
    const b = mezzBox(plan);
    const st = plan.mezzanine.stair;
    if (it.x < b.x0 - 0.02 || it.y < b.y0 - 0.02 || it.x + it.w > b.x1 + 0.02 || it.y + it.h > b.y1 + 0.02) out.push('Esce dal soppalco');
    const same = plan.furniture.filter((o, i) => i !== index && !o.decor && !o.wallMounted && o.elev && overlap(it, o));
    if (same.length) out.push(`Si sovrappone a ${same.length === 1 ? 'un altro arredo' : `${same.length} arredi`}`);
    // l'arrivo della rampa deve restare libero
    const land = { E: { x: st.x + st.w, y: st.y, w: 0.9, h: st.h }, W: { x: st.x - 0.9, y: st.y, w: 0.9, h: st.h },
      S: { x: st.x, y: st.y + st.h, w: st.w, h: 0.9 }, N: { x: st.x, y: st.y - 0.9, w: st.w, h: 0.9 } }[st.up || 'E'];
    if (overlap(it, st) || overlap(it, land)) out.push('Blocca la scala del soppalco');
    return out;
  }
  const room = plan.rooms.find((r) => r.id === it.room) || roomAtPoint(plan, it.x + it.w / 2, it.y + it.h / 2);
  if (room && room.kind !== 'garden') {
    const b = innerBox(plan, room);
    if (!room.poly && (it.x < b.x0 - 0.02 || it.y < b.y0 - 0.02 || it.x + it.w > b.x1 + 0.02 || it.y + it.h > b.y1 + 0.02)) {
      out.push(`Esce da ${room.name || 'il locale'}`);
    }
  }
  // la TV (a parete o su mobile) non sta davanti a una finestra: controluce e vetro la rendono inutilizzabile
  if (it.type === 'tv') {
    const hitWin = plan.windows.some((w) => {
      const op = opening(plan, w);
      const along = Math.abs((it.x + it.w / 2 - op.cx) * op.ux + (it.y + it.h / 2 - op.cy) * op.uy);
      const across = Math.abs((it.x + it.w / 2 - op.cx) * op.nx + (it.y + it.h / 2 - op.cy) * op.ny);
      const halfAlong = (Math.abs(op.ux) * it.w + Math.abs(op.uy) * it.h) / 2;
      const halfAcross = (Math.abs(op.nx) * it.w + Math.abs(op.ny) * it.h) / 2;
      return along < op.w / 2 + halfAlong - 0.05 && across < op.t / 2 + halfAcross + 0.2;
    });
    if (hitWin) out.push('La TV non può stare davanti a una finestra');
  }
  const hits = plan.furniture.filter((o, i) => i !== index && !GROUND.has(o.type) && !o.decor && !o.wallMounted && !o.elev && overlap(it, o));
  if (hits.length) out.push(`Si sovrappone a ${hits.length === 1 ? 'un altro arredo' : `${hits.length} arredi`}`);
  // porte: il vano e la fascia di passaggio (80 cm) da entrambi i lati
  for (const d of plan.doors) {
    if (d.kind === 'gate') continue;
    const op = opening(plan, d);
    const reach = d.kind === 'garage' ? 0.6 : Math.max(0.8, d.w);
    const along = Math.abs((it.x + it.w / 2 - op.cx) * op.ux + (it.y + it.h / 2 - op.cy) * op.uy);
    const across = Math.abs((it.x + it.w / 2 - op.cx) * op.nx + (it.y + it.h / 2 - op.cy) * op.ny);
    const halfAlong = (Math.abs(op.ux) * it.w + Math.abs(op.uy) * it.h) / 2;
    const halfAcross = (Math.abs(op.nx) * it.w + Math.abs(op.ny) * it.h) / 2;
    if (along < op.w / 2 + halfAlong - 0.05 && across < op.t / 2 + reach + halfAcross - 0.05) {
      out.push(d.entrance ? "Blocca la porta d'ingresso" : 'Blocca il passaggio di una porta');
      break;
    }
  }
  return out;
}
