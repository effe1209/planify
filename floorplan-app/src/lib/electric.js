/*
 * Impianto elettrico indicativo (tavola elettrica) ricavato dalla pianta, piano per piano.
 *
 * Dotazioni minime per locale secondo i livelli prestazionali della norma CEI 64-8 cap. 37 (abitazioni):
 * numero di prese e punti luce in base al tipo e alla superficie del locale, prese TV e dati, numero
 * minimo di circuiti, illuminazione di sicurezza. Le posizioni seguono la pianta: prese ai lati del letto,
 * dietro la TV, sopra il piano di lavoro, dedicate per gli elettrodomestici; comandi accanto alle porte dal
 * lato della maniglia (deviatori, invertitori o pulsanti con relè quando i punti di comando sono di più);
 * punti luce sopra il tavolo e distribuiti nei locali; quadro accanto all'ingresso.
 *
 * È uno schema per preventivi e per parlarne con l'installatore, NON un progetto esecutivo: il progetto e
 * la dichiarazione di conformità spettano a un tecnico abilitato (DM 37/08).
 *
 * Punto = { id, floor, room, kind, x, y, nx, ny, circuit, tag?, note? }   (x, y in metri; nx, ny = verso
 *   l'interno del locale per gli oggetti a parete)
 * Collegamento = { kind: 'cmd' (comando → luce) | 'feed' (quadro → cassetta), points: [[x, y], …] }
 */
import { pointInPolygon } from './geometry';
import { inside, opening } from './ajax';
import { engineStair } from './stairs';

export const LEVELS = {
  1: { label: 'Livello 1', desc: 'Dotazione minima della CEI 64-8 per le abitazioni.' },
  2: { label: 'Livello 2', desc: 'Più prese e punti luce, comandi anche dal letto, TV e dati in camera, videocitofono.' },
  3: { label: 'Livello 3', desc: 'Dotazione ampia: TV e dati in quasi tutti i locali. Prevede anche funzioni domotiche, non disegnate.' },
};

/* Simboli: etichetta, sigla e colore (la sigla compare accanto al simbolo e in legenda). */
export const KINDS = {
  light: { label: 'Punto luce a soffitto', color: '#d97706' },
  light_wall: { label: 'Punto luce a parete (applique)', color: '#d97706' },
  light_ext: { label: 'Luce esterna IP55', color: '#d97706' },
  light_garden: { label: 'Paletto luminoso da giardino', color: '#d97706' },
  emergency: { label: 'Lampada di emergenza estraibile', tag: 'SE', color: '#16a34a' },
  switch: { label: 'Interruttore', color: '#92400e' },
  switch_2way: { label: 'Deviatore', color: '#92400e' },
  switch_inter: { label: 'Invertitore', color: '#92400e' },
  button: { label: 'Pulsante (comando con relè passo-passo)', color: '#92400e' },
  socket: { label: 'Presa 10/16 A bipasso + Schuko', color: '#1f4fd8' },
  socket_ip: { label: 'Presa stagna IP55', tag: 'IP', color: '#1f4fd8' },
  dedicated: { label: 'Presa dedicata 16 A', color: '#7a2ee6' },
  hob: { label: 'Linea piano cottura (induzione)', tag: 'PC', color: '#7a2ee6' },
  hood: { label: 'Alimentazione cappa', tag: 'CA', color: '#7a2ee6' },
  ev: { label: 'Wallbox ricarica auto', tag: 'EV', color: '#0f7b5f' },
  motor: { label: 'Motore basculante', tag: 'M', color: '#7a2ee6' },
  tv: { label: 'Presa TV', tag: 'TV', color: '#0f7b5f' },
  data: { label: 'Presa dati RJ45', tag: 'D', color: '#0f7b5f' },
  thermostat: { label: 'Termostato / cronotermostato', tag: 'T', color: '#0f7b5f' },
  fan: { label: 'Aspiratore (bagno senza finestra)', tag: 'A', color: '#7a2ee6' },
  bell: { label: 'Pulsante campanello', color: '#0f7b5f' },
  chime: { label: 'Suoneria', tag: 'S', color: '#0f7b5f' },
  intercom: { label: 'Videocitofono', tag: 'VC', color: '#0f7b5f' },
  panel: { label: 'Quadro elettrico generale', tag: 'QE', color: '#b42318' },
  subpanel: { label: 'Quadro di piano', tag: 'QP', color: '#b42318' },
  box: { label: 'Cassetta di derivazione', color: '#64748b' },
};
export const KIND_ORDER = Object.keys(KINDS);

/* Elettrodomestici delle prese dedicate. */
export const APPLIANCES = {
  FR: 'Frigorifero', FO: 'Forno', LS: 'Lavastoviglie', LV: 'Lavatrice', AS: 'Asciugatrice', LT: 'Banco da lavoro',
};

