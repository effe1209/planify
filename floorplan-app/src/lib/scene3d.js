/*
 * Scena 3D della pianta arredata (three.js, caricato solo quando si apre la vista 3D).
 * Pianta in metri: x → x, y → z, altezza → y. Muri alti WALL_H con i vani di porte (fino a 2,10 m) e
 * finestre (da 0,90 a 2,10 m, con il vetro); arredi come volumi con altezze reali e i colori dello stile.
 */
import { frontOf } from './project';

export const WALL_H = 2.7;
const DOOR_H = 2.1;
const SILL = 0.9;
const SLAB_T = 0.3;   // solaio tra un piano e l'altro

/* Altezza (m) e materiale di ogni arredo; `lift` = quota da terra (TV appesa, pensili…). */
const SHAPES = {
  sofa: [0.8, 'fabric'], sofa_corner: [0.8, 'fabric'], armchair: [0.8, 'fabric'], bed: [0.55, 'duvet'],
  nightstand: [0.5, 'wood'], wardrobe: [2.2, 'cabinet'], desk: [0.75, 'wood'], table: [0.75, 'wood'],
  table_round: [0.75, 'wood'], coffee_table: [0.4, 'wood'], tv: [0.6, 'dark', 0.6], kitchen_counter: [0.9, 'counter'],
  kitchen_peninsula: [0.9, 'counter'], sideboard: [0.8, 'wood'], bookcase: [2.0, 'cabinet'], dresser: [0.9, 'wood'],
  shoe_cabinet: [1.0, 'cabinet'], console: [0.8, 'wood'], floor_lamp: [1.6, 'lamp'], plant: [1.0, 'plant'],
  toilet: [0.45, 'ceramic'], bidet: [0.4, 'ceramic'], sink: [0.85, 'ceramic'], bath_column: [1.8, 'cabinet'],
  towel_radiator: [1.2, 'ceramic', 0.2], shower: [0.06, 'ceramic'],
  shower_round: [0.06, 'ceramic'], shower_walkin: [0.06, 'ceramic'], bathtub: [0.55, 'ceramic'],
  washer: [0.85, 'ceramic'], dryer: [0.85, 'ceramic'], utility_sink: [0.85, 'ceramic'], minibar: [0.85, 'cabinet'],
  car: [1.45, 'car'], motorbike: [1.1, 'dark'], workbench: [0.9, 'wood'], shelving: [1.8, 'metal'],
  shelving_heavy: [2.0, 'metal'], laundry_basket: [0.5, 'fabric'], vacuum: [0.3, 'dark'],
  hedge: [1.2, 'plant'], fence: [1.0, 'wood'], tree: [3.5, 'plant'], gazebo: [2.5, 'wood'], path: [0.02, 'stone'], ramp: [0.02, 'stone'],
};

/* Quote da terra (m) del volume di un arredo: [base, sommità]. */
export function furnitureZ(type) {
  const [h, , lift = 0] = SHAPES[type] || [0.6];
  return [lift, lift + h];
}

const WOOD_FLOORS = new Set(['living', 'living_kitchen', 'dining', 'bed', 'study', 'entry', 'corridor', 'closet', 'hotel_room', 'stairs']);
const TILE_FLOORS = new Set(['bath', 'wc', 'kitchen', 'laundry', 'storage']);

import { ROOF_DEFAULTS, gableTriangles, roofWings } from './roof';
import { stairHoles, stairSteps } from './stairs3d';
import { projectStairs } from './stairs';

