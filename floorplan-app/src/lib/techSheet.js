/*
 * Tavola tecnica A4 (misure in mm): scala di stampa vera, legenda dei locali e disposizione dei riquadri.
 * Il disegno di PlanSvg ha `plan.scale` pixel per metro: alla scala 1:N un metro vale 1000/N mm sul foglio.
 */
export const A4 = { id: 'A4', w: 297, h: 210, margin: 10 };
export const SCALES = [100, 200, 500];   // 1:100 di serie; se la pianta non entra si passa alla scala più piccola che basta
/* Formati dei fogli (orizzontali, mm) e scale che si possono chiedere per le tavole */
export const SHEET_FORMATS = { A4: { w: 297, h: 210 }, A3: { w: 420, h: 297 }, A2: { w: 594, h: 420 }, A1: { w: 841, h: 594 } };
export const SHEET_SCALES = [20, 50, 100, 200, 500];
export const sheetFormat = (id = 'A4', { portrait = false, margin = 10 } = {}) => {
  const f = SHEET_FORMATS[id] || SHEET_FORMATS.A4;
  return { id: SHEET_FORMATS[id] ? id : 'A4', w: portrait ? f.h : f.w, h: portrait ? f.w : f.h, margin };
};
export const LEGEND_W = 74;              // colonna di destra: legenda, abaco, cartiglio
export const CARTOUCHE_H = 52;

/* Riquadro del disegno: tutto il foglio meno cornice, colonna di destra e un filo d'aria. */
export function drawingArea(F = A4, side = 'right') {
  const m = F.margin + 4;
  const w = F.w - m - F.margin - LEGEND_W - 6;
  return { x: side === 'left' ? F.margin + LEGEND_W + 6 : m, y: m, w, h: F.h - 2 * m };
}

/* Scala di stampa (1:N) e dimensioni in mm del disegno che ha `px` × `py` pixel a `pxPerM` px/m. */
export function fitScale(px, py, pxPerM, area = drawingArea(), scales = SCALES) {
  for (const n of scales) {
    const mmPerPx = 1000 / n / pxPerM;
    if (px * mmPerPx <= area.w + 1e-6 && py * mmPerPx <= area.h + 1e-6) return { n, mmPerPx, w: px * mmPerPx, h: py * mmPerPx, fits: true };
  }
  // oltre 1:500: si riduce comunque il disegno e si dichiara una scala non unificata
  const mmPerPx = Math.min(area.w / px, area.h / py);
  return { n: Math.round(1000 / (mmPerPx * pxPerM)), mmPerPx, w: px * mmPerPx, h: py * mmPerPx, fits: false };
}

/* Legenda dei locali: numero, nome e superficie (m²), più il totale; giardini esclusi. */
export function roomLegend(plan) {
  const rooms = plan.rooms.filter((r) => r.kind !== 'garden' && r.kind !== 'stairs').map((r, i) => ({
    n: i + 1, name: r.name || r.kind, area: Math.round((r.area ?? r.w * r.h) * 100) / 100,
  }));
  const total = Math.round(rooms.reduce((a, r) => a + r.area, 0) * 100) / 100;
  return { rooms, total };
}

/*
 * Foglio nel DXF (in metri, come il disegno): dove stanno cornice e cartiglio rispetto alla pianta quando il disegno si stampa
 * al formato e alla scala scelti. `n` = scala 1:n (la migliore che entra se `scale` è 'auto'), `k` = metri di disegno per mm di foglio,
 * (x0, y0) = angolo in basso a sinistra del foglio nel DXF (y verso l'alto). Un punto del foglio (mm, dal basso a sinistra) è (x0 + mx·k, y0 + my·k).
 */
export function sheetLayout(plan, { format = 'A3', scale = 'auto' } = {}) {
  const F = sheetFormat(format);
  const area = drawingArea(F);
  const px = plan.dimensions.width;
  const py = plan.dimensions.length;
  const fits = (n) => (px * 1000) / n <= area.w + 1e-6 && (py * 1000) / n <= area.h + 1e-6;
  const wanted = scale && scale !== 'auto' ? Number(scale) : null;
  const list = wanted ? [wanted, ...SHEET_SCALES.filter((s) => s > wanted)] : SHEET_SCALES.slice(1);
  let n = list.find(fits);
  const unified = n != null;
  if (!unified) n = Math.ceil(Math.max((px * 1000) / area.w, (py * 1000) / area.h) / 50) * 50;
  const k = n / 1000;
  return { F, n, k, unified, area, x0: px / 2 - (area.x + area.w / 2) * k, y0: py / 2 - (F.h / 2) * k };
}