/* Circuiti: protezione e sezione del cavo indicative. */
export const CIRCUITS = {
  L: { name: 'Luci', prot: 'MT 1P+N 10 A curva C', cable: '1,5 mm²' },
  LG: { name: 'Luci zona giorno', prot: 'MT 1P+N 10 A curva C', cable: '1,5 mm²' },
  LN: { name: 'Luci zona notte', prot: 'MT 1P+N 10 A curva C', cable: '1,5 mm²' },
  P: { name: 'Prese', prot: 'MT 1P+N 16 A curva C', cable: '2,5 mm²' },
  PG: { name: 'Prese zona giorno', prot: 'MT 1P+N 16 A curva C', cable: '2,5 mm²' },
  PN: { name: 'Prese zona notte', prot: 'MT 1P+N 16 A curva C', cable: '2,5 mm²' },
  K: { name: 'Cucina: forno e lavastoviglie', prot: 'MT 1P+N 16 A curva C', cable: '2,5 mm²' },
  PC: { name: 'Piano cottura a induzione', prot: 'MT 1P+N 32 A curva C', cable: '6 mm²' },
  W: { name: 'Lavanderia e bagni: lavatrice, asciugatrice', prot: 'MT 1P+N 16 A curva C', cable: '2,5 mm²' },
  B: { name: 'Bagni: prese e aspiratori', prot: 'MT 1P+N 16 A curva C', cable: '2,5 mm²' },
  E: { name: 'Garage ed esterni', prot: 'MT 1P+N 16 A curva C', cable: '2,5 mm²' },
  EV: { name: 'Ricarica auto (wallbox)', prot: 'MT 1P+N 32 A curva C + differenziale tipo A 6 mA DC', cable: '6 mm²' },
  S: { name: 'Segnali: TV, dati, campanello, videocitofono, termostato', prot: 'Alimentatori a bassissima tensione', cable: 'cavi dedicati' },
};

const NIGHT = new Set(['bed', 'closet', 'bath']);
const DAY_KINDS = new Set(['living', 'living_kitchen', 'dining', 'kitchen']);
const CIRCULATION = new Set(['corridor', 'entry']);
// locali «di arrivo»: da lì non si comanda la luce del locale da cui si entra
const DEAD_END = new Set(['bed', 'bath', 'wc', 'closet', 'storage', 'laundry', 'study']);
const COMMAND = new Set(['switch', 'switch_2way', 'switch_inter', 'button']);
const LIGHTS = new Set(['light', 'light_wall', 'fan']);
const SOCKETS = new Set(['socket', 'socket_ip', 'dedicated']);
// arredi davanti ai quali una presa «libera» non serve (o non è ammessa, vicino all'acqua)
const BLOCKING = new Set(['wardrobe', 'shelving', 'shelving_heavy', 'kitchen_counter', 'bathtub', 'shower',
  'shower_walkin', 'shower_round', 'toilet', 'bidet', 'washer', 'dryer', 'utility_sink', 'bed', 'sofa',
  'sofa_corner', 'car', 'workbench', 'minibar', 'bookcase', 'sideboard', 'dresser', 'shoe_cabinet']);
const WATER = new Set(['bathtub', 'shower', 'shower_walkin', 'shower_round']);

/* ── geometria ── */
const contains = (r, x, y) =>
  r.poly ? pointInPolygon([x, y], r.poly) : x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
const roomAt = (plan, x, y) => plan.rooms.find((r) => contains(r, x, y)) || null;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const area = (r) => r.area ?? r.w * r.h;
const center = (f) => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });
const rectDist = (p, f) => Math.hypot(Math.max(f.x - p.x, 0, p.x - f.x - f.w), Math.max(f.y - p.y, 0, p.y - f.y - f.h));
const ROT_BY_FACING = { S: 0, N: 180, E: -90, W: 90 };   // come in PlanSvg (Oriented)

/* Punto di un arredo nel suo riferimento (lx lungo il fronte, ly dal retro), in metri sulla pianta. */
export function itemPoint(f, lx, ly) {
  const side = f.facing === 'E' || f.facing === 'W';
  const cw = side ? f.h : f.w;
  const ch = side ? f.w : f.h;
  let x = lx - cw / 2;
  const y = ly - ch / 2;
  if (f.flip) x = -x;
  const a = ((ROT_BY_FACING[f.facing || 'S'] || 0) * Math.PI) / 180;
  return { x: f.x + f.w / 2 + x * Math.cos(a) - y * Math.sin(a), y: f.y + f.h / 2 + x * Math.sin(a) + y * Math.cos(a) };
}
export const itemLength = (f) => (f.facing === 'E' || f.facing === 'W' ? f.h : f.w);

/* Punto nel riferimento di una porta: lx lungo il varco (0 = cardine), ly attraverso il muro. */
function doorPoint(plan, d, lx, ly) {
  const a = (d.rot * Math.PI) / 180;
  return { x: d.x + lx * Math.cos(a) - ly * Math.sin(a), y: d.y + lx * Math.sin(a) + ly * Math.cos(a) };
}

/*
 * Posizioni possibili lungo i muri di un locale, a filo della parete: un punto ogni `step` metri,
 * con la normale verso l'interno. I lati aperti su un locale della stessa zona (nessun muro) non contano.
 */
