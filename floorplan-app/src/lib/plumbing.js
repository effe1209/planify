/*
 * Impianto idrico-sanitario indicativo (tavola idraulica) ricavato dalla pianta, per tutto il progetto.
 *
 * - Apparecchi: dagli arredi (WC, bidet, lavabo, doccia, vasca, lavello e lavastoviglie nel piano di lavoro,
 *   lavatrice, lavatoio) gli attacchi di acqua fredda, calda e lo scarico, sul muro dietro l'apparecchio.
 * - Adduzione: un collettore per piano con distribuzione a stella (un tubo per attacco), contatore in
 *   facciata, generatore dell'acqua calda (pompa di calore, caldaia o scaldabagno) e montante tra i piani.
 * - Scarichi: colonne verticali dietro il WC (o accanto al lavello / alla lavatrice), riprese ai piani di
 *   sotto nello stesso punto: con i bagni sovrapposti la colonna attraversa solo locali bagnati, altrimenti
 *   serve un cavedio. Al piano più basso le colonne vanno al collettore di scarico e alla fognatura.
 * - Calcoli indicativi: portata di scarico delle colonne con le unità di scarico DU (UNI EN 12056-2,
 *   Qww = K·√ΣDU con K = 0,5 per le abitazioni) e diametro; portata di progetto della dorsale dell'acqua
 *   con la contemporaneità; metri di tubo per la distinta.
 *
 * Schema per preventivi e per parlarne con l'idraulico, NON un progetto esecutivo (DM 37/08).
 *
 * Punto = { id, floor, room, kind, x, y, tag?, note? }   Linea = { kind: cold | hot | drain | main | sewer, points, d? }
 */
import { pointInPolygon } from './geometry';
import { opening } from './ajax';
import { itemLength, itemPoint, wallSpots } from './electric';
import { fmtM } from './utils';

export const GENERATORS = {
  heatpump: { label: 'Pompa di calore con accumulo ACS', tag: 'PdC' },
  gas: { label: 'Caldaia a condensazione', tag: 'CT' },
  electric: { label: 'Scaldabagno elettrico', tag: 'SB' },
};

export const PKINDS = {
  fixture: { label: 'Apparecchio sanitario', color: '#334155' },
  cold: { label: 'Attacco acqua fredda', tag: 'F', color: '#2563eb' },
  hot: { label: 'Attacco acqua calda', tag: 'C', color: '#dc2626' },
  drain: { label: 'Scarico apparecchio', color: '#7c4a1e' },
  manifold: { label: 'Collettore di piano (fredda / calda)', tag: 'COL', color: '#1e40af' },
  stack: { label: 'Colonna di scarico', color: '#7c4a1e' },
  stack_pass: { label: 'Colonna di scarico passante (cavedio)', color: '#7c4a1e' },
  meter: { label: 'Contatore acqua', tag: 'CA', color: '#0f766e' },
  generator: { label: 'Generatore acqua calda', color: '#b91c1c' },
  riser: { label: 'Montante tra i piani (fredda e calda)', tag: 'MT', color: '#1e40af' },
  sewer: { label: 'Uscita verso la fognatura', tag: 'FG', color: '#7c4a1e' },
  tap_ext: { label: 'Rubinetto esterno / irrigazione', tag: 'R', color: '#0f766e' },
};
export const PKIND_ORDER = Object.keys(PKINDS);

/* Tubazioni disegnate: colore, spessore (px) e tratteggio. */
export const PIPES = {
  main: { label: 'Dorsale / montante acqua', stroke: '#0f766e', width: 1.8 },
  cold: { label: 'Acqua fredda (multistrato 16)', stroke: '#2563eb', width: 1.1 },
  hot: { label: 'Acqua calda (multistrato 16)', stroke: '#dc2626', width: 1.1 },
  drain: { label: 'Scarico apparecchio', stroke: '#7c4a1e', width: 1.5, dash: '5 2.5' },
  sewer: { label: 'Collettore di scarico verso la fognatura', stroke: '#7c4a1e', width: 2.6, dash: '8 3' },
};

