/*
 * Preventivo indicativo del progetto: quantità ricavate dalle piante (superfici, muri, serramenti) e dalle
 * tavole degli impianti (lib/electric.js, lib/plumbing.js; se non progettati si stimano con le regole
 * standard), per prezzi unitari medi di mercato modificabili dall'utente.
 *
 * Voce = { key, cat, label, unit, qty, price, total }   I prezzi sono IVA esclusa, posa compresa.
 */
import { opening } from './ajax';
import { planElectric } from './electric';
import { planPlumbing } from './plumbing';

export const CATEGORIES = ['Opere edili', 'Pavimenti e rivestimenti', 'Serramenti', 'Impianto elettrico', 'Impianto idraulico', 'Cucina'];

/* Prezzi unitari predefiniti (€, IVA esclusa, fornitura e posa, medie indicative). */
export const DEFAULT_PRICES = {
  screed: 25, partition: 48, paint: 9, wood_floor: 78, tile_floor: 55, garage_floor: 30, bath_wall: 62, splash: 70,
  window: 560, door: 480, entrance_door: 1700, garage_door: 1500,
  el_point: 72, el_signal: 95, el_dedicated: 130, el_panel: 650, el_subpanel: 380, el_ev: 1300, el_extra: 90,
  pl_fixture: 380, pl_manifold: 420, pl_stack: 65, pl_sewer: 85, pl_heatpump: 3400, pl_gas: 2600, pl_electric: 450,
  sa_toilet: 420, sa_bidet: 340, sa_sink: 320, sa_shower: 950, sa_bathtub: 850, sa_kitchen_sink: 260,
  kitchen: 650,
};

const WOOD = new Set(['living', 'living_kitchen', 'dining', 'bed', 'study', 'entry', 'corridor', 'closet', 'hotel_room', 'stairs',
  'office_open', 'meeting', 'director']);
const TILE = new Set(['bath', 'wc', 'kitchen', 'laundry', 'storage']);
const H = 2.7;   // altezza dei locali

const area = (r) => r.area ?? r.w * r.h;
const perim = (r) => (r.poly ? r.poly.reduce((s, p, i, a) => s + Math.hypot(a[(i + 1) % a.length][0] - p[0], a[(i + 1) % a.length][1] - p[1]), 0)
  : 2 * (r.w + r.h));