export function wallSpots(plan, r, step = 0.2) {
  const t = plan.wallThickness / plan.scale;
  const { width: W, length: L } = plan.dimensions;
  const pts = r.poly || [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 0.5) continue;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    let nx = -uy;
    let ny = ux;
    if (!contains(r, (ax + bx) / 2 + nx * 0.3, (ay + by) / 2 + ny * 0.3)) { nx = -nx; ny = -ny; }
    const edgeOf = (v, max) => v < 1e-3 || Math.abs(v - max) < 1e-3;
    const perimeter = (Math.abs(ax - bx) < 1e-6 && edgeOf(ax, W)) || (Math.abs(ay - by) < 1e-6 && edgeOf(ay, L));
    const inset = (perimeter ? t : t / 2) + 0.06;
    for (let d = 0.3; d <= len - 0.3 + 1e-6; d += step) {
      const bxp = ax + ux * d;
      const byp = ay + uy * d;
      const beyond = roomAt(plan, bxp - nx * 0.15, byp - ny * 0.15);
      if (beyond && beyond.id !== r.id && beyond.zone === r.zone) continue;   // lato aperto, niente muro
      const p = { x: bxp + nx * inset, y: byp + ny * inset, nx, ny, edge: i, interior: !!beyond && beyond.kind !== 'garden' };
      if (contains(r, p.x, p.y)) out.push(p);
    }
  }
  return out;
}

/* ── dotazioni minime per locale (prese, punti luce, TV, dati) per livello 1, 2, 3 ── */
function need(r, level) {
  const L = level - 1;
  const a = area(r);
  const long = Math.max(r.w, r.h);
  const room = a <= 8 ? [[2, 3, 4], [1, 1, 1]] : a <= 12 ? [[4, 5, 6], [1, 2, 2]]
    : a <= 20 ? [[5, 7, 8], [1, 2, 3]] : [[6, 8, 10], [2, 3, 4]];
  let s = room[0];
  let l = room[1];
  let tv = [0, 0, 0];
  let data = [0, 0, 0];
  switch (r.kind) {
    case 'living':
      tv = [1, 1, 1]; data = [1, 1, 1];
      break;
    case 'living_kitchen':
      s = s.map((v, i) => v + [2, 2, 3][i]); tv = [1, 1, 1]; data = [1, 1, 1];
      break;
    case 'kitchen':
      s = [5, 6, 7]; l = [1, 2, 2]; tv = [0, 0, 1];
      break;
    case 'bed':
      tv = r.size === 'single' ? [0, 0, 1] : [0, 1, 1]; data = r.size === 'single' ? [0, 1, 1] : [0, 0, 1];
      break;
    case 'study':
      data = [1, 1, 1]; tv = [0, 0, 1];
      break;
    case 'dining': case 'hotel_room': case 'office_open': case 'meeting': case 'director':
      break;
    case 'laundry': s = [3, 4, 4]; l = [1, 1, 2]; break;
    case 'bath': s = [2, 2, 2]; l = [2, 2, 2]; break;
    case 'wc': s = [1, 1, 1]; l = [1, 1, 1]; break;
    case 'corridor':
      s = long <= 5 ? [1, 1, 1] : [2, 2, 2]; l = long <= 5 ? [1, 1, 2] : [2, 2, 3];
      break;
    case 'entry': s = [1, 1, 1]; l = [1, 1, 1]; break;
    case 'closet': case 'storage': s = [0, 0, 1]; l = [1, 1, 1]; break;
    case 'garage': s = [1, 1, 2]; l = [1, 1, 1].map((v) => Math.max(v, Math.ceil(a / 15))); break;
    case 'stairs': s = [0, 0, 0]; l = [1, 1, 1]; break;
    default: break;
  }
  return { sockets: s[L], lights: l[L], tv: tv[L], data: data[L] };
}

/* Circuiti minimi per superficie del piano (CEI 64-8 cap. 37). */
function minCircuits(a, level) {
  const row = a <= 50 ? [2, 3, 3] : a <= 75 ? [3, 3, 4] : a <= 125 ? [4, 5, 5] : [5, 6, 7];
  return row[level - 1];
}

