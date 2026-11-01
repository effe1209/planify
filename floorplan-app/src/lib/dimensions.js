/*
 * Quote esterne della pianta, in centimetri, a catene su tre livelli (da vicino a lontano dal muro):
 *   open  = aperture: porte e finestre dei muri esterni con i tratti di muro fra l'una e l'altra
 *   axes  = interassi: gli assi dei muri interni che toccano quel lato
 *   total = misura totale (solo sopra e a sinistra)
 * Ogni catena = { side: 'N'|'S'|'W'|'E', tier, pts: [metri lungo il lato], segs: [{ a, b, cm, open? }] }.
 */
const EDGE = 0.3;      // un'apertura sta su un lato se il suo muro è entro 30 cm dal perimetro
const MIN_SEG = 0.05;  // sotto 5 cm non è una quota ma un doppione

const round = (v) => Math.round(v * 100) / 100;
export const cm = (m) => Math.round(m * 100);

function chain(side, tier, pts, extra = {}) {
  const sorted = [...new Set(pts.map(round))].sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    if (sorted[i + 1] - sorted[i] < MIN_SEG) continue;
    segs.push({ a: sorted[i], b: sorted[i + 1], cm: cm(sorted[i + 1] - sorted[i]), open: extra.opens?.some(([x, y]) => Math.abs(x - sorted[i]) < 1e-6 && Math.abs(y - sorted[i + 1]) < 1e-6) || false });
  }
  return segs.length ? { side, tier, pts: sorted, segs } : null;
}

export function dimensionChains(plan) {
  const { width: W, length: L } = plan.dimensions;
  const rooms = plan.rooms.filter((r) => r.kind !== 'garden' && !r.poly);
  if (!rooms.length) return [];
  const out = [];
  const near = (v, t) => Math.abs(v - t) < 1e-3;
  // lato dell'apertura e coordinate lungo il lato
  const openings = [...(plan.windows || []), ...(plan.doors || []).filter((d) => d.kind !== 'gate')].map((o) => {
    const horiz = o.rot !== 90;
    if (horiz) {
      if (o.y < EDGE) return { side: 'N', a: o.x, b: o.x + o.w };
      if (o.y > L - EDGE) return { side: 'S', a: o.x, b: o.x + o.w };
    } else {
      if (o.x < EDGE) return { side: 'W', a: o.y, b: o.y + o.w };
      if (o.x > W - EDGE) return { side: 'E', a: o.y, b: o.y + o.w };
    }
    return null;
  }).filter(Boolean);
  const SIDES = {
    N: { len: W, edges: rooms.filter((r) => near(r.y, 0)).flatMap((r) => [r.x, r.x + r.w]) },
    S: { len: W, edges: rooms.filter((r) => near(r.y + r.h, L)).flatMap((r) => [r.x, r.x + r.w]) },
    W: { len: L, edges: rooms.filter((r) => near(r.x, 0)).flatMap((r) => [r.y, r.y + r.h]) },
    E: { len: L, edges: rooms.filter((r) => near(r.x + r.w, W)).flatMap((r) => [r.y, r.y + r.h]) },
  };
  for (const [side, { len, edges }] of Object.entries(SIDES)) {
    const ops = openings.filter((o) => o.side === side).map((o) => [Math.max(0, o.a), Math.min(len, o.b)]);
    const c1 = ops.length && chain(side, 'open', [0, len, ...ops.flat()], { opens: ops });
    // gli assi interni: i bordi dei locali che non sono sul perimetro
    const inner = edges.filter((v) => v > 1e-3 && v < len - 1e-3);
    const c2 = inner.length && chain(side, 'axes', [0, len, ...inner]);
    const c3 = (side === 'N' || side === 'W') && chain(side, 'total', [0, len]);
    for (const c of [c1, c2, c3]) if (c) out.push(c);
  }
  return out;
}

/* Distanza (px o m, a scelta di chi disegna) delle tre catene dal muro: la prima più vicina. */
export const TIER_ORDER = ['open', 'axes', 'total'];
/* I livelli presenti su un lato si impilano senza buchi: la catena `tier` sta al livello `k`-esimo fra quelle di quel lato. */
export function tierIndex(chains, c) {
  return chains.filter((x) => x.side === c.side).sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)).indexOf(c);
}
