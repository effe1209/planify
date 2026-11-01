/*
 * Tavola tecnica A4 (misure in mm): scala di stampa vera, legenda dei locali e disposizione dei riquadri.
 * Il disegno di PlanSvg ha `plan.scale` pixel per metro: alla scala 1:N un metro vale 1000/N mm sul foglio.
 */
export const A4 = { w: 297, h: 210, margin: 10 };
export const SCALES = [100, 200, 500];   // 1:100 di serie; se la pianta non entra si passa alla scala più piccola che basta
export const LEGEND_W = 74;              // colonna di destra: legenda, abaco, cartiglio
export const CARTOUCHE_H = 52;

/* Riquadro del disegno: tutto il foglio meno cornice, colonna di destra e un filo d'aria. */
export function drawingArea() {
  const m = A4.margin + 4;
  return { x: m, y: m, w: A4.w - m - A4.margin - LEGEND_W - 6, h: A4.h - 2 * m };
}

/* Scala di stampa (1:N) e dimensioni in mm del disegno che ha `px` × `py` pixel a `pxPerM` px/m. */
export function fitScale(px, py, pxPerM, area = drawingArea()) {
  for (const n of SCALES) {
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
