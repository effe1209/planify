/*
 * Render: risoluzioni, ora del giorno, sfondo e inquadrature automatiche (esterne e dentro ogni locale).
 * Tutto puro (nessuna scheda grafica): lo usano il pannello Render, lib/render3d.js e il PDF. Misure in metri,
 * x e z come la pianta, y verso l'alto; un piano sta a level × FLOOR_H.
 */
import { FLOOR_H } from './scene3d';
import { frontOf } from './project';

export const EYE = 1.6;   // altezza degli occhi nelle viste interne

export const SIZES = [
  { id: 'prev', label: 'Anteprima 960 × 540', w: 960, h: 540 },
  { id: 'hd', label: 'Full HD 1920 × 1080', w: 1920, h: 1080 },
  { id: '4k', label: '4K 3840 × 2160', w: 3840, h: 2160 },
];

/* Sole: azimut dal nord del foglio (gradi, in senso orario), altezza sull'orizzonte, colore e intensità; cielo e luce d'ambiente. */
export const TIMES = [
  { id: 'morning', label: 'Mattina', az: 100, el: 24, color: '#ffe6c2', sun: 2.6, hemi: 0.22, env: 0.3, exposure: 0.8, bloom: 0.12, lamps: false, ground: 1, sky: '#d3e5f5' },
  { id: 'noon', label: 'Mezzogiorno', az: 180, el: 62, color: '#fffaf0', sun: 3.2, hemi: 0.25, env: 0.32, exposure: 0.75, bloom: 0.1, lamps: false, ground: 1, sky: '#bfdaf3' },
  { id: 'afternoon', label: 'Pomeriggio', az: 215, el: 38, color: '#fff3e0', sun: 2.9, hemi: 0.22, env: 0.3, exposure: 0.8, bloom: 0.12, lamps: false, ground: 1, sky: '#d2e2f1' },
  { id: 'sunset', label: 'Tramonto', az: 270, el: 9, color: '#ff9f5a', sun: 2.4, hemi: 0.14, env: 0.18, exposure: 0.95, bloom: 0.22, lamps: true, ground: 0.6, sky: '#f1b98e' },
  { id: 'evening', label: 'Sera', az: 215, el: 14, color: '#8ea6ff', sun: 0.3, hemi: 0.16, env: 0.16, exposure: 1.2, bloom: 0.3, lamps: true, ground: 0.2, sky: '#1e2a47' },
];

export const BACKGROUNDS = [
  { id: 'white', label: 'Bianco', color: '#ffffff' },
  { id: 'sky', label: 'Cielo (come l\'ora)', color: null },
  { id: 'grey', label: 'Grigio chiaro', color: '#e6e9ee' },
  { id: 'transparent', label: 'Trasparente (PNG)', color: null, alpha: true },
];

/* Le luci di casa sono accese al tramonto e di sera. */
export const lampsOn = (id) => !!timeById(id).lamps;
export const timeById = (id) => TIMES.find((t) => t.id === id) || TIMES[2];

/* Posizione e colore del sole per un'ora del giorno, attorno al centro della scena. */
export function sunFor(timeId, north, center, reach) {
  const t = timeById(timeId);
  const a = (((t.az + (north || 0)) % 360) * Math.PI) / 180;
  const el = (t.el * Math.PI) / 180;
  const d = Math.max(reach, 12);
  return {
    position: [center[0] + Math.sin(a) * Math.cos(el) * d, Math.max(4, Math.sin(el) * d), center[2] - Math.cos(a) * Math.cos(el) * d],
    color: t.color, intensity: t.sun, hemi: t.hemi, sky: t.sky,
  };
}

/* Colore e trasparenza dello sfondo per l'ora scelta. */
export function backgroundFor(bgId, timeId) {
  const b = BACKGROUNDS.find((x) => x.id === bgId) || BACKGROUNDS[0];
  return { color: b.color || timeById(timeId).sky, alpha: !!b.alpha };
}

const rectRooms = (plan) => plan.rooms.filter((r) => !r.poly && r.kind !== 'garden' && r.kind !== 'stairs');

/* Ingombro della casa: centro, lati e altezza (piani impilati). */
export function houseBounds(project) {
  const floors = project.floors.filter((f) => typeof f.level === 'number' && f.plan?.rooms?.length);
  let W = 0, L = 0, top = 0, bottom = 0;
  for (const f of floors) {
    W = Math.max(W, f.plan.dimensions.width);
    L = Math.max(L, f.plan.dimensions.length);
    top = Math.max(top, f.level * FLOOR_H + (f.plan.height || 2.7));
    bottom = Math.min(bottom, f.level * FLOOR_H);
  }
  return { W, L, top, bottom, center: [W / 2, (top + bottom) / 2, L / 2] };
}

