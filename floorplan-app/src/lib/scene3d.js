/*
 * Scena 3D della pianta arredata (three.js, caricato solo quando si apre la vista 3D).
 * Pianta in metri: x → x, y → z, altezza → y. Muri alti WALL_H con i vani di porte (fino a 2,10 m) e
 * finestre (da 0,90 a 2,10 m, con il vetro); arredi come volumi con altezze reali e i colori dello stile.
 */
import { frontOf } from './project';
import { rugsFor } from './rugs';
import { shade, tintMaterials, tintTheme, validColor } from './furnitureColor';
import { decorFor } from './decor';
import { slideDoor } from './mezz';
import { balconyRailings } from './balcony';
import { glassSpan, isPanoramic, isSliding } from './openings';
import { withCornerWindows } from './cornerWindows';

export const WALL_H = 2.7;
const DOOR_H = 2.1;
const SILL = 0.9;
const SLAB_T = 0.3;   // solaio tra un piano e l'altro

/* Altezza (m) e materiale di ogni arredo; `lift` = quota da terra (TV appesa, pensili…). */
const SHAPES = {
  sofa: [0.8, 'fabric'], sofa_corner: [0.8, 'fabric'], armchair: [0.8, 'fabric'], bed: [0.55, 'duvet'],
  nightstand: [0.5, 'wood'], wardrobe: [2.2, 'cabinet'], wardrobe_corner: [2.2, 'cabinet'], wardrobe_open: [2.1, 'cabinet'],
  sofa_round: [0.8, 'fabric'], sofa_curved: [0.8, 'fabric'], chair_design: [0.82, 'wood'], chair_outdoor: [0.85, 'wood'], armchair_rattan: [0.8, 'wood'], table_rattan: [0.5, 'wood'], desk: [0.75, 'wood'], table: [0.75, 'wood'],
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
import { buildTimber, rafterTails } from './timber';
import { stairHoles, stairSteps } from './stairs3d';
import { buildObject } from './furniture3d';
import { projectStairs } from './stairs';
import { kitMaterials, styleKit, texture as kitTexture, uvMeters } from './style3d';
import { pointInPolygon } from './geometry';

export function buildScene(THREE, plan0, theme, { lowWalls = false, stairs = null, openings: voids = [], facade = null, timber = true } = {}) {
  const plan = withCornerWindows(plan0);   // due finestre vicine in un angolo sono una sola, con il montante
  const root = new THREE.Group();
  // ogni pezzo costruito mentre `curTag` è acceso porta quell'etichetta (arredo o apertura di origine): serve a riconoscere cosa si clicca nel 3D
  let curTag = null;
  const rawAdd = root.add.bind(root);
  root.add = (...objs) => {
    if (curTag) for (const o of objs) Object.assign(o.userData, curTag);
    return rawAdd(...objs);
  };
  const s = plan.scale;
  const t = plan.wallThickness / s;
  const wallH = lowWalls ? 1.2 : (plan.height || WALL_H);   // il loft ha il volume a doppia altezza
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
  const kit = styleKit(theme.id, theme.palette, theme.materials);
  const K = kitMaterials(THREE, mat, kit);
  const facadeKit = facade && facade !== theme.id ? styleKit(facade, theme.palette, theme.materials) : kit;
  const KF = facadeKit === kit ? K : kitMaterials(THREE, mat, facadeKit);
  M.wall = K.wallIn;
  M.wood.userData.pbr = 'plank';          // il legno degli arredi e del soppalco: nel render diventa legno vero con venature
  M.wood.userData.pbrTint = theme.wood;
  for (const k of ['fabric', 'duvet', 'accent']) { M[k].userData.pbr = 'fabric'; M[k].userData.pbrTint = k === 'duvet' ? theme.duvet : k === 'accent' ? (theme.accent || '#4f6d8f') : theme.fabric; }
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
  const finishFloors = new Map();   // materiali dei pavimenti scelti dalla libreria, uno per colore e trama
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
    // materiale scelto per il pavimento del locale (libreria): colore e trama del catalogo
    const fin = r.finish?.floor;
    const finKey = fin?.color && `${fin.texture || 'none'}|${fin.color}`;
    if (finKey && !finishFloors.has(finKey)) {
      const map = fin.texture && fin.texture !== 'none' ? kitTexture(THREE, fin.texture, fin.color, shade(fin.color, -0.05), shade(fin.color, -0.35)) : null;
      const fm = mat(map ? '#ffffff' : fin.color, { ...(map && { map }), roughness: fin.texture === 'marble' ? 0.3 : 0.7 });
      fm.userData.pbr = fin.texture && fin.texture !== 'none' ? fin.texture : undefined;
      fm.userData.pbrTint = fin.color;
      finishFloors.set(finKey, fm);
    }
    const floorMat = finKey ? finishFloors.get(finKey) : r.kind === 'garden' || r.kind === 'garage' ? mat(color) : r.kind === 'balcony' ? K.deck : WOOD_FLOORS.has(r.kind) ? K.floor : TILE_FLOORS.has(r.kind) ? K.wet : mat(color);
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.002;
    floor.receiveShadow = true;
    floor.userData.layer = 'PAVIMENTI';
    floor.userData.roomId = r.id;
    root.add(floor);
  }

  // vani di porte e finestre come rettangoli in pianta (come li disegna PlanSvg)
  const allOpenings = [
    ...plan.doors.map((d, i) => ({ ...d, door: true, _i: i })).filter((d) => d.kind !== 'gate'),
    ...plan.windows.map((w, i) => ({ ...w, door: false, _i: i })),
  ];
  // sui muri dritti le aperture sono orizzontali o verticali; su muri curvi o obliqui (forme libere, facciata ad arco) hanno un angolo qualsiasi
  const axisAligned = (o) => {
    const r = (((o.rot || 0) % 180) + 180) % 180;
    if (!(r < 0.01 || Math.abs(r - 90) < 0.01)) return false;
    if (!plan.wallLines?.length) return true;
    // orizzontale o verticale ma su un muro curvo (ai punti cardinali di un cerchio): non c'è un muro rettangolare da forare
    const q = r < 0.01 ? { x0: o.x, x1: o.x + o.w, z0: o.y, z1: o.y + t } : { x0: o.x - t, x1: o.x, z0: o.y, z1: o.y + o.w };
    return plan.walls.some((w) => q.x1 > w.x - 0.02 && q.x0 < w.x + w.w + 0.02 && q.z1 > w.y - 0.02 && q.z0 < w.y + w.h + 0.02);
  };
  const list = allOpenings.filter(axisAligned);
  const oblique = allOpenings.filter((o) => !axisAligned(o));
  const openings = list.map((o) => {
    const gs = glassSpan(o, wallH);
    const extra = { pano: isPanoramic(o), sill: gs.sill, top: gs.top, corner: !!o.corner, vert: !(o.rot === 0 || !o.rot) };
    return o.rot === 0 || !o.rot
      ? { x0: o.x, x1: o.x + o.w, z0: o.y, z1: o.y + t, door: o.door, ...extra }
      : { x0: o.x - t, x1: o.x, z0: o.y, z1: o.y + o.w, door: o.door, ...extra };
  });

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

  const planDims = plan.dimensions || { width: Math.max(0, ...plan.rooms.map((r) => r.x + r.w)), length: Math.max(0, ...plan.rooms.map((r) => r.y + r.h)) };
  // muri: ogni tratto si divide dove ci sono vani; sotto e sopra le finestre resta il muro
  for (const w of plan.walls) {
    const horiz = w.w >= w.h;
    // sotto il soppalco i muri interni arrivano al suo solaio; quelli esterni salgono a tutta altezza
    const mz = plan.mezzanine;
    // esterno = il muro sta sul perimetro (un tramezzo che lo tocca con un'estremità resta interno)
    const ext = horiz ? w.y <= 0.01 || w.y + w.h >= planDims.length - 0.01 : w.x <= 0.01 || w.x + w.w >= planDims.width - 0.01;
    const wh = mz && !ext && !lowWalls && w.x + w.w / 2 >= mz.x - 0.15 && w.x + w.w / 2 <= mz.x + mz.w + 0.15
      && w.y + w.h / 2 >= mz.y - 0.15 && w.y + w.h / 2 <= mz.y + mz.h + 0.15 ? mz.elev - mz.slab : wallH;
    const a0 = horiz ? w.x : w.y;
    const a1 = horiz ? w.x + w.w : w.y + w.h;
    // una finestra d'angolo buca solo il suo muro: al vertice resta il montante dell'altro muro
    const cuts = openings.filter((o) => !(o.corner && o.vert === horiz)).filter((o) => (horiz
      ? o.x1 > w.x + 0.01 && o.x0 < w.x + w.w - 0.01 && o.z1 > w.y - 0.01 && o.z0 < w.y + w.h + 0.01
      : o.z1 > w.y + 0.01 && o.z0 < w.y + w.h - 0.01 && o.x1 > w.x - 0.01 && o.x0 < w.x + w.w + 0.01))
      .map((o) => ({ a: Math.max(a0, horiz ? o.x0 : o.z0), b: Math.min(a1, horiz ? o.x1 : o.z1), door: o.door, pano: o.pano, sill: o.sill, top: o.top }))
      .sort((p, q) => p.a - q.a);
    let cur = a0;
    const seg = (a, b, y0, h, m = null) => (m ? (horiz ? box(a, w.y, b - a, w.h, y0, h, m) : box(w.x, a, w.w, b - a, y0, h, m)) : wallPiece(horiz, w, a, b, y0, h));
    for (const c of cuts) {
      if (c.a > cur) seg(cur, c.a, 0, wh);
      if (c.pano) {
        // vetrata a tutta altezza (fissa o scorrevole): il vetro arriva quasi al pavimento, sopra resta l'architrave
        if (c.sill > 0.001) seg(c.a, c.b, 0, Math.min(c.sill, wh));
        seg(c.a + 0.02, c.b - 0.02, c.sill, Math.min(c.top, wh) - c.sill, M.glass);
        if (wh > c.top) seg(c.a, c.b, c.top, wh - c.top);
      } else if (c.door) {
        if (wh > DOOR_H) seg(c.a, c.b, DOOR_H, wh - DOOR_H);
      } else {
        seg(c.a, c.b, 0, Math.min(SILL, wh));
        if (wh > SILL) seg(c.a + 0.02, c.b - 0.02, SILL, Math.min(DOOR_H, wh) - SILL, M.glass);
        if (wh > DOOR_H) seg(c.a, c.b, DOOR_H, wh - DOOR_H);
      }
      cur = Math.max(cur, c.b);
    }
    if (cur < a1) seg(cur, a1, 0, wh);
  }

  // parapetto di vetro dei balconi: lastre tra i montanti, corrimano in alto
  for (const rl of balconyRailings(plan)) {
    const horiz = rl.y1 === rl.y2;
    const len = horiz ? rl.x2 - rl.x1 : rl.y2 - rl.y1;
    const t = 0.04;
    const at = (a, b, y0, h, m) => (horiz ? box(rl.x1 + a, rl.y1 - t / 2, b - a, t, y0, h, m) : box(rl.x1 - t / 2, rl.y1 + a, t, b - a, y0, h, m));
    const posts = Math.max(1, Math.round(len / 1.4));
    at(0.03, len - 0.03, 0.08, 0.92, M.glass);
    at(0, len, 1.0, 0.05, M.metal);
    at(0, len, 0.0, 0.08, M.metal);
    for (let i = 0; i <= posts; i++) {
      const p0 = Math.min(len - 0.05, Math.max(0, (len * i) / posts - 0.025));
      at(p0, p0 + 0.05, 0.0, 1.05, M.metal);
    }
  }

  // muri curvi e obliqui: polilinee (già interrotte dove c'è un'apertura), un parallelepipedo per tratto, con la faccia esterna dello stile
  for (const wl of plan.wallLines || []) {
    const pts = wl.pts;
    const n = wl.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[(i + 1) % pts.length];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.004) continue;
      const a = Math.atan2(z1 - z0, x1 - x0);
      const nx = -Math.sin(a);
      const nz = Math.cos(a);
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      const off = t / 2 + 0.12;
      const left = inside(mx + nx * off, mz + nz * off);
      const right = inside(mx - nx * off, mz - nz * off);
      const out = right && !left ? 1 : left && !right ? -1 : 0;   // +1: l'esterno è dalla parte della normale sinistra
      const mats = [K.wallIn, K.wallIn, K.wallIn, K.wallIn, K.wallIn, K.wallIn];
      if (out) mats[out > 0 ? 4 : 5] = KF.facade;
      const L = len + Math.min(0.06, t * 0.35);   // un po' più lungo: sulle curve i tratti si sovrappongono senza lasciare fessure
      const g = new THREE.Mesh(new THREE.BoxGeometry(L, wallH, t), mats);
      uvMeters(g.geometry, L, wallH, t);
      g.position.set(mx, wallH / 2, mz);
      g.rotation.y = -a;
      g.castShadow = true;
      g.receiveShadow = true;
      g.userData.layer = 'MURI';
      root.add(g);
    }
  }
  // colore proprio di una porta o finestra (o.color): copie del materiale dello stile, una per colore
  const tinted = new Map();
  const tint = (base, color) => {
    const c = validColor(color);
    if (!c) return base;
    const key = `${base.uuid}${c}`;
    if (!tinted.has(key)) {
      const m = base.clone();
      m.color.set(c);
      m.userData = { ...base.userData, pbrTint: c };
      tinted.set(key, m);
    }
    return tinted.get(key);
  };
  const frameOf = (o) => tint(K.frame, o.color);
  const doorOf = (o) => tint(K.door, o.color);
  // aperture oblique: sopra e sotto il vano il muro continua; finestra con vetro e telaio, porta con stipiti, architrave e anta
  for (const o of oblique) {
    curTag = { openingKind: o.door ? 'door' : 'window', openingIndex: o._i };
    const a = ((o.rot || 0) * Math.PI) / 180;
    const ux = Math.cos(a), uz = Math.sin(a);
    const nx = -uz, nz = ux;
    const piece = (a0, a1, c0, c1, y0, h, m) => {
      if (a1 - a0 < 0.002 || c1 - c0 < 0.002 || h < 0.002) return null;
      const g = new THREE.Mesh(new THREE.BoxGeometry(a1 - a0, h, c1 - c0), m);
      if (m === M.glass) g.userData.layer = 'VETRI';
      else if (Array.isArray(m) || m.map) uvMeters(g.geometry, a1 - a0, h, c1 - c0);
      const am = (a0 + a1) / 2, cm = (c0 + c1) / 2;
      g.position.set(o.x + ux * am + nx * cm, y0 + h / 2, o.y + uz * am + nz * cm);
      g.rotation.y = -a;
      g.castShadow = true;
      g.receiveShadow = true;
      root.add(g);
      return g;
    };
    const lintel = (y0) => { const m = piece(0, o.w, 0, t, y0, wallH - y0, K.wallIn); if (m) m.userData.layer = 'MURI'; };
    const fr = 0.045;
    if (isPanoramic(o)) {
      const g = glassSpan(o, wallH);
      if (wallH > g.top) lintel(g.top);
      piece(0.02, o.w - 0.02, t / 2 - 0.01, t / 2 + 0.01, g.sill, g.top - g.sill, M.glass);
      for (const [p0, p1, y0, h] of [[0, 0.05, g.sill, g.top - g.sill], [o.w - 0.05, o.w, g.sill, g.top - g.sill], [0, o.w, g.top - 0.05, 0.05], [0, o.w, g.sill, 0.06]]) {
        piece(p0, p1, -0.01, t + 0.01, y0, h, frameOf(o));
      }
      continue;
    }
    if (!o.door) {
      const top = Math.min(DOOR_H, wallH);
      if (wallH <= SILL) continue;
      const sill = piece(0, o.w, 0, t, 0, SILL, K.wallIn);
      if (sill) sill.userData.layer = 'MURI';
      if (wallH > top) lintel(top);
      piece(fr, o.w - fr, t / 2 - 0.01, t / 2 + 0.01, SILL, top - SILL, M.glass);
      for (const [p0, p1, y0, h] of [[0, fr, SILL, top - SILL], [o.w - fr, o.w, SILL, top - SILL], [0, o.w, SILL, fr], [0, o.w, top - fr, fr]]) {
        piece(p0, p1, -0.01, t + 0.01, y0, h, frameOf(o));
      }
      const panes = o.w > 2.2 ? 3 : o.w > 1.2 ? 2 : 1;
      for (let k = 1; k < panes; k++) piece((o.w * k) / panes - fr / 2, (o.w * k) / panes + fr / 2, -0.01, t + 0.01, SILL, top - SILL, frameOf(o));
      continue;
    }
    if (wallH <= DOOR_H) continue;
    lintel(DOOR_H);
    piece(0, fr, -0.01, t + 0.01, 0, DOOR_H, frameOf(o));
    piece(o.w - fr, o.w, -0.01, t + 0.01, 0, DOOR_H, frameOf(o));
    piece(0, o.w, -0.01, t + 0.01, DOOR_H - fr, fr, frameOf(o));
    const leaf = new THREE.Group();
    const lw = o.w - 2 * fr;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(lw, DOOR_H - fr - 0.01, 0.04), o.entrance ? frameOf(o) : doorOf(o));
    slab.position.set(lw / 2, (DOOR_H - fr - 0.01) / 2 + 0.005, 0);
    slab.castShadow = true;
    leaf.add(slab);
    leaf.position.set(o.x + ux * fr + nx * (t / 2), 0, o.y + uz * fr + nz * (t / 2));
    leaf.rotation.y = -a - (o.openDir || 1) * ((65 * Math.PI) / 180);
    leaf.traverse((c) => { if (c.isMesh) { c.userData.layer = 'PORTE'; c.receiveShadow = true; } });
    root.add(leaf);
  }
  curTag = null;

  // infissi e porte nei colori dello stile: telaio e traversa centrale, davanzale, anta socchiusa con maniglia
  list.forEach((o, i) => {
    curTag = { openingKind: o.door ? 'door' : 'window', openingIndex: o._i };
    const q = openings[i];
    const horiz = o.rot === 0 || !o.rot;
    const len = o.w;
    const fr = 0.045;
    const th = t + 0.02;                    // il telaio sporge poco da entrambe le facce
    const bar = (aa, bb, y0, h, m) => (horiz ? box(aa, q.z0 - 0.01, bb - aa, th, y0, h, m) : box(q.x0 - 0.01, aa, th, bb - aa, y0, h, m));
    const a0 = horiz ? q.x0 : q.z0;
    const a1 = horiz ? q.x1 : q.z1;
    if (isPanoramic(o)) {
      // vetrata panoramica: telaio sottile, montanti ogni 1,3 m circa; scorrevole: due ante su binari paralleli e maniglia
      const Fm = frameOf(o);
      const pf = 0.05;
      const g = glassSpan(o, wallH);
      const barOff = (aa, bb, y0, h, m, off, thick) => (horiz
        ? box(aa, q.z0 + t / 2 - thick / 2 + off, bb - aa, thick, y0, h, m)
        : box(q.x0 + t / 2 - thick / 2 + off, aa, thick, bb - aa, y0, h, m));
      bar(a0, a0 + pf, g.sill, g.top - g.sill, Fm);
      bar(a1 - pf, a1, g.sill, g.top - g.sill, Fm);
      bar(a0, a1, g.top - pf, pf, Fm);
      bar(a0, a1, g.sill, 0.06, Fm);   // binario in basso
      if (isSliding(o)) {
        const leaf = len * 0.54;
        const lf = 0.04;
        const stiles = (from, to, off) => {
          barOff(from, from + lf, g.sill + 0.06, g.top - g.sill - 0.06 - pf, Fm, off, 0.04);
          barOff(to - lf, to, g.sill + 0.06, g.top - g.sill - 0.06 - pf, Fm, off, 0.04);
          barOff(from, to, g.sill + 0.06, lf, Fm, off, 0.04);
          barOff(from, to, g.top - pf - lf, lf, Fm, off, 0.04);
        };
        stiles(a0 + pf, a0 + pf + leaf, -0.035);
        stiles(a1 - pf - leaf, a1 - pf, 0.035);
        barOff(a0 + pf + leaf - 0.1, a0 + pf + leaf - 0.07, 1.0, 0.18, K.handle, -0.035, 0.03);
      } else {
        const panes = Math.max(1, Math.round(len / 1.3));
        for (let k = 1; k < panes; k++) bar(a0 + (len * k) / panes - 0.02, a0 + (len * k) / panes + 0.02, g.sill, g.top - g.sill, Fm);
      }
      return;
    }
    if (!o.door) {
      const top = Math.min(DOOR_H, wallH);
      if (wallH <= SILL) return;
      const Fm = frameOf(o);
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
      for (let k = 0; k < 5; k++) bar(a0 + 0.02, a1 - 0.02, 0.02 + (k * hh) / 5, hh / 5 - 0.012, doorOf(o));
      return;
    }
    if (wallH <= DOOR_H) return;
    // stipiti e architrave
    bar(a0, a0 + fr, 0, DOOR_H, frameOf(o));
    bar(a1 - fr, a1, 0, DOOR_H, frameOf(o));
    bar(a0, a1, DOOR_H - fr, fr, frameOf(o));
    // anta socchiusa di 65°, incernierata all'inizio del vano
    const leaf = new THREE.Group();
    const lw = len - 2 * fr;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(lw, DOOR_H - fr - 0.01, 0.04), o.entrance ? frameOf(o) : doorOf(o));
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
  curTag = null;

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

  // tappeti: sotto il tavolino, ai piedi del letto e quelli messi a mano, bassi e col colore dello stile
  const rugMat = mat(theme.rug || '#e6ebf2', { roughness: 1 });
  for (const r of rugsFor(plan)) {
    if (r.round) {
      const jute = mat('#d9c7a1', { roughness: 1 });
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r.w / 2, r.w / 2, 0.012, 48), jute);
      disc.position.set(r.x + r.w / 2, 0.01, r.y + r.h / 2);
      disc.receiveShadow = true;
      disc.userData.layer = 'ARREDI';
      root.add(disc);
      continue;
    }
    const m = box(r.x, r.y, r.w, r.h, 0.004, 0.012, rugMat);
    if (m) m.userData.layer = 'ARREDI';
  }

  // tende alle finestre (sempre aperte, raccolte ai lati) e specchi con la luce sopra il lavabo
  const curtainMat = mat(theme.curtain || '#ebe4d6', { roughness: 1 });
  curtainMat.userData.pbr = 'fabric'; curtainMat.userData.pbrTint = theme.curtain || '#ebe4d6';
  rugMat.userData.pbr = 'fabric'; rugMat.userData.pbrTint = theme.rug || '#e6ebf2';
  const mirrorMat = mat('#dbe8f1', { roughness: 0.04, metalness: 0.85 });
  const frameMat = mat('#2b3038', { roughness: 0.6 });
  const mz0 = plan.mezzanine;
  const underMezz = (x, z) => mz0 && x > mz0.x && x < mz0.x + mz0.w && z > mz0.y && z < mz0.y + mz0.h;
  /* rettangolo a filo del muro: `a0..a1` lungo il muro (da d.x, d.y verso ux, uy), `o0..o1` verso l'interno */
  const onWall = (d, a0, a1, o0, o1, y0, h, m) => {
    const pts = [[d.x + d.ux * a0 + d.nx * o0, d.y + d.uy * a0 + d.ny * o0], [d.x + d.ux * a1 + d.nx * o1, d.y + d.uy * a1 + d.ny * o1]];
    const x = Math.min(pts[0][0], pts[1][0]);
    const z = Math.min(pts[0][1], pts[1][1]);
    const mesh = box(x, z, Math.abs(pts[1][0] - pts[0][0]), Math.abs(pts[1][1] - pts[0][1]), y0, h, m);
    if (mesh) mesh.userData.layer = 'ARREDI';
    return mesh;
  };
  for (const d of decorFor(plan)) {
    if (d.kind === 'curtain') {
      const top = Math.min(2.5, (underMezz(d.x, d.y) ? mz0.elev - mz0.slab : wallH) - 0.12);
      onWall(d, 0, d.len, 0.02, 0.04, top, 0.025, M.metal);   // bastone
      const n = Math.max(3, Math.round(d.len / 0.07));
      for (let i = 0; i < n; i++) {
        const fold = i % 2 ? 0.075 : 0.035;
        onWall(d, (d.len * i) / n, (d.len * (i + 1)) / n, 0.03, 0.03 + fold, 0.03, top - 0.05, curtainMat);
      }
    } else if (d.kind === 'mirror') {
      const e = d.elev || 0;
      const half = d.len / 2;
      onWall(d, -half - 0.025, half + 0.025, 0.004, 0.024, e + 0.92, 0.86, frameMat);
      onWall(d, -half, half, 0.024, 0.03, e + 0.945, 0.81, mirrorMat);
      const bar = onWall(d, -half, half, 0.004, 0.07, e + 1.8, 0.05, M.lamp);   // luce sopra lo specchio
      if (bar) bar.userData.layer = 'LUCI';
    }
  }

  // sedie attorno ai tavoli (come nel disegno in pianta): seduta, gambe e schienale sul lato esterno
  const chair = (cx, cz, side, chairMat) => {
    const cl = 0.42;
    const cd = 0.4;
    const x0 = cx - (side === 'W' || side === 'E' ? cd : cl) / 2;
    const z0 = cz - (side === 'W' || side === 'E' ? cl : cd) / 2;
    const w = side === 'W' || side === 'E' ? cd : cl;
    const d = side === 'W' || side === 'E' ? cl : cd;
    box(x0, z0, w, d, 0.43, 0.04, chairMat);
    for (const [lx, lz] of [[x0, z0], [x0 + w - 0.035, z0], [x0, z0 + d - 0.035], [x0 + w - 0.035, z0 + d - 0.035]]) box(lx, lz, 0.035, 0.035, 0, 0.43, chairMat);
    const b = 0.04;
    if (side === 'N') box(x0, z0, w, b, 0.47, 0.42, chairMat);
    else if (side === 'S') box(x0, z0 + d - b, w, b, 0.47, 0.42, chairMat);
    else if (side === 'W') box(x0, z0, b, d, 0.47, 0.42, chairMat);
    else box(x0 + w - b, z0, b, d, 0.47, 0.42, chairMat);
  };
  const chairsAround = (it) => {
    const chairMat = mat(theme.chair || '#eadfca');
    const spots = [];   // [centro x, centro z, lato su cui sta lo schienale]
    if (it.type === 'table_round') {
      const rr = it.w / 2 + 0.24;
      for (const [dx, dz, sd] of [[0, -rr, 'N'], [rr, 0, 'E'], [0, rr, 'S'], [-rr, 0, 'W']]) spots.push([it.x + it.w / 2 + dx, it.y + it.h / 2 + dz, sd]);
    } else {
      const horiz = it.w >= it.h;
      const long = Math.max(it.w, it.h);
      const n = Math.max(1, Math.min(8, Math.floor(long / 0.55)));
      for (let i = 0; i < n; i++) {
        const p = (long * (i + 0.5)) / n;
        if (horiz) spots.push([it.x + p, it.y - 0.24, 'N'], [it.x + p, it.y + it.h + 0.24, 'S']);
        else spots.push([it.x - 0.24, it.y + p, 'W'], [it.x + it.w + 0.24, it.y + p, 'E']);
      }
      if (long > 2.4) {
        if (horiz) spots.push([it.x - 0.24, it.y + it.h / 2, 'W'], [it.x + it.w + 0.24, it.y + it.h / 2, 'E']);
        else spots.push([it.x + it.w / 2, it.y - 0.24, 'N'], [it.x + it.w / 2, it.y + it.h + 0.24, 'S']);
      }
    }
    for (const [x, z, sd] of spots) chair(x, z, sd, chairMat);
  };

  // arredi
  // arredi del soppalco (it.elev): stessi volumi, alzati alla quota del suo pavimento
  const raise = (it, from) => {
    if (it.elev) {
      for (let i = from; i < root.children.length; i++) {
        root.children[i].position.y += it.elev;
        root.children[i].userData.mezz = true;   // il livello «Sotto» del loft li nasconde
      }
    }
  };
  for (const [fi, it] of plan.furniture.entries()) {
    curTag = { itemIndex: fi };
    if (it.type === 'rug') continue;   // il tappeto è già disegnato sopra
    if (it.type === 'table' || it.type === 'table_round') chairsAround(it);
    const from = root.children.length;
    // gli arredi con un modello (letto, auto, sanitari…) sono oggetti veri: gruppi di pezzi, un blocco nel DXF
    const obj = it.color ? buildObject(THREE, it, tintMaterials(M, it.type, it.color), mat, { ...theme, ...tintTheme(theme, it.type, it.color) }) : buildObject(THREE, it, M, mat, theme);
    if (obj) {
      obj.name = obj.name || `ARREDO_${it.type.toUpperCase()}`;
      root.add(obj);
      raise(it, from);
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
    raise(it, from);
  }
  curTag = null;
  // layer di ogni volume (per il DXF 3D): muri, vetri, pavimenti, il resto sono arredi
  root.traverse((o) => {
    if (!o.isMesh || o.userData.layer) return;
    o.userData.layer = o.material === M.wall ? 'MURI' : o.material === M.glass ? 'VETRI' : 'ARREDI';
  });
  // scale: i gradini salgono al piano di sopra (altezza = solaio compreso)
  const mz = plan.mezzanine;
  const flights = [...(stairs ?? (plan.stairs || []).filter((st) => st.entry)),
    ...(mz ? [{ ...mz.stair, id: 'mezzanine', type: 'straight' }] : [])];
  if (mz) {
    const mzFrom = root.children.length;
    buildMezzanine(THREE, root, mz, M, K, theme, box, { ...planDims, half: t / 2 });
    for (let i = mzFrom; i < root.children.length; i++) root.children[i].userData.mezz = true;
  }
  const stepMat = new THREE.MeshStandardMaterial({ color: theme.wood || '#cdb89a', roughness: 0.7 });
  for (const st of flights) {
    for (const b of stairSteps(st, st.id === 'mezzanine' ? mz.elev : WALL_H + SLAB_T)) {
      // i gradini bassi poggiano a terra; sopra 1 m la rampa è sospesa (gradino con spessore, aperta sotto), così chi sale dal
      // piano sotto passa sotto la rampa del piano di sopra e non dentro un blocco pieno
      const th = b.top > 1.0 ? 0.2 : b.top;
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, th, b.z1 - b.z0), stepMat);
      m.position.set((b.x0 + b.x1) / 2, b.top - th / 2, (b.z0 + b.z1) / 2);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.layer = 'SCALE';
      root.add(m);
    }
  }
  // casa in legno: pilastri, travi a vista e portico (nella casa intera li mette buildHouse, una volta sola)
  if (timber && theme.materials?.structure === 'wood') {
    root.add(buildTimber(THREE, [{ plan, y: 0 }], { roofColor: kit.roof.color, beams: false, porch: theme.materials.porch !== false }));
  }
  return root;
}

