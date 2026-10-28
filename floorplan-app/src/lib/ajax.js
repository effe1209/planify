/*
 * Disposizione ottimale allarme: analizza stanze e varchi di ogni piano e propone i dispositivi
 * ufficiali Ajax Systems (catalogo in data/ajax-catalog.json).
 *
 * Dispositivo = { id, model, floor, room, roomName, x, y, purpose }   (x, y in metri sulla pianta)
 * Regole:
 *   garage       DoorProtect Plus sulla basculante + FireProtect 2
 *   lavanderia   LeaksProtect a terra vicino a lavatrice / lavatoio
 *   ripostiglio  FireProtect 2 (+ MotionProtect se dà sull'esterno)
 *   cucina       FireProtect 2
 *   giorno       MotionProtect, CombiProtect se ci sono vetrate ampie
 *   giardino     MotionCam Outdoor PhOD sugli angoli scoperti + DualCurtain Outdoor lungo la facciata
 *   varchi       porte esterne DoorProtect Plus, finestre DoorProtect Plus, vetrate MotionProtect Curtain
 *   ingresso     KeyPad TouchScreen all'interno, Hub 2 Plus in un locale centrale e protetto, StreetSiren in facciata
 */
import catalog from '../data/ajax-catalog.json';
import { pointInPolygon } from './geometry';

const EXTRA = {
  category: 'Intrusione Interna',
  models: [{ id: 'motionprotect_curtain', name: 'MotionProtect Curtain', type: 'PIR a tenda', use: 'Finestre ampie e vetrate' }],
};

export const AJAX_MODELS = Object.fromEntries(
  [...catalog, EXTRA].flatMap((c) => c.models.map((m) => [m.id, { ...m, category: c.category }])),
);

/* Sigla e colore del simbolo sulla pianta, per famiglia. */
export const DEVICE_STYLE = {
  hub2_plus: { tag: 'HUB', color: '#111827' },
  keypad_touchscreen: { tag: 'KP', color: '#111827' },
  streetsiren: { tag: 'SR', color: '#b42318' },
  doorprotect_plus: { tag: 'DP', color: '#1f4fd8' },
  motionprotect: { tag: 'MP', color: '#7a2ee6' },
  motionprotect_curtain: { tag: 'MC', color: '#7a2ee6' },
  combiprotect: { tag: 'CP', color: '#7a2ee6' },
  motioncam_phod: { tag: 'MCam', color: '#7a2ee6' },
  motioncam_outdoor: { tag: 'MO', color: '#0f7b5f' },
  dualcurtain_outdoor: { tag: 'DC', color: '#0f7b5f' },
  fireprotect2_co: { tag: 'FP', color: '#d9480f' },
  leaksprotect: { tag: 'LK', color: '#0b84c6' },
};

const WIDE_WINDOW = 1.8;            // da qui una finestra è una «vetrata»
const DAY = new Set(['living', 'living_kitchen', 'dining', 'study', 'hotel_room']);
const HUB_ROOMS = ['storage', 'closet', 'corridor', 'study'];
const TALL_GARDEN = new Set(['gazebo', 'tree']);

/* ── geometria ── */
const contains = (r, x, y) =>
  r.poly ? pointInPolygon([x, y], r.poly) : x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
const roomAt = (plan, x, y) => plan.rooms.find((r) => contains(r, x, y)) || null;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/* Un varco (porta o finestra) visto dai due lati: centro, normale, stanza interna e se dà sull'esterno. */
function opening(plan, o) {
  const t = plan.wallThickness / plan.scale;
  const a = (o.rot * Math.PI) / 180;
  const ux = Math.cos(a), uy = Math.sin(a);   // lungo il muro
  const nx = -uy, ny = ux;                    // attraverso il muro
  const cx = o.x + ux * (o.w / 2) + nx * (t / 2);
  const cy = o.y + uy * (o.w / 2) + ny * (t / 2);
  const off = t / 2 + 0.3;
  const A = roomAt(plan, cx + nx * off, cy + ny * off);
  const B = roomAt(plan, cx - nx * off, cy - ny * off);
  const outside = (r) => !r || r.kind === 'garden';
  const exterior = outside(A) !== outside(B);
  const room = outside(A) ? B : A;
  const sign = room === A ? 1 : -1;           // verso l'interno della stanza
  return { cx, cy, ux, uy, nx: nx * sign, ny: ny * sign, t, w: o.w, room, exterior };
}