/* Distanza a cui una sfera di raggio r entra tutta nel campo più stretto. */
function distFor(r, fov, aspect) {
  const v = (fov * Math.PI) / 180;
  const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  return (r / Math.sin(Math.min(v, h) / 2)) * 1.06;
}

/*
 * Inquadrature automatiche: tre esterne (tre quarti, pianta 3D dall'alto, fronte) e una dentro ogni locale a 1,6 m,
 * dall'angolo opposto alle porte; nel loft anche una dal soppalco verso il soggiorno.
 * { id, label, kind: 'outside' | 'inside', floor?: id, level?, position: [x, y, z], target: [x, y, z], fov }
 */
/*
 * Il giardino davanti alla casa nelle coordinate della casa (come lo mette scene3d placeGarden): { toWorld(lx, ly), gw, gl, hx, fw, front }
 * con (lx, ly) = punto nel piano del giardino (x lungo la facciata, y verso la strada), null se non c'è un giardino con la casa.
 */
export function gardenFrame(project) {
  const garden = (project?.floors || []).find((f) => f.level === 'out' && f.plan?.rooms?.length);
  const fr = garden && frontOf(project);
  if (!fr) return null;
  const { width: gw, length: gl } = garden.plan.dimensions;
  const { W, L } = fr;
  const fw = fr.facade.w;
  const hx = garden.plan.house?.x ?? (gw - fw) / 2;
  const front = fr.facade.front;
  const toWorld = {
    S: (x, y) => [x - hx, L + y], N: (x, y) => [W + hx - x, -y], E: (x, y) => [W + y, L + hx - x], W: (x, y) => [-y, -hx + x],
  }[front];
  return { toWorld, gw, gl, hx, fw, front };
}