/* Soppalco del loft: solaio, parapetto (vetro e corrimano) sui lati aperti con il varco della scala. */
function buildMezzanine(THREE, root, mz, M, K, theme, box, dims) {
  const e = mz.elev;
  // solaio e parapetto finiscono a metà dello spessore dei muri esterni: a filo della facciata si vedrebbero come righe sul muro (z-fighting)
  const hf = dims.half ?? 0.1;
  const ins = { x0: mz.x <= 0.01 ? hf : 0, x1: mz.x + mz.w >= dims.width - 0.01 ? hf : 0, y0: mz.y <= 0.01 ? hf : 0, y1: mz.y + mz.h >= dims.length - 0.01 ? hf : 0 };
  const slab = box(mz.x + ins.x0, mz.y + ins.y0, mz.w - ins.x0 - ins.x1, mz.h - ins.y0 - ins.y1, e - mz.slab, mz.slab, M.wood);
  if (slab) slab.userData.layer = 'SOLAI';
  const gap = { x0: mz.stair.x, x1: mz.stair.x + mz.stair.w, y0: mz.stair.y, y1: mz.stair.y + mz.stair.h };
  const rail = (x, z, w, d) => {
    for (const m of [box(x, z, w, d, e, mz.parapet, M.glass), box(x, z, w, d, e + mz.parapet - 0.04, 0.04, K.rail)]) if (m) m.userData.layer = 'RINGHIERE';
  };
  const thick = 0.03;
  buildStairRail(THREE, root, mz, M, K, dims);
  // bagnetto chiuso sul soppalco: tramezzi alti 2,20 m con il varco della porta e l'architrave
  if (mz.bath) {
    for (const q of mz.bath.walls) {
      const m = box(q.x, q.y, q.w, q.h, e, 2.2, M.wall);
      if (m) m.userData.layer = 'MURI';
    }
    const d = mz.bath.door;
    const lin = box(d.x, d.y, d.w, d.h, e + 2.0, 0.2, M.wall);
    if (lin) lin.userData.layer = 'MURI';
    // porta scorrevole esterna: anta davanti al varco e binario sopra, che corre oltre il varco
    const sd = slideDoor(mz);
    if (sd) {
      const leaf = box(sd.closed.x, sd.closed.y, sd.closed.w, sd.closed.h, e + 0.04, 2.0, M.cabinet);
      const rail = box(sd.rail.x, sd.rail.y, sd.rail.w, sd.rail.h, e + 2.04, 0.04, M.metal);
      for (const m of [leaf, rail]) if (m) m.userData.layer = 'PORTE';
    }
  }
  for (const side of mz.open) {
    const vertical = side === 'W' || side === 'E';
    const at = side === 'W' ? mz.x : side === 'E' ? mz.x + mz.w : side === 'N' ? mz.y : mz.y + mz.h;
    const a = vertical ? mz.y + ins.y0 : mz.x + ins.x0;
    const b = vertical ? mz.y + mz.h - ins.y1 : mz.x + mz.w - ins.x1;
    // il varco: dove la rampa arriva su questo lato
    const g0 = vertical ? gap.y0 : gap.x0;
    const g1 = vertical ? gap.y1 : gap.x1;
    const touches = vertical ? (gap.x0 <= at + 0.05 && gap.x1 >= at - 0.05) : (gap.y0 <= at + 0.05 && gap.y1 >= at - 0.05);
    const spans = touches ? [[a, Math.min(g0, b)], [Math.max(g1, a), b]] : [[a, b]];
    for (const [p0, p1] of spans) {
      if (p1 - p0 < 0.05) continue;
      if (vertical) rail(at - thick / 2, p0, thick, p1 - p0);
      else rail(p0, at - thick / 2, p1 - p0, thick);
    }
  }
}