/* Apparecchi: attacchi (fredda, calda), scarico (Ø mm), unità di scarico DU e portate in l/s. */
export const FIXTURES = {
  toilet: { name: 'WC', cold: true, hot: false, d: 110, du: 2.0, q: 0.1 },
  bidet: { name: 'Bidet', cold: true, hot: true, d: 40, du: 0.5, q: 0.1 },
  sink: { name: 'Lavabo', cold: true, hot: true, d: 40, du: 0.5, q: 0.1 },
  shower: { name: 'Doccia', cold: true, hot: true, d: 50, du: 0.6, q: 0.15 },
  bathtub: { name: 'Vasca', cold: true, hot: true, d: 50, du: 0.8, q: 0.2 },
  kitchen_sink: { name: 'Lavello', cold: true, hot: true, d: 50, du: 0.8, q: 0.2 },
  dishwasher: { name: 'Lavastoviglie', cold: true, hot: false, d: 40, du: 0.8, q: 0.15 },
  washer: { name: 'Lavatrice', cold: true, hot: false, d: 50, du: 0.8, q: 0.15 },
  utility_sink: { name: 'Lavatoio', cold: true, hot: true, d: 50, du: 0.8, q: 0.2 },
  tap_ext: { name: 'Rubinetto esterno', cold: true, hot: false, d: 0, du: 0, q: 0.2 },
};

const K_HOME = 0.5;   // coefficiente di contemporaneità degli scarichi nelle abitazioni (UNI EN 12056-2)
// colonne con ventilazione primaria: diametro esterno PP/PVC e portata massima indicativa (l/s)
const STACKS = [{ d: 90, q: 2.6 }, { d: 110, q: 4.0 }, { d: 125, q: 5.8 }];
const FLOOR_H = 3.0;  // interpiano per i metri delle colonne

const contains = (r, x, y) =>
  r.poly ? pointInPolygon([x, y], r.poly) : x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
const rectDist = (r, x, y) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h));
/* Il locale che contiene il punto; sul confine (o nello spessore di un muro) il più vicino entro 30 cm. */
function roomAt(plan, x, y) {
  const rooms = plan.rooms.filter((r) => r.kind !== 'garden');
  const hit = rooms.find((r) => contains(r, x, y));
  if (hit) return hit;
  const near = rooms.map((r) => [r, rectDist(r, x, y)]).sort((a, b) => a[1] - b[1])[0];
  return near && near[1] < 0.3 ? near[0] : null;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const center = (f) => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });
const WET_ROOMS = new Set(['bath', 'wc', 'laundry', 'kitchen', 'living_kitchen']);
const CIRCULATION = new Set(['corridor', 'entry']);

/* Percorso a L (prima orizzontale, poi verticale) e la sua lunghezza. */
const ell = (a, b, off = 0) => [[a.x, a.y + off], [b.x + off, a.y + off], [b.x + off, b.y]];
const pathLen = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

