/* Impaginazione del foglio della planimetria ed esportazione dell'SVG renderizzato. */

import { extStairBounds } from './extStair';

const MARGIN = 78;
/* giardino: sopra il lotto si disegna la casa, che sta sul lato nord */
export const HOUSE_BAND = 150;
export const isGardenPlan = (plan) => plan.rooms.length > 0 && plan.rooms.every((r) => r.kind === 'garden');

export function sheetBox(plan, thumb) {
  // la scala esterna sporge dalla pianta: il foglio si allarga dal lato in cui esce
  const eb = extStairBounds(plan);
  const k = plan.scale;
  const L = eb ? Math.max(0, -eb.x * k) : 0;
  const R = eb ? Math.max(0, (eb.x + eb.w) * k - plan.svgWidth) : 0;
  const T = eb ? Math.max(0, -eb.y * k) : 0;
  const B = eb ? Math.max(0, (eb.y + eb.h) * k - plan.svgHeight) : 0;
  if (thumb) return { w: plan.svgWidth + 12 + L + R, h: plan.svgHeight + 12 + T + B, ox: 6 + L, oy: 6 + T };
  const top = isGardenPlan(plan) ? HOUSE_BAND : 0;
  const inner = plan.svgWidth + MARGIN * 2 + L + R;
  const w = Math.max(inner, 500);
  return { w, h: MARGIN + top + T + plan.svgHeight + B + 100, ox: MARGIN + L + (w - inner) / 2, oy: MARGIN + top + T };
}

/* SVG pronto da scaricare: senza evidenziazioni/aree cliccabili e a dimensione reale (zoom 100%). */
export function serializeSvg(svg) {
  const clone = svg.cloneNode(true);
  clone.querySelectorAll('.pf-hl,.pf-hit').forEach((n) => n.remove());
  const vb = svg.viewBox.baseVal;
  clone.setAttribute('width', vb.width);
  clone.setAttribute('height', vb.height);
  return { xml: new XMLSerializer().serializeToString(clone), w: vb.width, h: vb.height };
}
