/*
 * Dimensione del soppalco: si allarga o si stringe dal lato aperto (verso il soggiorno), dove sta la scala.
 * Il bordo aperto si sposta e la rampa lo segue; i muri esterni, gli arredi contro il muro e il bagnetto restano dove sono.
 * Limiti: almeno 2,3 m (3 m con il bagnetto), la rampa dentro la pianta e al massimo metà del loft (oltre è un errore di norma).
 */
import { snapItem } from './furnitureEdit';
import { movePartition, partition } from './walls';

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

/*
 * Il muro sotto il soppalco (quello del bagno e della cucina che stanno sotto) segue il bordo aperto: sposta la partizione sulla
 * linea del bordo di `delta` metri. Non conta la «zona aperta» di soggiorno e cucina (senza muro in mezzo): qui le stanze sono
 * trattate separate per calcolare lo spostamento. Ritorna { plan } oppure { error }; plan invariato se sotto non c'è un muro.
 */
function followWall(plan, side, delta) {
  const mz = plan.mezzanine;
  const vertical = side === 'W' || side === 'E';
  const line = round3(side === 'W' ? mz.x : side === 'E' ? mz.x + mz.w : side === 'N' ? mz.y : mz.y + mz.h);
  const tol = 0.06;
  const rooms = plan.rooms.filter((r) => r.kind !== 'garden');
  const cx = (r) => r.x + r.w / 2;
  const cy = (r) => r.y + r.h / 2;
  const under = (r) => cx(r) > mz.x && cx(r) < mz.x + mz.w && cy(r) > mz.y && cy(r) < mz.y + mz.h;
  const edge = (r, far) => (vertical ? (far ? r.x + r.w : r.x) : (far ? r.y + r.h : r.y));
  // sotto: i locali che toccano la linea dal lato del soppalco; fuori: quelli dall'altra parte
  const inside = side === 'W' || side === 'N' ? (r) => Math.abs(edge(r, false) - line) < tol && under(r) : (r) => Math.abs(edge(r, true) - line) < tol && under(r);
  const outside = side === 'W' || side === 'N' ? (r) => Math.abs(edge(r, true) - line) < tol && !under(r) : (r) => Math.abs(edge(r, false) - line) < tol && !under(r);
  const a = rooms.find(outside);
  const b = rooms.find(inside);
  if (!a || !b) return { plan };
  const loose = { ...plan, rooms: plan.rooms.map((r) => { const { zone, ...rest } = r; return rest; }) };
  const orient = vertical ? 'v' : 'h';
  const lo = Math.min(...rooms.filter(inside).map((r) => (vertical ? r.y : r.x)));
  const hi = Math.max(...rooms.filter(inside).map((r) => (vertical ? r.y + r.h : r.x + r.w)));
  const part = partition(loose, orient, line, a.id, b.id, [lo, hi]);
  if (part.error) return { error: `Il muro sotto il soppalco non si può spostare: ${part.error}` };
  const d = side === 'W' || side === 'N' ? -delta : delta;
  if (d < part.min - 1e-6 || d > part.max + 1e-6) return { error: 'Il muro sotto il soppalco non può spostarsi di così tanto: i locali sotto diventerebbero troppo piccoli' };
  const res = movePartition(loose, part, d);
  if (res.error) return res;
  // si rimettono le zone dei locali originali (id invariati; in caso di tratti isolati, quelli nuovi restano senza zona)
  const zones = new Map(plan.rooms.map((r) => [r.id, r.zone]));
  return { plan: { ...res.plan, rooms: res.plan.rooms.map((r) => (zones.get(r.id) !== undefined ? { ...r, zone: zones.get(r.id) } : r)) }, notes: res.dropped || [] };
}

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
  // il muro sotto il soppalco (bagno e cucina) si sposta insieme al bordo aperto
  const wall = followWall(plan, side, delta);
  if (wall.error) return { error: wall.error };
  const base = wall.plan;
  // la rampa non può finire contro una porta
  for (const d of base.doors || []) {
    const box = d.rot === 90 || d.rot === 270 ? { x: d.x - 0.1, y: d.y, w: 0.2, h: d.w } : { x: d.x, y: d.y - 0.1, w: d.w, h: 0.2 };
    if (overlaps(stair, box, 0.02)) return { error: 'La scala del soppalco finirebbe contro una porta: riduci la dimensione' };
  }
  const next = { ...base, mezzanine: { ...base.mezzanine, ...rect, stair } };
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
  return { plan: next, dropped, size: target, notes: wall.notes || [] };
}