/* Punto appena dentro la stanza, sul varco (spostato di `along` metri lungo il muro). */
const inside = (op, depth = 0.12, along = 0) => ({
  x: op.cx + op.nx * (op.t / 2 + depth) + op.ux * along,
  y: op.cy + op.ny * (op.t / 2 + depth) + op.uy * along,
});

const corners = (r, inset) => [
  [r.x + inset, r.y + inset], [r.x + r.w - inset, r.y + inset],
  [r.x + inset, r.y + r.h - inset], [r.x + r.w - inset, r.y + r.h - inset],
].filter(([x, y]) => contains(r, x, y));

/* Angolo da cui un sensore volumetrico guarda i varchi: il più lontano dalle aperture verso l'esterno. */
function watchCorner(r, targets) {
  const cs = corners(r, 0.3);
  if (!cs.length) return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  if (!targets.length) return { x: cs[0][0], y: cs[0][1] };
  const score = ([x, y]) => Math.min(...targets.map((p) => dist(x, y, p.cx, p.cy)));
  const [x, y] = cs.reduce((best, c) => (score(c) > score(best) ? c : best));
  return { x, y };
}

const centroid = (plan) => {
  const rs = plan.rooms.filter((r) => r.kind !== 'garden');
  const a = rs.reduce((s, r) => s + r.w * r.h, 0) || 1;
  return {
    x: rs.reduce((s, r) => s + (r.x + r.w / 2) * r.w * r.h, 0) / a,
    y: rs.reduce((s, r) => s + (r.y + r.h / 2) * r.w * r.h, 0) / a,
  };
};

