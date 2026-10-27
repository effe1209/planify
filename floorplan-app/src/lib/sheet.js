/* Impaginazione del foglio della planimetria ed esportazione dell'SVG renderizzato. */

const MARGIN = 78;

export function sheetBox(plan, thumb) {
  if (thumb) return { w: plan.svgWidth + 12, h: plan.svgHeight + 12, ox: 6, oy: 6 };
  const w = Math.max(plan.svgWidth + MARGIN * 2, 500);
  return { w, h: MARGIN + plan.svgHeight + 100, ox: (w - plan.svgWidth) / 2, oy: MARGIN };
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
