/*
 * Copertura reale dei sensori Ajax: visibilità 2,5D con ostacoli a volume (muri, porte, vetrate, arredi).
 * Modulo puro (niente React né DOM): può girare in un Web Worker.
 *
 *   obstacles(plan, { doors }) → [Box]          Box = { x0, y0, x1, y1, z0, z1, kind, label }
 *   sensorModel(model)         → modello di rilevazione dalle specifiche ufficiali (data/ajax-specs.json), o null
 *   aimDevice(plan, dev)       → { x, y, dir, h }: direzione (gradi, 0 = verso x+, 90 = verso y+) e altezza di montaggio
 *   coverFloor(plan, devices, opts) → copertura di un piano (celle, percentuali, zone cieche con la causa, varchi)
 *
 * Un punto del corpo è «visto» se è entro la portata (che cala verso i bordi del ventaglio), entro l'apertura
 * orizzontale e la fascia verticale del sensore, e il segmento 3D sensore → punto non attraversa nessun volume.
 * La persona si controlla a 0,5 / 1,0 / 1,5 m: cella coperta con almeno due punti visti, parziale con uno.
 */
import specs from '../data/ajax-specs.json';
import { opening, inside } from './ajax';
import { pointInPolygon } from './geometry';
import { furnitureZ, WALL_H } from './scene3d';
import { FURNITURE_LABEL } from '../constants';

export const BODY = [0.5, 1.0, 1.5];
export const CELL = { inside: 0.1, garden: 0.25 };
export const CELL_STATE = { none: 0, blind: 1, partial: 2, covered: 3, occupied: 4 };
/* Colori delle celle (RGBA): coperta (più intensa dove si sovrappongono più sensori), parziale, cieca. */
export const COVER_COLORS = {
  covered: [22, 163, 74, 70], overlap: [21, 128, 61, 110], partial: [234, 179, 8, 90], blind: [220, 38, 38, 95],
  highlight: [220, 38, 38, 210], unwatched: [100, 116, 139, 55],
};
const DOOR_H = 2.1;
const SILL = 0.9;
const deg = Math.PI / 180;

/* Ipotesi per i dati che Ajax non dichiara: si dicono nella relazione. */
export const ASSUMPTIONS = [
  'Persona controllata a 0,5, 1,0 e 1,5 m da terra: coperta se almeno due punti sono visti, parziale se uno.',
  'Fasci PIR trattati come una fascia continua: chi cammina attraversa gli spazi stretti tra i fasci.',
  'Muri e vetrate bloccano il PIR (il PIR non rileva oltre il vetro); le porte chiuse bloccano fino all\'architrave.',
  'Arredi come volumi pieni alla loro altezza; le chiome degli alberi da 1,6 m, il tetto del gazebo da 2,2 m.',
  'Rilevatori da esterno (angolo verticale non dichiarato): fascia di ±10° attorno all\'altezza di montaggio.',
  'Non sono simulati sole diretto, fonti di calore, correnti d\'aria e animali: restano avvisi di posizionamento.',
];

/* ── modelli di rilevazione ── */
const indoor = specs.families.indoor_pir_885;
const FAMILY_885 = {
  kind: 'volumetric', mount: indoor.mount_h_m, hAngle: indoor.h_angle_deg, profile: indoor.h_reach_profile,
  v: [0, indoor.derived.v_angle_deg],
};
const SENSORS = {
  motionprotect: FAMILY_885,
  motionprotect_plus: FAMILY_885,
  motioncam: FAMILY_885,
  motioncam_phod: FAMILY_885,
  combiprotect: { ...FAMILY_885, glass: specs.models.combiprotect.glassBreak.range_m[1] },
  motionprotect_curtain: { kind: 'curtain', mount: 2.4, hAngle: specs.models.motionprotect_curtain.h_angle_deg,
    range: specs.models.motionprotect_curtain.range_m, v: [0, specs.models.motionprotect_curtain.v_angle_deg] },
  dualcurtain_outdoor: { kind: 'curtain', mount: 1.0, hAngle: specs.models.dualcurtain_outdoor.h_angle_deg,
    range: specs.models.dualcurtain_outdoor.range_m, v: [-45, 45], twoWay: true },
  motioncam_outdoor: { kind: 'outdoor', mount: 1.0, hAngle: specs.models.motioncam_outdoor.h_angle_deg,
    range: specs.models.motioncam_outdoor.range_m, v: [-10, 10] },
  motionprotect_outdoor: { kind: 'outdoor', mount: 1.0, hAngle: specs.models.motionprotect_outdoor.h_angle_deg,
    range: specs.models.motionprotect_outdoor.range_m, v: [-10, 10] },
  glassprotect: { kind: 'glass', glass: specs.models.glassprotect.glassBreak.range_m[1] },
};