/* ── regole per piano ── */
function planFloor(floor, emit) {
  const plan = floor.plan;
  const doors = plan.doors.map((d) => ({ d, op: opening(plan, d) }));
  const windows = plan.windows.map((w) => opening(plan, w));
  const extOps = (r) => [...doors.map((x) => x.op), ...windows].filter((op) => op.exterior && op.room?.id === r.id);
  const add = (model, r, p, purpose) => emit({ model, floor: floor.id, room: r?.id ?? null, roomName: r?.name || '', x: p.x, y: p.y, purpose });

  // varchi verso l'esterno
  for (const { d, op } of doors) {
    if (!op.exterior || d.kind === 'gate') continue;
    if (d.kind === 'garage') add('doorprotect_plus', op.room, inside(op, 0.1, -op.w / 2 + 0.3), 'Contatto, urto e inclinazione sulla basculante del garage');
    else add('doorprotect_plus', op.room, inside(op, 0.1, op.w / 2 - 0.1), d.entrance ? 'Contatto sulla porta d’ingresso' : 'Contatto sulla porta verso l’esterno');
  }
  for (const op of windows) {
    if (!op.exterior || !op.room || op.room.kind === 'garden') continue;
    if (op.w >= WIDE_WINDOW) add('motionprotect_curtain', op.room, inside(op, 0.15), 'Barriera a tenda sulla vetrata');
    else add('doorprotect_plus', op.room, inside(op, 0.1, op.w / 2 - 0.1), 'Contatto magnetico sulla finestra');
  }

  for (const r of plan.rooms) {
    const ext = extOps(r);
    const items = plan.furniture.filter((f) => f.room === r.id || (!f.room && contains(r, f.x + f.w / 2, f.y + f.h / 2)));
    const mid = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    switch (r.kind) {
      case 'garage':
        add('fireprotect2_co', r, mid, 'Fumo, calore e monossido (gas di scarico)');
        break;
      case 'laundry': {
        const wet = items.filter((f) => f.type === 'washer' || f.type === 'utility_sink');
        const at = wet.length ? wet : [{ x: mid.x, y: mid.y, w: 0, h: 0 }];
        // un sensore tra lavatrice e lavatoio se vicini, altrimenti uno per apparecchio
        const groups = [];
        for (const f of at) {
          const c = { x: f.x + f.w / 2, y: f.y + f.h / 2 };
          const g = groups.find((p) => dist(p.x, p.y, c.x, c.y) < 1.6);
          if (!g) groups.push(c);
        }
        for (const g of groups) add('leaksprotect', r, nearFloor(r, g), 'Allagamento a terra vicino a lavatrice / lavatoio');
        break;
      }
      case 'storage':
        add('fireprotect2_co', r, mid, 'Fumo e calore nel locale di deposito');
        if (ext.length) add('motionprotect', r, watchCorner(r, ext), 'Volumetrico: il ripostiglio dà sull’esterno');
        break;
      case 'kitchen':
        add('fireprotect2_co', r, mid, 'Fumo, calore e CO in cucina');
        break;
      case 'garden':
        planGarden(r, items, add);
        break;
      default:
        if (DAY.has(r.kind)) {
          const wide = windows.some((op) => op.exterior && op.room?.id === r.id && op.w >= WIDE_WINDOW);
          add(wide ? 'combiprotect' : 'motionprotect', r, watchCorner(r, ext),
            wide ? 'Volumetrico + rottura vetro (vetrate ampie)' : 'Volumetrico della zona giorno');
          if (r.kind === 'living_kitchen') add('fireprotect2_co', r, kitchenSpot(r, items), 'Fumo, calore e CO in zona cottura');
        }
    }
  }
  return doors;
}

/* Sensore d'allagamento: sul pavimento accanto all'apparecchio, mai fuori dalla stanza. */
function nearFloor(r, c) {
  const x = Math.min(r.x + r.w - 0.2, Math.max(r.x + 0.2, c.x + 0.45));
  const y = Math.min(r.y + r.h - 0.2, Math.max(r.y + 0.2, c.y));
  return { x, y };
}