/* Quantità di tutto il progetto, prima dei prezzi. */
export function quantities(project) {
  const q = {};
  const add = (key, v) => { q[key] = (q[key] || 0) + v; };
  for (const f of project.floors) {
    const plan = f.plan;
    if (!plan?.rooms?.length) continue;
    const rooms = plan.rooms.filter((r) => r.kind !== 'garden');
    if (!rooms.length) continue;
    const { width: W, length: L } = plan.dimensions;
    for (const r of rooms) {
      const a = area(r);
      add('screed', a);
      if (r.kind === 'garage') add('garage_floor', a);
      else if (TILE.has(r.kind)) add('tile_floor', a);
      else if (WOOD.has(r.kind)) add('wood_floor', a);
      else add('tile_floor', a);
      // pareti (al netto di porte e finestre) e soffitto da tinteggiare; nei bagni le pareti sono rivestite fino a 2,2 m
      const openings = plan.windows.map((w) => opening(plan, w)).filter((op) => op.room?.id === r.id)
        .reduce((s, op) => s + op.w * 1.4, 0)
        + plan.doors.filter((d) => d.kind !== 'gate').map((d) => opening(plan, d)).filter((op) => op.room?.id === r.id)
          .reduce((s, op) => s + op.w * 2.1, 0);
      const walls = Math.max(0, perim(r) * H - openings);
      if (r.kind === 'bath' || r.kind === 'wc') {
        const tiled = Math.max(0, perim(r) * 2.2 - openings * 0.8);
        add('bath_wall', tiled);
        add('paint', walls - tiled + a);
      } else {
        add('paint', walls + a);
      }
    }
    // tramezzi: muri interni (non sul bordo della pianta), in m² di parete
    for (const w of plan.walls || []) {
      // muro perimetrale: corre lungo il bordo (orizzontale in cima o in fondo, verticale ai lati)
      const onEdge = w.w >= w.h ? w.y <= 1e-3 || w.y + w.h >= L - 1e-3 : w.x <= 1e-3 || w.x + w.w >= W - 1e-3;
      if (!onEdge) add('partition', Math.max(w.w, w.h) * H);
    }
    for (const w of plan.windows) add('window', w.w * 1.4);
    for (const d of plan.doors) {
      if (d.kind === 'gate') continue;
      if (d.kind === 'garage') add('garage_door', 1);
      else if (d.entrance) add('entrance_door', 1);
      else add('door', 1);
    }
    for (const it of plan.furniture) {
      if (it.type === 'kitchen_counter') {
        const len = it.facing === 'E' || it.facing === 'W' ? it.h : it.w;
        add('kitchen', len);
        add('splash', len * 0.6);
      }
    }
  }

  // impianto elettrico: dai punti della tavola (livello del progetto o 2)
  const el = planElectric(project, { level: project.electric?.level || 2 });
  for (const fl of Object.values(el.floors)) {
    for (const p of fl.points) {
      if (['light', 'light_wall', 'light_ext', 'light_garden', 'switch', 'switch_2way', 'switch_inter', 'button', 'socket', 'socket_ip'].includes(p.kind)) add('el_point', 1);
      else if (['tv', 'data', 'intercom', 'chime', 'bell', 'thermostat'].includes(p.kind)) add('el_signal', 1);
      else if (['dedicated', 'hob', 'hood', 'motor', 'fan'].includes(p.kind)) add('el_dedicated', 1);
      else if (p.kind === 'panel') add('el_panel', 1);
      else if (p.kind === 'subpanel') add('el_subpanel', 1);
      else if (p.kind === 'ev') add('el_ev', 1);
      else if (p.kind === 'emergency') add('el_extra', 1);
    }
  }
  // impianto idraulico: apparecchi, collettori, colonne, scarichi interrati, generatore
  const pl = planPlumbing(project, { generator: project.plumbing?.generator || 'heatpump' });
  const gen = pl.generator;
  for (const fl of Object.values(pl.floors)) {
    for (const fx of fl.fixtures) {
      add('pl_fixture', 1);
      const sa = { toilet: 'sa_toilet', bidet: 'sa_bidet', sink: 'sa_sink', shower: 'sa_shower', bathtub: 'sa_bathtub', kitchen_sink: 'sa_kitchen_sink' }[fx.type];
      if (sa) add(sa, 1);
    }
    for (const p of fl.points) {
      if (p.kind === 'manifold') add('pl_manifold', 1);
      if (p.kind === 'generator') add(`pl_${gen}`, 1);
    }
  }
  for (const s of pl.stacks) add('pl_stack', s.length);
  const sewer = pl.bom.find((b) => b.key === 'sewer');
  if (sewer) add('pl_sewer', sewer.qty);
  return q;
}

