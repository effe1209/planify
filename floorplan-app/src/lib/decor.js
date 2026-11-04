/*
 * Decorazioni appese che completano gli interni (calcolate dalla pianta, come i tappeti): tende alle finestre
 * dei locali abitabili, quadri sopra divano e letto, specchi sopra lavabo e scarpiera.
 * Tutto in metri; `ux, uy` lungo il muro, `nx, ny` verso l'interno del locale.
 *   { kind: 'curtain', x, y, ux, uy, nx, ny, len }   un pannello di tenda (x, y = estremo sul filo del muro)
 *   { kind: 'art' | 'mirror', x, y, ux, uy, nx, ny, len }   cornice sottile centrata in x, y
 */
import { opening } from './ajax';
import { isPanoramic } from './openings';
import { withCornerWindows } from './cornerWindows';
import { furnitureRect, raiseKitchenWindows } from './kitchenWindows';

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

/*
 * Quanto sta libero lungo il muro, oltre il bordo di un vano, da quel lato (`side` ±1 lungo la direzione del muro): fino al muro d'angolo
 * del locale (meno lo spessore) o alla prossima apertura dello stesso muro. Solo per muri orizzontali o verticali; sui muri obliqui non si limita.
 */
function freeBeyond(plan, op, o, side) {
  const horiz = Math.abs(op.ux) > 0.9;
  const vert = Math.abs(op.uy) > 0.9;
  if (!op.room || !(horiz || vert)) return Infinity;
  const r = op.room;
  const sgn = (horiz ? op.ux : op.uy) * side;                 // verso crescente (+1) o decrescente (−1) della coordinata lungo il muro
  const edge = horiz ? (sgn > 0 ? r.x + r.w : r.x) : (sgn > 0 ? r.y + r.h : r.y);
  const here = (horiz ? op.cx : op.cy) + sgn * op.w / 2;      // bordo del vano da quel lato
  let free = (edge - here) * sgn - (op.t + 0.03);             // dal bordo del vano al muro d'angolo, meno lo spessore del muro
  // altre aperture sullo stesso muro, da quel lato
  for (const x of [...plan.windows, ...plan.doors.filter((d) => d.kind !== 'gate')]) {
    if (x === o) continue;
    const q = opening(plan, x);
    if (Math.abs(horiz ? q.cy - op.cy : q.cx - op.cx) > op.t) continue;
    const near = ((horiz ? q.cx : q.cy) - sgn * q.w / 2 - here) * sgn;   // dal bordo del vano al bordo vicino dell'altra apertura
    if (near > -0.05) free = Math.min(free, near - 0.05);
  }
  return free;
}

export function decorFor(plan0) {
  const plan = raiseKitchenWindows(withCornerWindows(plan0));
  const out = [];
  const rooms = new Map(plan.rooms.map((r) => [r.id, r]));
  const glass = plan.windows.map((w) => opening(plan, w));
  // un quadro o uno specchio non va sopra un vetro: stesso muro (entro 40 cm) e tratti che si toccano
  const onGlass = (b, len) => glass.some((op) => Math.abs((b.x - op.cx) * b.nx + (b.y - op.cy) * b.ny) < 0.4
    && Math.abs((b.x - op.cx) * b.ux + (b.y - op.cy) * b.uy) < len / 2 + op.w / 2 + 0.1);
  // le vetrate scorrevoli sono porte a tutto vetro: anche loro hanno la tenda
  const curtained = [...plan.windows.map((w) => ({ o: w, op: opening(plan, w) })),
    ...plan.doors.filter((d) => d.type === 'sliding').map((d) => ({ o: d, op: opening(plan, d) }))];
  // arredi che una tenda non può attraversare (tutto tranne tappeti e decori a terra)
  const blockers = plan.furniture.filter((it) => it.type !== 'rug' && !it.decor && !it.elev).map(furnitureRect);
  const placed = [];   // pannelli già messi: due tende non si toccano
  const panelHits = (op, ex, ey, ux, uy, len) => {
    // il pannello sta appoggiato al muro: da (ex, ey) lungo (ux, uy) per `len`, profondo 12 cm verso la stanza
    const x1 = ex + ux * len + op.nx * 0.12;
    const y1 = ey + uy * len + op.ny * 0.12;
    const r = { x0: Math.min(ex, x1), x1: Math.max(ex, x1), y0: Math.min(ey, y1), y1: Math.max(ey, y1) };
    const hit = [...blockers, ...placed].some((b) => b.x0 < r.x1 - 0.005 && b.x1 > r.x0 + 0.005 && b.y0 < r.y1 - 0.005 && b.y1 > r.y0 + 0.005);
    if (!hit) placed.push(r);
    return hit;
  };
  for (const { o, op } of curtained) {
    if (o.kitchen) continue;   // finestra dietro il piano cucina: niente tenda
    if (!op.room || !CURTAIN_ROOMS.has(op.room.kind)) continue;
    const face = { x: op.cx + op.nx * (op.t / 2 + 0.03), y: op.cy + op.ny * (op.t / 2 + 0.03) };
    if (isPanoramic(o) || o.corner) {
      // vetrata grande: tenda a pannelli su un binario lungo tutto il vetro, aperta ai lati e sempre dentro la larghezza del vano,
      // così non tocca i muri vicini (i pannelli stanno ai due estremi del vetro, verso il centro)
      const panel = Math.min(0.55, Math.max(0.3, op.w * 0.16));
      for (const side of [-1, 1]) {
        const ex = face.x + op.ux * side * (op.w / 2 - 0.02);
        const ey = face.y + op.uy * side * (op.w / 2 - 0.02);
        if (panelHits(op, ex, ey, -op.ux * side, -op.uy * side, panel)) continue;
        out.push({ kind: 'curtain', x: ex, y: ey, ux: -op.ux * side, uy: -op.uy * side, nx: op.nx, ny: op.ny, len: panel });
      }
      continue;
    }
    const panel = Math.min(0.4, Math.max(0.25, op.w * 0.22));
    for (const side of [-1, 1]) {
      // tenda aperta: il pannello sta di lato al vano, appena sovrapposto al vetro, e non entra nel muro d'angolo né in un'altra apertura
      const len = Math.min(panel, 0.08 + freeBeyond(plan, op, o, side));
      if (len < 0.12) continue;
      const ex = face.x + op.ux * side * (op.w / 2 - 0.08);
      const ey = face.y + op.uy * side * (op.w / 2 - 0.08);
      if (panelHits(op, ex, ey, op.ux * side, op.uy * side, len)) continue;
      out.push({ kind: 'curtain', x: ex, y: ey, ux: op.ux * side, uy: op.uy * side, nx: op.nx, ny: op.ny, len });
    }
  }
  for (const it of plan.furniture) {
    const room = rooms.get(it.room);
    if (!room && !it.elev) continue;
    const b = backOf(it);
    let deco = null;
    if (['sofa', 'sofa_corner', 'bed'].includes(it.type)) deco = { kind: 'art', len: Math.min(1.4, b.along * 0.55) };
    else if (it.type === 'sink' && (it.elev || room.kind === 'bath' || room.kind === 'wc')) deco = { kind: 'mirror', len: Math.max(0.4, b.along * 0.8) };
    else if (it.type === 'shoe_cabinet') deco = { kind: 'mirror', len: 0.6 };
    if (deco && !onGlass(b, deco.len)) out.push({ ...b, ...deco, ...(it.elev ? { elev: it.elev } : {}) });
  }
  return out;
}