function kitchenSpot(r, items) {
  const k = items.find((f) => f.type === 'kitchen_counter');
  return k ? { x: k.x + k.w / 2, y: k.y + k.h / 2 } : { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/* Giardino: la casa è sul lato nord, la strada a sud. */
function planGarden(r, items, add) {
  const tall = items.filter((f) => TALL_GARDEN.has(f.type));
  const free = ([x, y]) => !tall.some((f) => dist(x, y, f.x + f.w / 2, f.y + f.h / 2) < Math.max(f.w, f.h) / 2 + 1.2);
  const cs = corners(r, 0.4);
  const north = cs.filter(([, y]) => y < r.y + r.h / 2);
  const south = cs.filter(([, y]) => y >= r.y + r.h / 2);
  const picks = [...north.filter(free), ...south.filter(free)].slice(0, 2);
  for (const [x, y] of picks.length ? picks : north) {
    add('motioncam_outdoor', r, { x, y }, 'Rilevazione con fotoverifica sull’angolo scoperto del giardino');
  }
  const n = Math.max(1, Math.ceil(r.w / 24));
  for (let i = 0; i < n; i++) {
    add('dualcurtain_outdoor', r, { x: r.x + (r.w * (i + 0.5)) / n, y: r.y + 0.3 }, 'Barriera perimetrale lungo la facciata della casa');
  }
}

/* Locale per la centrale: interno, senza aperture verso l'esterno, il più vicino al centro del piano. */
function hubRoom(plan, doors) {
  const c = centroid(plan);
  const ext = new Set([
    ...doors.filter(({ op }) => op.exterior).map(({ op }) => op.room?.id),
    ...plan.windows.map((w) => opening(plan, w)).filter((op) => op.exterior).map((op) => op.room?.id),
  ]);
  const rank = (r) => {
    const k = HUB_ROOMS.indexOf(r.kind);
    return (ext.has(r.id) ? 100 : 0) + (k < 0 ? 10 : k) + dist(r.x + r.w / 2, r.y + r.h / 2, c.x, c.y) / 10;
  };
  return plan.rooms.filter((r) => !['garden', 'garage', 'bath'].includes(r.kind)).sort((a, b) => rank(a) - rank(b))[0];
}

/* Piano principale: quello con l'ingresso pedonale, preferendo il piano terra. */
function mainFloor(project) {
  const withEntrance = project.floors.filter((f) => f.plan?.doors.some((d) => d.entrance && !d.kind));
  const pool = withEntrance.length ? withEntrance : project.floors.filter((f) => f.level !== 'out');
  return pool.find((f) => f.level === 0) || pool[0] || null;
}

export function planSecurity(project) {
  const devices = [];
  let n = 0;
  const emit = (d) => devices.push({ id: `dev-${++n}`, ...d, x: +d.x.toFixed(2), y: +d.y.toFixed(2) });
  const doorsByFloor = {};
  for (const f of project.floors) {
    if (f.plan) doorsByFloor[f.id] = planFloor(f, emit);
  }

  const main = mainFloor(project);
  if (main) {
    const plan = main.plan;
    const doors = doorsByFloor[main.id];
    const entry = doors.find(({ d, op }) => d.entrance && !d.kind && op.exterior)?.op;
    if (entry) {
      // tastiera accanto alla porta, dal lato opposto alla maniglia; sirena in facciata vicino all'ingresso
      emit({ model: 'keypad_touchscreen', floor: main.id, room: entry.room?.id ?? null, roomName: entry.room?.name || '',
        ...inside(entry, 0.12, -entry.w / 2 - 0.3), purpose: 'Inserimento / disinserimento all’ingresso principale' });
      emit({ model: 'streetsiren', floor: main.id, room: null, roomName: 'Facciata',
        x: entry.cx - entry.nx * (entry.t / 2 + 0.25) + entry.ux * (entry.w / 2 + 1.2),
        y: entry.cy - entry.ny * (entry.t / 2 + 0.25) + entry.uy * (entry.w / 2 + 1.2),
        purpose: 'Sirena esterna visibile dalla strada' });
    }
    const hr = hubRoom(plan, doors);
    if (hr) {
      emit({ model: 'hub2_plus', floor: main.id, room: hr.id, roomName: hr.name,
        ...watchCorner(hr, entry ? [entry] : []), purpose: 'Centrale in posizione interna e protetta' });
    }
  }
  return { devices, createdAt: Date.now() };
}

/* Distinta materiali: un rigo per modello, con quantità, locali e scopi. */
export function billOfMaterials(project, devices) {
  const floorName = Object.fromEntries(project.floors.map((f) => [f.id, f.name]));
  const rows = new Map();
  for (const d of devices) {
    const m = AJAX_MODELS[d.model];
    if (!m) continue;
    const row = rows.get(d.model) || { model: m, qty: 0, places: new Map(), purposes: new Set() };
    row.qty += 1;
    const place = `${d.roomName || 'Esterno'} (${floorName[d.floor] || '—'})`;
    row.places.set(place, (row.places.get(place) || 0) + 1);
    row.purposes.add(d.purpose);
    rows.set(d.model, row);
  }
  const order = Object.keys(DEVICE_STYLE);
  return [...rows.values()]
    .sort((a, b) => order.indexOf(a.model.id) - order.indexOf(b.model.id))
    .map((r) => ({
      ...r,
      places: [...r.places].map(([p, q]) => (q > 1 ? `${p} ×${q}` : p)),
      purposes: [...r.purposes],
    }));
}