/* ── un piano ── */
function planFloor(project, floor, level, stairRole, main) {
  const plan = floor.plan;
  const t = plan.wallThickness / plan.scale;
  const points = [];
  const links = [];
  const notes = [];
  const rooms = [];
  let n = 0;
  const add = (kind, r, p, extra = {}) => {
    const pt = { id: `${floor.id}-e${++n}`, floor: floor.id, room: r?.id ?? null, kind,
      x: +p.x.toFixed(3), y: +p.y.toFixed(3), nx: p.nx ?? 0, ny: p.ny ?? 0, ...extra };
    points.push(pt);
    return pt;
  };
  const doors = plan.doors.filter((d) => d.kind !== 'gate').map((d) => ({ d, op: opening(plan, d) }));
  const windows = plan.windows.map((w) => opening(plan, w));
  const items = (r) => plan.furniture.filter((f) => f.room === r.id || (!f.room && contains(r, f.x + f.w / 2, f.y + f.h / 2)));
  const garden = plan.rooms.length > 0 && plan.rooms.every((r) => r.kind === 'garden');

  /* Le porte di un locale: per ognuna il punto appena dentro il locale (lx lungo il varco) e i lati. */
  const doorSide = (d, r) => {
    for (const side of [1, -1]) {
      const p = doorPoint(plan, d, d.w / 2, t / 2 + side * (t / 2 + 0.3));
      if (contains(r, p.x, p.y)) return side;
    }
    return 0;
  };
  const atDoor = (d, r, lx, depth = 0.08) => {
    const side = doorSide(d, r);
    if (!side) return null;
    const a = (d.rot * Math.PI) / 180;
    const p = doorPoint(plan, d, lx, t / 2 + side * (t / 2 + depth));
    const nx = -Math.sin(a) * side;
    const ny = Math.cos(a) * side;
    return contains(r, p.x, p.y) ? { ...p, nx, ny } : null;
  };
  // comando accanto alla porta, dal lato della maniglia (opposto al cardine); se lì non c'è muro, dall'altro
  const switchSpot = (d, r, extra = 0) => atDoor(d, r, d.w + 0.2 + extra) || atDoor(d, r, -0.2 - extra);

  /* Posizioni libere sui muri di un locale per le prese «a muro» (né porte, né finestre, né arredi davanti). */
  const freeSpots = (r, { strict = true } = {}) => {
    const its = items(r);
    return wallSpots(plan, r).filter((p) => {
      for (const { d, op } of doors) {
        if (Math.hypot(p.x - op.cx, p.y - op.cy) < d.w / 2 + 0.3) return false;
        // dietro l'anta aperta: dal lato in cui la porta si apre, fino alla larghezza dell'anta
        const hinge = doorPoint(plan, d, 0, t / 2);
        const a = (d.rot * Math.PI) / 180;
        const sx = -Math.sin(a) * d.openDir;
        const sy = Math.cos(a) * d.openDir;
        if (Math.hypot(p.x - hinge.x, p.y - hinge.y) < d.w + 0.1 && (p.x - hinge.x) * sx + (p.y - hinge.y) * sy > 0) return false;
      }
      if (windows.some((op) => Math.hypot(p.x - op.cx, p.y - op.cy) < op.w / 2 + 0.1)) return false;
      if (strict && its.some((f) => BLOCKING.has(f.type) && rectDist(p, f) < 0.12)) return false;
      if (its.some((f) => WATER.has(f.type) && rectDist(p, f) < 0.6)) return false;   // zone 0-1-2 del bagno
      return true;
    });
  };
  /* Il punto a muro più vicino a `q` (ammessi anche dietro gli arredi: serve per letto, TV, scrivania…). */
  const nearestWall = (r, q, max = 1.6, used = []) => {
    const spots = freeSpots(r, { strict: false }).filter((p) => used.every((u) => dist(u, p) > 0.25));
    let best = null;
    for (const p of spots) if (!best || dist(p, q) < dist(best, q)) best = p;
    return best && dist(best, q) <= max ? best : null;
  };

  /* ── locali ── */
  const zones = new Map();   // zona (open space) → { rooms, lights, controls }
  for (const r of plan.rooms) {
    if (r.kind === 'garden' || r.kind === 'stairs') continue;
    const z = zones.get(r.zone) || { rooms: [], lights: [], controls: [] };
    z.rooms.push(r);
    zones.set(r.zone, z);
  }
  const zoneOf = (r) => zones.get(r.zone);

  for (const r of plan.rooms) {
    if (r.kind === 'garden' || (r.kind === 'garage' && !r.name)) continue;   // i pezzi di box attorno alla scala
    const req = need(r, level);
    const its = items(r);
    const got = { sockets: 0, lights: 0, tv: 0, data: 0 };
    const sockets = [];
    const sock = (kind, p, extra = {}) => {
      if (!p) return null;
      const pt = add(kind, r, p, extra);
      if (SOCKETS.has(kind)) { got.sockets += 1; sockets.push(pt); }
      if (kind === 'tv') got.tv += 1;
      if (kind === 'data') got.data += 1;
      return pt;
    };

    if (r.kind === 'stairs') {
      const p = add('light', r, center(r));
      got.lights = 1;
      rooms.push({ id: r.id, name: 'Scala', kind: r.kind, need: req, got });
      const st = engineStair(plan);
      const entry = st ? { N: { x: st.x + st.w / 2, y: st.y }, S: { x: st.x + st.w / 2, y: st.y + st.h },
        W: { x: st.x, y: st.y + st.h / 2 }, E: { x: st.x + st.w, y: st.y + st.h / 2 } }[st.entry] : center(r);
      const sw = nearestWall(r, entry, 3) || wallSpots(plan, r)[0];
      if (sw) {
        const c = add(stairRole, r, sw, { note: 'Luce scala comandata da tutti i piani' });
        links.push({ kind: 'cmd', points: [[c.x, c.y], [p.x, p.y]] });
      }
      continue;
    }

    // arredi che chiamano prese e attacchi
    for (const f of its) {
      const len = itemLength(f);
      switch (f.type) {
        case 'nightstand': sock('socket', nearestWall(r, center(f), 1.2, sockets)); break;
        case 'tv': {
          const p = nearestWall(r, itemPoint(f, len / 2, 0), 1.2, sockets);
          if (p) {
            const ux = -p.ny;
            const uy = p.nx;
            sock('socket', { ...p, x: p.x - ux * 0.3, y: p.y - uy * 0.3 });
            sock('socket', { ...p, x: p.x + ux * 0.3, y: p.y + uy * 0.3 });
            if (req.tv) sock('tv', p);
            if (req.data) sock('data', { ...p, x: p.x + ux * 0.6, y: p.y + uy * 0.6 });
          }
          break;
        }
        case 'desk': {
          const p = nearestWall(r, itemPoint(f, len * 0.8, 0), 1.2, sockets);
          sock('socket', p);
          if (p && req.data > got.data) sock('data', { ...p, x: p.x - p.ny * 0.3, y: p.y + p.nx * 0.3 });
          break;
        }
        case 'sofa': case 'sofa_corner': {
          for (const lx of [-0.15, len + 0.15]) sock('socket', nearestWall(r, itemPoint(f, lx, 0.4), 1.0, sockets));
          break;
        }
        case 'kitchen_counter': {
          const fridge = len >= 3 && !points.some((p) => p.tag === 'FR');
          const f0 = fridge ? 0.62 : 0;
          const usable = len - f0;
          const sinkW = Math.min(usable * 0.3, 0.8);
          // posizioni scelte dal motore (f.parts, centri in metri) o quelle standard del disegno
          const hob = f.parts?.hob ?? f0 + usable * (fridge ? 0.3 : 0.18) + 0.3;
          const sink = f.parts?.sink != null ? f.parts.sink - sinkW / 2 : f0 + usable * 0.58;
          const at = (lx, kind, extra) => {
            const q = itemPoint(f, lx, 0);
            const p = nearestWall(r, q, 0.6) || { ...q, nx: 0, ny: 0 };
            return sock(kind, p, extra);
          };
          if (fridge) at(0.31, 'dedicated', { tag: 'FR' });
          if (!points.some((p) => p.kind === 'hob')) {
            at(hob, 'hob');
            at(hob + 0.25, 'dedicated', { tag: 'FO' });
            at(hob, 'hood');
            at(Math.min(len - 0.2, sink + sinkW + 0.3), 'dedicated', { tag: 'LS' });
            // prese sul piano di lavoro, lontano da fuochi e lavello
            at(Math.max(f0 + 0.25, hob - 0.55), 'socket');
            if (len - (sink + sinkW) > 0.9) at(len - 0.3, 'socket');
            else at((hob + sink) / 2 + 0.1, 'socket');
          } else {
            at(len / 2, 'socket');
          }
          break;
        }
        case 'washer': sock('dedicated', nearestWall(r, itemPoint(f, len / 2, 0), 0.9, sockets), { tag: 'LV' }); break;
        case 'dryer': sock('dedicated', nearestWall(r, itemPoint(f, len / 2, 0), 0.9, sockets), { tag: 'AS' }); break;
        case 'workbench': sock('socket', nearestWall(r, itemPoint(f, len / 2, 0), 1.0, sockets)); break;
        case 'sink':
          if (r.kind === 'bath' || r.kind === 'wc') {
            const p = nearestWall(r, itemPoint(f, len / 2, 0), 0.8);
            if (p) {
              add('light_wall', r, p);
              got.lights += 1;
              sock('socket', nearestWall(r, itemPoint(f, len + 0.25, 0), 0.8, [p, ...sockets]));
            }
          }
          break;
        case 'car':
          if (!points.some((p) => p.kind === 'ev')) sock('ev', nearestWall(r, center(f), 3.5, sockets));
          break;
        default: break;
      }
    }
    // la sola TV non basta: in camera e in cucina (livelli 2-3) la presa TV va di fronte al letto / sul muro libero
    const spread = (kind, count, extra = {}) => {
      for (let k = 0; k < count; k++) {
        const used = points.filter((p) => p.room === r.id && (SOCKETS.has(p.kind) || p.kind === 'tv' || p.kind === 'data'));
        const spots = freeSpots(r).filter((p) => used.every((u) => dist(u, p) > 0.6));
        if (!spots.length) return false;
        // il più lontano dalle prese già messe: copertura uniforme del locale
        const score = (p) => (used.length ? Math.min(...used.map((u) => dist(u, p))) : -dist(p, center(r)));
        sock(kind, spots.reduce((b, p) => (score(p) > score(b) ? p : b)), extra);
      }
      return true;
    };
    if (req.tv > got.tv) spread('tv', req.tv - got.tv);
    if (req.data > got.data) spread('data', req.data - got.data);
    if (req.sockets > got.sockets) spread(r.kind === 'garage' ? 'socket_ip' : 'socket', req.sockets - got.sockets);
    if (got.sockets < req.sockets) {
      notes.push(`${r.name}: poca parete libera, ${got.sockets} prese su ${req.sockets} richieste.`);
    }

    // punti luce: sopra il tavolo, poi distribuiti lungo il lato lungo
    const z = zoneOf(r);
    const ceiling = req.lights - got.lights;   // l'applique del bagno conta già
    const spots = [];
    const table = its.find((f) => ['table', 'table_round', 'kitchen_peninsula'].includes(f.type));
    if (table && ceiling > 0) spots.push(center(table));
    const lounge = its.find((f) => f.type === 'coffee_table') || its.find((f) => f.type === 'sofa' || f.type === 'sofa_corner');
    if (lounge && spots.length < ceiling) spots.push(center(lounge));
    const left = ceiling - spots.length;
    for (let k = 0; k < left; k++) {
      const f = (k + 0.5) / left;
      const p = r.w >= r.h ? { x: r.x + r.w * f, y: r.y + r.h / 2 } : { x: r.x + r.w / 2, y: r.y + r.h * f };
      spots.push(contains(r, p.x, p.y) ? p : center(r));
    }
    for (const p of spots.slice(0, Math.max(1, ceiling))) {
      z.lights.push(add('light', r, p));
      got.lights += 1;
    }
    for (const p of points.filter((q) => q.room === r.id && q.kind === 'light_wall')) z.lights.push(p);
    // bagno senza finestra: aspiratore comandato con la luce
    if ((r.kind === 'bath' || r.kind === 'wc') && !windows.some((op) => op.room?.id === r.id && op.exterior)) {
      const c = center(r);
      z.lights.push(add('fan', r, { x: c.x + Math.min(0.5, r.w / 4), y: c.y }));
    }
    rooms.push({ id: r.id, name: r.name || 'Garage', kind: r.kind, need: req, got });
  }

  /* ── comandi delle luci, zona per zona ── */
  const otherSide = (op, r) => {
    for (const side of [1, -1]) {
      const p = { x: op.cx + op.nx * side * (op.t / 2 + 0.3), y: op.cy + op.ny * side * (op.t / 2 + 0.3) };
      const q = roomAt(plan, p.x, p.y);
      if (q?.id !== r.id) return q;
    }
    return null;
  };
  const boxes = [];
  for (const z of zones.values()) {
    const ids = new Set(z.rooms.map((r) => r.id));
    const zd = doors.filter(({ d }) => z.rooms.some((r) => doorSide(d, r)) && d.kind !== 'garage');
    const linked = zd.map(({ d, op }) => {
      const r = z.rooms.find((x) => doorSide(d, x));
      const o = otherSide(op, r);
      return { d, op, r, o: o && !ids.has(o.id) ? o : null };
    });
    let ctl = linked.filter((x) => !x.o || !DEAD_END.has(x.o.kind) || x.d.entrance);
    if (!ctl.length) ctl = linked.slice(0, 1);
    const spots = ctl.map(({ d, r }) => ({ r, p: switchSpot(d, r) })).filter((c) => c.p);
    // dal letto matrimoniale (livello 2 e 3): comando ai due lati
    if (level >= 2) {
      for (const r of z.rooms.filter((x) => x.kind === 'bed' && x.size !== 'single')) {
        for (const f of items(r).filter((x) => x.type === 'nightstand')) {
          const p = nearestWall(r, center(f), 1.2, [...points, ...spots.map((c) => c.p)]);
          if (p) spots.push({ r, p });
        }
      }
    }
    const k = spots.length;
    spots.forEach(({ r, p }, i) => {
      const kind = k === 1 ? 'switch' : k === 2 ? 'switch_2way' : k === 3 ? (i < 2 ? 'switch_2way' : 'switch_inter') : 'button';
      const c = add(kind, r, p);
      z.controls.push(c);
      for (const l of z.lights) links.push({ kind: 'cmd', points: [[c.x, c.y], [l.x, l.y]] });
    });
    if (k >= 4) notes.push(`${z.rooms[0].name}: ${k} punti di comando, pulsanti con relè passo-passo nel quadro.`);
    // cassetta di derivazione della zona, accanto alla prima porta dal lato del cardine
    const first = ctl[0] || linked[0];
    const bp = first && (atDoor(first.d, first.r, -0.45, 0.35) || atDoor(first.d, first.r, first.d.w + 0.6, 0.35));
    if (bp) boxes.push(add('box', first.r, bp));
  }

  /* ── ingresso, quadro, segnali, sicurezza ── */
  const entrance = doors.find(({ d, op }) => d.entrance && !d.kind && op.exterior);
  if (entrance) {
    const { d, op } = entrance;
    const r = op.room;
    const out = { x: op.cx - op.nx * (op.t / 2 + 0.3), y: op.cy - op.ny * (op.t / 2 + 0.3) };
    const ext = add('light_ext', null, out);
    const extSw = switchSpot(d, r, 0.18);
    if (extSw) {
      const c = add('switch', r, extSw, { note: 'Luce esterna' });
      links.push({ kind: 'cmd', points: [[c.x, c.y], [ext.x, ext.y]] });
    }
    add('bell', null, { x: out.x + op.ux * (op.w / 2 + 0.35), y: out.y + op.uy * (op.w / 2 + 0.35) });
    const vc = switchSpot(d, r, 0.42);
    if (vc) add(level >= 2 ? 'intercom' : 'chime', r, vc);
  }
  const garageDoor = doors.find(({ d, op }) => d.kind === 'garage' && op.exterior);
  if (garageDoor) {
    const { op } = garageDoor;
    add('motor', op.room, inside(op, 0.7));
    add('light_ext', null, { x: op.cx - op.nx * (op.t / 2 + 0.3) + op.ux * (op.w / 2 + 0.4), y: op.cy - op.ny * (op.t / 2 + 0.3) + op.uy * (op.w / 2 + 0.4) });
  }

  // quadro: generale all'ingresso del piano principale, di piano vicino alla scala sugli altri
  let panel = null;
  if (!garden) {
    if (main && entrance) {
      const { d, op } = entrance;
      const p = atDoor(d, op.room, -(d.w + 0.45)) || atDoor(d, op.room, d.w + 0.95);
      if (p) panel = add('panel', op.room, p);
    }
    if (!panel) {
      const stairs = plan.rooms.find((r) => r.kind === 'stairs');
      const host = plan.rooms.filter((r) => CIRCULATION.has(r.kind) || r.kind === 'garage')
        .sort((a, b) => (stairs ? dist(center(a), center(stairs)) - dist(center(b), center(stairs)) : area(b) - area(a)))[0]
        || plan.rooms.filter((r) => r.kind !== 'stairs').sort((a, b) => area(b) - area(a))[0];
      const target = stairs ? center(stairs) : host && center(host);
      const p = host && nearestWall(host, target, 99, points);
      if (p) panel = add(main ? 'panel' : 'subpanel', host, p);
    }
    for (const b of boxes) {
      if (!panel) break;
      // dorsale dal quadro alla cassetta: tratto orizzontale e poi verticale
      links.push({ kind: 'feed', points: [[panel.x, panel.y], [b.x, panel.y], [b.x, b.y]] });
    }
  }

  // termostato nel locale giorno principale, su un muro interno
  const dayRoom = plan.rooms.filter((r) => DAY_KINDS.has(r.kind) && r.kind !== 'kitchen').sort((a, b) => area(b) - area(a))[0];
  if (dayRoom) {
    const spots = freeSpots(dayRoom).filter((p) => p.interior && points.every((q) => dist(q, p) > 0.4));
    const c = center(dayRoom);
    const p = spots.sort((a, b) => dist(a, c) - dist(b, c))[0];
    if (p) add('thermostat', dayRoom, p);
  }

  // illuminazione di sicurezza: lungo la via d'uscita (disimpegno, ingresso, garage), almeno una per piano
  const totalArea = plan.rooms.filter((r) => r.kind !== 'garden').reduce((s, r) => s + area(r), 0);
  const emergencies = garden ? 0 : [1, 1, 2][level - 1] + Math.floor(totalArea / 100);
  const exitRooms = [...plan.rooms.filter((r) => CIRCULATION.has(r.kind) || r.kind === 'garage' || r.kind === 'stairs'),
    ...plan.rooms.filter((r) => DAY_KINDS.has(r.kind))];
  for (let k = 0; k < emergencies; k++) {
    const r = exitRooms[k % Math.max(1, exitRooms.length)];
    if (!r) break;
    const spots = freeSpots(r, { strict: false }).filter((p) => points.every((q) => dist(q, p) > 0.5));
    const target = entrance && entrance.op.room?.id === r.id ? { x: entrance.op.cx, y: entrance.op.cy } : center(r);
    const p = spots.sort((a, b) => dist(a, target) - dist(b, target))[0];
    if (p) add('emergency', r, p);
  }

  // giardino: paletti lungo il camminamento e una presa stagna verso la casa
  if (garden) {
    const r = plan.rooms[0];
    for (const f of plan.furniture.filter((x) => x.type === 'path')) {
      const steps = Math.max(1, Math.round(Math.max(f.w, f.h) / 4));
      for (let k = 0; k <= steps; k++) {
        const vert = f.h >= f.w;
        add('light_garden', r, vert ? { x: f.x + f.w + 0.3, y: f.y + (f.h * k) / steps } : { x: f.x + (f.w * k) / steps, y: f.y + f.h + 0.3 });
      }
    }
    add('socket_ip', r, { x: r.x + r.w / 2, y: r.y + 0.4, nx: 0, ny: 1 });
    notes.push('Luci del giardino comandate da interruttore crepuscolare e orologio nel quadro generale.');
  }

  /* ── circuiti ── */
  const night = (p) => {
    const r = plan.rooms.find((x) => x.id === p.room);
    return !!r && NIGHT.has(r.kind);
  };
  const need2 = minCircuits(totalArea, level);
  const has = (pred) => points.some(pred);
  const fixed = [
    has((p) => p.tag === 'FO' || p.tag === 'LS') && 'K',
    has((p) => p.kind === 'hob') && 'PC',
    has((p) => p.tag === 'LV' || p.tag === 'AS') && 'W',
    has((p) => p.kind === 'ev') && 'EV',
    (garden || has((p) => p.kind === 'motor' || p.kind === 'light_ext')) && 'E',
  ].filter(Boolean);
  const split = !garden && 2 + fixed.length < need2 && has(night) && has((p) => !night(p));
  for (const p of points) {
    const r = plan.rooms.find((x) => x.id === p.room);
    const outdoor = !r || r.kind === 'garage' || r.kind === 'garden';
    if (['tv', 'data', 'bell', 'chime', 'intercom', 'thermostat'].includes(p.kind)) p.circuit = 'S';
    else if (p.tag === 'FO' || p.tag === 'LS') p.circuit = 'K';
    else if (p.kind === 'hob') p.circuit = 'PC';
    else if (p.tag === 'LV' || p.tag === 'AS') p.circuit = 'W';
    else if (p.kind === 'ev') p.circuit = 'EV';
    else if (outdoor && fixed.includes('E')) p.circuit = 'E';
    else if (LIGHTS.has(p.kind) || COMMAND.has(p.kind) || p.kind === 'light_wall' || p.kind === 'emergency') {
      p.circuit = split ? (night(p) ? 'LN' : 'LG') : 'L';
    } else if (SOCKETS.has(p.kind) || p.kind === 'hood' || p.kind === 'motor') {
      p.circuit = split ? (night(p) ? 'PN' : 'PG') : 'P';
    }
  }
  // ancora sotto il minimo: le prese dei bagni su un circuito proprio
  const powerKeys = () => new Set(points.map((p) => p.circuit).filter((c) => c && c !== 'S')).size;
  const wetRoom = (p) => ['bath', 'wc'].includes(plan.rooms.find((x) => x.id === p.room)?.kind);
  if (!garden && powerKeys() < need2 && points.some((p) => wetRoom(p) && SOCKETS.has(p.kind))) {
    for (const p of points) if (wetRoom(p) && (SOCKETS.has(p.kind) || p.kind === 'fan')) p.circuit = 'B';
  }
  const order = Object.keys(CIRCUITS);
  const circuits = [...new Set(points.map((p) => p.circuit).filter(Boolean))]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((key) => {
      const pts = points.filter((p) => p.circuit === key);
      return { key, ...CIRCUITS[key], points: pts.length,
        sockets: pts.filter((p) => SOCKETS.has(p.kind)).length, lights: pts.filter((p) => LIGHTS.has(p.kind)).length };
    });
  const power = circuits.filter((c) => c.key !== 'S').length;
  if (!garden && power < need2) {
    notes.push(`Circuiti di potenza: ${power} su ${need2} richiesti dal livello ${level}: separa le prese per zona nel quadro.`);
  }

  return { floor: floor.id, name: floor.name, points, links, rooms, circuits, notes, area: totalArea, minCircuits: need2, panel: panel?.kind || null };
}