/* Gli apparecchi di una pianta con i loro attacchi, sul muro dietro. */
function fixturesOf(plan) {
  const out = [];
  const back = (f, lx, ly = 0) => itemPoint(f, lx, ly);
  for (const f of plan.furniture) {
    const len = itemLength(f);
    const room = plan.rooms.find((r) => r.id === f.room) || roomAt(plan, f.x + f.w / 2, f.y + f.h / 2);
    if (!room || room.kind === 'garden') continue;
    // attacchi sul muro dietro, in `lx` lungo il fronte: fredda a sinistra e calda a destra, a 10 cm
    const push = (type, lx, drain) => out.push({ type, room, ...FIXTURES[type], drain,
      at: back(f, lx), coldAt: back(f, FIXTURES[type].hot ? lx - 0.1 : lx), hotAt: back(f, lx + 0.1) });
    switch (f.type) {
      case 'toilet': push('toilet', len / 2, back(f, len / 2, 0.15)); break;
      case 'bidet': push('bidet', len / 2, back(f, len / 2, 0.15)); break;
      case 'sink': push('sink', len / 2, back(f, len / 2, 0.05)); break;
      case 'shower': case 'shower_walkin': push('shower', len / 2, center(f)); break;
      case 'shower_round': push('shower', len * 0.3, back(f, len * 0.3, len * 0.3)); break;
      case 'bathtub': push('bathtub', len / 2, back(f, len / 2, 0.25)); break;
      case 'washer': push('washer', len / 2, back(f, len / 2, 0.05)); break;
      case 'utility_sink': push('utility_sink', len / 2, back(f, len / 2, 0.05)); break;
      case 'kitchen_counter': {
        if (out.some((x) => x.type === 'kitchen_sink' && x.room.id === room.id)) break;
        // come nel disegno del piano di lavoro (PlanSvg): frigo a sinistra se lungo, lavello al 58%
        const f0 = len >= 3 ? 0.62 : 0;
        const usable = len - f0;
        const sinkX = f0 + usable * 0.58 + Math.min(usable * 0.3, 0.8) / 2;
        push('kitchen_sink', sinkX, back(f, sinkX, 0.08));
        const dw = Math.min(len - 0.3, sinkX + Math.min(usable * 0.3, 0.8) / 2 + 0.3);
        push('dishwasher', dw, back(f, dw, 0.08));
        break;
      }
      default: break;
    }
  }
  return out;
}

/* Un punto a muro libero dal locale `r` vicino a `q` (niente porte e finestre davanti). */
function wallNear(plan, r, q, used = []) {
  const doors = plan.doors.map((d) => ({ d, op: opening(plan, d) }));
  const wins = plan.windows.map((w) => opening(plan, w));
  const spots = wallSpots(plan, r).filter((p) => doors.every(({ d, op }) => Math.hypot(p.x - op.cx, p.y - op.cy) > d.w / 2 + 0.35)
    && wins.every((op) => Math.hypot(p.x - op.cx, p.y - op.cy) > op.w / 2 + 0.15)
    && used.every((u) => dist(u, p) > 0.5));
  return spots.sort((a, b) => dist(a, q) - dist(b, q))[0] || null;
}

function stackSize(du, hasWc) {
  const q = Math.max(K_HOME * Math.sqrt(du), hasWc ? 2.0 : 0.8);
  const fit = STACKS.find((s) => (!hasWc || s.d >= 110) && s.q >= q) || STACKS[STACKS.length - 1];
  return { q: Math.round(q * 100) / 100, d: fit.d, ok: fit.q >= q };
}

/* Dorsale di un piano: portata di progetto con contemporaneità 1/√(n-1) e tubo multistrato consigliato. */
function supplySize(fx) {
  const n = fx.length;
  const sum = fx.reduce((s, f) => s + f.q, 0);
  const q = n <= 1 ? sum : sum / Math.sqrt(n - 1);
  const pipe = q <= 0.35 ? '20 × 2' : q <= 0.7 ? '26 × 3' : '32 × 3';
  return { q: Math.round(q * 100) / 100, pipe };
}

/*
 * Impianto di tutto il progetto: { floors: { [id]: piano }, stacks: [colonna], bom, generator }.
 * Le colonne nascono dall'alto: ai piani di sotto si ripassa nello stesso punto.
 */
