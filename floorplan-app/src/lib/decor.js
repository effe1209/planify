/*
 * Decorazioni appese che completano gli interni (calcolate dalla pianta, come i tappeti): tende alle finestre
 * dei locali abitabili, quadri sopra divano e letto, specchi sopra lavabo e scarpiera.
 * Tutto in metri; `ux, uy` lungo il muro, `nx, ny` verso l'interno del locale.
 *   { kind: 'curtain', x, y, ux, uy, nx, ny, len }   un pannello di tenda (x, y = estremo sul filo del muro)
 *   { kind: 'art' | 'mirror', x, y, ux, uy, nx, ny, len }   cornice sottile centrata in x, y
 */
import { opening } from './ajax';

const CURTAIN_ROOMS = new Set(['living', 'living_kitchen', 'dining', 'bed', 'study', 'hotel_room']);
const BACK = { S: [0, -1], N: [0, 1], E: [-1, 0], W: [1, 0] };   // dal centro dell'arredo verso il suo retro

/* Il centro del retro di un arredo a muro (dove sta la parete) e le sue direzioni. */
function backOf(it) {
  const [bx, by] = BACK[it.facing || 'S'];
  const x = it.x + it.w / 2 + bx * (it.w / 2);
  const y = it.y + it.h / 2 + by * (it.h / 2);
  const along = bx === 0 ? it.w : it.h;
  return { x, y, ux: Math.abs(by), uy: Math.abs(bx), nx: -bx, ny: -by, along };
}

export function decorFor(plan) {
  const out = [];
  const rooms = new Map(plan.rooms.map((r) => [r.id, r]));
  const glass = plan.windows.map((w) => opening(plan, w));
  // un quadro o uno specchio non va sopra un vetro: stesso muro (entro 40 cm) e tratti che si toccano
  const onGlass = (b, len) => glass.some((op) => Math.abs((b.x - op.cx) * b.nx + (b.y - op.cy) * b.ny) < 0.4
    && Math.abs((b.x - op.cx) * b.ux + (b.y - op.cy) * b.uy) < len / 2 + op.w / 2 + 0.1);
  for (const op of glass) {
    if (!op.room || !CURTAIN_ROOMS.has(op.room.kind)) continue;
    const face = { x: op.cx + op.nx * (op.t / 2 + 0.03), y: op.cy + op.ny * (op.t / 2 + 0.03) };
    const panel = Math.min(0.4, Math.max(0.25, op.w * 0.22));
    for (const side of [-1, 1]) {
      // il pannello parte poco oltre il vano e si raccoglie verso l'interno della finestra
      const ex = face.x + op.ux * side * (op.w / 2 + 0.12);
      const ey = face.y + op.uy * side * (op.w / 2 + 0.12);
      out.push({ kind: 'curtain', x: ex, y: ey, ux: -op.ux * side, uy: -op.uy * side, nx: op.nx, ny: op.ny, len: panel });
    }
  }
  for (const it of plan.furniture) {
    const room = rooms.get(it.room);
    if (!room) continue;
    const b = backOf(it);
    let deco = null;
    if (['sofa', 'sofa_corner', 'bed'].includes(it.type)) deco = { kind: 'art', len: Math.min(1.4, b.along * 0.55) };
    else if (it.type === 'sink' && (room.kind === 'bath' || room.kind === 'wc')) deco = { kind: 'mirror', len: Math.max(0.4, b.along * 0.8) };
    else if (it.type === 'shoe_cabinet') deco = { kind: 'mirror', len: 0.6 };
    if (deco && !onGlass(b, deco.len)) out.push({ ...b, ...deco });
  }
  return out;
}
