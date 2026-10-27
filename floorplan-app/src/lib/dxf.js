/*
 * DXF lato client: lettura (fallback quando il backend non risponde) e scrittura.
 * Il DXF ha l'asse y verso l'alto, la planimetria verso il basso: le y vengono ribaltate.
 */
import { ROOM_KIND_NAME } from '../constants.js';
import * as G from './geometry.js';
import { snapPolygon } from './sketchShapes.js';
import { sketchToPlan } from './sketchToPlan.js';

const ROOM_LAYERS = /^(aree|area|rooms?|stanze?|locali)$/i;
const OTHER_LAYERS = /^(muri|walls?|arredi|furniture|quote|dim)/i;

/* Estrae le polilinee (LWPOLYLINE, almeno 3 vertici) da un DXF ASCII, con il loro layer. */
function readPolylines(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const polys = [];
  let type = null;
  let layer = '';
  let pts = [];
  const flush = () => {
    if (type === 'LWPOLYLINE' && pts.length >= 3) polys.push({ layer, pts });
  };
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i], 10);
    const val = lines[i + 1];
    if (Number.isNaN(code)) continue;
    if (code === 0) {
      flush();
      type = val.toUpperCase();
      layer = '';
      pts = [];
    } else if (code === 8) {
      layer = val;
    } else if (type === 'LWPOLYLINE') {
      const v = parseFloat(val);
      if (Number.isNaN(v)) continue;
      if (code === 10) pts.push([v, 0]);
      else if (code === 20 && pts.length) pts[pts.length - 1][1] = v;
    }
  }
  flush();
  return polys;
}

function kindForArea(area, index) {
  if (index === 0) return 'living_kitchen';
  if (area <= 5.5) return 'bath';
  if (area >= 9) return 'bed';
  return 'study';
}

/* DXF → planimetria arredata, usando lo stesso motore degli schizzi (porte solo sui muri in comune). */
export function parseDxfClientSide(text, style = 'modern') {
  const read = readPolylines(text);
  // se il file ha un layer delle stanze si usa quello, altrimenti tutto tranne muri/arredi
  const tagged = read.filter((p) => ROOM_LAYERS.test(p.layer));
  let polys = (tagged.length ? tagged : read.filter((p) => !OTHER_LAYERS.test(p.layer))).map((p) => p.pts);
  const all = polys.flat();
  if (!all.length) {
    return defaultPlan(style);
  }
  const b = G.bounds(all);
  // unità: metri, centimetri o millimetri, scegliendo la prima che dà misure plausibili (≤ 60 m)
  const size = Math.max(b.w, b.h);
  const k = [1, 0.01, 0.001].find((f) => size * f <= 60) ?? 0.001;
  polys = polys.map((p) => G.cleanPolygon(p.map(([x, y]) => [(x - b.x) * k, (b.y2 - y) * k])));
  // il contorno esterno che contiene tutte le altre polilinee non è una stanza
  const bbArea = b.w * b.h * k * k;
  const rooms = polys
    .filter((p) => p.length >= 3 && G.polygonArea(p) >= 1.5)
    .filter((p, _, arr) => arr.length < 2 || G.polygonArea(p) < bbArea * 0.9)
    .sort((p, q) => G.polygonArea(q) - G.polygonArea(p));
  if (!rooms.length) return defaultPlan(style);

  // nel CAD tra due stanze c'è lo spessore del muro: si agganciano i contorni perché risultino confinanti
  const shapes = [];
  rooms.forEach((raw, i) => {
    const poly = snapPolygon(raw, shapes);
    const kind = kindForArea(G.polygonArea(poly), i);
    shapes.push({ kind, name: ROOM_KIND_NAME[kind], poly });
  });
  const plan = sketchToPlan(shapes, { style });
  plan.notes.unshift(`Importate ${shapes.length} stanze dal file DXF e arredate automaticamente.`);
  return plan;
}

function defaultPlan(style) {
  const plan = sketchToPlan([
    { kind: 'living_kitchen', name: ROOM_KIND_NAME.living_kitchen, poly: G.rectPoly(0, 0, 5.5, 8) },
    { kind: 'bed', name: ROOM_KIND_NAME.bed, poly: G.rectPoly(5.5, 0, 4.5, 5) },
    { kind: 'bath', name: ROOM_KIND_NAME.bath, poly: G.rectPoly(5.5, 5, 4.5, 3) },
  ], { style });
  plan.notes.unshift('Nel file DXF non ci sono polilinee chiuse riconoscibili: ho creato una pianta di esempio.');
  return plan;
}

/* Planimetria → DXF ASCII (layer AREE, MURI, ARREDI). */
export function buildDxf(plan) {
  const L = plan.dimensions.length;
  const out = ['0', 'SECTION', '2', 'ENTITIES'];
  const poly = (layer, pts, closed = true) => {
    out.push('0', 'LWPOLYLINE', '8', layer, '90', String(pts.length), '70', closed ? '1' : '0');
    for (const [x, y] of pts) out.push('10', x.toFixed(3), '20', (L - y).toFixed(3));
  };
  const rect = (layer, r) => poly(layer, G.rectPoly(r.x, r.y, r.w, r.h));
  for (const r of plan.rooms) {
    if (r.poly) poly('AREE', r.poly);
    else rect('AREE', r);
  }
  for (const w of plan.walls) rect('MURI', w);
  for (const l of plan.wallLines || []) poly('MURI', l.pts, l.closed);
  for (const f of plan.furniture) rect('ARREDI', f);
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\n');
}