/* Piano principale: quello con l'ingresso pedonale, preferendo il piano terra. */
function mainFloorId(project) {
  const withEntrance = project.floors.filter((f) => f.plan?.doors.some((d) => d.entrance && !d.kind));
  const pool = withEntrance.length ? withEntrance : project.floors.filter((f) => f.plan && f.level !== 'out');
  return (pool.find((f) => f.level === 0) || pool[0])?.id ?? null;
}

/*
 * Impianto del progetto: { level, floors: { [floorId]: piano }, bom: [{ kind, tag?, label, qty }] }.
 * La luce della scala si comanda da ogni piano: deviatori ai piani estremi, invertitori in mezzo.
 */
export function planElectric(project, { level = 2 } = {}) {
  const lv = [1, 2, 3].includes(level) ? level : 2;
  const main = mainFloorId(project);
  const withStairs = project.floors.filter((f) => typeof f.level === 'number' && f.plan?.rooms.some((r) => r.kind === 'stairs'))
    .sort((a, b) => a.level - b.level);
  const role = (f) => {
    const i = withStairs.findIndex((x) => x.id === f.id);
    if (withStairs.length < 2 || i < 0) return 'switch';
    return i === 0 || i === withStairs.length - 1 ? 'switch_2way' : 'switch_inter';
  };
  const floors = {};
  for (const f of project.floors) {
    if (f.plan?.rooms?.length) floors[f.id] = planFloor(project, f, lv, role(f), f.id === main);
  }
  const counts = new Map();
  for (const fl of Object.values(floors)) {
    for (const p of fl.points) {
      const key = p.tag && p.kind === 'dedicated' ? `dedicated:${p.tag}` : p.kind;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const bom = [...counts].map(([key, qty]) => {
    const [kind, tag] = key.split(':');
    return { kind, tag, qty, label: tag ? `${KINDS[kind].label} (${APPLIANCES[tag] || tag})` : KINDS[kind].label };
  }).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || String(a.tag).localeCompare(String(b.tag)));
  return { level: lv, floors, bom };
}
