/*
 * Progetto multi-piano: Progetto -> Piani -> (stanze, arredi, dispositivi).
 *
 * Una voce della cronologia è un progetto:
 *   { id, name, saved, createdAt, activeFloor, floors: [Floor], security? }
 * Floor = { id, name, level, plan, meta, params, sketch? }
 *   level: numero (-1 interrato, 0 terra, 1 primo…) oppure 'out' per giardino/esterno.
 * Le voci salvate prima dei piani ({ plan, meta, params, sketch }) diventano progetti a un piano.
 */
import { newId } from './utils';

export const FLOOR_PRESETS = [
  { name: 'Piano interrato / garage', level: -1, type: 'garage' },
  { name: 'Piano terra', level: 0 },
  { name: 'Primo piano', level: 1 },
  { name: 'Secondo piano', level: 2 },
  { name: 'Mansarda', level: 3 },
  { name: 'Giardino / esterno', level: 'out', type: 'garden' },
];

export function floorDefaults(type) {
  if (type === 'garage') return { name: 'Piano interrato / garage', level: -1 };
  if (type === 'garden') return { name: 'Giardino / esterno', level: 'out' };
  return { name: 'Piano terra', level: 0 };
}

export function makeFloor({ name, level, plan, meta, params, sketch }) {
  const def = floorDefaults(meta?.type);
  return {
    id: newId(),
    name: name || def.name,
    level: level ?? def.level,
    plan,
    meta,
    params,
    ...(sketch && { sketch }),
  };
}

export function normalizeProject(entry) {
  if (!entry || Array.isArray(entry.floors)) return entry;
  const { plan, meta, params, sketch, ...rest } = entry;
  const floor = { ...makeFloor({ plan, meta, params, sketch }), id: `f-${entry.id}` };
  return { ...rest, floors: [floor], activeFloor: floor.id };
}

export const activeFloor = (project) =>
  project ? project.floors.find((f) => f.id === project.activeFloor) || project.floors[0] : null;

export const updateFloor = (project, floorId, fn) => ({
  ...project,
  floors: project.floors.map((f) => (f.id === floorId ? fn(f) : f)),
});

export function addFloor(project, floor) {
  return { ...project, floors: [...project.floors, floor], activeFloor: floor.id };
}

export function removeFloor(project, floorId) {
  if (project.floors.length <= 1) return project;
  const idx = project.floors.findIndex((f) => f.id === floorId);
  const floors = project.floors.filter((f) => f.id !== floorId);
  const active = project.activeFloor === floorId ? floors[Math.max(0, idx - 1)].id : project.activeFloor;
  const security = project.security && {
    ...project.security, devices: project.security.devices.filter((d) => d.floor !== floorId),
  };
  return { ...project, floors, activeFloor: active, ...(security && { security }) };
}

export function moveFloor(project, floorId, delta) {
  const floors = [...project.floors];
  const i = floors.findIndex((f) => f.id === floorId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= floors.length) return project;
  [floors[i], floors[j]] = [floors[j], floors[i]];
  return { ...project, floors };
}

/* La casa vista dal giardino: il piano terra (o il primo piano abitato) con la sua larghezza. */
export function houseFor(project) {
  const f = homeFloor(project);
  if (!f) return null;
  return { w: f.plan.dimensions.width, name: f.name, ...houseFront(project) };
}

const homeFloor = (project) => {
  const built = (project?.floors || []).filter((f) => typeof f.level === 'number' && f.level >= 0 && f.plan
    && f.meta?.type !== 'garage' && f.meta?.type !== 'garden');
  return built.find((x) => x.level === 0) || [...built].sort((a, b) => a.level - b.level)[0] || null;
};

/* Lato del muro su cui sta un'apertura (N/E/S/W) e il suo centro, nella pianta. */
function openingSide(o, W, L) {
  if (o.rot === 90) return { side: o.x < W / 2 ? 'W' : 'E', cx: o.x, cy: o.y + o.w / 2 };
  return { side: o.y < L / 2 ? 'N' : 'S', cx: o.x + o.w / 2, cy: o.y };
}

const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };
const LEFT_OF = { S: 'W', N: 'E', E: 'S', W: 'N' };   // il fianco sinistro guardando la facciata da fuori

/* Dalla pianta alla facciata vista dal giardino: t lungo la facciata da sinistra, d dentro la casa. */
function toFront(side, W, L) {
  return {
    S: (x, y) => [x, L - y], N: (x, y) => [W - x, y], E: (x, y) => [L - y, W - x], W: (x, y) => [y, x],
  }[side];
}

/*
 * La facciata d'ingresso della casa vista dal giardino (che sta davanti a lei, lato nord del lotto):
 * larghezza, sagoma dei locali (per disegnarla), portoncino e basculante del garage (dello stesso piano
 * o del piano interrato, che ha la stessa impronta). Misure in metri, t da sinistra guardando la casa.
 */
export function houseFront(project) {
  const f = homeFloor(project);
  if (!f) return null;
  const { width: W, length: L } = f.plan.dimensions;
  const door = f.plan.doors.find((d) => d.entrance && !d.kind) || f.plan.doors.find((d) => d.entrance);
  const front = door ? openingSide(door, W, L).side : 'S';
  const map = toFront(front, W, L);
  const fw = front === 'S' || front === 'N' ? W : L;
  const rects = f.plan.rooms.map((r) => {
    const [a, b] = [map(r.x, r.y), map(r.x + r.w, r.y + r.h)];
    return { t: Math.min(a[0], b[0]), d: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]), kind: r.kind };
  });
  const out = { w: fw, front, rects };
  if (door) {
    const o = openingSide(door, W, L);
    const [t, d] = map(o.cx, o.cy);
    out.door = { x: t, w: door.w, d };
  }
  // garage: prima sullo stesso piano, poi ai piani sotto (rampa)
  const floors = (project.floors || []).filter((x) => typeof x.level === 'number' && x.level <= f.level && x.plan)
    .sort((a, b) => b.level - a.level);
  for (const g of floors) {
    const gd = g.plan.doors.find((d) => d.kind === 'garage');
    if (!gd) continue;
    const { width: gW, length: gL } = g.plan.dimensions;
    const o = openingSide(gd, gW, gL);
    const side = o.side === front ? 'front' : o.side === OPPOSITE[front] ? 'back' : o.side === LEFT_OF[front] ? 'left' : 'right';
    const [t, d] = map(o.cx, o.cy);
    out.garage = { x: t, w: gd.w, d, side, ramp: g.level < f.level };
    break;
  }
  return out;
}

/* Quello che serve al motore per disegnare il giardino davanti alla casa (POST /generate-plan, house). */
export const houseRequest = (h) => h && {
  w: h.w,
  ...(h.door && { door: { x: h.door.x, w: h.door.w } }),
  ...(h.garage && { garage: { x: h.garage.x, w: h.garage.w, side: h.garage.side, ramp: h.garage.ramp } }),
};

/* Etichetta breve del livello: «-1», «PT», «1°», «Est.» */
export function levelLabel(level) {
  if (level === 'out') return 'Est.';
  if (level === 0) return 'PT';
  if (typeof level === 'number') return level < 0 ? String(level) : `${level}°`;
  return '';
}
