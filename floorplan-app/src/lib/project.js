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

/* Etichetta breve del livello: «-1», «PT», «1°», «Est.» */
export function levelLabel(level) {
  if (level === 'out') return 'Est.';
  if (level === 0) return 'PT';
  if (typeof level === 'number') return level < 0 ? String(level) : `${level}°`;
  return '';
}
