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
import { buildObject } from './furniture3d';
import { projectStairs } from './stairs';
import { kitMaterials, styleKit, uvMeters } from './style3d';
import { pointInPolygon } from './geometry';

export function buildScene(THREE, plan, theme, { lowWalls = false, stairs = null, openings: voids = [], facade = null } = {}) {
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
  // kit dello stile: interni e pavimenti dal tema del piano, facciata dallo stile della casa
  const kit = styleKit(theme.id);
  const K = kitMaterials(THREE, mat, kit);
  const facadeKit = facade && facade !== theme.id ? styleKit(facade) : kit;
  const KF = facadeKit === kit ? K : kitMaterials(THREE, mat, facadeKit);
  M.wall = K.wallIn;
  // categoria di materiale: nel DXF 3D ogni pezzo di un arredo va sul layer del suo materiale
  const CATS = { wood: 'LEGNO', fabric: 'TESSUTO', duvet: 'TESSUTO', cabinet: 'LACCATO', counter: 'PIANO', dark: 'PLASTICA', ceramic: 'CERAMICA',
    lamp: 'LUCE', plant: 'VEGETAZIONE', car: 'CARROZZERIA', metal: 'METALLO', stone: 'PIETRA', glass: 'VETRO', accent: 'TESSUTO' };
  for (const [k, v] of Object.entries(CATS)) M[k].userData.cat = v;
  const box = (x, z, w, d, y0, h, m) => {
    if (w <= 0.001 || d <= 0.001 || h <= 0.001) return null;
    const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    if (m === M.glass) g.userData.layer = 'VETRI';
    else if (Array.isArray(m) || m.map) uvMeters(g.geometry, w, h, d);
    g.position.set(x + w / 2, y0 + h / 2, z + d / 2);
    g.castShadow = true;
    g.receiveShadow = true;
    root.add(g);
    return g;
  };
  const rooms = plan.rooms.filter((r) => r.kind !== 'garden');
  const inside = (px, pz) => rooms.some((r) => (r.poly ? pointInPolygon([px, pz], r.poly)
    : px >= r.x - 0.02 && px <= r.x + r.w + 0.02 && pz >= r.y - 0.02 && pz <= r.y + r.h + 0.02));

  // pavimenti dei locali (anche di forma libera)
  for (const r of plan.rooms) {
    const pts = r.poly || [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
    // la forma si costruisce con y rovesciata: ruotata di -90° sull'asse x torna in (x, z = y) con la faccia in alto
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, -y)));
    // aperture dei solai (scale che salgono da sotto): il pavimento del piano non le copre
    for (const v0 of voids) {
      const v = clipHole(v0, r);   // una scala a cavallo di due locali buca il pavimento di entrambi
      if (!v) continue;
      const hole = new THREE.Path();
      [[v.x, v.y], [v.x, v.y + v.h], [v.x + v.w, v.y + v.h], [v.x + v.w, v.y]].forEach(([x, z], i) => (i ? hole.lineTo(x, -z) : hole.moveTo(x, -z)));
      shape.holes.push(hole);
    }
    const color = r.kind === 'garden' ? '#b9d6a8' : r.kind === 'garage' ? '#c9ccd1' : r.color || '#f5f5f5';
    // pavimento dello stile: listoni, spina di pesce o cemento nelle zone abitate, piastrelle o marmo nei bagni
    const floorMat = r.kind === 'garden' || r.kind === 'garage' ? mat(color) : WOOD_FLOORS.has(r.kind) ? K.floor : TILE_FLOORS.has(r.kind) ? K.wet : mat(color);
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.002;
    floor.receiveShadow = true;
    floor.userData.layer = 'PAVIMENTI';
    root.add(floor);
  }

  // vani di porte e finestre come rettangoli in pianta (come li disegna PlanSvg)
  const list = [
    ...plan.doors.filter((d) => d.kind !== 'gate').map((d) => ({ ...d, door: true })),
    ...plan.windows.map((w) => ({ ...w, door: false })),
  ];
  const openings = list.map((o) => (o.rot === 0 || !o.rot
    ? { x0: o.x, x1: o.x + o.w, z0: o.y, z1: o.y + t, door: o.door }
    : { x0: o.x - t, x1: o.x, z0: o.y, z1: o.y + o.w, door: o.door }));

  // muro intero: faccia interna chiara, faccia esterna nel colore e nel materiale della facciata dello stile
  const wallPiece = (horiz, w, a, b, y0, h) => {
    const x0 = horiz ? a : w.x;
    const z0 = horiz ? w.y : a;
    const bw = horiz ? b - a : w.w;
    const bd = horiz ? w.h : b - a;
    const mid = (a + b) / 2;
    const off = (horiz ? w.h : w.w) / 2 + 0.12;
    const cx = w.x + w.w / 2;
    const cz = w.y + w.h / 2;
    // da che parte sta l'esterno: si guardano i due lati del muro nel punto medio del tratto
    const lo = horiz ? inside(mid, cz - off) : inside(cx - off, mid);
    const hi = horiz ? inside(mid, cz + off) : inside(cx + off, mid);
    const out = lo && !hi ? 1 : hi && !lo ? -1 : 0;   // +1: l'esterno è verso +z (o +x), -1: verso -z (o -x)
    const mats = [K.wallIn, K.wallIn, K.wallIn, K.wallIn, K.wallIn, K.wallIn];
    const face = horiz ? (out > 0 ? 4 : 5) : (out > 0 ? 0 : 1);
    if (out) mats[face] = KF.facade;
    const mesh = box(x0, z0, bw, bd, y0, h, mats);
    if (!mesh) return;
    mesh.userData.layer = 'MURI';
    if (y0 > 0) return;
    const T = 0.014;
    const side = (sgn, fn) => {   // sgn: +1 faccia verso +z/+x, -1 verso -z/-x
      if (horiz) fn(x0, sgn > 0 ? z0 + bd : z0 - T, bw, T);
      else fn(sgn > 0 ? x0 + bw : x0 - T, z0, T, bd);
    };
    for (const sgn of [1, -1]) {
      if (out === sgn) {
        // esterno: zoccolo e cornicione dello stile della facciata
        side(sgn, (x, z, ww, dd) => box(x, z, ww, dd, 0, Math.min(0.45, h), KF.plinth));
        if (facadeKit.cornice && h >= wallH - 0.01 && !lowWalls) {
          const o2 = 0.07;
          if (horiz) box(x0 - 0.04, sgn > 0 ? z0 + bd : z0 - o2, bw + 0.08, o2, wallH - 0.14, 0.14, KF.trim);
          else box(sgn > 0 ? x0 + bw : x0 - o2, z0 - 0.04, o2, bd + 0.08, wallH - 0.14, 0.14, KF.trim);
        }
      } else {
        // interno: battiscopa dello stile
        side(sgn, (x, z, ww, dd) => box(x, z, ww, dd, 0, Math.min(kit.baseboard.h, h), K.baseboard));
      }
    }
  };

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
    const seg = (a, b, y0, h, m = null) => (m ? (horiz ? box(a, w.y, b - a, w.h, y0, h, m) : box(w.x, a, w.w, b - a, y0, h, m)) : wallPiece(horiz, w, a, b, y0, h));
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

  // infissi e porte nei colori dello stile: telaio e traversa centrale, davanzale, anta socchiusa con maniglia
  list.forEach((o, i) => {
    const q = openings[i];
    const horiz = o.rot === 0 || !o.rot;
    const len = o.w;
    const fr = 0.045;
    const th = t + 0.02;                    // il telaio sporge poco da entrambe le facce
    const bar = (aa, bb, y0, h, m) => (horiz ? box(aa, q.z0 - 0.01, bb - aa, th, y0, h, m) : box(q.x0 - 0.01, aa, th, bb - aa, y0, h, m));
    const a0 = horiz ? q.x0 : q.z0;
    const a1 = horiz ? q.x1 : q.z1;
    if (!o.door) {
      const top = Math.min(DOOR_H, wallH);
      if (wallH <= SILL) return;
      const Fm = K.frame;
      bar(a0, a0 + fr, SILL, top - SILL, Fm);
      bar(a1 - fr, a1, SILL, top - SILL, Fm);
      bar(a0, a1, SILL, fr, Fm);
      bar(a0, a1, top - fr, fr, Fm);
      const panes = len > 2.2 ? 3 : len > 1.2 ? 2 : 1;
      for (let k = 1; k < panes; k++) bar(a0 + (len * k) / panes - fr / 2, a0 + (len * k) / panes + fr / 2, SILL, top - SILL, Fm);
      // davanzale: lastra che sporge sul lato esterno e leggermente dentro
      if (horiz) box(q.x0 - 0.05, q.z0 - 0.06, len + 0.1, t + 0.12, SILL - 0.035, 0.035, K.trim);
      else box(q.x0 - 0.06, q.z0 - 0.05, t + 0.12, len + 0.1, SILL - 0.035, 0.035, K.trim);
      return;
    }
    if (o.kind === 'garage') {
      // basculante a pannelli: cinque doghe con la fuga tra l'una e l'altra
      const hh = Math.min(DOOR_H, wallH) - 0.03;
      for (let k = 0; k < 5; k++) bar(a0 + 0.02, a1 - 0.02, 0.02 + (k * hh) / 5, hh / 5 - 0.012, K.door);
      return;
    }
    if (wallH <= DOOR_H) return;
    // stipiti e architrave
    bar(a0, a0 + fr, 0, DOOR_H, K.frame);
    bar(a1 - fr, a1, 0, DOOR_H, K.frame);
    bar(a0, a1, DOOR_H - fr, fr, K.frame);
    // anta socchiusa di 65°, incernierata all'inizio del vano
    const leaf = new THREE.Group();
    const lw = len - 2 * fr;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(lw, DOOR_H - fr - 0.01, 0.04), o.entrance ? K.frame : K.door);
    slab.position.set(lw / 2, (DOOR_H - fr - 0.01) / 2 + 0.005, 0);
    slab.castShadow = true;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 10), K.handle);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(lw - 0.08, 1.0, 0);
    leaf.add(slab, knob);
    const dir = horiz ? o.openDir : -o.openDir;   // verso (+1/-1) in cui si apre, lungo z (porte orizzontali) o x (verticali)
    const hinge = horiz ? [q.x0 + fr, q.z0 + t / 2] : [q.x0 + t / 2, q.z0 + fr];
    leaf.position.set(hinge[0], 0, hinge[1]);
    // l'anta è costruita lungo +x: nelle porte orizzontali gira da +x verso ±z, in quelle verticali parte da +z (−90°) verso ±x
    const open = (65 * Math.PI) / 180;
    leaf.rotation.y = horiz ? -dir * open : -Math.PI / 2 + dir * open;
    leaf.traverse((c) => { if (c.isMesh) { c.userData.layer = 'PORTE'; c.receiveShadow = true; } });
    root.add(leaf);
  });

  // ringhiera attorno all'apertura della scala nei lati lunghi non appoggiati a un muro (i lati corti sono il passaggio)
  for (const v of voids) {
    const room = rooms.find((r) => v.x >= r.x - 0.01 && v.x + v.w <= r.x + r.w + 0.01 && v.y >= r.y - 0.01 && v.y + v.h <= r.y + r.h + 0.01);
    if (!room) continue;
    const alongX = v.w >= v.h;
    const edges = alongX
      ? [{ a: v.x, b: v.x + v.w, z: v.y, near: v.y - room.y < 0.3 }, { a: v.x, b: v.x + v.w, z: v.y + v.h, near: room.y + room.h - (v.y + v.h) < 0.3 }]
      : [{ a: v.y, b: v.y + v.h, x: v.x, near: v.x - room.x < 0.3 }, { a: v.y, b: v.y + v.h, x: v.x + v.w, near: room.x + room.w - (v.x + v.w) < 0.3 }];
    for (const e of edges) {
      if (e.near) continue;
      const len = e.b - e.a;
      const at = (a, y0, h, thick, mt) => (alongX ? box(a, e.z - thick / 2, thick, thick, y0, h, mt) : box(e.x - thick / 2, a, thick, thick, y0, h, mt));
      const bar = (y0, h, thick, mt) => (alongX ? box(e.a, e.z - thick / 2, len, thick, y0, h, mt) : box(e.x - thick / 2, e.a, thick, len, y0, h, mt));
      const posts = Math.max(2, Math.round(len / 0.9) + 1);
      const meshes = [];
      for (let i = 0; i < posts; i++) meshes.push(at(e.a + (len * i) / (posts - 1) - 0.015, 0, 0.95, 0.03, K.rail));
      meshes.push(bar(0.93, 0.035, 0.05, K.rail));
      if (theme.id === 'modern') meshes.push(bar(0.12, 0.8, 0.012, M.glass));   // moderno: vetro
      else if (theme.id === 'industrial') for (const y of [0.3, 0.55, 0.78]) meshes.push(bar(y, 0.008, 0.01, K.rail));
      else {
        const n = Math.floor(len / 0.11);
        for (let i = 0; i < n; i++) meshes.push(at(e.a + (len * (i + 0.5)) / n - 0.01, 0.05, 0.86, 0.02, K.rail));
      }
      for (const mm of meshes) if (mm) mm.userData.layer = 'RINGHIERE';
    }
  }

  // arredi
  for (const it of plan.furniture) {
    // gli arredi con un modello (letto, auto, sanitari…) sono oggetti veri: gruppi di pezzi, un blocco nel DXF
    const obj = buildObject(THREE, it, M, mat, theme);
    if (obj) {
      root.add(obj);
      continue;
    }
    const [h, m, lift = 0] = SHAPES[it.type] || [0.6, 'cabinet'];
    const material = M[m] || M.cabinet;
    if (it.type === 'floor_lamp') {
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
/* Parte di un'apertura che cade dentro il locale (rettangolo del locale), o null se non lo tocca. */
function clipHole(v, r) {
  const x0 = Math.max(v.x, r.x);
  const y0 = Math.max(v.y, r.y);
  const x1 = Math.min(v.x + v.w, r.x + r.w);
  const y1 = Math.min(v.y + v.h, r.y + r.h);
  return x1 - x0 > 0.02 && y1 - y0 > 0.02 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

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
  // una sola facciata per la casa: lo stile del piano terra (o del piano più basso)
  const facadeId = themeFor(floors.find((f) => f.level === 0) || floors[0]).id;
  for (const f of floors) {
    // le scale partono dal piano e salgono al successivo: sul piano di sopra non si disegnano
    const up = (byFloor[f.id] || []).filter((st) => st.engine ? st.upTo : st.role === 'up');
    const voids = f.level === lowest ? [] : floorVoids(byFloor[f.id]);
    const g = buildScene(THREE, f.plan, themeFor(f), { lowWalls, stairs: up, openings: voids, facade: facadeId });
    const y = quota(f.level);
    g.position.y = y;
    g.userData.floor = { id: f.id, name: f.name, level: f.level };
    house.add(g);
    if (f.level === lowest) continue;
    // solaio sotto il piano: un volume per locale, nessuno sopra la scala (il vano resta aperto)
    for (const r of f.plan.rooms) {
      if (r.kind === 'garden') continue;
      // il solaio ha l'apertura dove la scala sale dal piano sotto; sul vano scala resta la fascia attorno e lo spazio di arrivo
      const holes = floorVoids(byFloor[f.id]).map((v) => clipHole(v, r)).filter(Boolean);
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
  const { type, slope, overhang, style } = { ...ROOF_DEFAULTS, ...opts };
  const g = new THREE.Group();
  g.name = 'tetto';
  g.position.y = y;
  const kit = styleKit(style);
  const mk = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  const tile = kitMaterials(THREE, mk, kit).roof;
  const slab = mk(kit.plinth);
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
    const flat = tris.flat(2);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
    // UV in metri sulla falda: lungo il colmo e lungo la linea di massima pendenza
    const uvs = [];
    for (let i = 0; i < flat.length; i += 3) uvs.push(flat[i] + flat[i + 2] * 0.3, flat[i + 1] / Math.max(0.2, Math.sin((slope * Math.PI) / 180)) + flat[i + 2] * 0.7);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
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