export function sensorModel(model) {
  return SENSORS[model] || null;
}

/* Portata (m) a un angolo dall'asse: dal profilo del diagramma ufficiale, o costante fino al bordo. */
function reachAt(m, off) {
  if (off > m.hAngle / 2 + 1e-9) return 0;
  if (!m.profile) return m.range;
  const p = m.profile;
  for (let i = 1; i < p.length; i++) {
    if (off <= p[i][0]) return p[i - 1][1] + ((off - p[i - 1][0]) / (p[i][0] - p[i - 1][0])) * (p[i][1] - p[i - 1][1]);
  }
  return p[p.length - 1][1];
}

/* ── geometria ── */
const contains = (r, x, y) =>
  r.poly ? pointInPolygon([x, y], r.poly) : x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
const roomAt = (plan, x, y) => plan.rooms.find((r) => contains(r, x, y)) || null;
const center = (r) => (r.poly
  ? { x: r.poly.reduce((s, p) => s + p[0], 0) / r.poly.length, y: r.poly.reduce((s, p) => s + p[1], 0) / r.poly.length }
  : { x: r.x + r.w / 2, y: r.y + r.h / 2 });

/* Vano di una porta o finestra come rettangolo in pianta (come in PlanSvg e nella vista 3D). */
function openingRect(o, t) {
  return o.rot === 0 || !o.rot
    ? { x0: o.x, x1: o.x + o.w, y0: o.y, y1: o.y + t }
    : { x0: o.x - t, x1: o.x, y0: o.y, y1: o.y + o.w };
}

/*
 * Stato delle porte di un piano per il calcolo: quello generale del progetto più le porte cambiate una per una
 * (security.doorStates = { [floorId]: { [indice porta]: 'open' | 'closed' } }).
 */
export function doorsFor(security, floorId) {
  return { default: security?.doors || 'closed', ...(security?.doorStates?.[floorId] || {}) };
}

/*
 * Ostacoli del piano come volumi. `doors`: 'closed' (default), 'open', oppure
 * { default, [indice porta]: 'open' | 'closed' } (vedi doorsFor).
 * Ogni muro si divide dove ci sono vani: sopra la porta resta l'architrave; la finestra è muro sotto il davanzale
 * e vetro sopra (opaco per il PIR).
 */
