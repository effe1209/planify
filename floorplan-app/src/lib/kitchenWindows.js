/*
 * Finestra dietro il piano cucina: il davanzale sta sopra il piano di lavoro e l'alzatina (1,20 m, vetro fino a 2,20 m), così il vetro non
 * finisce dietro i mobili; su quella finestra non ci sono tende. Lavora sui dati della pianta: la finestra riceve `sill`, `top` e `kitchen`.
 */
import { opening } from './ajax';
import { isPanoramic } from './openings';

export const KITCHEN_SILL = 1.2;
export const KITCHEN_TOP = 2.2;
const COUNTERS = new Set(['kitchen_counter']);

/* Rettangolo in pianta di un arredo (con la rotazione a 90°). */
export function furnitureRect(it) {
  const q = (((it.rot || 0) % 180) + 180) % 180;
  if (Math.abs(q - 90) < 1) {
    const cx = it.x + it.w / 2;
    const cy = it.y + it.h / 2;
    return { x0: cx - it.h / 2, x1: cx + it.h / 2, y0: cy - it.w / 2, y1: cy + it.w / 2 };
  }
  return { x0: it.x, x1: it.x + it.w, y0: it.y, y1: it.y + it.h };
}

/* Il rettangolo sta contro il muro dell'apertura `op` e si sovrappone al suo vano (con `margin` metri attorno)? */
export function againstOpening(rect, op, { depth = 0.4, margin = 0 } = {}) {
  const pts = [[rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x0, rect.y1], [rect.x1, rect.y1]];
  const along = pts.map(([x, y]) => (x - op.cx) * op.ux + (y - op.cy) * op.uy);
  const deep = pts.map(([x, y]) => (x - op.cx) * op.nx + (y - op.cy) * op.ny - op.t / 2);
  return Math.max(...along) > -op.w / 2 - margin && Math.min(...along) < op.w / 2 + margin && Math.min(...deep) < depth && Math.max(...deep) > -0.05;
}

export function raiseKitchenWindows(plan) {
  if (!plan.windows?.length || !plan.furniture?.some((it) => COUNTERS.has(it.type))) return plan;
  let changed = false;
  const windows = plan.windows.map((w) => {
    if (isPanoramic(w) || Number.isFinite(w.sill)) return w;
    const op = opening(plan, w);
    if (!op.room) return w;
    const hit = plan.furniture.some((it) => COUNTERS.has(it.type) && againstOpening(furnitureRect(it), op));
    if (!hit) return w;
    changed = true;
    return { ...w, sill: KITCHEN_SILL, top: KITCHEN_TOP, kitchen: true };
  });
  return changed ? { ...plan, windows } : plan;
}
