/*
 * Scena 3D della pianta arredata (three.js, caricato solo quando si apre la vista 3D).
 * Pianta in metri: x → x, y → z, altezza → y. Muri alti WALL_H con i vani di porte (fino a 2,10 m) e
 * finestre (da 0,90 a 2,10 m, con il vetro); arredi come volumi con altezze reali e i colori dello stile.
 */
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
  toilet: [0.45, 'ceramic'], bidet: [0.4, 'ceramic'], sink: [0.85, 'ceramic'], shower: [0.06, 'ceramic'],
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

export function buildScene(THREE, plan, theme, { lowWalls = false } = {}) {
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
  return root;
}

/* Quota di un piano rispetto al piano terra: muri alti WALL_H più il solaio. */
export const FLOOR_H = WALL_H + SLAB_T;

/*
 * Tutta la casa in 3D: i piani del progetto (livelli numerici; l'esterno resta fuori) impilati alla loro quota, con
 * un solaio sotto ogni piano più alto del più basso, aperto sopra la scala. `spread` stacca i piani (vista esplosa).
 * themeFor(floor) dà lo stile di ogni piano. Ogni gruppo di piano porta userData.floor = { id, name, level }.
 */
export function buildHouse(THREE, project, themeFor, { lowWalls = false, spread = 0 } = {}) {
  const house = new THREE.Group();
  const floors = project.floors.filter((f) => typeof f.level === 'number' && f.plan?.rooms?.length)
    .sort((a, b) => a.level - b.level);
  if (!floors.length) return house;
  const lowest = floors[0].level;
  const slabMat = new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.9 });
  for (const f of floors) {
    const g = buildScene(THREE, f.plan, themeFor(f), { lowWalls });
    const y = (f.level - lowest) * (FLOOR_H + spread);
    g.position.y = y;
    g.userData.floor = { id: f.id, name: f.name, level: f.level };
    house.add(g);
    if (f.level === lowest) continue;
    // solaio sotto il piano: un volume per locale, nessuno sopra la scala (il vano resta aperto)
    for (const r of f.plan.rooms) {
      if (r.kind === 'stairs' || r.kind === 'garden') continue;
      const pts = r.poly || [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
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
  return house;
}