/*
 * Porta scorrevole del bagnetto, tutta DENTRO il bagno: l'anta chiusa sta sul varco, sul filo interno del muro, e scorre lungo
 * il muro verso il tratto più lungo; il binario sta sopra, lungo lo stesso muro. Fuori dal bagno non sporge niente.
 * Restituisce l'anta chiusa, la posizione aperta (ombra) e il binario, in metri.
 */
export function slideDoor(mz) {
  const b = mz?.bath;
  if (!b?.door || !b.walls?.length) return null;
  const d = b.door;
  const vertical = d.h > d.w;   // il varco corre lungo y: muro verticale
  const bx = b.walls.reduce((a, q) => [Math.min(a[0], q.x), Math.max(a[1], q.x + q.w)], [Infinity, -Infinity]);
  const by = b.walls.reduce((a, q) => [Math.min(a[0], q.y), Math.max(a[1], q.y + q.h)], [Infinity, -Infinity]);
  // lato interno del bagno: verso il centro dei suoi muri
  const inn = vertical ? ((bx[0] + bx[1]) / 2 > d.x + d.w / 2 ? 1 : -1) : ((by[0] + by[1]) / 2 > d.y + d.h / 2 ? 1 : -1);
  const len = vertical ? d.h : d.w;
  const a0 = vertical ? d.y : d.x;
  // il muro prima e dopo il varco, lungo l'asse della porta: l'anta scorre verso il tratto più lungo
  const segs = b.walls.filter((q) => (vertical ? q.h > q.w && Math.abs(q.x - d.x) < 1e-6 : q.w > q.h && Math.abs(q.y - d.y) < 1e-6));
  const before = segs.filter((q) => (vertical ? q.y + q.h <= a0 + 1e-6 : q.x + q.w <= a0 + 1e-6)).reduce((m, q) => m + (vertical ? q.h : q.w), 0);
  const after = segs.filter((q) => (vertical ? q.y >= a0 + len - 1e-6 : q.x >= a0 + len - 1e-6)).reduce((m, q) => m + (vertical ? q.h : q.w), 0);
  const dir = after >= before ? 1 : -1;
  const T = 0.04;
  const face = vertical ? (inn > 0 ? d.x + d.w + 0.01 : d.x - 0.01 - T) : (inn > 0 ? d.y + d.h + 0.01 : d.y - 0.01 - T);
  const mk = (s0, l, t, across) => (vertical ? { x: across, y: s0, w: t, h: l } : { x: s0, y: across, w: l, h: t });
  const closed = mk(a0 - 0.02, len + 0.04, T, face);
  const open = mk(a0 - 0.02 + dir * len, len + 0.04, T, face);
  // il binario copre varco e posizione aperta, ma non esce dal muro: al più fino alla fine del tratto
  const lo = Math.min(a0, a0 + dir * len) - 0.02;
  const hi = Math.max(a0 + len, a0 + len + dir * len) + 0.02;
  const wallLo = Math.min(...segs.map((q) => (vertical ? q.y : q.x)), a0);
  const wallHi = Math.max(...segs.map((q) => (vertical ? q.y + q.h : q.x + q.w)), a0 + len);
  const rail = mk(Math.max(lo, wallLo), Math.min(hi, wallHi) - Math.max(lo, wallLo), 0.03, inn > 0 ? face : face + T - 0.03);
  return { closed, open, rail, vertical };
}
