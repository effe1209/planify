/*
 * Scale tra i piani del progetto.
 *
 * Per ogni coppia di piani consecutivi (interrato → terra → primo → …; il giardino è escluso) si cerca un
 * ingombro libero nella STESSA posizione su entrambe le piante: appoggiato a una parete, in un locale di
 * passaggio o di giorno, lontano dalle porte e con il minimo di arredi da spostare.
 * Scala = { id, x, y, w, h, type: 'straight' | 'u', up: 'N'|'S'|'E'|'W', role: 'up' | 'down', other }
 *   x, y, w, h in metri; `up` è il verso in cui si sale; `other` è il nome del piano collegato.
 */
import { pointInPolygon } from './geometry';

/* rampa unica 1,0 × 3,6 m oppure a U (due rampe e pianerottolo) 2,0 × 2,6 m */
const TYPES = [
  { type: 'straight', run: 3.6, width: 1.0, cost: 0 },
  { type: 'u', run: 2.6, width: 2.0, cost: 0.4 },
];
export const TREAD = 0.27;
export const LANDING = 1.0;
/* dove una scala sta bene: costo più basso = posto migliore */
const KIND_COST = {
  entry: 0, corridor: 0, living: 1, living_kitchen: 1.3, dining: 1.3, office_open: 1.3,
  study: 2, garage: 1.6, storage: 2.5, meeting: 2.5,
};
const INSET = 0.12;     // distanza dal filo del locale: metà muro più un margine
const STEP = 0.2;
const PASSAGE = 0.9;

const contains = (r, x, y) =>
  r.poly ? pointInPolygon([x, y], r.poly) : x > r.x - 1e-6 && x < r.x + r.w + 1e-6 && y > r.y - 1e-6 && y < r.y + r.h + 1e-6;
const roomAt = (plan, x, y) => plan.rooms.find((r) => r.kind !== 'garden' && contains(r, x, y)) || null;
const overlap = (a, b) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/* Centro di una porta (come in lib/ajax.js: il varco parte da x,y e corre lungo `rot`). */
function doorCenter(plan, d) {
  const t = plan.wallThickness / plan.scale;
  const a = (d.rot * Math.PI) / 180;
  return {
    x: d.x + Math.cos(a) * (d.w / 2) - Math.sin(a) * (t / 2),
    y: d.y + Math.sin(a) * (d.w / 2) + Math.cos(a) * (t / 2),
    r: d.kind === 'garage' ? 0.9 : d.w + 0.35,   // spazio di apertura e di passaggio davanti alla porta
  };
}
const hitsCircle = (rc, c) => {
  const dx = Math.max(rc.x - c.x, 0, c.x - (rc.x + rc.w));
  const dy = Math.max(rc.y - c.y, 0, c.y - (rc.y + rc.h));
  return dx * dx + dy * dy < c.r * c.r;
};

/* Quanto è adatta la posizione su una pianta: null se impossibile, altrimenti un costo. */
function fit(plan, rc, taken) {
  const room = roomAt(plan, rc.x + rc.w / 2, rc.y + rc.h / 2);
  if (!room || !(room.kind in KIND_COST)) return null;
  const pts = [[rc.x, rc.y], [rc.x + rc.w, rc.y], [rc.x, rc.y + rc.h], [rc.x + rc.w, rc.y + rc.h]];
  if (pts.some(([x, y]) => roomAt(plan, x, y) !== room)) return null;
  if (plan.doors.some((d) => d.kind !== 'gate' && hitsCircle(rc, doorCenter(plan, d)))) return null;
  if (taken.some((s) => overlap(s, rc) > 0)) return null;
  // accanto alla scala deve restare un passaggio di almeno 90 cm
  const across = rc.w > rc.h ? room.h - rc.h : room.w - rc.w;
  if (across - 2 * INSET < PASSAGE) return null;
  const furn = plan.furniture.reduce((a, f) => a + overlap(rc, f), 0);
  // una scala che si mangia metà del locale non va bene
  const share = (rc.w * rc.h) / (room.w * room.h);
  return { cost: KIND_COST[room.kind] + furn * 1.5 + Math.max(0, share - 0.35) * 8 };
}