export function cameraViews(project, { aspect = 16 / 9 } = {}) {
  const b = houseBounds(project);
  if (!b.W) return [];
  const r = Math.hypot(b.W, b.L, b.top - b.bottom) / 2;
  const out = [];
  const fov = 35;
  const outside = (id, label, dir, f = fov) => {
    const n = Math.hypot(...dir);
    const d = distFor(r, f, aspect);
    out.push({ id, label, kind: 'outside', fov: f, target: b.center, position: b.center.map((c, i) => c + (dir[i] / n) * d) });
  };
  outside('three-quarter', 'Tre quarti', [0.55, 0.65, 0.8]);
  // pianta 3D: dritta sopra la casa, perpendicolare al terreno, con la stessa orientazione della pianta (nord/alto del foglio in alto) e a tutto
  // schermo: ortografica (nessuna prospettiva) nel render; la vista viva e il path tracing usano un campo molto stretto da lontano, quasi uguale
  {
    const m = 1.03;
    const viewH = Math.max(b.L * m, (b.W * m) / aspect);   // altezza visibile: la casa riempie il quadro nel lato che lo limita
    const pf = 10;
    const dist = viewH / 2 / Math.tan((pf * Math.PI) / 360);
    const off = dist * 0.0015;                             // 0,09° di inclinazione verso il basso del foglio: serve solo a orientare l'immagine
    out.push({ id: 'plan3d', label: 'Pianta 3D dall\'alto', kind: 'outside', fov: pf, ortho: { height: viewH, width: b.W * m, length: b.L * m },
      target: [b.center[0], 0, b.center[2]], position: [b.center[0], dist, b.center[2] + off] });
  }
  outside('front', 'Fronte', [0, 0.22, 1]);
  // il giardino, se c'è: una vista dall'alto che abbraccia casa e giardino, una a quota d'occhi dal cancello verso il portoncino
  const gf = gardenFrame(project);
  const fr0 = gf ? frontOf(project)?.facade?.door : null;
  if (gf) {
    const pts = [[0, 0], [gf.gw, 0], [0, gf.gl], [gf.gw, gf.gl]].map(([x, y]) => gf.toWorld(x, y)).concat([[0, 0], [b.W, 0], [0, b.L], [b.W, b.L]]);
    const x0 = Math.min(...pts.map((q) => q[0])); const x1 = Math.max(...pts.map((q) => q[0]));
    const z0 = Math.min(...pts.map((q) => q[1])); const z1 = Math.max(...pts.map((q) => q[1]));
    const c = [(x0 + x1) / 2, 0.8, (z0 + z1) / 2];
    const gr = Math.hypot(x1 - x0, z1 - z0, b.top) / 2;
    const gd = distFor(gr, fov, aspect);
    const mid = gf.toWorld(gf.gw / 2, gf.gl / 2);
    const door = gf.toWorld(gf.hx + gf.fw / 2, 0);
    const outDir = [mid[0] - door[0], mid[1] - door[1]];
    const on = Math.hypot(...outDir) || 1;
    const dir = [outDir[0] / on, outDir[1] / on];
    out.push({ id: 'garden-aerial', label: 'Giardino dall\'alto', kind: 'outside', fov, target: c,
      position: [c[0] + dir[0] * gd * 0.7, c[1] + gd * 0.6, c[2] + dir[1] * gd * 0.7] });
    // dal fondo del giardino verso la casa, a quota d'occhi, dall'angolo del fondo, in diagonale: così il gazebo o il vialetto al centro non coprono il portoncino
    const doorX = fr0 ? gf.hx + (fr0.x ?? gf.fw / 2) : gf.hx + gf.fw / 2;
    const left = doorX > gf.gw / 2;                       // si sta dal lato opposto al portoncino
    const eyeAt = gf.toWorld(left ? gf.gw * 0.1 : gf.gw * 0.9, gf.gl - 0.9);
    const tgt = gf.toWorld(doorX, 0);
    out.push({ id: 'garden-view', label: 'Giardino: verso la casa', kind: 'outside', fov: 62,
      target: [tgt[0], 1.5, tgt[1]], position: [eyeAt[0], EYE + 0.1, eyeAt[1]] });
  }
  const floors = project.floors.filter((f) => typeof f.level === 'number' && f.plan?.rooms?.length).sort((a, c) => a.level - c.level);
  for (const f of floors) {
    const y0 = f.level * FLOOR_H;
    for (const room of rectRooms(f.plan).filter((q) => q.w * q.h >= 5)) {
      const cx = room.x + room.w / 2;
      const cz = room.y + room.h / 2;
      // il punto di vista: l'angolo del locale più lontano dalle porte, così guarda verso l'ingresso e nessuna anta gli sta davanti; senza porte il primo
      const corners = [[room.x, room.y], [room.x + room.w, room.y], [room.x, room.y + room.h], [room.x + room.w, room.y + room.h]];
      const doors = (f.plan.doors || []).map((d) => [d.x + (d.rot === 90 ? 0 : d.w / 2), d.y + (d.rot === 90 ? d.w / 2 : 0)]);
      const near = (c) => (doors.length ? Math.min(...doors.map((d) => Math.hypot(d[0] - c[0], d[1] - c[1]))) : 0);
      const inset = Math.min(0.75, Math.min(room.w, room.h) / 5);   // lontano dall'anta aperta di una porta d'angolo
      const at = (c) => [c[0] + (cx - c[0] > 0 ? inset : -inset), c[1] + (cz - c[1] > 0 ? inset : -inset)];
      // niente occhio dentro una lampada, una pianta o un mobile d'angolo: si scartano gli angoli occupati (0,6 m di margine)
      const free = corners.filter((c) => {
        const [x, z] = at(c);
        return !(f.plan.furniture || []).some((it) => x > it.x - 0.6 && x < it.x + it.w + 0.6 && z > it.y - 0.6 && z < it.y + it.h + 0.6 && it.type !== 'rug');
      });
      const [px, pz] = (free.length ? free : corners).reduce((best, c) => (near(c) > near(best) ? c : best));
      const [vx, vz] = at([px, pz]);
      const pos = [vx, y0 + EYE, vz];
      out.push({ id: `room-${f.id}-${room.id}`, label: `Interno: ${room.name || room.kind}${floors.length > 1 ? ` (${f.name})` : ''}`, kind: 'inside',
        floor: f.id, level: f.level, fov: 72, position: pos, target: [cx, y0 + EYE - 0.4, cz] });
    }
    const mz = f.plan.mezzanine;
    if (mz) {
      const side = (mz.open || ['W'])[0];
      const mid = [mz.x + mz.w / 2, mz.y + mz.h / 2];
      const eye = y0 + mz.elev + EYE;
      const pos = { W: [mz.x + mz.w - 0.45, eye, mid[1]], E: [mz.x + 0.45, eye, mid[1]], N: [mid[0], eye, mz.y + mz.h - 0.45], S: [mid[0], eye, mz.y + 0.45] }[side];
      const tgt = { W: [mz.x - 4, eye - 0.6, mid[1]], E: [mz.x + mz.w + 4, eye - 0.6, mid[1]], N: [mid[0], eye - 0.6, mz.y - 4], S: [mid[0], eye - 0.6, mz.y + mz.h + 4] }[side];
      out.push({ id: `mezz-${f.id}`, label: `Interno: soppalco${floors.length > 1 ? ` (${f.name})` : ''}`, kind: 'inside', floor: f.id, level: f.level, fov: 75, position: pos, target: tgt });
    }
  }
  return out;
}

/* Una vista fatta con la telecamera di un piano solo (la scena sta a quota 0): si toglie la quota del piano. */
export const shiftView = (v, dy) => ({ ...v, position: [v.position[0], v.position[1] + dy, v.position[2]], target: [v.target[0], v.target[1] + dy, v.target[2]] });