export function buildScene(THREE, plan, theme, { lowWalls = false, stairs = null, openings: voids = [] } = {}) {
  const root = new THREE.Group();
  const s = plan.scale;
  const t = plan.wallThickness / s;
  const wallH = lowWalls ? 1.2 : WALL_H;
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });
  const M = {
    wall: mat('#f3f0ea'), wood: mat(theme.wood), fabric: mat(theme.fabric), duvet: mat(theme.duvet),
    cabinet: mat(theme.cabinet), counter: mat('#eceef2'), dark: mat('#2b3038'), ceramic: mat('#fbfbfc', { roughness: 0.3 }),
    lamp: mat('#fff3c4', { emissive: '#ffe08a', emissiveIntensity: 0.4 }), plant: mat('#6f9f62'), car: mat('#c6d0de', { roughness: 0.4 }),
    metal: mat(theme.metal || '#5b6472', { metalness: 0.4, roughness: 0.5 }), stone: mat('#d9d4ca'),
    glass: new THREE.MeshStandardMaterial({ color: '#bfe0f5', transparent: true, opacity: 0.35, roughness: 0.1 }),
    accent: mat(theme.accent || '#4f6d8f'),
  };
  const box = (x, z, w, d, y0, h, m) => {
    if (w <= 0.001 || d <= 0.001 || h <= 0.001) return;
    const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    g.position.set(x + w / 2, y0 + h / 2, z + d / 2);
    g.castShadow = true;
    g.receiveShadow = true;
    root.add(g);
  };

  // pavimenti dei locali (anche di forma libera)
  for (const r of plan.rooms) {
    const pts = r.poly || [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
    // la forma si costruisce con y rovesciata: ruotata di -90° sull'asse x torna in (x, z = y) con la faccia in alto
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, -y)));
    // aperture dei solai (scale che salgono da sotto): il pavimento del piano non le copre
    for (const v of voids) {
      if (v.x >= r.x - 0.01 && v.x + v.w <= r.x + r.w + 0.01 && v.y >= r.y - 0.01 && v.y + v.h <= r.y + r.h + 0.01) {
        const hole = new THREE.Path();
        [[v.x, v.y], [v.x, v.y + v.h], [v.x + v.w, v.y + v.h], [v.x + v.w, v.y]].forEach(([x, z], i) => (i ? hole.lineTo(x, -z) : hole.moveTo(x, -z)));
        shape.holes.push(hole);
      }
    }
    const color = r.kind === 'garden' ? '#b9d6a8' : r.kind === 'garage' ? '#c9ccd1'
      : WOOD_FLOORS.has(r.kind) ? theme.wood : TILE_FLOORS.has(r.kind) ? '#e8ecf0' : r.color || '#f5f5f5';
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat(color));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.002;
    floor.receiveShadow = true;
    floor.userData.layer = 'PAVIMENTI';
    root.add(floor);
  }

  // vani di porte e finestre come rettangoli in pianta (come li disegna PlanSvg)
  const openings = [
    ...plan.doors.filter((d) => d.kind !== 'gate').map((d) => ({ ...d, door: true })),
    ...plan.windows.map((w) => ({ ...w, door: false })),
  ].map((o) => (o.rot === 0 || !o.rot
    ? { x0: o.x, x1: o.x + o.w, z0: o.y, z1: o.y + t, door: o.door }
    : { x0: o.x - t, x1: o.x, z0: o.y, z1: o.y + o.w, door: o.door }));

  // muri: ogni tratto si divide dove ci sono vani; sotto e sopra le finestre resta il muro
  for (const w of plan.walls) {
    const horiz = w.w >= w.h;
    const a0 = horiz ? w.x : w.y;
    const a1 = horiz ? w.x + w.w : w.y + w.h;
    const cuts = openings.filter((o) => (horiz
      ? o.x1 > w.x + 0.01 && o.x0 < w.x + w.w - 0.01 && o.z1 > w.y - 0.01 && o.z0 < w.y + w.h + 0.01
      : o.z1 > w.y + 0.01 && o.z0 < w.y + w.h - 0.01 && o.x1 > w.x - 0.01 && o.x0 < w.x + w.w + 0.01))
      .map((o) => ({ a: Math.max(a0, horiz ? o.x0 : o.z0), b: Math.min(a1, horiz ? o.x1 : o.z1), door: o.door }))
      .sort((p, q) => p.a - q.a);
    let cur = a0;
    const seg = (a, b, y0, h, m = M.wall) => (horiz ? box(a, w.y, b - a, w.h, y0, h, m) : box(w.x, a, w.w, b - a, y0, h, m));
    for (const c of cuts) {
      if (c.a > cur) seg(cur, c.a, 0, wallH);
      if (c.door) {
        if (wallH > DOOR_H) seg(c.a, c.b, DOOR_H, wallH - DOOR_H);
      } else {
        seg(c.a, c.b, 0, Math.min(SILL, wallH));
        if (wallH > SILL) seg(c.a + 0.02, c.b - 0.02, SILL, Math.min(DOOR_H, wallH) - SILL, M.glass);
        if (wallH > DOOR_H) seg(c.a, c.b, DOOR_H, wallH - DOOR_H);
      }
      cur = Math.max(cur, c.b);
    }
    if (cur < a1) seg(cur, a1, 0, wallH);
  }

  // arredi
  for (const it of plan.furniture) {
    const [h, m, lift = 0] = SHAPES[it.type] || [0.6, 'cabinet'];
    const material = M[m] || M.cabinet;
    if (it.type === 'plant' || it.type === 'tree') {
      const r = Math.min(it.w, it.h) / 2;
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.4, it.type === 'tree' ? 1.6 : 0.35, 16),
        it.type === 'tree' ? mat('#7a5a3a') : mat(theme.pot || '#e2d6c2'));
      pot.position.set(it.x + it.w / 2, (it.type === 'tree' ? 1.6 : 0.35) / 2, it.y + it.h / 2);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(r * (it.type === 'tree' ? 1 : 0.9), 16, 12), M.plant);
      crown.position.set(it.x + it.w / 2, it.type === 'tree' ? 2.4 : 0.75, it.y + it.h / 2);
      pot.castShadow = crown.castShadow = true;
      root.add(pot, crown);
    } else if (it.type === 'floor_lamp') {
      box(it.x + it.w / 2 - 0.02, it.y + it.h / 2 - 0.02, 0.04, 0.04, 0, 1.4, M.metal);
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.28, 20), M.lamp);
      shade.position.set(it.x + it.w / 2, 1.5, it.y + it.h / 2);
      root.add(shade);
    } else if (it.type === 'table' || it.type === 'table_round' || it.type === 'desk' || it.type === 'coffee_table') {
      // piano e gambe
      const top = 0.04;
      if (it.type === 'table_round') {
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(it.w / 2, it.w / 2, top, 32), material);
        disc.position.set(it.x + it.w / 2, h - top / 2, it.y + it.h / 2);
        disc.castShadow = true;
        root.add(disc);
        box(it.x + it.w / 2 - 0.04, it.y + it.h / 2 - 0.04, 0.08, 0.08, 0, h - top, material);
      } else {
        box(it.x, it.y, it.w, it.h, h - top, top, material);
        const l = 0.05;
        for (const [lx, lz] of [[it.x, it.y], [it.x + it.w - l, it.y], [it.x, it.y + it.h - l], [it.x + it.w - l, it.y + it.h - l]]) {
          box(lx, lz, l, l, 0, h - top, theme.legs === 'metal' ? M.metal : material);
        }
      }
    } else if (it.type === 'sofa' || it.type === 'sofa_corner' || it.type === 'armchair') {
      // seduta bassa e schienale sul retro
      box(it.x, it.y, it.w, it.h, 0, 0.42, material);
      const back = 0.2;
      const f = it.facing || 'S';
      if (f === 'S') box(it.x, it.y, it.w, back, 0.42, h - 0.42, material);
      else if (f === 'N') box(it.x, it.y + it.h - back, it.w, back, 0.42, h - 0.42, material);
      else if (f === 'E') box(it.x, it.y, back, it.h, 0.42, h - 0.42, material);
      else box(it.x + it.w - back, it.y, back, it.h, 0.42, h - 0.42, material);
    } else if (it.type === 'sink' && it.parts?.cabinet) {
      // lavabo su mobile: mobile con i cassetti e piano in ceramica
      box(it.x, it.y, it.w, it.h, 0.15, 0.62, M.cabinet);
      box(it.x, it.y, it.w, it.h, 0.77, 0.08, M.ceramic);
    } else if (it.type === 'bed') {
      box(it.x, it.y, it.w, it.h, 0, 0.3, M.wood);
      box(it.x + 0.03, it.y + 0.03, it.w - 0.06, it.h - 0.06, 0.3, 0.25, M.duvet);
      const f = it.facing || 'S';
      const hb = 0.08;
      if (f === 'S') box(it.x, it.y, it.w, hb, 0, 1.0, M.wood);
      else if (f === 'N') box(it.x, it.y + it.h - hb, it.w, hb, 0, 1.0, M.wood);
      else if (f === 'E') box(it.x, it.y, hb, it.h, 0, 1.0, M.wood);
      else box(it.x + it.w - hb, it.y, hb, it.h, 0, 1.0, M.wood);
    } else {
      box(it.x, it.y, it.w, it.h, lift, h, material);
    }
  }
  // layer di ogni volume (per il DXF 3D): muri, vetri, pavimenti, il resto sono arredi
  root.traverse((o) => {
    if (!o.isMesh || o.userData.layer) return;
    o.userData.layer = o.material === M.wall ? 'MURI' : o.material === M.glass ? 'VETRI' : 'ARREDI';
  });
  // scale: i gradini salgono al piano di sopra (altezza = solaio compreso)
  const flights = stairs ?? (plan.stairs || []).filter((st) => st.entry);
  const stepMat = new THREE.MeshStandardMaterial({ color: theme.wood || '#cdb89a', roughness: 0.7 });
  for (const st of flights) {
    for (const b of stairSteps(st, WALL_H + SLAB_T)) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, b.top, b.z1 - b.z0), stepMat);
      m.position.set((b.x0 + b.x1) / 2, b.top / 2, (b.z0 + b.z1) / 2);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.layer = 'SCALE';
      root.add(m);
    }
  }
  return root;
}