export function obstacles(plan, { doors = 'closed' } = {}) {
  const t = plan.wallThickness / plan.scale;
  const boxes = [];
  const add = (x0, y0, x1, y1, z0, z1, kind, label) => {
    if (x1 - x0 > 1e-3 && y1 - y0 > 1e-3 && z1 - z0 > 1e-3) boxes.push({ x0, y0, x1, y1, z0, z1, kind, label });
  };
  const doorState = (i) => (typeof doors === 'string' ? doors : doors[i] || doors.default || 'closed');
  const vani = [
    ...plan.doors.map((d, i) => (d.kind === 'gate' ? null : { ...openingRect(d, t), door: true, open: doorState(i) === 'open' })),
    ...plan.windows.map((w) => ({ ...openingRect(w, t), door: false })),
  ].filter(Boolean);

  for (const w of plan.walls || []) {
    const horiz = w.w >= w.h;
    const a0 = horiz ? w.x : w.y;
    const a1 = horiz ? w.x + w.w : w.y + w.h;
    const cuts = vani.filter((o) => (horiz
      ? o.x1 > w.x + 0.01 && o.x0 < w.x + w.w - 0.01 && o.y1 > w.y - 0.01 && o.y0 < w.y + w.h + 0.01
      : o.y1 > w.y + 0.01 && o.y0 < w.y + w.h - 0.01 && o.x1 > w.x - 0.01 && o.x0 < w.x + w.w + 0.01))
      .map((o) => ({ a: Math.max(a0, horiz ? o.x0 : o.y0), b: Math.min(a1, horiz ? o.x1 : o.y1), o }))
      .sort((p, q) => p.a - q.a);
    const seg = (a, b, z0, z1, kind, label) => (horiz
      ? add(a, w.y, b, w.y + w.h, z0, z1, kind, label)
      : add(w.x, a, w.x + w.w, b, z0, z1, kind, label));
    let cur = a0;
    for (const { a, b, o } of cuts) {
      if (a > cur) seg(cur, a, 0, WALL_H, 'wall', 'Muro');
      if (o.door) {
        if (!o.open) seg(a, b, 0, DOOR_H, 'door', 'Porta chiusa');
      } else {
        seg(a, b, 0, SILL, 'wall', 'Muro');
        seg(a, b, SILL, DOOR_H, 'glass', 'Vetrata');
      }
      seg(a, b, DOOR_H, WALL_H, 'wall', 'Muro');
      cur = Math.max(cur, b);
    }
    if (cur < a1) seg(cur, a1, 0, WALL_H, 'wall', 'Muro');
  }

  for (const it of plan.furniture || []) {
    let [z0, z1] = furnitureZ(it.type);
    if (it.type === 'tree') z0 = 1.6;           // si vede sotto la chioma
    if (it.type === 'gazebo') z0 = 2.2;         // aperto ai lati, solo il tetto
    if (it.z) [z0, z1] = it.z;                  // altezza corretta a mano
    if (z1 - z0 < 0.1) continue;                // piatti doccia, camminamenti
    add(it.x, it.y, it.x + it.w, it.y + it.h, z0, z1, 'furniture', FURNITURE_LABEL[it.type] || 'Arredo');
  }
  return boxes;
}

/* Il segmento S → P attraversa il volume? (metodo delle lastre, t in [0, 1]) */
function hits(b, sx, sy, sz, dx, dy, dz) {
  let t0 = 0, t1 = 1;
  const slab = (s, d, lo, hi) => {
    if (Math.abs(d) < 1e-12) return s > lo && s < hi;
    let a = (lo - s) / d, c = (hi - s) / d;
    if (a > c) [a, c] = [c, a];
    if (a > t0) t0 = a;
    if (c < t1) t1 = c;
    return t0 < t1;
  };
  return slab(sx, dx, b.x0, b.x1) && slab(sy, dy, b.y0, b.y1) && slab(sz, dz, b.z0, b.z1) && t1 - t0 > 1e-6;
}

/* ── orientamento predefinito ── */
const nearestWindow = (plan, x, y) => plan.windows.map((w) => opening(plan, w))
  .reduce((best, op) => (!best || Math.hypot(op.cx - x, op.cy - y) < Math.hypot(best.cx - x, best.cy - y) ? op : best), null);

/*
 * Direzione e altezza di un sensore se non le ha già: i volumetrici guardano il centro del locale, la tenda corre
 * lungo la vetrata partendo da un'estremità, la barriera da esterno lungo la facciata, le telecamere da esterno
 * verso il centro del giardino.
 */
export function aimDevice(plan, dev) {
  const m = sensorModel(dev.model);
  const h = dev.h ?? m?.mount ?? 2.4;
  if (dev.dir != null) return { x: dev.x, y: dev.y, dir: dev.dir, h };
  const room = plan.rooms.find((r) => r.id === dev.room) || roomAt(plan, dev.x, dev.y);
  if (dev.model === 'motionprotect_curtain') {
    const op = nearestWindow(plan, dev.x, dev.y);
    if (op) {
      const p = inside(op, 0.15, -op.w / 2);
      return { x: p.x, y: p.y, dir: Math.atan2(op.uy, op.ux) / deg, h };
    }
  }
  if (dev.model === 'dualcurtain_outdoor') return { x: dev.x, y: dev.y, dir: 0, h };
  const c = room ? center(room) : { x: dev.x + 1, y: dev.y };
  return { x: dev.x, y: dev.y, dir: Math.atan2(c.y - dev.y, c.x - dev.x) / deg, h };
}

/* ── visibilità ── */

