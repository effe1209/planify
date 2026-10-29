/*
 * DXF lato client: lettura (fallback quando il backend non risponde) e scrittura.
 * Il DXF ha l'asse y verso l'alto, la planimetria verso il basso: le y vengono ribaltate.
 */
import { FURNITURE_LABEL, ROOM_KIND_NAME } from '../constants.js';
import * as G from './geometry.js';
import { snapPolygon } from './sketchShapes.js';
import { sketchToPlan } from './sketchToPlan.js';
import { AJAX_MODELS, DEVICE_STYLE } from './ajax.js';
import { aimDevice, CELL_STATE, reachAt, sensorModel } from './coverage.js';
import { furnitureZ } from './scene3d.js';

const ROOM_LAYERS = /^(aree|area|rooms?|stanze?|locali)$/i;
const OTHER_LAYERS = /^(muri|walls?|arredi|furniture|quote|dim|porte|finestre|testi|sensori|dispositivi|copertura|zone|non_sorv)/i;

/*
 * Estrae le polilinee (almeno 3 vertici) da un DXF ASCII, con il loro layer: LWPOLYLINE e le POLYLINE
 * del formato R12 (vertici in entità VERTEX fino a SEQEND).
 */
function readPolylines(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const polys = [];
  let type = null;
  let layer = '';
  let pts = [];
  let poly = null;   // POLYLINE R12 in corso: { layer, pts }
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
      if (type === 'POLYLINE') poly = { layer: '', pts: [] };
      else if (type === 'SEQEND' && poly) {
        if (poly.pts.length >= 3) polys.push(poly);
        poly = null;
      } else if (type !== 'VERTEX') poly = null;
      layer = '';
      pts = [];
    } else if (code === 8) {
      layer = val;
      if (type === 'POLYLINE' && poly) poly.layer = val;
    } else if (type === 'VERTEX' && poly && (code === 10 || code === 20)) {
      const v = parseFloat(val);
      if (Number.isNaN(v)) continue;
      if (code === 10) poly.pts.push([v, 0]);
      else if (poly.pts.length) poly.pts[poly.pts.length - 1][1] = v;
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
  plan.notes.unshift('Nel file DXF non ci sono contorni dei locali (layer AREE o polilinee chiuse): ho creato una pianta di esempio. '
    + 'I disegni di studio, con muri a doppia linea, porte e finestre, si ricostruiscono con il motore collegato.');
  return plan;
}

/* ── Scrittura: DXF R12 (AC1009), il formato che leggono tutti i CAD ── */

/* Layer: nome, colore ACI, tipo di linea, contenuto. */
export const DXF_LAYERS = [
  ['AREE', 8, 'CONTINUOUS', 'Contorno dei locali'],
  ['MURI', 7, 'CONTINUOUS', 'Muri'],
  ['PORTE', 5, 'CONTINUOUS', 'Porte: anta e arco di apertura'],
  ['FINESTRE', 4, 'CONTINUOUS', 'Finestre e vetrate'],
  ['ARREDI', 9, 'CONTINUOUS', 'Arredi (ingombro in pianta)'],
  ['ARREDI_TESTI', 9, 'CONTINUOUS', 'Nome e altezza degli arredi'],
  ['TESTI', 7, 'CONTINUOUS', 'Nomi e superfici dei locali'],
  ['QUOTE', 7, 'CONTINUOUS', 'Quote d\'ingombro'],
  ['SENSORI', 6, 'CONTINUOUS', 'Rilevatori Ajax (blocchi con attributi)'],
  ['DISPOSITIVI', 5, 'CONTINUOUS', 'Altri dispositivi Ajax (blocchi con attributi)'],
  ['SENSORI_CAMPO', 6, 'DASHED', 'Campo nominale dei rilevatori (portata e apertura, senza ostacoli)'],
  ['COPERTURA', 3, 'CONTINUOUS', 'Zone coperte (calcolo con ostacoli)'],
  ['COPERTURA_PARZIALE', 2, 'CONTINUOUS', 'Zone viste in parte'],
  ['ZONE_CIECHE', 1, 'CONTINUOUS', 'Zone cieche nei locali sorvegliati'],
  ['NON_SORVEGLIATO', 252, 'CONTINUOUS', 'Locali senza un rilevatore proprio'],
];