const ITEMS = [
  ['screed', 'Opere edili', 'Massetto e sottofondo', 'm²'],
  ['partition', 'Opere edili', 'Tramezzi interni (laterizio o cartongesso)', 'm²'],
  ['paint', 'Opere edili', 'Tinteggiatura di pareti e soffitti', 'm²'],
  ['wood_floor', 'Pavimenti e rivestimenti', 'Pavimento in legno (zona giorno e camere)', 'm²'],
  ['tile_floor', 'Pavimenti e rivestimenti', 'Pavimento in gres (bagni, cucina, servizi)', 'm²'],
  ['garage_floor', 'Pavimenti e rivestimenti', 'Pavimento industriale del garage', 'm²'],
  ['bath_wall', 'Pavimenti e rivestimenti', 'Rivestimento dei bagni (h 2,2 m)', 'm²'],
  ['splash', 'Pavimenti e rivestimenti', 'Rivestimento della parete cucina', 'm²'],
  ['window', 'Serramenti', 'Finestre e portefinestre (PVC/alluminio, vetrocamera)', 'm²'],
  ['door', 'Serramenti', 'Porte interne', 'pz'],
  ['entrance_door', 'Serramenti', "Portoncino d'ingresso blindato", 'pz'],
  ['garage_door', 'Serramenti', 'Porta basculante del garage', 'pz'],
  ['el_point', 'Impianto elettrico', 'Punti luce, comandi e prese', 'pz'],
  ['el_signal', 'Impianto elettrico', 'Prese TV/dati, campanello, videocitofono, termostato', 'pz'],
  ['el_dedicated', 'Impianto elettrico', 'Linee dedicate (piano cottura, forno, lavatrice, cappa…)', 'pz'],
  ['el_panel', 'Impianto elettrico', 'Quadro elettrico generale', 'pz'],
  ['el_subpanel', 'Impianto elettrico', 'Quadri di piano', 'pz'],
  ['el_ev', 'Impianto elettrico', 'Wallbox per la ricarica auto', 'pz'],
  ['el_extra', 'Impianto elettrico', 'Lampade di emergenza', 'pz'],
  ['pl_fixture', 'Impianto idraulico', 'Punti acqua e scarico per apparecchio', 'pz'],
  ['pl_manifold', 'Impianto idraulico', 'Collettori di piano', 'pz'],
  ['pl_stack', 'Impianto idraulico', 'Colonne di scarico con ventilazione', 'm'],
  ['pl_sewer', 'Impianto idraulico', 'Collettore di scarico verso la fognatura', 'm'],
  ['pl_heatpump', 'Impianto idraulico', 'Pompa di calore con accumulo ACS', 'pz'],
  ['pl_gas', 'Impianto idraulico', 'Caldaia a condensazione', 'pz'],
  ['pl_electric', 'Impianto idraulico', 'Scaldabagno elettrico', 'pz'],
  ['sa_toilet', 'Impianto idraulico', 'Sanitari: WC', 'pz'],
  ['sa_bidet', 'Impianto idraulico', 'Sanitari: bidet', 'pz'],
  ['sa_sink', 'Impianto idraulico', 'Sanitari: lavabo', 'pz'],
  ['sa_shower', 'Impianto idraulico', 'Doccia (piatto, box, miscelatore)', 'pz'],
  ['sa_bathtub', 'Impianto idraulico', 'Vasca con miscelatore', 'pz'],
  ['sa_kitchen_sink', 'Impianto idraulico', 'Lavello e miscelatore cucina', 'pz'],
  ['kitchen', 'Cucina', 'Cucina componibile (basi, pensili, piano)', 'm'],
];

/* Preventivo: voci con prezzi (quelli dell'utente sopra i predefiniti), totali per categoria e complessivo. */
export function buildEstimate(project, { prices = {}, vat = 10, contingency = 10 } = {}) {
  const q = quantities(project);
  const rows = ITEMS.filter(([key]) => q[key] > 0).map(([key, cat, label, unit]) => {
    const qty = unit === 'pz' ? Math.round(q[key]) : Math.ceil(q[key] * 10) / 10;
    const price = prices[key] ?? DEFAULT_PRICES[key];
    return { key, cat, label, unit, qty, price, total: Math.round(qty * price) };
  });
  const byCat = CATEGORIES.map((cat) => ({ cat, rows: rows.filter((r) => r.cat === cat) }))
    .filter((c) => c.rows.length).map((c) => ({ ...c, total: c.rows.reduce((s, r) => s + r.total, 0) }));
  const subtotal = byCat.reduce((s, c) => s + c.total, 0);
  const extra = Math.round((subtotal * contingency) / 100);
  const taxable = subtotal + extra;
  const tax = Math.round((taxable * vat) / 100);
  const area = project.floors.filter((f) => f.level !== 'out' && f.plan)
    .reduce((s, f) => s + f.plan.rooms.filter((r) => r.kind !== 'garden').reduce((a, r) => a + (r.area ?? r.w * r.h), 0), 0);
  return { rows, byCat, subtotal, extra, taxable, tax, total: taxable + tax, vat, contingency, area,
    perSqm: area ? Math.round((taxable + tax) / area) : 0 };
}