/* Sensore pronto per il calcolo: modello, posizione, direzioni (una o due) e volumi entro la sua portata. */
function prepare(plan, dev, boxes) {
  const m = sensorModel(dev.model);
  if (!m || m.kind === 'glass') return null;
  const { x, y, dir, h } = aimDevice(plan, dev);
  const reach = m.profile ? m.profile[0][1] : m.range;
  // volumi vicini (escluso quello in cui il sensore è montato, es. il muro)
  const near = boxes.filter((b) => b.x1 > x - reach && b.x0 < x + reach && b.y1 > y - reach && b.y0 < y + reach
    && !(x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && h > b.z0 && h < b.z1));
  return { dev, m, x, y, h, dirs: m.twoWay ? [dir, dir + 180] : [dir], near };
}

/*
 * Un punto rispetto a un sensore: 'seen' visto; 'blocked' nel campo ma nascosto (con l'ostacolo); 'below' sotto il
 * fascio più basso (troppo vicino al rilevatore); 'out' fuori dal campo.
 */
function look(s, px, py, pz) {
  const dx = px - s.x, dy = py - s.y;
  const d = Math.hypot(dx, dy);
  const az = Math.atan2(dy, dx) / deg;
  const off = Math.min(...s.dirs.map((a) => Math.abs(((az - a + 540) % 360) - 180)));
  if (d > reachAt(s.m, off)) return { st: 'out' };
  const el = Math.atan2(s.h - pz, d) / deg;     // gradi sotto l'orizzontale
  if (el > s.m.v[1]) return { st: 'below' };
  if (el < s.m.v[0]) return { st: 'out' };
  const dz = pz - s.h;
  for (const b of s.near) {
    if (hits(b, s.x, s.y, s.h, dx, dy, dz)) return { st: 'blocked', by: b };
  }
  return { st: 'seen' };
}

/*
 * Copertura di un piano. devices: dispositivi di questo piano (planSecurity, con eventuali x, y, dir, h modificati).
 * opts.doors come in obstacles(). Restituisce per ogni locale la griglia delle celle (CELL_STATE), il numero di
 * sensori che vedono ogni cella, le superfici e le zone cieche raggruppate per causa; più lo stato dei varchi.
 */
