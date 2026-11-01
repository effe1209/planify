import { pointInPolygon } from './geometry';

/* Tappeti della pianta: sotto il tavolino, ai piedi del letto, e quelli messi a mano (arredo «rug»). */
export function rugsFor(plan) {
  const rooms = new Map(plan.rooms.map((r) => [r.id, r]));
  const out = [];
  const clipTo = (r, room) => {
    const m = 0.25;
    const x0 = Math.max(r.x, room.x + m);
    const y0 = Math.max(r.y, room.y + m);
    const x1 = Math.min(r.x + r.w, room.x + room.w - m);
    const y1 = Math.min(r.y + r.h, room.y + room.h - m);
    return x1 - x0 > 0.8 && y1 - y0 > 0.8 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  };
  for (const it of plan.furniture) {
    const room = rooms.get(it.room);
    if (!room || it.elev) continue;
    let rug = null;
    if (it.type === 'rug') {
      rug = { x: it.x, y: it.y, w: it.w, h: it.h };
    } else if (it.type === 'coffee_table') {
      rug = { x: it.x - 0.55, y: it.y - 0.55, w: it.w + 1.1, h: it.h + 1.1 };
    } else if (it.type === 'bed' && it.w >= 1.3 && it.h >= 1.3) {
      // dalla metà del letto verso i piedi, 50 cm oltre i lati
      const f = it.facing || 'S';
      const hx = f === 'E' ? it.w / 2 : 0;
      const hy = f === 'S' ? it.h / 2 : 0;
      const w = f === 'E' || f === 'W' ? it.w / 2 + 0.6 : it.w + 1.0;
      const h = f === 'S' || f === 'N' ? it.h / 2 + 0.6 : it.h + 1.0;
      rug = {
        x: f === 'E' || f === 'W' ? it.x + hx - (f === 'W' ? 0.6 : 0) : it.x - 0.5,
        y: f === 'S' || f === 'N' ? it.y + hy - (f === 'N' ? 0.6 : 0) : it.y - 0.5,
        w, h,
      };
    }
    const clipped = it.type === 'rug' ? rug : rug && clipTo(rug, room);
    // stanze di forma libera: il tappeto si disegna solo se sta tutto dentro (a 25 cm dal muro)
    const inside = (r) => !room.poly || [[r.x - 0.25, r.y - 0.25], [r.x + r.w + 0.25, r.y - 0.25],
      [r.x + r.w + 0.25, r.y + r.h + 0.25], [r.x - 0.25, r.y + r.h + 0.25]].every((p) => pointInPolygon(p, room.poly));
    if (clipped && inside(clipped)) out.push(clipped);
  }
  return out;
}