/* Ringhiera della scala del soppalco: vetro e corrimano inclinati come la rampa, sui lati lunghi che non stanno contro un muro. */
function buildStairRail(THREE, root, mz, M, K, dims) {
  const st = mz.stair;
  const alongX = st.up === 'E' || st.up === 'W';
  const len = alongX ? st.w : st.h;
  const sign = st.up === 'E' || st.up === 'S' ? 1 : -1;
  const ang = Math.atan2(mz.elev, len) * sign;
  const run = Math.hypot(len, mz.elev);
  const wall = 0.25;   // spessore del muro esterno + gioco: oltre questo il lato è contro la parete
  const sides = alongX
    ? [[st.y, st.y <= wall], [st.y + st.h, st.y + st.h >= dims.length - wall]]
    : [[st.x, st.x <= wall], [st.x + st.w, st.x + st.w >= dims.width - wall]];
  const cx = st.x + st.w / 2;
  const cz = st.y + st.h / 2;
  for (const [at, wallSide] of sides) {
    if (wallSide) continue;
    for (const [m, h, lift] of [[M.glass, mz.parapet, mz.parapet / 2], [K.rail, 0.04, mz.parapet - 0.02]]) {
      const geo = alongX ? new THREE.BoxGeometry(run, h, 0.03) : new THREE.BoxGeometry(0.03, h, run);
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(alongX ? cx : at, mz.elev / 2 + lift, alongX ? at : cz);
      if (alongX) mesh.rotation.z = ang;
      else mesh.rotation.x = -ang;
      mesh.castShadow = true;
      mesh.userData.layer = 'RINGHIERE';
      root.add(mesh);
    }
  }
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

export function buildHouse(THREE, project, themeFor, { lowWalls = false, spread = 0, ceiling = false } = {}) {
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
    const g = buildScene(THREE, f.plan, themeFor(f), { lowWalls, stairs: up, openings: voids, facade: facadeId, timber: false });
    const y = quota(f.level);
    g.position.y = y;
    g.userData.floor = { id: f.id, name: f.name, level: f.level };
    g.name = `PIANO_${String(f.name || f.level).toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
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
  // casa in legno: pilastri d'angolo, travi a vista e portico, una volta per tutta la casa
  const homeTheme = themeFor(floors.find((f) => f.level === 0) || floors[0]);
  if (homeTheme.materials?.structure === 'wood') {
    house.add(buildTimber(THREE, floors.map((f) => ({ plan: f.plan, y: quota(f.level) })), { roofColor: styleKit(homeTheme.id, homeTheme.palette, homeTheme.materials).roof.color, beams: ceiling, porch: homeTheme.materials.porch !== false }));
  }
  // soffitto del piano più alto (render): senza, da dentro si vedrebbe il tetto da sotto o il cielo; i piani sotto hanno già il solaio sopra
  if (ceiling) {
    const top = floors[floors.length - 1];
    const ceilMat = new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.95 });
    ceilMat.userData.pbr = 'stucco';
    ceilMat.userData.pbrTint = '#f4f2ee';
    const yTop = quota(top.level) + (top.plan.height || WALL_H);
    for (const r of top.plan.rooms) {
      if (r.kind === 'garden' || r.kind === 'balcony') continue;
      const pts = r.poly || [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
      const c = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)))), ceilMat);
      c.rotation.x = Math.PI / 2;   // la faccia guarda in basso
      c.position.y = yTop;
      c.receiveShadow = true;
      c.castShadow = true;
      c.userData.layer = 'SOFFITTI';
      house.add(c);
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
  // portoncino su un fianco della casa: il camminamento prosegue lungo il fianco fino alla porta
  const fd = facade.door;
  if (fd && (fd.side === 'left' || fd.side === 'right')) {
    const len = fd.d + 0.7;
    const x0 = fd.side === 'left' ? hx - 1.3 : hx + facade.w + 0.1;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, len), new THREE.MeshStandardMaterial({ color: '#c9c4b8', roughness: 0.9 }));
    strip.position.set(x0 + 0.6, 0.02, -len / 2);
    strip.receiveShadow = true;
    strip.userData.layer = 'PAVIMENTI';
    g.add(strip);
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
  ground.userData.layer = 'TERRENO';
  scene.add(ground);
  return { bb, center, size, ground };
}

/*
 * Tetto di un piano, alla quota `y` (la sommità dei muri). Gruppo «tetto»: userData.layer = 'TETTO', si accende e si
 * spegne con `visible`. type = 'gable' (due falde, un'ala per ogni parte rettangolare dell'edificio) | 'flat'.
 */
export function buildRoof(THREE, plan, y, opts = {}) {
  const { type, slope, overhang, style, palette = null, materials = null } = { ...ROOF_DEFAULTS, ...opts };
  const g = new THREE.Group();
  g.name = 'tetto';
  g.position.y = y;
  const kit = styleKit(style, palette, materials);
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
    if (materials?.structure === 'wood') g.add(rafterTails(THREE, [w], { slope, overhang }));
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
  return { floor: top, y: top.level * FLOOR_H + (top.plan.height || WALL_H) };
}