export function coverFloor(plan, devices, { doors = 'closed', only = null, boxes = obstacles(plan, { doors }) } = {}) {
  const sensors = devices.map((d) => prepare(plan, d, boxes)).filter(Boolean);
  const occupiers = boxes.filter((b) => b.kind === 'furniture' && b.z0 < 0.3 && b.z1 >= 0.3);
  const walls = boxes.filter((b) => b.kind !== 'furniture');

  const rooms = [];
  for (const r of plan.rooms) {
    if (only && !only.includes(r.id)) continue;
    const step = r.kind === 'garden' ? CELL.garden : CELL.inside;
    const bx = r.poly ? Math.min(...r.poly.map((p) => p[0])) : r.x;
    const by = r.poly ? Math.min(...r.poly.map((p) => p[1])) : r.y;
    const bw = r.poly ? Math.max(...r.poly.map((p) => p[0])) - bx : r.w;
    const bh = r.poly ? Math.max(...r.poly.map((p) => p[1])) - by : r.h;
    const nx = Math.max(1, Math.round(bw / step)), ny = Math.max(1, Math.round(bh / step));
    const cells = new Uint8Array(nx * ny);
    const count = new Uint8Array(nx * ny);
    const cause = new Uint8Array(nx * ny);   // celle cieche: 1 + indice della causa in `keys`
    const causes = new Map();
    const keys = [];
    const seenBy = new Set();
    const tally = { floor: 0, covered: 0, partial: 0, blind: 0, occupied: 0 };
    const mine = sensors.filter((s) => r.kind === 'garden' || Math.hypot(s.x - center(r).x, s.y - center(r).y) < 20);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const px = bx + (i + 0.5) * (bw / nx), py = by + (j + 0.5) * (bh / ny);
        const k = j * nx + i;
        if (!contains(r, px, py) || walls.some((b) => b.z0 < 0.1 && px > b.x0 && px < b.x1 && py > b.y0 && py < b.y1)) continue;
        tally.floor++;
        if (occupiers.some((b) => px > b.x0 && px < b.x1 && py > b.y0 && py < b.y1)) {
          cells[k] = CELL_STATE.occupied;
          tally.occupied++;
          continue;
        }
        const seen = BODY.map(() => false);
        let n = 0, why = null, whyD = Infinity;
        for (const s of mine) {
          let any = false;
          BODY.forEach((z, q) => {
            const res = look(s, px, py, z);
            if (res.st === 'seen') {
              seen[q] = true;
              any = true;
            } else if (res.st !== 'out') {
              // causa dal sensore più vicino che avrebbe visto il punto, prima quelli montati nel locale stesso
              const d = Math.hypot(px - s.x, py - s.y) + (s.dev.room === r.id ? 0 : 1000);
              if (d < whyD) {
                whyD = d;
                why = res.st === 'below' ? { kind: 'below', label: 'Sotto il rilevatore' } : { kind: res.by.kind, label: res.by.label };
              }
            }
          });
          if (any) {
            n++;
            seenBy.add(s.dev.id);
          }
        }
        count[k] = Math.min(n, 255);
        const v = seen.filter(Boolean).length;
        if (v >= 2) {
          cells[k] = CELL_STATE.covered;
          tally.covered++;
        } else {
          cells[k] = v === 1 ? CELL_STATE.partial : CELL_STATE.blind;
          tally[v === 1 ? 'partial' : 'blind']++;
          if (v === 0) {
            const c = why || { kind: 'out', label: mine.length ? 'Fuori dal campo dei sensori' : 'Nessun sensore' };
            const key = `${c.kind}|${c.label}`;
            if (!causes.has(key)) keys.push(key);
            causes.set(key, { ...c, key, cells: (causes.get(key)?.cells || 0) + 1 });
            cause[k] = keys.indexOf(key) + 1;
          }
        }
      }
    }
    const a = (bw / nx) * (bh / ny);
    const free = tally.floor - tally.occupied;
    if (!seenBy.size) {
      // nessun sensore vede il locale: una sola causa, non «fuori campo» di sensori in altre stanze
      causes.clear();
      keys.length = 0;
      if (tally.blind) {
        causes.set('none', { kind: 'none', label: 'Nessun sensore nel locale', key: 'none', cells: tally.blind });
        keys.push('none');
        for (let k = 0; k < cells.length; k++) cause[k] = cells[k] === CELL_STATE.blind ? 1 : 0;
      }
    }
    rooms.push({
      id: r.id, name: r.name, kind: r.kind, x0: bx, y0: by, cw: bw / nx, ch: bh / ny, nx, ny, cells, count, cause,
      area: +(free * a).toFixed(2),
      covered: +(tally.covered * a).toFixed(2), partial: +(tally.partial * a).toFixed(2), blind: +(tally.blind * a).toFixed(2),
      pct: free ? Math.round((100 * tally.covered) / free) : 0,
      pctAny: free ? Math.round((100 * (tally.covered + tally.partial)) / free) : 0,
      blindCauses: [...causes.values()].map((c) => ({ kind: c.kind, label: c.label, area: +(c.cells * a).toFixed(2), idx: keys.indexOf(c.key) + 1 }))
        .sort((p, q) => q.area - p.area),
      sensors: seenBy.size,
      own: sensors.filter((x) => x.dev.room === r.id).length,   // sensori montati nel locale
    });
  }

  return { rooms, sensors: sensors.map(({ dev, x, y, h, dirs, m }) => ({ id: dev.id, model: dev.model, x, y, h, dir: dirs[0], kind: m.kind })),
    openings: only ? [] : openingsStatus(plan, devices, sensors), boxes };
}

/* ── posizionamento migliore dei volumetrici ── */

const HEAT = new Set(['kitchen_counter', 'kitchen_peninsula']);   // piano cottura: temperatura che cambia in fretta
const HUBS = new Set(['hub2_plus', 'rex2']);

/* Punti di montaggio candidati in un locale: gli angoli e, sulle pareti lunghe, il centro della parete. */
function mounts(r) {
  const c = center(r);
  const pts = r.poly
    ? r.poly.map(([x, y]) => {
      const d = Math.hypot(c.x - x, c.y - y) || 1;
      return { x: x + ((c.x - x) / d) * 0.3, y: y + ((c.y - y) / d) * 0.3 };
    })
    : [[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, b]) => ({ x: r.x + 0.25 + a * (r.w - 0.5), y: r.y + 0.25 + b * (r.h - 0.5) }));
  const out = pts.filter((p) => contains(r, p.x, p.y)).map((p) => ({ ...p, dir: Math.atan2(c.y - p.y, c.x - p.x) / deg }));
  if (!r.poly) {
    if (r.w > 5) out.push({ x: c.x, y: r.y + 0.25, dir: 90 }, { x: c.x, y: r.y + r.h - 0.25, dir: -90 });
    if (r.h > 5) out.push({ x: r.x + 0.25, y: c.y, dir: 0 }, { x: r.x + r.w - 0.25, y: c.y, dir: 180 });
  }
  return out;
}