/* Quota di un piano rispetto al piano terra: muri alti WALL_H più il solaio. */
export const FLOOR_H = WALL_H + SLAB_T;

/*
 * Tutta la casa in 3D: i piani del progetto impilati alla loro quota (il piano terra a quota 0, l'interrato sotto
 * terra), con un solaio sotto ogni piano più alto del più basso, aperto sopra la scala. `spread` stacca i piani
 * (vista esplosa). Il giardino si mette davanti alla facciata d'ingresso, dove lo mette la sua pianta, alla quota
 * del terreno; con il garage interrato la sua rampa scende fino alla basculante, tra due muri di contenimento.
 * themeFor(floor) dà lo stile di ogni piano. Ogni gruppo di piano porta userData.floor = { id, name, level };
 * house.userData.grade è la quota del terreno.
 */
/* Aperture di un piano per le scale che salgono dal piano sotto (scale del motore con downTo, del progetto con role down). */
function floorVoids(stairs) {
  return (stairs || []).filter((st) => (st.engine ? st.downTo : st.role === 'down'))
    .flatMap((st) => stairHoles(st, WALL_H + SLAB_T));
}

export function buildHouse(THREE, project, themeFor, { lowWalls = false, spread = 0 } = {}) {
  const house = new THREE.Group();
  house.userData.grade = 0;
  const floors = project.floors.filter((f) => typeof f.level === 'number' && f.plan?.rooms?.length)
    .sort((a, b) => a.level - b.level);
  if (!floors.length) return house;
  const lowest = floors[0].level;
  const quota = (level) => level * (FLOOR_H + spread);
  const slabMat = new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.9 });
  const byFloor = projectStairs(project).byFloor;
  for (const f of floors) {
    // le scale partono dal piano e salgono al successivo: sul piano di sopra non si disegnano
    const up = (byFloor[f.id] || []).filter((st) => st.engine ? st.upTo : st.role === 'up');
    const voids = f.level === lowest ? [] : floorVoids(byFloor[f.id]);
    const g = buildScene(THREE, f.plan, themeFor(f), { lowWalls, stairs: up, openings: voids });
    const y = quota(f.level);
    g.position.y = y;
    g.userData.floor = { id: f.id, name: f.name, level: f.level };
    house.add(g);
    if (f.level === lowest) continue;
    // solaio sotto il piano: un volume per locale, nessuno sopra la scala (il vano resta aperto)
    for (const r of f.plan.rooms) {
      if (r.kind === 'garden') continue;
      // il solaio ha l'apertura dove la scala sale dal piano sotto; sul vano scala resta la fascia attorno e lo spazio di arrivo
      const holes = floorVoids(byFloor[f.id]).filter((v) => v.x >= r.x - 0.01 && v.x + v.w <= r.x + r.w + 0.01
        && v.y >= r.y - 0.01 && v.y + v.h <= r.y + r.h + 0.01);
      const pts = r.poly || [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
      for (const v of holes) {
        const hole = new THREE.Path();
        [[v.x, v.y], [v.x, v.y + v.h], [v.x + v.w, v.y + v.h], [v.x + v.w, v.y]].forEach(([x, z], k) => (k ? hole.lineTo(x, -z) : hole.moveTo(x, -z)));
        shape.holes.push(hole);
      }
      if (r.kind === 'stairs' && !holes.length) continue;
      const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: SLAB_T, bevelEnabled: false }), slabMat);
      slab.rotation.x = -Math.PI / 2;
      slab.position.y = y - SLAB_T;
      slab.receiveShadow = true;
      slab.castShadow = true;
      slab.userData.layer = 'SOLAI';
      slab.userData.floor = { id: f.id, name: f.name, level: f.level };
      house.add(slab);
    }
  }
  const garden = project.floors.find((f) => f.level === 'out' && f.plan?.rooms?.length);
  const front = garden && frontOf(project);
  if (front) {
    const garage = floors.find((f) => f.level < front.floor.level && f.plan.doors.some((d) => d.kind === 'garage'));
    house.add(placeGarden(THREE, garden, front, themeFor(garden), garage ? quota(garage.level) - quota(front.floor.level) : 0));
  }
  return house;
}