/* Posizioni candidate: lungo le pareti dei locali adatti del piano inferiore. */
function* candidates(plan) {
  for (const room of plan.rooms) {
    if (!(room.kind in KIND_COST)) continue;
    const x0 = room.x + INSET, y0 = room.y + INSET;
    const x1 = room.x + room.w - INSET, y1 = room.y + room.h - INSET;
    for (const t of TYPES) {
      for (const horiz of [true, false]) {
        const w = horiz ? t.run : t.width;
        const h = horiz ? t.width : t.run;
        if (x1 - x0 < w || y1 - y0 < h) continue;
        for (let x = x0; x <= x1 - w + 1e-6; x += STEP) {
          for (const y of [y0, y1 - h]) yield { t, horiz, x, y, w, h };
        }
        for (let y = y0; y <= y1 - h + 1e-6; y += STEP) {
          for (const x of [x0, x1 - w]) yield { t, horiz, x, y, w, h };
        }
      }
    }
  }
}

/* Si sale partendo dall'estremo più vicino a una porta. */
function ascent(plan, c) {
  const doors = plan.doors.map((d) => doorCenter(plan, d));
  const ends = c.horiz
    ? [{ up: 'E', x: c.x, y: c.y + c.h / 2 }, { up: 'W', x: c.x + c.w, y: c.y + c.h / 2 }]
    : [{ up: 'S', x: c.x + c.w / 2, y: c.y }, { up: 'N', x: c.x + c.w / 2, y: c.y + c.h }];
  const near = (e) => Math.min(...doors.map((d) => Math.hypot(d.x - e.x, d.y - e.y)), 99);
  return near(ends[0]) <= near(ends[1]) ? ends[0].up : ends[1].up;
}

function place(lowerPlan, upperPlan, takenL = [], takenU = []) {
  let best = null;
  for (const c of candidates(lowerPlan)) {
    const rc = { x: c.x, y: c.y, w: c.w, h: c.h };
    const a = fit(lowerPlan, rc, takenL);
    if (!a) continue;
    const b = fit(upperPlan, rc, takenU);
    if (!b) continue;
    const cost = a.cost + b.cost + c.t.cost;
    if (!best || cost < best.cost - 1e-9) best = { cost, c };
  }
  if (!best) return null;
  const { c } = best;
  const r = (v) => Math.round(v * 100) / 100;
  return { x: r(c.x), y: r(c.y), w: c.w, h: c.h, type: c.t.type, up: ascent(lowerPlan, c) };
}

/*
 * Scale di tutto il progetto: { byFloor: { [floorId]: [scala] }, missing: [{ lower, upper }] }.
 * Si parte dal basso, così le scale già messe su un piano diventano ostacoli per la coppia successiva.
 */
export function projectStairs(project) {
  const byFloor = {};
  const missing = [];
  if (!project) return { byFloor, missing };
  const levels = new Map();
  for (const f of project.floors) {
    if (typeof f.level === 'number' && f.plan && !levels.has(f.level)) levels.set(f.level, f);
  }
  const sorted = [...levels.keys()].sort((a, b) => a - b);
  for (let i = 0; i + 1 < sorted.length; i++) {
    if (sorted[i + 1] - sorted[i] !== 1) continue;
    const lower = levels.get(sorted[i]);
    const upper = levels.get(sorted[i + 1]);
    byFloor[lower.id] ||= [];
    byFloor[upper.id] ||= [];
    const s = place(lower.plan, upper.plan, byFloor[lower.id], byFloor[upper.id]);
    if (!s) {
      missing.push({ lower: lower.name, upper: upper.name });
      continue;
    }
    const id = `st-${lower.id}-${upper.id}`;
    byFloor[lower.id].push({ ...s, id, role: 'up', other: upper.name });
    byFloor[upper.id].push({ ...s, id, role: 'down', other: lower.name });
  }
  return { byFloor, missing };
}

/*
 * Un nuovo piano al livello `level` ha posto per le scale con i piani subito sopra e sotto?
 * Serve a scegliere, tra più varianti generate, una in cui la scala si allinea.
 */
export function stairsFit(project, level, plan) {
  if (!project || typeof level !== 'number') return true;
  return project.floors
    .filter((f) => f.plan && (f.level === level - 1 || f.level === level + 1))
    .every((f) => (f.level < level ? place(f.plan, plan) : place(plan, f.plan)) !== null);
}

/* Arredi coperti dalla scala: non si disegnano (la scala ha la precedenza). */
export const coveredByStairs = (item, stairs) => stairs?.some((s) => overlap(s, item) > 0.04) ?? false;
