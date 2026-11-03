/*
 * Finestre d'angolo: due finestre su pareti perpendicolari, nello stesso locale, con i bordi verso lo stesso angolo esterno a meno di
 * 30 cm dal muro d'angolo, diventano un'unica apertura che gira l'angolo. Al posto del pezzo di muro resta un montante di 10 cm
 * (la «trave» che dà continuità). Non si salva nulla nella pianta: l'unione si ricalcola dalle posizioni, quindi se una finestra si
 * sposta lontano dall'angolo le due tornano separate da sole.
 *   cornerPairs(plan)        → [{ a, b, corner }]  indici in plan.windows delle due finestre e angolo ('NW' | 'NE' | 'SW' | 'SE')
 *   withCornerWindows(plan)  → la pianta con le finestre unite prolungate fino al montante (per disegnarle); la stessa pianta se non ce ne sono
 */
import { opening } from './ajax';

export const CORNER_NEAR = 0.3;   // distanza massima dei bordi dall'angolo (m)
export const CORNER_POST = 0.1;   // lato del montante d'angolo (m)

export function cornerPairs(plan) {
  if (!plan?.windows?.length || plan.wallLines?.length || plan.rooms?.some((r) => r.poly)) return [];
  const { width: W, length: L } = plan.dimensions;
  const t = plan.wallThickness / plan.scale;
  const eps = 0.02;
  // finestre sul bordo della pianta: orizzontali in cima (N) o in fondo (S), verticali a sinistra (W) o a destra (E)
  const side = (o) => {
    if (!o.rot) return o.y <= eps ? 'N' : o.y + t >= L - eps ? 'S' : null;
    if (o.rot === 90) return o.x - t <= eps ? 'W' : o.x >= W - eps ? 'E' : null;
    return null;
  };
  const room = (o) => opening(plan, o).room?.id ?? null;
  const out = [];
  const used = new Set();
  plan.windows.forEach((a, i) => {
    if (a.rot || used.has(i) || !side(a)) return;
    plan.windows.forEach((b, j) => {
      if (used.has(i) || used.has(j) || i === j || b.rot !== 90 || !side(b)) return;
      if ((a.type || '') !== (b.type || '') || room(a) == null || room(a) !== room(b)) return;
      const ns = side(a);
      const ew = side(b);
      // distanza del bordo di ciascuna finestra dal muro d'angolo
      const dA = ew === 'W' ? a.x - t : W - t - (a.x + a.w);
      const dB = ns === 'N' ? b.y - t : L - t - (b.y + b.w);
      if (dA < -eps || dB < -eps || dA > CORNER_NEAR || dB > CORNER_NEAR) return;
      used.add(i);
      used.add(j);
      out.push({ a: i, b: j, corner: `${ns}${ew}` });
    });
  });
  return out;
}

export function withCornerWindows(plan) {
  const pairs = cornerPairs(plan);
  if (!pairs.length) return plan;
  const { width: W, length: L } = plan.dimensions;
  const windows = plan.windows.map((w) => ({ ...w }));
  for (const { a, b, corner } of pairs) {
    const wa = windows[a];
    const wb = windows[b];
    if (corner[1] === 'W') { const end = wa.x + wa.w; wa.x = CORNER_POST; wa.w = round(end - CORNER_POST); }
    else wa.w = round(W - CORNER_POST - wa.x);
    if (corner[0] === 'N') { const end = wb.y + wb.w; wb.y = CORNER_POST; wb.w = round(end - CORNER_POST); }
    else wb.w = round(L - CORNER_POST - wb.y);
    wa.corner = wb.corner = true;
  }
  return { ...plan, windows };
}

const round = (v) => Math.round(v * 1000) / 1000;