export function planPlumbing(project, { generator = 'heatpump' } = {}) {
  const gen = GENERATORS[generator] ? generator : 'heatpump';
  const built = project.floors.filter((f) => f.plan?.rooms?.length && typeof f.level === 'number')
    .sort((a, b) => b.level - a.level);   // dall'alto in basso
  const floors = {};
  const stacks = [];   // { id, x, y, top, du, wc, fixtures, floors: Set }
  let n = 0;
  const mk = (floor) => {
    const fl = { floor: floor.id, name: floor.name, level: floor.level, points: [], lines: [], fixtures: [], notes: [], manifold: null, supply: null };
    fl.add = (kind, r, p, extra = {}) => {
      const pt = { id: `${floor.id}-w${++n}`, floor: floor.id, room: r?.id ?? null, kind, x: +p.x.toFixed(3), y: +p.y.toFixed(3), ...extra };
      fl.points.push(pt);
      return pt;
    };
    return fl;
  };

  // piano principale: quello con l'ingresso pedonale (lì contatore e, se non c'è posto migliore, generatore)
  const withEntrance = built.filter((f) => f.plan.doors.some((d) => d.entrance && !d.kind));
  const main = withEntrance.find((f) => f.level === 0) || withEntrance[0] || built[built.length - 1];
  // generatore: lavanderia, poi garage, poi cucina, poi bagno (primo locale adatto dal basso)
  const genHost = (() => {
    for (const kinds of [['laundry'], ['garage'], ['kitchen', 'living_kitchen'], ['bath']]) {
      for (const f of [...built].reverse()) {
        const r = f.plan.rooms.find((x) => kinds.includes(x.kind) && x.name);
        if (r) return { floor: f, room: r };
      }
    }
    return null;
  })();

  for (const floor of built) {
    const plan = floor.plan;
    const fl = mk(floor);
    floors[floor.id] = fl;
    const fx = fixturesOf(plan);
    fl.fixtures = fx;

    /* ── scarichi: colonne ── */
    const byRoom = new Map();
    for (const f of fx) {
      const list = byRoom.get(f.room.id) || [];
      list.push(f);
      byRoom.set(f.room.id, list);
    }
    const here = [];   // colonne usate su questo piano
    for (const [, list] of byRoom) {
      const room = list[0].room;
      // una colonna che scende dal piano di sopra dentro questo locale si riusa (bagni sovrapposti)
      let st = stacks.find((s) => roomAt(plan, s.x, s.y)?.id === room.id && !here.includes(s));
      if (!st) {
        const lead = list.find((f) => f.type === 'toilet') || [...list].sort((a, b) => b.du - a.du)[0];
        const p = wallNear(plan, room, lead.drain, [...here, ...fl.points]) || lead.drain;
        st = { id: `S${stacks.length + 1}`, x: p.x, y: p.y, top: floor.name, du: 0, wc: false, fixtures: 0, floors: new Set(), rooms: [] };
        stacks.push(st);
      }
      here.push(st);
      st.floors.add(floor.id);
      st.rooms.push(`${room.name} (${floor.name})`);
      for (const f of list) {
        st.du += f.du;
        st.wc = st.wc || f.type === 'toilet';
        st.fixtures += 1;
        const drain = fl.add('drain', room, f.drain, { tag: `Ø${f.d}`, fixture: f.name });
        fl.lines.push({ kind: 'drain', points: ell(drain, st), d: f.d });
      }
    }
    // colonne dei piani di sopra che qui non servono apparecchi: passano (in cavedio se il locale non è bagnato)
    for (const s of stacks) {
      if (here.includes(s) || !s.floors.size) continue;
      const above = [...s.floors].some((id) => (floors[id]?.level ?? -99) > floor.level);
      if (!above) continue;
      s.floors.add(floor.id);
      const r = roomAt(plan, s.x, s.y);
      if (!r) {
        fl.notes.push(`Colonna ${s.id}: qui cade fuori dalla pianta, va deviata.`);
        continue;
      }
      fl.add('stack_pass', r, s, { tag: s.id });
      const where = r.name || (r.kind === 'garage' ? 'Garage' : 'il locale');
      const gate = plan.doors.filter((d) => d.kind === 'garage').map((d) => opening(plan, d))
        .find((op) => Math.abs((s.x - op.cx) * op.ux + (s.y - op.cy) * op.uy) < op.w / 2 + 0.3
          && Math.abs((s.x - op.cx) * op.nx + (s.y - op.cy) * op.ny) < 1.5);
      if (gate) fl.notes.push(`Colonna ${s.id} cade davanti alla basculante: deviala a soffitto del garage fino a un muro laterale.`);
      else if (!WET_ROOMS.has(r.kind)) fl.notes.push(`Colonna ${s.id} attraversa ${where}: serve un cavedio (o un controtelaio a parete).`);
    }
    for (const s of here) fl.add('stack', roomAt(plan, s.x, s.y), s, { tag: s.id });

    /* ── adduzione: collettore di piano a stella ── */
    const attaches = [];
    for (const f of fx) {
      if (f.cold) attaches.push({ f, kind: 'cold', p: f.coldAt });
      if (f.hot) attaches.push({ f, kind: 'hot', p: f.hotAt });
    }
    if (attaches.length) {
      const c = fx.reduce((a, f) => ({ x: a.x + f.at.x / fx.length, y: a.y + f.at.y / fx.length }), { x: 0, y: 0 });
      const hosts = plan.rooms.filter((r) => CIRCULATION.has(r.kind));
      const pool = hosts.length ? hosts : plan.rooms.filter((r) => ['bath', 'laundry', 'garage'].includes(r.kind) && r.name);
      let mp = null;
      let mroom = null;
      for (const r of pool) {
        const p = wallNear(plan, r, c, fl.points);
        if (p && (!mp || dist(p, c) < dist(mp, c))) { mp = p; mroom = r; }
      }
      if (mp) {
        const man = fl.add('manifold', mroom, mp, { tag: 'COL', outputs: attaches.length });
        fl.manifold = man;
        for (const a of attaches) {
          const pt = fl.add(a.kind, a.f.room, a.p, { fixture: a.f.name });
          fl.lines.push({ kind: a.kind, points: ell(man, pt, a.kind === 'hot' ? 0.08 : 0) });
        }
        fl.supply = supplySize(fx);
        if (attaches.length > 16) fl.notes.push(`Collettore con ${attaches.length} uscite: dividilo in due (zona giorno / zona notte).`);
      } else {
        fl.notes.push('Nessun muro libero per il collettore: posizionalo a mano.');
      }
    }
  }

  /* ── piano più basso: colonne verso la fognatura ── */
  const lowest = built[built.length - 1];
  if (lowest && stacks.length) {
    const fl = floors[lowest.id];
    const { width: W, length: L } = lowest.plan.dimensions;
    const xs = stacks.map((s) => s.x);
    const out = { x: Math.min(W - 0.4, Math.max(0.4, xs.reduce((a, b) => a + b, 0) / xs.length)), y: L + 0.35 };
    fl.add('sewer', null, out, { tag: 'FG' });
    // collettore orizzontale lungo la facciata verso la strada, con l'innesto di ogni colonna
    const yT = L - 0.25;
    const d = Math.max(125, ...stacks.map((s) => stackSize(s.du, s.wc).d));
    for (const s of stacks) fl.lines.push({ kind: 'sewer', points: [[s.x, s.y], [s.x, yT]], d });
    const x0 = Math.min(out.x, ...xs);
    const x1 = Math.max(out.x, ...xs);
    fl.lines.push({ kind: 'sewer', points: [[x0, yT], [x1, yT]], d });
    fl.lines.push({ kind: 'sewer', points: [[out.x, yT], [out.x, out.y]], d });
    fl.notes.push('Collettore di scarico sotto il pavimento verso il pozzetto d\'ispezione e la fognatura (pendenza 1-2%).');
  }

  /* ── contatore, generatore, montanti ── */
  if (main) {
    const fl = floors[main.id];
    const plan = main.plan;
    const entry = plan.doors.map((d) => ({ d, op: opening(plan, d) })).find(({ d, op }) => d.entrance && op.exterior)
      || plan.doors.map((d) => ({ d, op: opening(plan, d) })).find(({ op }) => op.exterior);
    if (entry) {
      const { op } = entry;
      const m = fl.add('meter', null, { x: op.cx - op.nx * (op.t / 2 + 0.35) - op.ux * (op.w / 2 + 0.6), y: op.cy - op.ny * (op.t / 2 + 0.35) - op.uy * (op.w / 2 + 0.6) }, { tag: 'CA' });
      if (fl.manifold) fl.lines.push({ kind: 'main', points: ell(m, fl.manifold) });
    }
  }
  if (genHost) {
    const fl = floors[genHost.floor.id];
    const p = wallNear(genHost.floor.plan, genHost.room, center(genHost.room), fl.points);
    if (p) {
      const g = fl.add('generator', genHost.room, p, { tag: GENERATORS[gen].tag });
      if (fl.manifold) fl.lines.push({ kind: 'hot', points: ell(g, fl.manifold, 0.08) });
      const meter = fl.points.find((x) => x.kind === 'meter');
      if (meter) fl.lines.push({ kind: 'main', points: ell(meter, g) });
    }
  }
  const served = built.filter((f) => floors[f.id].manifold);
  if (served.length > 1) {
    for (const f of served) {
      const fl = floors[f.id];
      const r = fl.add('riser', null, { x: fl.manifold.x + 0.35, y: fl.manifold.y }, { tag: 'MT' });
      fl.lines.push({ kind: 'main', points: [[r.x, r.y], [fl.manifold.x, fl.manifold.y]] });
    }
  }

  // giardino: rubinetto per l'irrigazione verso la casa
  for (const f of project.floors.filter((x) => x.level === 'out' && x.plan?.rooms?.length)) {
    const fl = mk(f);
    const r = f.plan.rooms[0];
    fl.add('tap_ext', r, { x: r.x + r.w / 2 + 1.0, y: r.y + 0.4 }, { tag: 'R' });
    fl.notes.push('Irrigazione: elettrovalvole e programmatore collegati alla linea dal contatore.');
    floors[f.id] = fl;
  }

  /* ── colonne: portate, diametri, piani attraversati ── */
  const stackRows = stacks.map((s) => {
    const sz = stackSize(s.du, s.wc);
    return { id: s.id, rooms: s.rooms, du: Math.round(s.du * 10) / 10, q: sz.q, d: sz.d, ok: sz.ok, floors: s.floors.size,
      length: Math.round((s.floors.size * FLOOR_H + 1.0) * 10) / 10 };
  });
  for (const r of stackRows) {
    const fl = Object.values(floors).find((x) => x.points.some((p) => p.kind === 'stack' && p.tag === r.id));
    if (!r.ok && fl) fl.notes.push(`Colonna ${r.id}: ${fmtM(r.q)} l/s oltre la portata di un Ø${r.d}, valuta una ventilazione secondaria.`);
  }

  /* ── distinta: apparecchi e metri di tubo ── */
  const bom = new Map();
  const inc = (key, label, qty, unit = 'pz') => {
    const row = bom.get(key) || { key, label, qty: 0, unit };
    row.qty += qty;
    bom.set(key, row);
  };
  for (const fl of Object.values(floors)) {
    for (const f of fl.fixtures) inc(`fx-${f.type}`, f.name, 1);
    for (const l of fl.lines) {
      const m = pathLen(l.points);
      if (l.kind === 'cold' || l.kind === 'hot') inc(`pipe-16-${l.kind}`, `Multistrato 16 × 2 (acqua ${l.kind === 'cold' ? 'fredda' : 'calda'}, coibentato)`, m, 'm');
      else if (l.kind === 'main') inc('pipe-main', `Multistrato ${fl.supply?.pipe || '26 × 3'} (dorsali e montanti)`, m, 'm');
      else if (l.kind === 'drain') inc(`drain-${l.d}`, `Scarico PP Ø${l.d}`, m, 'm');
      else if (l.kind === 'sewer') inc('sewer', `Collettore di scarico interrato Ø${l.d}`, m, 'm');
    }
    for (const p of fl.points) {
      if (p.kind === 'manifold') inc('manifold', 'Collettore complanare fredda/calda con valvole di intercettazione', 1);
      if (p.kind === 'meter') inc('meter', 'Gruppo contatore con riduttore di pressione e filtro', 1);
      if (p.kind === 'generator') inc('gen', GENERATORS[gen].label, 1);
    }
  }
  for (const r of stackRows) inc(`stack-${r.d}`, `Colonna di scarico Ø${r.d} con ventilazione primaria`, r.length, 'm');
  const rows = [...bom.values()].map((b) => ({ ...b, qty: b.unit === 'm' ? Math.ceil(b.qty * 1.1) : b.qty }));   // +10% sfridi e raccordi

  return { generator: gen, floors, stacks: stackRows, bom: rows };
}