/*
 * Valuta un montaggio: superficie del locale coperta (le celle parziali valgono metà), varchi verso l'esterno
 * visti da dentro (chi entra deve attraversare il campo), penalità se la lente guarda una finestra (sole diretto)
 * o il piano cottura entro 4 m (avvisi del manuale Ajax).
 */
function score(plan, room, dev, ctx) {
  const cov = coverFloor(plan, [dev], { only: [room.id], boxes: ctx.boxes }).rooms[0];
  const free = cov.covered + cov.partial + cov.blind || 1;
  let sc = (cov.covered + cov.partial / 2) / free;
  const s = prepare(plan, dev, ctx.boxes);
  for (const op of ctx.exits) {
    if (op.room?.id !== room.id) continue;
    const p = inside(op, 0.6);
    if (look(s, p.x, p.y, 1.0).st === 'seen') sc += 0.15;
  }
  for (const w of ctx.windows) {
    if (w.room?.id !== room.id) continue;
    const off = Math.abs(((Math.atan2(w.cy - s.y, w.cx - s.x) / deg - s.dirs[0] + 540) % 360) - 180);
    if (off < 30 && Math.hypot(w.cx - s.x, w.cy - s.y) < 8) sc -= 0.1;
  }
  for (const it of plan.furniture) {
    if (!HEAT.has(it.type)) continue;
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    const off = Math.abs(((Math.atan2(cy - s.y, cx - s.x) / deg - s.dirs[0] + 540) % 360) - 180);
    if (off < 40 && Math.hypot(cx - s.x, cy - s.y) < 4) sc -= 0.08;
  }
  return { sc, pct: cov.pct };
}

/*
 * Sposta ogni volumetrico interno nel montaggio migliore del suo locale (angoli e centri delle pareti lunghe),
 * con direzione e altezza consigliata. Gli altri dispositivi restano come sono, con la loro direzione predefinita.
 */
export function optimizeDevices(project, devices, { doors = 'closed', all = devices } = {}) {
  const ctxs = {};
  return devices.map((d) => {
    const m = sensorModel(d.model);
    const floor = project.floors.find((f) => f.id === d.floor);
    const plan = floor?.plan;
    if (!m || !plan) return d;
    if (m.kind !== 'volumetric') return { ...d, ...aimDevice(plan, d) };
    const room = plan.rooms.find((r) => r.id === d.room);
    if (!room) return { ...d, ...aimDevice(plan, d) };
    if (!ctxs[floor.id]) {
      const ops = [...plan.doors.filter((x) => x.kind !== 'gate'), ...plan.windows].map((o) => opening(plan, o));
      ctxs[floor.id] = {
        boxes: obstacles(plan, { doors }),
        exits: ops.filter((op) => op.exterior),
        windows: plan.windows.map((w) => opening(plan, w)).filter((op) => op.exterior),
      };
    }
    // manuale Ajax: mai a meno di 1 m dalla centrale o da un ripetitore
    const hubs = all.filter((x) => x.floor === d.floor && HUBS.has(x.model));
    let best = null;
    for (const p of mounts(room)) {
      if (hubs.some((hb) => Math.hypot(hb.x - p.x, hb.y - p.y) < 1)) continue;
      const cand = { ...d, x: +p.x.toFixed(2), y: +p.y.toFixed(2), dir: Math.round(p.dir), h: m.mount };
      const r = score(plan, room, cand, ctxs[floor.id]);
      if (!best || r.sc > best.sc) best = { ...r, cand };
    }
    return best ? best.cand : { ...d, ...aimDevice(plan, d) };
  });
}