/*
 * Il giardino nella pianta del piano terra. Nel giardino la casa sta sul lato nord (y = 0), con la facciata da
 * plan.house.x; si ruota e si sposta perché quel lato combaci con la facciata d'ingresso vera. `drop` = di quanto
 * scende la rampa del garage interrato (negativo), 0 se non c'è.
 */
function placeGarden(THREE, floor, { facade, W, L }, theme, drop) {
  const p = floor.plan;
  const hx = p.house?.x ?? (p.dimensions.width - facade.w) / 2;
  const ramps = drop < 0 ? p.furniture.filter((it) => it.type === 'ramp') : [];
  // il prato ha un buco dove c'è la rampa (che parte dalla facciata, y = 0)
  const rooms = p.rooms.map((r) => {
    const cut = ramps.find((it) => it.y <= r.y + 0.01 && it.x >= r.x && it.x + it.w <= r.x + r.w);
    if (!cut || r.poly) return r;
    return { ...r, poly: [[r.x, r.y], [cut.x, r.y], [cut.x, cut.y + cut.h], [cut.x + cut.w, cut.y + cut.h],
      [cut.x + cut.w, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]] };
  });
  const g = buildScene(THREE, { ...p, rooms, furniture: p.furniture.filter((it) => !ramps.includes(it)) }, theme);
  const concrete = new THREE.MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.9, side: THREE.DoubleSide });
  for (const it of ramps) {
    // piano inclinato dalla quota del terreno (verso la strada) alla quota del garage (alla facciata)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      it.x, drop, it.y, it.x + it.w, drop, it.y, it.x + it.w, 0, it.y + it.h,
      it.x, drop, it.y, it.x + it.w, 0, it.y + it.h, it.x, 0, it.y + it.h,
    ], 3));
    geo.computeVertexNormals();
    const ramp = new THREE.Mesh(geo, concrete);
    ramp.receiveShadow = true;
    ramp.userData.layer = 'PAVIMENTI';
    g.add(ramp);
    for (const x of [it.x - 0.2, it.x + it.w]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3 - drop, it.h), concrete);
      wall.position.set(x + 0.1, (0.3 + drop) / 2, it.y + it.h / 2);
      wall.castShadow = wall.receiveShadow = true;
      wall.userData.layer = 'MURI';
      g.add(wall);
    }
  }
  const place = {
    S: [0, -hx, L], N: [Math.PI, W + hx, 0], E: [Math.PI / 2, W, L + hx], W: [-Math.PI / 2, 0, -hx],
  }[facade.front];
  g.rotation.y = place[0];
  g.position.set(place[1], 0, place[2]);
  g.userData.floor = { id: floor.id, name: floor.name, level: 'out' };
  return g;
}

