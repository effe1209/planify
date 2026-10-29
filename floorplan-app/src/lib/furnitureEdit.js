/*
 * Spostare e ruotare gli arredi a mano: aggancio alla griglia e ai muri, controllo di sovrapposizioni,
 * porte bloccate e arredi fuori dal locale. Tutto in metri, come plan.furniture.
 */
import { pointInPolygon } from './geometry';
import { opening } from './ajax';

export const GRID = 0.05;        // passo di spostamento e aggancio
const WALL_SNAP = 0.15;          // entro 15 cm dal muro l'arredo si appoggia al muro
const GROUND = new Set(['path', 'ramp', 'hedge', 'fence']);   // elementi del giardino a terra: non contano come ostacoli

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

/* Posizione agganciata per un arredo spostato in (x, y): griglia di 5 cm e muri vicini. */
export function snapItem(plan, item, x, y) {
  let nx = round(x);
  let ny = round(y);
  const room = roomAtPoint(plan, nx + item.w / 2, ny + item.h / 2);
  if (room && room.kind !== 'garden') {
    const b = innerBox(plan, room);
    if (Math.abs(nx - b.x0) < WALL_SNAP) nx = b.x0;
    else if (Math.abs(nx + item.w - b.x1) < WALL_SNAP) nx = b.x1 - item.w;
    if (Math.abs(ny - b.y0) < WALL_SNAP) ny = b.y0;
    else if (Math.abs(ny + item.h - b.y1) < WALL_SNAP) ny = b.y1 - item.h;
  }
  return { x: +nx.toFixed(3), y: +ny.toFixed(3), room: room?.id ?? item.room };
}

/* Arredo ruotato di 90°: larghezza e profondità si scambiano attorno al centro, il fronte gira in senso orario. */
const NEXT = { S: 'W', W: 'N', N: 'E', E: 'S' };
export function rotateItem(item) {
  const cx = item.x + item.w / 2;
  const cy = item.y + item.h / 2;
  return { ...item, w: item.h, h: item.w, x: +(cx - item.h / 2).toFixed(3), y: +(cy - item.w / 2).toFixed(3),
    facing: NEXT[item.facing || 'S'] || 'S' };
}

const overlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.02
  && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.02;

/* Cosa non va nella posizione dell'arredo `index` (eventualmente spostato in `it`): elenco di frasi. */
export function itemProblems(plan, index, it = plan.furniture[index]) {
  if (!it || GROUND.has(it.type)) return [];
  const out = [];
  const room = plan.rooms.find((r) => r.id === it.room) || roomAtPoint(plan, it.x + it.w / 2, it.y + it.h / 2);
  if (room && room.kind !== 'garden') {
    const b = innerBox(plan, room);
    if (!room.poly && (it.x < b.x0 - 0.02 || it.y < b.y0 - 0.02 || it.x + it.w > b.x1 + 0.02 || it.y + it.h > b.y1 + 0.02)) {
      out.push(`Esce da ${room.name || 'il locale'}`);
    }
  }
  const hits = plan.furniture.filter((o, i) => i !== index && !GROUND.has(o.type) && overlap(it, o));
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