/* Spostamento di un dispositivo: aggancio a 5 cm, dentro la pianta, locale aggiornato. */
export function placeDevice(plan, dev, x, y) {
  const sx = Math.round(Math.min(plan.dimensions.width, Math.max(0, x)) * 20) / 20;
  const sy = Math.round(Math.min(plan.dimensions.length, Math.max(0, y)) * 20) / 20;
  const r = roomAt(plan, sx, sy);
  return { ...dev, x: sx, y: sy, room: r?.id ?? null, roomName: r?.name || dev.roomName || '' };
}

/* Avvisi di posizionamento di un sensore (manuale Ajax): altezza, sole sulla lente, fonti di calore. */
export function deviceWarnings(plan, dev, devices = []) {
  const m = sensorModel(dev.model);
  if (!m || m.kind === 'glass') return [];
  const { x, y, dir, h } = aimDevice(plan, dev);
  const out = [];
  if (devices.some((o) => o.floor === dev.floor && HUBS.has(o.model) && Math.hypot(o.x - x, o.y - y) < 1)) {
    out.push('A meno di 1 m dalla centrale: Ajax indica di installare i rilevatori ad almeno 1 m.');
  }
  if (m.kind === 'volumetric' && Math.abs(h - m.mount) > 0.05) {
    out.push(`Ajax indica il montaggio a ${String(m.mount).replace('.', ',')} m: a un'altezza diversa la portata reale cambia.`);
  }
  if (m.kind === 'outdoor' && (h < 0.8 || h > 1.3)) out.push('Ajax indica il montaggio tra 0,8 e 1,3 m da terra.');
  const facing = (px, py) => Math.abs(((Math.atan2(py - y, px - x) / deg - dir + 540) % 360) - 180);
  const room = plan.rooms.find((r) => r.id === dev.room) || roomAt(plan, x, y);
  if (m.kind === 'volumetric' && room?.kind !== 'garden') {
    const win = plan.windows.map((w) => opening(plan, w))
      .find((w) => w.exterior && w.room?.id === room?.id && facing(w.cx, w.cy) < 30 && Math.hypot(w.cx - x, w.cy - y) < 8);
    if (win) out.push('La lente guarda una finestra: il sole diretto può causare falsi allarmi.');
    const hob = plan.furniture.find((it) => HEAT.has(it.type)
      && facing(it.x + it.w / 2, it.y + it.h / 2) < 40 && Math.hypot(it.x + it.w / 2 - x, it.y + it.h / 2 - y) < 4);
    if (hob) out.push('Il piano cottura è nel campo del sensore: le variazioni di temperatura possono dare falsi allarmi.');
  }
  return out;
}

/*
 * Varchi verso l'esterno e da cosa sono protetti: contatto sul varco, tenda che ne vede il piano, rottura vetri
 * nel locale (finestre), volumetrico che vede chi entra (0,6 m dentro, a 1 m da terra).
 */
function openingsStatus(plan, devices, sensors) {
  const list = [
    ...plan.doors.map((d, i) => (d.kind === 'gate' ? null : { type: 'door', i, o: d })),
    ...plan.windows.map((w, i) => ({ type: 'window', i, o: w })),
  ].filter(Boolean);
  const out = [];
  for (const { type, i, o } of list) {
    const op = opening(plan, o);
    if (!op.exterior || !op.room || op.room.kind === 'garden') continue;
    const by = [];
    if (devices.some((d) => d.model === 'doorprotect_plus' && Math.hypot(d.x - op.cx, d.y - op.cy) <= op.w / 2 + 0.6)) by.push('Contatto');
    const plane = inside(op, 0.15);
    if (sensors.some((s) => s.m.kind === 'curtain' && look(s, plane.x, plane.y, 1.2).st === 'seen')) by.push('Tenda');
    if (type === 'window' && devices.some((d) => {
      const m = sensorModel(d.model);
      return m?.glass && (d.room === op.room.id) && Math.hypot(d.x - op.cx, d.y - op.cy) <= m.glass;
    })) by.push('Rottura vetri');
    const p = inside(op, 0.6);
    if (sensors.some((s) => s.m.kind !== 'curtain' && look(s, p.x, p.y, 1.0).st === 'seen')) by.push('Volumetrico');
    out.push({ type, index: i, room: op.room.id, roomName: op.room.name, w: o.w, x: op.cx, y: op.cy, by, ok: by.length > 0 });
  }
  return out;
}