/*
 * Terreno sotto il modello, alla quota del terreno (model.userData.grade, se c'è): con i piani interrati è
 * trasparente, così l'interrato si vede attraverso. Ritorna centro e ingombro per luce e inquadratura.
 */
export function addGround(THREE, scene, model) {
  const bb = new THREE.Box3().setFromObject(model);
  const grade = model.userData.grade ?? bb.min.y;
  const below = bb.min.y < grade - 0.5;
  const size = bb.getSize(new THREE.Vector3());
  const center = bb.getCenter(new THREE.Vector3());
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size.x + 20, size.z + 20), new THREE.MeshStandardMaterial({
    color: '#e4e8ee', ...(below && { transparent: true, opacity: 0.5, depthWrite: false }),
  }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center.x, grade - 0.01, center.z);
  ground.receiveShadow = true;
  scene.add(ground);
  return { bb, center, size };
}

/*
 * Tetto di un piano, alla quota `y` (la sommità dei muri). Gruppo «tetto»: userData.layer = 'TETTO', si accende e si
 * spegne con `visible`. type = 'gable' (due falde, un'ala per ogni parte rettangolare dell'edificio) | 'flat'.
 */
export function buildRoof(THREE, plan, y, opts = {}) {
  const { type, slope, overhang } = { ...ROOF_DEFAULTS, ...opts };
  const g = new THREE.Group();
  g.name = 'tetto';
  g.position.y = y;
  const tile = new THREE.MeshStandardMaterial({ color: '#a8604a', roughness: 0.8, side: THREE.DoubleSide });
  const slab = new THREE.MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.9 });
  for (const w of roofWings(plan)) {
    if (type === 'flat') {
      const o = overhang / 2;
      const box = new THREE.Mesh(new THREE.BoxGeometry(w.x1 - w.x0 + 2 * o, 0.25, w.y1 - w.y0 + 2 * o), slab);
      box.position.set((w.x0 + w.x1) / 2, 0.125, (w.y0 + w.y1) / 2);
      box.castShadow = box.receiveShadow = true;
      box.userData.layer = 'TETTO';
      g.add(box);
      continue;
    }
    const { tris } = gableTriangles(w, { slope, overhang });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(2), 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, tile);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.layer = 'TETTO';
    g.add(mesh);
  }
  return g;
}

/* Il piano più alto con locali abitati (il garage interrato e il giardino non hanno tetto): [{ floor, y }]. */
export function roofFloor(project) {
  const floors = project.floors.filter((f) => typeof f.level === 'number' && f.level >= 0 && f.plan?.rooms?.length
    && !f.plan.rooms.every((r) => r.kind === 'garden' || r.kind === 'garage'));
  if (!floors.length) return null;
  const top = floors.reduce((a, f) => (f.level > a.level ? f : a));
  return { floor: top, y: top.level * FLOOR_H + WALL_H };
}