/* Testo per R12: ASCII, il resto come \U+XXXX (lo leggono AutoCAD e gli altri CAD). */
const enc = (str) => String(str ?? '').replace(/[^\x20-\x7e]/g, (c) => `\\U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
const n3 = (v) => (Math.round(v * 1000) / 1000).toString();

function writer(L) {
  const out = [];
  const put = (...pairs) => {
    for (let i = 0; i < pairs.length; i += 2) out.push(String(pairs[i]), String(pairs[i + 1]));
  };
  const Y = (y) => L - y;   // pianta con y verso il basso, DXF verso l'alto
  const api = {
    out, put,
    poly(layer, pts, closed = true) {
      if (pts.length < 2) return;
      put(0, 'POLYLINE', 8, layer, 66, 1, 10, 0, 20, 0, 30, 0, 70, closed ? 1 : 0);
      for (const [x, y] of pts) put(0, 'VERTEX', 8, layer, 10, n3(x), 20, n3(Y(y)), 30, 0);
      put(0, 'SEQEND', 8, layer);
    },
    rect(layer, x, y, w, h) { api.poly(layer, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]); },
    line(layer, [x1, y1], [x2, y2]) { put(0, 'LINE', 8, layer, 10, n3(x1), 20, n3(Y(y1)), 30, 0, 11, n3(x2), 21, n3(Y(y2)), 31, 0); },
    text(layer, [x, y], h, str, align = 'center') {
      const a = align === 'center' ? 1 : 0;
      put(0, 'TEXT', 8, layer, 10, n3(x), 20, n3(Y(y)), 30, 0, 40, h, 1, enc(str));
      if (a) put(72, 1, 11, n3(x), 21, n3(Y(y)), 31, 0);
    },
    // rettangolo pieno (SOLID: vertici 1, 2, 4, 3)
    solid(layer, x0, y0, x1, y1) {
      put(0, 'SOLID', 8, layer, 10, n3(x0), 20, n3(Y(y0)), 30, 0, 11, n3(x1), 21, n3(Y(y0)), 31, 0,
        12, n3(x0), 22, n3(Y(y1)), 32, 0, 13, n3(x1), 23, n3(Y(y1)), 33, 0);
    },
  };
  return api;
}

/* Punto locale di una porta o finestra (lungo il muro, attraverso il muro) → pianta. */
const local = (o) => ([lx, ly]) => (o.rot === 90 ? [o.x - ly, o.y + lx] : [o.x + lx, o.y + ly]);

const BLOCK_ATTRS = [['CODICE', 'Codice', false], ['MODELLO', 'Modello Ajax', true], ['LOCALE', 'Locale', true],
  ['ALTEZZA', 'Altezza di montaggio (m)', true], ['DIREZIONE', 'Direzione asse (gradi, 0 = +X, antiorario)', true]];

/*
 * Planimetria → DXF R12 a layer (vedi DXF_LAYERS), in metri.
 * opts.devices: dispositivi Ajax del piano → blocchi AJAX_<sigla> con attributi (codice, modello, locale, altezza,
 * direzione), campo nominale dei rilevatori e, con opts.coverage (coverFloor), zone coperte / parziali / cieche.
 */
export function buildDxf(plan, { devices = [], codes = {}, coverage = null } = {}) {
  const W = plan.dimensions.width;
  const L = plan.dimensions.length;
  const t = plan.wallThickness / plan.scale;
  const d = writer(L);
  const { put } = d;

  // intestazione, tabelle, blocchi
  put(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 6,
    9, '$EXTMIN', 10, -3, 20, -3, 30, 0, 9, '$EXTMAX', 10, n3(W + 3), 20, n3(L + 3), 30, 0, 0, 'ENDSEC');
  put(0, 'SECTION', 2, 'TABLES');
  put(0, 'TABLE', 2, 'LTYPE', 70, 2);
  put(0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Continua', 72, 65, 73, 0, 40, 0);
  put(0, 'LTYPE', 2, 'DASHED', 70, 0, 3, 'Tratteggiata __ __', 72, 65, 73, 2, 40, 0.3, 49, 0.2, 49, -0.1);
  put(0, 'ENDTAB');
  put(0, 'TABLE', 2, 'LAYER', 70, DXF_LAYERS.length + 1);
  put(0, 'LAYER', 2, '0', 70, 0, 62, 7, 6, 'CONTINUOUS');
  for (const [name, color, lt] of DXF_LAYERS) put(0, 'LAYER', 2, name, 70, 0, 62, color, 6, lt);
  put(0, 'ENDTAB');
  put(0, 'TABLE', 2, 'STYLE', 70, 1, 0, 'STYLE', 2, 'STANDARD', 70, 0, 40, 0, 41, 1, 50, 0, 71, 0, 42, 0.25, 3, 'txt', 4, '', 0, 'ENDTAB');
  put(0, 'ENDSEC');

  const models = [...new Set(devices.map((x) => x.model))];
  put(0, 'SECTION', 2, 'BLOCKS');
  for (const model of models) {
    const tag = DEVICE_STYLE[model]?.tag || 'DEV';
    put(0, 'BLOCK', 8, 0, 2, `AJAX_${tag}`, 70, 2, 10, 0, 20, 0, 30, 0, 3, `AJAX_${tag}`);
    put(0, 'CIRCLE', 8, 0, 10, 0, 20, 0, 30, 0, 40, 0.16);
    put(0, 'TEXT', 8, 0, 10, 0, 20, -0.045, 30, 0, 40, 0.09, 1, tag, 72, 1, 11, 0, 21, -0.045, 31, 0);
    BLOCK_ATTRS.forEach(([name, prompt, hidden], i) => {
      put(0, 'ATTDEF', 8, 0, 10, 0.22, 20, -0.22 - i * 0.14, 30, 0, 40, i ? 0.08 : 0.12, 1, '', 3, enc(prompt), 2, name, 70, hidden ? 1 : 0);
    });
    put(0, 'ENDBLK', 8, 0);
  }
  put(0, 'ENDSEC');

  put(0, 'SECTION', 2, 'ENTITIES');

  // locali, muri
  for (const r of plan.rooms) {
    if (r.poly) d.poly('AREE', r.poly);
    else d.rect('AREE', r.x, r.y, r.w, r.h);
  }
  for (const w of plan.walls) d.rect('MURI', w.x, w.y, w.w, w.h);
  for (const l of plan.wallLines || []) d.poly('MURI', l.pts, l.closed);

  // porte: stipiti, anta e arco di apertura; basculante come linea sul vano
  for (const o of plan.doors) {
    if (o.kind === 'gate') continue;
    const P = local(o);
    const c = t / 2;
    if (o.kind === 'garage') {
      d.line('PORTE', P([0, c]), P([o.w, c]));
      continue;
    }
    const dir = o.openDir || 1;
    d.line('PORTE', P([0, c]), P([0, c + dir * o.w]));
    const arc = [];
    for (let k = 0; k <= 12; k++) {
      const a = (k / 12) * (Math.PI / 2);
      arc.push(P([Math.sin(a) * o.w, c + dir * Math.cos(a) * o.w]));
    }
    d.poly('PORTE', arc, false);
  }
  // finestre: vano e due linee del vetro
  for (const o of plan.windows) {
    const P = local(o);
    d.poly('FINESTRE', [P([0, 0]), P([o.w, 0]), P([o.w, t]), P([0, t])]);
    d.line('FINESTRE', P([0, t * 0.34]), P([o.w, t * 0.34]));
    d.line('FINESTRE', P([0, t * 0.66]), P([o.w, t * 0.66]));
  }

  // arredi con nome e altezza (contano per le ombre dei rilevatori)
  for (const f of plan.furniture) {
    d.rect('ARREDI', f.x, f.y, f.w, f.h);
    if (Math.min(f.w, f.h) < 0.35) continue;
    const [z0, z1] = f.z || furnitureZ(f.type);
    const h = Math.min(0.12, Math.min(f.w, f.h) / 4);
    d.text('ARREDI_TESTI', [f.x + f.w / 2, f.y + f.h / 2], h, FURNITURE_LABEL[f.type] || f.type);
    d.text('ARREDI_TESTI', [f.x + f.w / 2, f.y + f.h / 2 + h * 1.6], h * 0.8,
      `h ${(z1 - z0).toFixed(2).replace('.', ',')} m${z0 > 0 ? ` da ${z0.toFixed(2).replace('.', ',')}` : ''}`);
  }

  // nomi e superfici dei locali
  for (const r of plan.rooms) {
    if (!r.name || r.kind === 'stairs') continue;
    const [cx, cy] = r.label || [r.x + r.w / 2, r.y + r.h / 2];
    d.text('TESTI', [cx, cy], 0.22, r.name);
    d.text('TESTI', [cx, cy + 0.32], 0.16, `${(r.area ?? r.w * r.h).toFixed(1).replace('.', ',')} m²`);
  }

  // quote d'ingombro
  const tick = (p) => d.line('QUOTE', [p[0] - 0.08, p[1] + 0.08], [p[0] + 0.08, p[1] - 0.08]);
  d.line('QUOTE', [0, -0.8], [W, -0.8]);
  d.line('QUOTE', [0, -0.15], [0, -0.95]);
  d.line('QUOTE', [W, -0.15], [W, -0.95]);
  tick([0, -0.8]);
  tick([W, -0.8]);
  d.text('QUOTE', [W / 2, -0.95], 0.2, `${W.toFixed(2).replace('.', ',')} m`);
  d.line('QUOTE', [-0.8, 0], [-0.8, L]);
  d.line('QUOTE', [-0.15, 0], [-0.95, 0]);
  d.line('QUOTE', [-0.15, L], [-0.95, L]);
  tick([-0.8, 0]);
  tick([-0.8, L]);
  d.text('QUOTE', [-1.25, L / 2], 0.2, `${L.toFixed(2).replace('.', ',')} m`);

  // copertura calcolata: righe di celle uguali unite in rettangoli pieni
  if (coverage) {
    for (const r of coverage.rooms) {
      const layerOf = (k) => {
        const st = r.cells[k];
        if (st === CELL_STATE.covered) return 'COPERTURA';
        if (st === CELL_STATE.partial) return 'COPERTURA_PARZIALE';
        if (st === CELL_STATE.blind) return r.own ? 'ZONE_CIECHE' : 'NON_SORVEGLIATO';
        return null;
      };
      for (let j = 0; j < r.ny; j++) {
        let i = 0;
        while (i < r.nx) {
          const layer = layerOf(j * r.nx + i);
          let e = i + 1;
          while (e < r.nx && layerOf(j * r.nx + e) === layer) e++;
          if (layer) d.solid(layer, r.x0 + i * r.cw, r.y0 + j * r.ch, r.x0 + e * r.cw, r.y0 + (j + 1) * r.ch);
          i = e;
        }
      }
    }
  }

  // campo nominale dei rilevatori e dispositivi come blocchi con attributi
  for (const dev of devices) {
    const m = sensorModel(dev.model);
    const aimed = m && m.kind !== 'glass';
    const { x, y, dir, h } = aimed ? aimDevice(plan, dev) : { x: dev.x, y: dev.y, dir: 0, h: 0 };
    if (aimed) {
      for (const axis of m.twoWay ? [dir, dir + 180] : [dir]) {
        const pts = [[x, y]];
        const half = m.hAngle / 2;
        for (let k = 0; k <= 16; k++) {
          const off = -half + (k / 16) * m.hAngle;
          const rr = reachAt(m, Math.abs(off));
          const a = ((axis + off) * Math.PI) / 180;
          pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
        }
        d.poly('SENSORI_CAMPO', pts);
      }
    }
    const layer = aimed ? 'SENSORI' : 'DISPOSITIVI';
    const tag = DEVICE_STYLE[dev.model]?.tag || 'DEV';
    put(0, 'INSERT', 8, layer, 66, 1, 2, `AJAX_${tag}`, 10, n3(x), 20, n3(L - y), 30, 0);
    // direzione nel DXF (y verso l'alto): antioraria da +X
    const values = {
      CODICE: codes[dev.id] || tag, MODELLO: AJAX_MODELS[dev.model]?.name || dev.model, LOCALE: dev.roomName || '',
      ALTEZZA: aimed ? h.toFixed(2) : '', DIREZIONE: aimed ? String(Math.round((360 - (((dir % 360) + 360) % 360)) % 360)) : '',
    };
    BLOCK_ATTRS.forEach(([name, , hidden], i) => {
      put(0, 'ATTRIB', 8, layer, 10, n3(x + 0.22), 20, n3(L - y - 0.22 - i * 0.14), 30, 0, 40, i ? 0.08 : 0.12,
        1, enc(values[name]), 2, name, 70, hidden ? 1 : 0);
    });
    put(0, 'SEQEND', 8, layer);
  }

  put(0, 'ENDSEC', 0, 'EOF');
  return d.out.join('\n');
}
