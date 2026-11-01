/*
 * Dimensione del soppalco: si allarga o si stringe dal lato aperto (verso il soggiorno), dove sta la scala.
 * Il bordo aperto si sposta e la rampa lo segue; i muri esterni, gli arredi contro il muro e il bagnetto restano dove sono.
 * Limiti: almeno 2,3 m (3 m con il bagnetto), la rampa dentro la pianta e al massimo metà del loft (oltre è un errore di norma).
 */
import { snapItem } from './furnitureEdit';

const GRID = 0.05;
const round3 = (v) => Math.round(v * 1000) / 1000;
const snapTo = (v) => Math.round(v / GRID) * GRID;

/* Il soppalco è una colonna (bordo aperto a W/E, si regola la larghezza) o una fascia (bordo aperto a N/S, si regola la profondità). */
export function mezzAxis(plan) {
  const mz = plan.mezzanine;
  const side = mz.open?.[0] || 'W';
  const vertical = side === 'W' || side === 'E';
  return { side, vertical, label: vertical ? 'Larghezza' : 'Profondità' };
}

export function mezzLimits(plan) {
  const mz = plan.mezzanine;
  const { side, vertical } = mezzAxis(plan);
  const { width: W, length: L } = plan.dimensions;
  const st = mz.stair;
  const run = vertical ? st.w : st.h;
  const cur = vertical ? mz.w : mz.h;
  const pos = vertical ? mz.x : mz.y;       // inizio del soppalco lungo l'asse
  const total = vertical ? W : L;
  const other = vertical ? L : W;           // l'altra misura del soppalco (fissa)
  const margin = 0.3;
  const geomMax = side === 'W' || side === 'N' ? pos + cur - margin - run : total - pos - margin - run;
  const min = mz.bath ? 3.0 : 2.3;
  const max = Math.max(min, Math.min(geomMax, (0.5 * W * L) / other));
  return { min: round3(min), max: round3(Math.floor(max / GRID) * GRID), cur: round3(cur), vertical, side };
}

/* Quanta superficie del loft occupa il soppalco (0–1). */
export const mezzRatio = (plan, size) => {
  const { vertical } = mezzAxis(plan);
  const mz = plan.mezzanine;
  return ((vertical ? size * mz.h : mz.w * size)) / (plan.dimensions.width * plan.dimensions.length);
};

const overlaps = (a, b, pad = 0) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > pad && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > pad;

/* Soppalco portato a `size` metri: { plan, dropped } oppure { error }. */
export function resizeMezz(plan, size) {
  const lim = mezzLimits(plan);
  const target = Math.max(lim.min, Math.min(lim.max, snapTo(size)));
  const delta = round3(target - lim.cur);
  if (Math.abs(delta) < 1e-6) return { plan, dropped: [], size: target, unchanged: true };
  const mz = plan.mezzanine;
  const { side } = lim;
  const sx = side === 'W' ? -delta : side === 'E' ? delta : 0;   // spostamento del bordo aperto
  const sy = side === 'N' ? -delta : side === 'S' ? delta : 0;
  const rect = { ...mz };
  if (side === 'W') { rect.x = round3(mz.x - delta); rect.w = round3(mz.w + delta); }
  else if (side === 'E') rect.w = round3(mz.w + delta);
  else if (side === 'N') { rect.y = round3(mz.y - delta); rect.h = round3(mz.h + delta); }
  else rect.h = round3(mz.h + delta);
  const stair = { ...mz.stair, x: round3(mz.stair.x + sx), y: round3(mz.stair.y + sy) };
  // la rampa non può finire contro una porta
  for (const d of plan.doors || []) {
    const box = d.rot === 90 || d.rot === 270 ? { x: d.x - 0.1, y: d.y, w: 0.2, h: d.w } : { x: d.x, y: d.y - 0.1, w: d.w, h: 0.2 };
    if (overlaps(stair, box, 0.02)) return { error: 'La scala del soppalco finirebbe contro una porta: riduci la dimensione' };
  }
  const next = { ...plan, mezzanine: { ...rect, stair } };
  // arredi a terra che la rampa nuova coprirebbe: si tolgono (si possono rimettere altrove)
  const dropped = [];
  const keep = (next.furniture || []).filter((f) => {
    if (f.elev || f.type === 'rug') return true;
    if (overlaps(f, stair, 0.05)) { dropped.push(f.type); return false; }
    return true;
  });
  // arredi del soppalco: restano dentro al bordo nuovo
  next.furniture = keep.map((f) => {
    if (!f.elev) return f;
    const p = snapItem(next, f, f.x, f.y);
    return { ...f, x: p.x, y: p.y };
  });
  return { plan: next, dropped, size: target };
}
