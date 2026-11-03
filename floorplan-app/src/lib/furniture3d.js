/*
 * Arredi 3D come oggetti veri: ogni arredo è un gruppo di pezzi (letto con testiera, materasso e cuscini; auto con
 * ruote, abitacolo e fari; sanitari con tazza, sedile e cassetta…) con nome e misure in userData.furniture.
 * Il gruppo è costruito in un riferimento locale uguale per tutti: origine al centro dell'ingombro sul pavimento,
 * larghezza lungo x, profondità lungo z, davanti verso +z (la parte che guarda verso `facing`), schienale e muro
 * verso -z. La stessa geometria diventa un blocco nel DXF 3D (lib/dxf3d.js): un oggetto per tipo e misura, inserito
 * più volte, invece di migliaia di facce sparse.
 */

export const OBJECT_NAMES = {
  bed: 'LETTO', wardrobe: 'ARMADIO', dresser: 'CASSETTIERA', shelving: 'SCAFFALE', shelving_heavy: 'SCAFFALE_PESANTE',
  bookcase: 'LIBRERIA', car: 'AUTO', motorbike: 'MOTO', toilet: 'WC', bidet: 'BIDET', sink: 'LAVABO', shower: 'DOCCIA',
  shower_round: 'DOCCIA_ANGOLARE', shower_walkin: 'DOCCIA_WALKIN', bathtub: 'VASCA', office_chair: 'SEDIA_UFFICIO',
  tv: 'TV', sofa: 'DIVANO', sofa_corner: 'DIVANO_ANGOLARE', armchair: 'POLTRONA', sideboard: 'MADIA', plant: 'PIANTA', tree: 'ALBERO',
  hedge: 'SIEPE', fence: 'RECINZIONE', path: 'PASSO_PEDONALE', gate_pedestrian: 'CANCELLO_PEDONALE', gate_driveway: 'CANCELLO_CARRAIO',
  washer: 'LAVATRICE', dryer: 'ASCIUGATRICE', vacuum: 'ASPIRAPOLVERE',
  nightstand: 'COMODINO', desk: 'SCRIVANIA', table: 'TAVOLO', table_round: 'TAVOLO_TONDO', coffee_table: 'TAVOLINO',
  kitchen_counter: 'CUCINA', kitchen_peninsula: 'PENISOLA', shoe_cabinet: 'SCARPIERA', console: 'CONSOLE', floor_lamp: 'LAMPADA',
  bath_column: 'COLONNA_BAGNO', towel_radiator: 'SCALDASALVIETTE', utility_sink: 'LAVATOIO', minibar: 'MINIBAR',
  workbench: 'BANCO_LAVORO', laundry_basket: 'CESTO', gazebo: 'GAZEBO',
  wardrobe_corner: 'ARMADIO_ANGOLO', wardrobe_open: 'ARMADIO_APERTO', sofa_round: 'DIVANO_TONDO', sofa_curved: 'DIVANO_ARCO',
  chair_design: 'SEDIA_DESIGN', chair_outdoor: 'SEDIA_ESTERNO', armchair_rattan: 'POLTRONA_RATTAN', table_rattan: 'TAVOLINO_RATTAN',
};

/* Categoria di materiale dal nome con cui l'oggetto lo chiama: diventa il layer del pezzo nel blocco DXF. */
export function materialCategory(key) {
  if (/glass|porthole|bottle/.test(key)) return 'VETRO';
  if (/chrome|iron|rim|metal|steel|burner|radiator|ring|^deep$/.test(key)) return 'METALLO';
  if (/tire/.test(key)) return 'GOMMA';
  if (/head|tail|lamp/.test(key)) return 'LUCE';
  if (/white|pillow|chairfab|cloth|towel|^tub$/.test(key)) return 'TESSUTO';
  if (/gravel|stone/.test(key)) return 'PIETRA';
  if (/leaf|soil/.test(key)) return 'VEGETAZIONE';
  if (/bark|wicker|peg|gazroof|legs$/.test(key)) return 'LEGNO';
  if (/basin|pot|appliance|applitop|niche|splash|sinkbowl|water|drain|paint|vacbody/.test(key)) return 'CERAMICA';
  return 'PLASTICA';
}

import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/* parallelepipedo con spigoli smussati; le geometrie uguali si riusano (un arredo ne ha decine di identiche) */
const boxCache = new Map();
export function roundedBox(w, h, d, r) {
  const key = [w, h, d, r].map((v) => v.toFixed(4)).join('|');
  if (!boxCache.has(key)) boxCache.set(key, new RoundedBoxGeometry(w, h, d, 2, r));
  return boxCache.get(key);
}

/* Numeri pseudo-casuali ripetibili (stesso seme, stessa sequenza): ogni letto ha le sue piccole variazioni, sempre le stesse. */
export function seeded(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}

/*
 * Cuscino morbido: un parallelepipedo con spigoli molto arrotondati, schiacciato verso i bordi (al centro è pieno, ai lati sottile)
 * e con gli angoli pizzicati come un cuscino vero. `pinch` 0 = quasi un blocco, 0.6 = cuscino da letto.
 */
const pillowCache = new Map();
export function pillowGeometry(w, h, d, pinch = 0.5) {
  const key = [w, h, d, pinch].map((v) => v.toFixed(3)).join('|');
  if (!pillowCache.has(key)) {
    const geo = new RoundedBoxGeometry(w, h, d, 5, Math.min(h * 0.49, w * 0.3, d * 0.3));
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const nx = pos.getX(i) / (w / 2);
      const nz = pos.getZ(i) / (d / 2);
      const edge = Math.max(Math.abs(nx), Math.abs(nz));
      const corner = Math.abs(nx * nz);
      pos.setY(i, pos.getY(i) * (1 - pinch * (0.8 * edge * edge + 0.5 * corner)));
    }
    pillowCache.set(key, geo);
  }
  return pillowCache.get(key);
}

/*
 * Coperta appoggiata sul letto: una striscia larga `width` che segue il piumone per `len` metri e poi cade per `drop` metri sul bordo,
 * con pieghe morbide e lato un po' ondulato. Il suo sistema: x = larghezza, y = su, z = lungo il letto (0 = inizio, verso i piedi).
 */
export function drapedThrow(THREE, width, len, drop, phase = 0) {
  const nx = 22;
  const ny = 40;
  const R = 0.05;   // raccordo sul bordo
  const total = len + drop;
  const pos = [];
  const idx = [];
  for (let j = 0; j <= ny; j++) {
    const s = (total * j) / ny;
    let z = s;
    let y = 0;
    if (s > len) {
      const t = s - len;
      if (t < (R * Math.PI) / 2) { z = len + R * Math.sin(t / R); y = -R * (1 - Math.cos(t / R)); } else { z = len + R; y = -R - (t - (R * Math.PI) / 2); }
    }
    for (let i = 0; i <= nx; i++) {
      const u0 = i / nx - 0.5;
      const edge = 1 - Math.pow(Math.abs(u0) * 2, 4);
      const u = u0 * width * (1 + 0.025 * Math.sin(s * 9 + phase));
      const fold = 0.009 * Math.sin(u * 26 + s * 5 + phase) * (0.4 + 0.6 * edge) + 0.004 * Math.sin(s * 15 + u * 7 + phase * 2);
      pos.push(u, y + fold + 0.004 * edge, z);
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const YAW = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };
const r2 = (v) => Math.round(v * 100) / 100;

/* Nome del blocco per tipo e misure: LETTO_160X200. */
export const objectKey = (type, w, d, style = '') => `${OBJECT_NAMES[type] || type.toUpperCase()}_${Math.round(w * 100)}X${Math.round(d * 100)}${style ? `_${style.toUpperCase()}` : ''}`;

/* Ingombro nel riferimento locale: larghezza e profondità, scambiate quando l'arredo guarda a est o a ovest. */
export function localSize(it) {
  const f = it.facing || 'S';
  return f === 'E' || f === 'W' ? [it.h, it.w] : [it.w, it.h];
}

export const hasObject = (type) => type in OBJECT_NAMES;

/*
 * Costruisce l'arredo `it` come gruppo posizionato e ruotato nella pianta. `M` = materiali della scena, `mat(color,
 * extra)` ne crea di nuovi. Ritorna null per i tipi senza modello (si disegnano come volumi).
 */
export function buildObject(THREE, it, M, mat, theme = {}) {
  if (!hasObject(it.type)) return null;
  const [W, D] = localSize(it);
  const g = new THREE.Group();
  g.name = OBJECT_NAMES[it.type];
  g.userData.furniture = { type: it.type, w: r2(W), d: r2(D), style: theme.id || '', key: objectKey(it.type, W, D, theme.id || '') };
  const own = {};   // materiali propri dell'oggetto, creati una volta sola
  /* materiale proprio con la categoria per i layer del DXF (legno, tessuto, metallo, vetro…) dedotta dal nome */
  const m = (key, color, extra) => {
    if (!own[key]) {
      own[key] = mat(color, extra);
      own[key].userData.cat = materialCategory(key);
    }
    return own[key];
  };

  const place = (mesh, x, y, z) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  /* scatola con la base a quota y */
  const SOFT = new Set([M.fabric, M.duvet]);
  const bx = (w, h, d, x, y, z, mt, radius) => {
    // tessuti e imbottiti: spigoli molto smussati (cuscini, materassi, divani non sono mai spigolosi); legno, laccato e il resto: un
    // piccolo smusso che prende la luce, così i bordi non sembrano tagliati con l'accetta. Le lastre sottili restano nette.
    const soft = SOFT.has(mt) || mt?.userData?.cat === 'TESSUTO';
    const small = Math.min(w, h, d);
    const r = radius ?? (soft ? Math.min(0.04, small * 0.4) : small >= 0.02 ? Math.min(0.011, small * 0.3) : 0);
    return place(new THREE.Mesh(r > 0.004 ? roundedBox(w, h, d, r) : new THREE.BoxGeometry(w, h, d), mt), x, y + h / 2, z);
  };
  /* cuscino morbido con la base a quota y (vedi pillowGeometry); rot = rotazione attorno a y, tilt = inclinazione in avanti */
  const soft = (w, h, d, x, y, z, mt, { pinch = 0.5, rot = 0, tilt = 0 } = {}) => {
    const mesh = place(new THREE.Mesh(pillowGeometry(w, h, d, pinch), mt), x, y + h / 2, z);
    mesh.rotation.set(tilt, rot, 0, 'YXZ');
    return mesh;
  };
  /* cilindro verticale con la base a quota y */
  const cy = (rt, rb, h, x, y, z, mt, seg = 24) => place(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mt), x, y + h / 2, z);
  /* cilindro con l'asse lungo x (ruote) */
  const wheel = (r, w, x, y, z, mt) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 24), mt);
    mesh.rotation.z = Math.PI / 2;
    return place(mesh, x, y, z);
  };
  /* sfera schiacciata */
  const ball = (r, x, y, z, mt, sx = 1, sy = 1, sz = 1) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mt);
    mesh.scale.set(sx, sy, sz);
    return place(mesh, x, y, z);
  };
  const wood = M.wood;
  const white = m('white', '#f4f1ec');
  const darkLine = m('line', '#262a31');
  const chrome = m('chrome', '#c4cad3', { metalness: 0.7, roughness: 0.25 });
  const ceramic = M.ceramic;
  const glass = m('glass', '#cfe8f5', { transparent: true, opacity: 0.28, roughness: 0.05 });

  // grammatica dello stile (lib/themes.js): gambe, braccioli, capitonné, mobili bassi, maniglie
  const style = { legs: theme.legs || 'wood', arm: theme.arm || 'square', tuft: !!theme.tuft, low: !!theme.low, id: theme.id || 'modern' };
  const metalMat = m('stylemetal', theme.metal || '#5b6472', { metalness: 0.7, roughness: 0.3 });
  const leg = (x, z, h, w = 0.05, mt = wood) => {
    if (style.legs === 'metal') {
      cy(0.011, 0.011, h, x, 0, z, metalMat, 10);
      cy(0.02, 0.02, 0.006, x, 0, z, darkLine, 12);
    } else if (style.legs === 'turned') {
      cy(0.024, 0.016, h * 0.35, x, 0, z, mt, 12);
      ball(0.034, x, h * 0.5, z, mt);
      cy(0.02, 0.026, h * 0.35, x, h * 0.65, z, mt, 12);
    } else {
      cy(w / 2, w / 3, h, x, 0, z, mt, 8);
    }
  };
  /* maniglia sulla faccia verso +z a quota y: pomello (classico), presa incassata (japandi), pomello in legno (nordico) o barra */
  const pull = (x, y, zf, vertical = false) => {
    if (style.id === 'classic') ball(0.017, x, y, zf + 0.012, metalMat);
    else if (style.id === 'nordic') cy(0.014, 0.014, 0.025, x, y, zf + 0.012, wood, 12).rotation.x = Math.PI / 2;
    else if (style.id === 'japandi') bx(vertical ? 0.01 : 0.12, vertical ? 0.12 : 0.01, 0.004, x, y - 0.005, zf + 0.002, darkLine);
    else bx(vertical ? 0.012 : 0.14, vertical ? 0.14 : 0.012, 0.02, x, y - 0.006, zf + 0.012, metalMat);
  };

  switch (it.type) {
    case 'bed': {
      // base (su pedana nel japandi), materasso, piumone, cuscini e testiera dello stile
      const low = style.low;
      const baseTop = low ? 0.3 : 0.34;
      if (low) bx(W + 0.12, 0.06, D + 0.06, 0, 0, 0, wood);
      else for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) leg(sx * (W / 2 - 0.06), sz * (D / 2 - 0.06), 0.12, 0.07);
      bx(W, low ? 0.2 : 0.22, D - 0.04, 0, low ? 0.06 : 0.12, 0.02, wood);
      bx(W - 0.06, 0.2, D - 0.12, 0, baseTop, 0.02, white);
      const len = (D - 0.12) * 0.64;
      const rnd = seeded(`${it.x}|${it.y}|${W}|${D}`);   // piccole variazioni, diverse per ogni letto e sempre le stesse
      const jit = (a) => (rnd() - 0.5) * 2 * a;
      // piumone: lastra morbida con gli angoli smussati, e il lembo che scende davanti
      soft(W + 0.02, 0.1, len, 0, baseTop + 0.145, D / 2 - 0.06 - len / 2, M.duvet, { pinch: 0.18 });
      bx(W + 0.02, 0.22, 0.05, 0, baseTop - 0.05, D / 2 - 0.08, M.duvet);   // lembo davanti
      const pillows = W > 1.7 ? 3 : W > 1.2 ? 2 : 1;
      for (let i = 0; i < pillows; i++) {
        const x = pillows === 1 ? 0 : (i - (pillows - 1) / 2) * ((W - 0.1) / pillows);
        soft(Math.min(0.58, (W - 0.1) / pillows - 0.04), 0.17, 0.4, x + jit(0.02), baseTop + 0.2, -D / 2 + 0.3 + jit(0.02), white, { pinch: 0.62, rot: jit(0.1), tilt: 0.2 + jit(0.05) });
      }
      // cuscini davanti (verde e sabbia, appoggiati, un po' storti) e coperta verde drappeggiata con le frange ai piedi
      const olive = m('olive', '#7d8050', { roughness: 0.95 });
      const sand = m('sand', '#e8dcc3', { roughness: 0.95 });
      const front = [[-0.22, olive, 0.18], [0.2, sand, -0.15]];
      for (const [fx, mt, rot] of front) {
        soft(Math.min(0.44, W * 0.3), 0.13, 0.3, fx * Math.min(W, 1.8) * 0.9 + jit(0.03), baseTop + 0.235, -D / 2 + 0.6 + jit(0.03), mt, { pinch: 0.6, rot: rot + jit(0.12), tilt: 0.28 + jit(0.06) });
      }
      const tw = Math.min(0.4, W * 0.24);
      const tz0 = -D / 2 + 0.78;
      const throwLen = D / 2 - 0.06 - tz0;
      const drop = 0.34;
      const olive2 = m('throw', '#7d8050', { roughness: 1, side: THREE.DoubleSide });
      const cloth = place(new THREE.Mesh(drapedThrow(THREE, tw, throwLen, drop, jit(3)), olive2), jit(0.04), baseTop + 0.252, tz0);
      cloth.rotation.y = jit(0.05);
      for (let k = 0; k < 9; k++) {   // frange sul bordo basso della coperta
        const fh = 0.05 + rnd() * 0.025;
        bx(0.012, fh, 0.008, -tw / 2 + (tw * (k + 0.5)) / 9 + jit(0.004), baseTop + 0.252 - drop - 0.05 - fh + 0.04, tz0 + throwLen + 0.05 + 0.012, olive);
      }
      const hz = -D / 2;
      if (style.tuft) {
        // testiera imbottita e capitonné con bottoni
        const hh = style.id === 'luxury' ? 1.35 : 1.15;
        bx(W + 0.06, hh, 0.1, 0, 0.1, hz + 0.05, M.fabric);
        bx(W + 0.1, 0.06, 0.13, 0, 0.1 + hh, hz + 0.055, wood);
        const cols = Math.max(3, Math.round(W / 0.22));
        for (let r = 0; r < 4; r++) for (let c = 0; c < cols; c++) ball(0.014, -W / 2 + 0.08 + (c + (r % 2 ? 0.5 : 0)) * ((W - 0.16) / cols), 0.5 + r * 0.17, hz + 0.105, metalMat);
      } else if (style.legs === 'metal') {
        // testiera in tubo di ferro: due montanti, traversa e barre
        for (const sx of [-1, 1]) cy(0.018, 0.018, 1.05, sx * (W / 2 - 0.02), 0, hz + 0.03, metalMat, 12);
        bx(W, 0.03, 0.03, 0, 1.0, hz + 0.03, metalMat);
        const bars = Math.max(6, Math.round(W / 0.12));
        for (let i = 0; i < bars; i++) bx(0.012, 0.6, 0.012, -W / 2 + (W * (i + 0.5)) / bars, 0.4, hz + 0.03, metalMat);
      } else if (style.id === 'nordic') {
        const slats = Math.max(5, Math.round(W / 0.14));
        bx(W + 0.04, 0.05, 0.05, 0, 0.12, hz + 0.03, wood);
        for (let i = 0; i < slats; i++) bx(0.07, 0.8, 0.03, -W / 2 + (W * (i + 0.5)) / slats, 0.17, hz + 0.03, wood);
      } else {
        bx(W, low ? 0.55 : 0.95, 0.07, 0, low ? 0.06 : 0.1, hz + 0.035, wood, 0.03);
        bx(W + 0.06, 0.05, 0.1, 0, low ? 0.61 : 1.05, hz + 0.05, wood, 0.022);
      }
      break;
    }
    case 'wardrobe_corner': {
      // armadio a L: due bracci profondi come l'armadio, braccio laterale a sinistra (a destra se specchiato), fessure delle ante sui fronti
      const H = 2.2;
      const d = Math.min(0.6, Math.min(W, D) * 0.45);
      const sx = it.flip ? 1 : -1;                          // lato del braccio laterale
      const back = (z) => -D / 2 + z;
      bx(W, 0.06, d - 0.04, 0, 0, back(d / 2), darkLine);
      bx(W, H - 0.11, d, 0, 0.06, back(d / 2), M.cabinet);
      bx(d, 0.06, D - d, sx * (W / 2 - d / 2), 0, back(d + (D - d) / 2), darkLine);
      bx(d, H - 0.11, D - d, sx * (W / 2 - d / 2), 0.06, back(d + (D - d) / 2), M.cabinet);
      bx(W + 0.02, 0.05, d + 0.02, 0, H - 0.05, back(d / 2), M.cabinet);
      bx(d + 0.02, 0.05, D - d, sx * (W / 2 - d / 2), H - 0.05, back(d + (D - d) / 2), M.cabinet);
      const nTop = Math.max(2, Math.round((W - d) / 0.6));
      const x0 = sx < 0 ? -W / 2 + d : -W / 2;
      for (let i = 1; i < nTop; i++) bx(0.008, H - 0.16, 0.012, x0 + ((W - d) * i) / nTop, 0.08, back(d) + 0.004, darkLine);
      const nSide = Math.max(1, Math.round((D - d) / 0.6));
      for (let i = 1; i < nSide; i++) bx(0.012, H - 0.16, 0.008, sx * (W / 2 - d) - sx * 0.004, 0.08, back(d) + ((D - d) * i) / nSide, darkLine);
      for (const [px, pz, vertical] of [[x0 + (W - d) / 2 - 0.035, back(d), false], [x0 + (W - d) / 2 + 0.035, back(d), false]]) {
        void vertical;
        bx(0.012, 0.16, 0.025, px, 1.0, pz + 0.013, metalMat);
      }
      break;
    }
    case 'wardrobe_open': {
      // armadio aperto a vista: montanti, schienale chiaro, ripiani, asta con i capi appesi e pile piegate sui ripiani
      const H = 2.1;
      const upr = Math.max(2, Math.round(W / 0.55));
      for (let i = 0; i <= upr; i++) bx(0.03, H, D, -W / 2 + 0.015 + ((W - 0.03) * i) / upr, 0, 0, wood);
      bx(W, H - 0.03, 0.02, 0, 0.03, -D / 2 + 0.01, white);
      for (const y of [0.04, 0.5, H - 0.04]) bx(W, 0.03, D, 0, y, 0, wood);
      const rodY = 1.85;
      wheel(0.012, W - 0.04, 0, rodY, -D / 2 + D * 0.45, chrome);
      const pal = [m('cloth1', '#cfd6df'), m('cloth2', '#e8ddd0'), m('cloth3', '#8f9eb2'), m('cloth4', '#c9b8a6'), m('cloth5', '#b5bfa8'), m('cloth6', '#9a8f86')];
      const n = Math.max(6, Math.round((W - 0.1) / 0.07));
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + 0.06 + ((W - 0.12) * (i + 0.5)) / n;
        const len = 0.55 + ((i * 37) % 5) * 0.08;
        bx(0.04, len, D * 0.55, x, rodY - len, -D / 2 + D * 0.45, pal[(i * 7 + 3) % pal.length]);
      }
      for (let k = 0; k < Math.max(1, Math.round(W / 0.5)); k++) {
        const x = -W / 2 + 0.2 + k * 0.45;
        if (x > W / 2 - 0.2) break;
        for (let j = 0; j < 4; j++) bx(0.32, 0.05, D * 0.7, x, 0.07 + j * 0.055, -D / 2 + D * 0.4, pal[(k + j) % pal.length]);
      }
      break;
    }
    case 'sofa_round': {
      // divano piccolo e morbido in bouclé: corpo a fagiolo (quasi un rettangolo molto arrotondato), schienale a mezzaluna
      // che avvolge, seduta e due cuscini tondi oliva, coperta verde sul bracciolo
      let boucleMap = null;
      if (typeof document !== 'undefined') {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 128;
        const c2 = cv.getContext('2d');
        c2.fillStyle = '#efe7d6';
        c2.fillRect(0, 0, 128, 128);
        let seed = 7;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let k = 0; k < 520; k++) {
          const x = rnd() * 128, y = rnd() * 128;
          c2.strokeStyle = rnd() < 0.5 ? 'rgba(160,140,110,0.35)' : 'rgba(255,255,255,0.7)';
          c2.lineWidth = 1.4;
          c2.beginPath();
          c2.arc(x, y, 2 + rnd() * 2, rnd() * 6, rnd() * 6 + 3.6);
          c2.stroke();
        }
        boucleMap = new THREE.CanvasTexture(cv);
        boucleMap.wrapS = boucleMap.wrapT = THREE.RepeatWrapping;
        boucleMap.repeat.set(3, 3);
        boucleMap.colorSpace = THREE.SRGBColorSpace;
      }
      const boucle = m('boucle', it.color || '#f1ead9', { roughness: 1, side: THREE.DoubleSide, ...(boucleMap && { map: boucleMap }) });
      const boucleMesh = (geo, x, y, z) => place(new THREE.Mesh(geo, boucle), x, y, z);
      boucleMesh(new RoundedBoxGeometry(W, 0.16, D * 0.96, 6, 0.3), 0, 0.12, 0);                // base
      boucleMesh(new RoundedBoxGeometry(W - 0.14, 0.17, D * 0.72, 6, 0.26), 0, 0.3, D * 0.1);    // seduta (sopra a 0,385 m)
      const seatTop = 0.385;
      // schienale a mezzaluna che avvolge: due rotoli sovrapposti, con una calotta tonda a ogni estremità (senza, i tubi restano aperti)
      const Rr = W / 2 - 0.1;
      const arc = 3.0;
      const wrap = new THREE.Group();
      wrap.scale.z = D / W;
      for (const [y, tube] of [[0.42, 0.115], [0.55, 0.1]]) {
        const ring = new THREE.Group();
        ring.rotation.x = -Math.PI / 2;
        const tor = new THREE.Mesh(new THREE.TorusGeometry(Rr, tube, 16, 48, arc), boucle);
        tor.rotation.z = Math.PI / 2 - arc / 2;
        tor.castShadow = true;
        tor.receiveShadow = true;
        ring.add(tor);
        ring.position.y = y;
        wrap.add(ring);
        for (const e of [-1, 1]) {
          const phi = Math.PI / 2 + (e * arc) / 2;
          const cap = new THREE.Mesh(new THREE.SphereGeometry(tube, 18, 14), boucle);
          cap.position.set(Rr * Math.cos(phi), y, -Rr * Math.sin(phi));
          cap.castShadow = true;
          wrap.add(cap);
        }
      }
      g.add(wrap);
      // due cuscini oliva appoggiati allo schienale, un po' storti, e una coperta verde buttata sul bordo davanti
      const olive = m('olive', '#7d8050', { roughness: 0.95 });
      for (const sx of [-1, 1]) soft(0.36, 0.13, 0.34, sx * W * 0.2, seatTop + 0.115, -D * 0.2, olive, { pinch: 0.5, rot: sx * 0.14, tilt: 1.25 });
      const throwMat = m('throw', '#7d8050', { roughness: 1, side: THREE.DoubleSide });
      const frontZ = D * 0.1 + D * 0.36;
      const cloth = place(new THREE.Mesh(drapedThrow(THREE, 0.34, 0.3, 0.2, 1.3), throwMat), W * 0.24, seatTop + 0.018, frontZ - 0.3);   // un velo sopra la seduta (le pieghe salgono e scendono di 1 cm)
      cloth.rotation.y = -0.12;
      break;
    }
    case 'sofa_curved': {
      // divano ad arco: moduli di seduta e schienale lungo una parabola, concavità verso il davanti
      const b = D * 0.45;
      const depth = D - b;
      const n = 9;
      const zOf = (t) => -D / 2 + b * (2 * t - 1) ** 2;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = -W / 2 + W * t;
        const slope = (b * 4 * (2 * t - 1)) / W;
        const yaw = -Math.atan(slope);
        const sw = (W / n) * 1.08;
        const z = zOf(t) + depth / 2;
        const seat = bx(sw, 0.22, depth - 0.04, x, 0.18, z, M.fabric);
        seat.rotation.y = yaw;
        const bk = bx(sw, 0.46, 0.2, x, 0.38, zOf(t) + 0.12, M.fabric);
        bk.rotation.y = yaw;
        bk.rotation.x = -0.1;
        const base = bx(sw, 0.14, depth - 0.1, x, 0.05, z, darkLine);
        base.rotation.y = yaw;
      }
      // cuscini tondi oliva ai lati e coperta verde sul bracciolo
      const olive = m('olive', '#7d8050', { roughness: 0.95 });
      for (const sx of [-1, 1]) {
        const tt = 0.5 + sx * 0.3;
        const slope = (b * 4 * (2 * tt - 1)) / W;
        soft(0.36, 0.13, 0.34, sx * W * 0.3, 0.4 + 0.115, zOf(tt) + 0.28, olive, { pinch: 0.5, rot: -Math.atan(slope) + sx * 0.14, tilt: 1.25 });
      }
      const cloth = place(new THREE.Mesh(drapedThrow(THREE, 0.34, 0.34, 0.16, 2.1), m('throw', '#7d8050', { roughness: 1, side: THREE.DoubleSide })), W * 0.4, 0.418, zOf(0.9) + 0.22);
      cloth.rotation.y = -0.5;
      break;
    }
    case 'chair_design': {
      // sedia di design: guscio chiaro (seduta e schienale curvo) su quattro gambe di legno svasate
      const shell = m('shell', '#e9e4dc', { roughness: 0.4 });
      const s = Math.min(W, D);
      soft(s * 0.92, 0.055, s * 0.86, 0, 0.43, 0.03, shell, { pinch: 0.2 });
      const bk = bx(s * 0.92, 0.4, 0.045, 0, 0.47, -s / 2 + 0.07, shell, 0.02);
      bk.rotation.x = -0.18;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const lg = cy(0.011, 0.016, 0.45, sx * s * 0.34, 0, sz * s * 0.3, wood, 12);
        lg.rotation.z = -sx * 0.1;
        lg.rotation.x = sz * 0.1;
      }
      break;
    }
    case 'chair_outdoor': {
      // sedia da esterno di design: seduta e schienale intrecciati (rattan), gambe sottili in metallo scuro
      const wick = m('wicker', '#c9a77a', { roughness: 0.9, side: THREE.DoubleSide });
      const s = Math.min(W, D);
      cy(s * 0.42, s * 0.38, 0.07, 0, 0.42, 0.02, wick, 28);
      const arc = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.42, s * 0.42, 0.46, 32, 1, true, Math.PI - 1.3, 2.6), wick);
      place(arc, 0, 0.72, 0.02);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cy(0.012, 0.016, 0.42, sx * s * 0.28, 0, sz * s * 0.26, darkLine, 10);
      break;
    }
    case 'armchair_rattan': {
      // poltrona in rattan intrecciato: seduta tonda, schienale a conchiglia, cuscino crema e coperta oliva ripiegata
      const wick = m('wicker', '#b98f5c', { roughness: 0.9, side: THREE.DoubleSide });
      const cream = m('cream', '#efe6d4', { roughness: 0.95 });
      const olive = m('olive', '#7d8050', { roughness: 0.95 });
      const s = Math.min(W, D);
      cy(s * 0.4, s * 0.36, 0.08, 0, 0.3, 0.02, wick, 32);
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.46, s * 0.4, 0.5, 32, 1, true, Math.PI - 1.9, 3.8), wick);
      place(shell, 0, 0.55, 0.02);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cy(0.02, 0.025, 0.3, sx * s * 0.26, 0, sz * s * 0.24, wick, 10);
      cy(s * 0.34, s * 0.34, 0.1, 0, 0.38, 0.05, cream, 28);
      bx(s * 0.5, 0.025, s * 0.2, s * 0.05, 0.485, s * 0.12, olive);
      break;
    }
    case 'table_rattan': {
      // tavolino tondo in rattan con piano in marmo, una pianta e una lanterna con la candela
      const wick = m('wicker', '#b98f5c', { roughness: 0.9 });
      const marble = m('marble', '#ece9e4', { roughness: 0.25 });
      const s = Math.min(W, D);
      cy(s * 0.46, s * 0.46, 0.03, 0, 0.5, 0, marble, 36);
      cy(s * 0.48, s * 0.48, 0.02, 0, 0.48, 0, wick, 36);
      for (const a of [0, 2.1, 4.2]) cy(0.02, 0.025, 0.48, Math.cos(a) * s * 0.3, 0, Math.sin(a) * s * 0.3, wick, 10);
      ball(0.07, -s * 0.15, 0.62, 0.05, m('leaf', '#5f7f4a', { roughness: 0.9 }));
      cy(0.045, 0.05, 0.14, s * 0.17, 0.53, -0.03, m('lantern', '#2c2f33'), 14);
      cy(0.012, 0.012, 0.06, s * 0.17, 0.55, -0.03, m('wax', '#f4ead2', { roughness: 0.6 }), 8);
      break;
    }
    case 'wardrobe': {
      // corpo su zoccolo, ante con fessure e maniglie dello stile, cornice in alto (con modanatura nel classico e nel luxury)
      const H = 2.2;
      bx(W, 0.06, D - 0.04, 0, 0, -0.01, darkLine);
      bx(W, H - 0.11, D, 0, 0.06, 0, M.cabinet);
      bx(W + 0.02, style.tuft ? 0.1 : 0.05, D + 0.02, 0, H - (style.tuft ? 0.1 : 0.05), 0, M.cabinet);
      if (style.tuft) bx(W + 0.05, 0.03, D + 0.05, 0, H - 0.13, 0, wood);
      const doors = Math.max(2, Math.round(Math.max(W, D) / 0.6));
      const front = W >= D;
      const span = front ? W : D;
      for (let i = 1; i < doors; i++) {
        const o = -span / 2 + (span * i) / doors;
        if (front) bx(0.008, H - 0.16, 0.012, o, 0.08, D / 2 + 0.004, darkLine);
        else bx(0.012, H - 0.16, 0.008, W / 2 + 0.004, 0.08, o, darkLine);
      }
      if (front) {
        // ante vere, appena in rilievo e smussate (non un blocco unico con le righe disegnate)
        for (let i = 0; i < doors; i++) bx(span / doors - 0.01, H - 0.19, 0.02, -span / 2 + (span * (i + 0.5)) / doors, 0.09, D / 2 + 0.008, M.cabinet, 0.007);
      }
      if (style.tuft && front) {
        // specchiature in rilievo sulle ante
        for (let i = 0; i < doors; i++) {
          const o = -span / 2 + (span * (i + 0.5)) / doors;
          bx(span / doors - 0.12, 0.7, 0.012, o, 0.2, D / 2 + 0.008, wood);
          bx(span / doors - 0.12, 0.9, 0.012, o, 1.05, D / 2 + 0.008, wood);
        }
      }
      for (let i = 0; i < doors; i += 2) {
        const o = -span / 2 + (span * (i + 1)) / doors;
        for (const k of [-0.035, 0.035]) {
          if (front) pull(o + k, 1.0, D / 2, true);
          else bx(0.02, 0.2, 0.015, W / 2 + 0.012, 0.95, o + k, metalMat);
        }
      }
      break;
    }
    case 'dresser': {
      // cassettiera: gambe dello stile, corpo, cassetti con maniglie, piano sporgente
      const rows = W > 0.7 ? 3 : 4;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) leg(sx * (W / 2 - 0.05), sz * (D / 2 - 0.05), 0.12);
      bx(W, 0.72, D, 0, 0.12, 0, M.cabinet);
      const dh = 0.72 / rows;
      for (let i = 0; i < rows; i++) {
        bx(W - 0.05, dh - 0.02, 0.015, 0, 0.13 + i * dh, D / 2 + 0.006, wood);
        pull(0, 0.12 + i * dh + dh / 2, D / 2 + 0.006, false);
      }
      bx(W + 0.02, 0.04, D + 0.02, 0, 0.84, 0, wood);
      break;
    }
    case 'shelving':
    case 'shelving_heavy': {
      // scaffale metallico: montanti, ripiani e qualche scatola
      const H = it.type === 'shelving' ? 1.9 : 2.0;
      const n = it.type === 'shelving' ? 5 : 4;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bx(0.04, H, 0.04, sx * (W / 2 - 0.02), 0, sz * (D / 2 - 0.02), M.metal);
      const boxMat = m('cardboard', '#b79b6a');
      const tub = m('tub', '#5b7fa6');
      for (let i = 0; i < n; i++) {
        const y = 0.12 + (i * (H - 0.2)) / (n - 1);
        bx(W - 0.02, 0.03, D, 0, y, 0, M.metal);
        if (i > 0 && i < n - 1) {
          const k = Math.max(1, Math.floor(W / 0.55));
          for (let j = 0; j < k; j++) {
            if ((i + j) % 3 === 2) continue;
            const x = -W / 2 + (W * (j + 0.5)) / k;
            bx(Math.min(0.44, W / k - 0.1), 0.24 + 0.04 * ((i + j) % 2), D - 0.1, x, y + 0.03, 0, (i + j) % 2 ? boxMat : tub);
          }
        }
      }
      break;
    }
    case 'bookcase': {
      const H = 2.0;
      bx(0.03, H, D, -W / 2 + 0.015, 0, 0, M.cabinet);
      bx(0.03, H, D, W / 2 - 0.015, 0, 0, M.cabinet);
      bx(W, H, 0.02, 0, 0, -D / 2 + 0.01, M.cabinet);
      const n = 5;
      const cols = ['#8b5e4b', '#46627a', '#c2a35c', '#5f7d5a', '#a64b4b'];
      const books = cols.map((color, i) => m(`book-${i}`, color, { roughness: 0.82 }));
      const band = m('bookband', '#d8c89b', { roughness: 0.72 });
      const rng = seeded(`${it.x}|${it.y}|${W}|${D}|bookcase`);
      const widths = [0.034, 0.04, 0.046, 0.052];
      const heights = [0.2, 0.23, 0.27, 0.3];
      for (let i = 0; i <= n; i++) {
        const y = (i * (H - 0.03)) / n;
        bx(W - 0.06, 0.03, D - 0.02, 0, y, 0.0, M.cabinet);
        if (i > 0 && i < n) {
          const baseY = y + 0.03;
          const left = -W / 2 + 0.06;
          const right = W / 2 - 0.06;
          const stacked = i === 2 || i === 4;
          const stackW = stacked ? Math.min(0.28, W * 0.25) : 0;
          const stackSide = i === 2 ? 1 : -1;
          const stackX = stackSide > 0 ? right - stackW / 2 : left + stackW / 2;
          const start = stacked && stackSide < 0 ? left + stackW + 0.035 : left;
          const end = stacked && stackSide > 0 ? right - stackW - 0.035 : right;
          let x = start;
          for (let j = 0; x < end && j < 22; j++) {
            const bw = widths[Math.floor(rng() * widths.length)];
            const bh = heights[Math.floor(rng() * heights.length)];
            if (x + bw > end) break;
            const book = bx(bw, bh, D - 0.12, x + bw / 2, baseY, 0, books[Math.floor(rng() * books.length)]);
            book.rotation.y = (rng() - 0.5) * 0.08;
            book.rotation.z = (rng() - 0.5) * 0.08;
            if (rng() < 0.28) bx(bw * 0.72, 0.006, 0.003, x + bw / 2, baseY + bh * 0.16, (D - 0.12) / 2 + 0.001, band);
            x += bw + 0.008;
          }
          if (stacked) {
            for (let j = 0; j < 3; j++) {
              const mt = books[Math.floor(rng() * books.length)];
              bx(stackW, 0.024, D - 0.12, stackX, baseY + j * 0.026, 0, mt);
              if (j !== 1) bx(stackW * 0.72, 0.005, 0.003, stackX, baseY + j * 0.026 + 0.009, (D - 0.12) / 2 + 0.001, band);
            }
          }
        }
      }
      break;
    }
    case 'car': {
      // carrozzeria, abitacolo con vetri, ruote con cerchi, fari e paraurti. Davanti verso +z
      const tire = m('tire', '#1f2328');
      const rim = m('rim', '#aeb6c2', { metalness: 0.7, roughness: 0.3 });
      const body = M.car;
      const rad = 0.33;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        wheel(rad, 0.23, sx * (W / 2 - 0.13), rad, sz * D * 0.31, tire);
        wheel(rad * 0.62, 0.235, sx * (W / 2 - 0.13), rad, sz * D * 0.31, rim);
      }
      bx(W - 0.04, 0.52, D - 0.2, 0, 0.3, 0, body);                 // scocca
      bx(W - 0.1, 0.1, D * 0.32, 0, 0.62, D * 0.32, body);           // cofano
      bx(W - 0.1, 0.12, D * 0.2, 0, 0.62, -D * 0.38, body);          // bagagliaio
      // abitacolo: profilo laterale esteso in larghezza
      const shape = new THREE.Shape();
      const cabin = [[-D * 0.28, 0.82], [-D * 0.2, 1.35], [D * 0.08, 1.38], [D * 0.2, 0.82]];   // (z, quota)
      cabin.forEach(([z, y], i) => (i ? shape.lineTo(-z, y) : shape.moveTo(-z, y)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: W - 0.22, bevelEnabled: false });
      geo.rotateY(Math.PI / 2);
      geo.translate(-(W - 0.22) / 2, 0, 0);
      place(new THREE.Mesh(geo, body), 0, 0, 0);
      const wy = 0.9;
      for (const sx of [-1, 1]) bx(0.012, 0.36, D * 0.3, sx * (W / 2 - 0.115), wy, -D * 0.06, glass);   // vetri laterali
      const ws = bx(W - 0.3, 0.012, 0.58, 0, 1.08, D * 0.14, glass);      // parabrezza
      ws.rotation.x = -0.9;
      const rw = bx(W - 0.34, 0.012, 0.45, 0, 1.1, -D * 0.27, glass);     // lunotto
      rw.rotation.x = 0.8;
      const head = m('head', '#fff7d0', { emissive: '#fff1a8', emissiveIntensity: 0.5 });
      const tail = m('tail', '#c1272d', { emissive: '#7a1015', emissiveIntensity: 0.4 });
      for (const sx of [-1, 1]) {
        bx(0.28, 0.1, 0.03, sx * (W / 2 - 0.25), 0.55, D / 2 - 0.09, head);
        bx(0.26, 0.09, 0.03, sx * (W / 2 - 0.22), 0.6, -D / 2 + 0.09, tail);
      }
      bx(W - 0.1, 0.12, 0.08, 0, 0.18, D / 2 - 0.08, darkLine);        // paraurti
      bx(W - 0.1, 0.12, 0.08, 0, 0.18, -D / 2 + 0.08, darkLine);
      break;
    }
    case 'motorbike': {
      // due ruote, forcella, serbatoio, sella, motore e manubrio. Davanti verso +z
      const tire = m('tire', '#1f2328');
      const rim = m('rim', '#aeb6c2', { metalness: 0.7, roughness: 0.3 });
      const paint = m('paint', '#8c1f25', { metalness: 0.3, roughness: 0.4 });
      const rad = 0.3;
      const zf = D * 0.34;
      const zr = -D * 0.34;
      for (const z of [zf, zr]) {
        wheel(rad, 0.12, 0, rad, z, tire);
        wheel(rad * 0.62, 0.125, 0, rad, z, rim);
      }
      bx(0.22, 0.28, 0.4, 0, 0.3, 0, M.metal);                       // motore
      bx(0.26, 0.2, D * 0.26, 0, 0.62, D * 0.1, paint);               // serbatoio
      bx(0.24, 0.1, D * 0.28, 0, 0.66, -D * 0.16, darkLine);          // sella
      bx(0.22, 0.05, D * 0.2, 0, 0.56, zr, paint).rotation.x = 0.1;   // parafango posteriore
      const fork = cy(0.018, 0.018, 0.75, 0, 0.3, zf - 0.1, chrome, 10);
      fork.rotation.x = 0.28;
      cy(0.015, 0.015, 0.62, 0, 0.98, zf - 0.04, M.metal, 10).rotation.z = Math.PI / 2;   // manubrio
      ball(0.09, 0, 0.98, zf + 0.04, m('lamp', '#fff7d0', { emissive: '#fff1a8', emissiveIntensity: 0.5 }));
      const ex = cy(0.04, 0.05, 0.9, 0.17, 0.2, -0.1, chrome, 14);   // scarico
      ex.rotation.x = Math.PI / 2;
      break;
    }
    case 'toilet': {
      // cassetta a muro (-z), tazza ovale con sedile e acqua; le scale dei volumi tondi sono diametri (raggio base 0,5)
      const bd = D - 0.18;
      const zc = -D / 2 + 0.18 + bd / 2;
      bx(Math.min(W, 0.4), 0.38, 0.18, 0, 0.4, -D / 2 + 0.09, ceramic).name = 'cassetta';
      bx(0.07, 0.02, 0.04, 0, 0.78, -D / 2 + 0.09, chrome);
      ball(0.5, 0, 0.27, zc, ceramic, W, 0.44, bd).name = 'tazza';
      cy(0.5, 0.5, 0.035, 0, 0.42, zc, white, 28).scale.set(W, 1, bd);
      cy(0.5, 0.5, 0.01, 0, 0.455, zc + 0.02, m('water', '#b9d7ea'), 24).scale.set(W * 0.68, 1, bd * 0.68);
      break;
    }
    case 'bidet': {
      ball(0.5, 0, 0.22, 0, ceramic, W, 0.4, D);
      cy(0.5, 0.5, 0.03, 0, 0.37, 0, white, 28).scale.set(W, 1, D);
      cy(0.5, 0.5, 0.01, 0, 0.4, 0.02, m('water', '#b9d7ea'), 24).scale.set(W * 0.66, 1, D * 0.66);
      cy(0.015, 0.015, 0.07, 0, 0.4, -D / 2 + 0.04, chrome, 10);   // rubinetto
      break;
    }
    case 'sink': {
      // lavabo da appoggio con rubinetto; su mobile il piano poggia sul mobile (disegnato a parte nello stesso gruppo)
      const cab = !!it.parts?.cabinet;
      if (cab) bx(W, 0.62, D, 0, 0.15, 0, M.cabinet);
      const top = cab ? 0.77 : 0.8;
      bx(W, cab ? 0.05 : 0.1, D, 0, top - (cab ? 0 : 0.05), 0, ceramic);
      const basin = m('basin', '#dfe6ec', { roughness: 0.2 });
      bx(Math.min(W - 0.12, 0.42), 0.02, Math.min(D - 0.14, 0.32), 0, top + 0.044, D * 0.04, basin);
      cy(0.012, 0.012, 0.13, 0, top + 0.05, -D / 2 + 0.07, chrome, 10);
      bx(0.018, 0.018, 0.1, 0, top + 0.16, -D / 2 + 0.115, chrome);
      if (!cab) {
        cy(0.035, 0.035, 0.7, 0, 0.05, -D / 2 + 0.1, ceramic, 14);   // colonna
      }
      break;
    }
    case 'shower_walkin': {
      // walk-in: piatto in pietra a filo pavimento con canale di scarico, un pannello di vetro fisso lungo il lato,
      // soffione a pioggia su braccio, miscelatore, asta con doccetta e nicchia nel muro di fondo (-z)
      const stone = m('stone_tray', '#cfc7ba', { roughness: 0.85 });
      const niche = m('niche', '#b9b1a3', { roughness: 0.9 });
      bx(W, 0.02, D, 0, 0, 0, stone);
      bx(W - 0.16, 0.008, 0.045, 0, 0.02, -D / 2 + 0.1, chrome);                       // canale di scarico
      bx(0.012, 2.0, D - 0.04, W / 2 - 0.006, 0.02, 0.0, glass);                       // vetro fisso
      bx(0.024, 0.024, D - 0.04, W / 2 - 0.012, 2.02, 0.0, chrome);                    // profilo superiore
      const hx = -W / 4;
      bx(0.016, 0.016, 0.42, hx, 2.1, -D / 2 + 0.21, chrome);                          // braccio del soffione
      cy(0.15, 0.15, 0.014, hx, 2.085, -D / 2 + 0.4, chrome, 32);                      // soffione a pioggia
      bx(0.08, 0.08, 0.018, W / 4, 1.0, -D / 2 + 0.009, chrome);                       // placca del miscelatore
      cy(0.026, 0.026, 0.03, W / 4, 1.0, -D / 2 + 0.03, chrome, 16).rotation.x = Math.PI / 2;
      cy(0.008, 0.008, 0.8, W / 4 + 0.22, 1.0, -D / 2 + 0.03, chrome, 8);              // asta
      bx(0.04, 0.12, 0.04, W / 4 + 0.22, 1.35, -D / 2 + 0.06, chrome);                 // doccetta
      bx(0.34, 0.24, 0.012, -W / 2 + 0.3, 1.05, -D / 2 + 0.006, niche);                // nicchia portaoggetti
      break;
    }
    case 'shower':
    case 'shower_round': {
      // piatto, pannelli di vetro sui lati aperti e soffione sul lato muro
      bx(W, 0.06, D, 0, 0, 0, ceramic);
      bx(W - 0.14, 0.012, D - 0.14, 0, 0.062, 0, m('drain', '#dde3ea'));
      cy(0.03, 0.03, 0.012, 0, 0.07, 0, chrome, 12);
      bx(0.012, 2.0, D, W / 2 - 0.006, 0.06, 0, glass);
      bx(W, 2.0, 0.012, 0, 0.06, D / 2 - 0.006, glass);
      bx(0.03, 2.0, 0.03, W / 2 - 0.015, 0.06, D / 2 - 0.015, chrome);
      cy(0.012, 0.012, 1.9, -W / 2 + 0.06, 0.06, -D / 2 + 0.06, chrome, 8);
      cy(0.1, 0.1, 0.015, -W / 2 + 0.14, 1.98, -D / 2 + 0.14, chrome, 20);
      bx(0.08, 0.012, 0.12, -W / 2 + 0.1, 1.98, -D / 2 + 0.1, chrome);
      break;
    }
    case 'bathtub': {
      // vasca: bordo, conca interna chiara, rubinetteria sul lato corto contro il muro
      const t = 0.07;
      const inner = m('tub', '#e7edf2', { roughness: 0.25 });
      bx(W, 0.55, t, 0, 0, -D / 2 + t / 2, ceramic);
      bx(W, 0.55, t, 0, 0, D / 2 - t / 2, ceramic);
      bx(t, 0.55, D - 2 * t, -W / 2 + t / 2, 0, 0, ceramic);
      bx(t, 0.55, D - 2 * t, W / 2 - t / 2, 0, 0, ceramic);
      bx(W - 2 * t, 0.12, D - 2 * t, 0, 0, 0, ceramic);
      bx(W - 2 * t - 0.04, 0.01, D - 2 * t - 0.04, 0, 0.12, 0, inner);
      const long = W >= D;
      if (long) {
        cy(0.012, 0.012, 0.1, -W / 2 + 0.12, 0.55, 0, chrome, 10);
        bx(0.1, 0.018, 0.018, -W / 2 + 0.17, 0.64, 0, chrome);
      } else {
        cy(0.012, 0.012, 0.1, 0, 0.55, -D / 2 + 0.12, chrome, 10);
        bx(0.018, 0.018, 0.1, 0, 0.64, -D / 2 + 0.17, chrome);
      }
      break;
    }
    case 'tv': {
      // schermo piatto su staffa a muro (-z), con cornice, schermo scuro e barra audio sotto
      const sw = Math.min(W - 0.04, 1.9);
      const sh = Math.min(0.95, sw * 0.5625);
      const screen = m('screen', '#0b0f14', { roughness: 0.12, metalness: 0.3 });
      if (it.parts?.stand) {
        // mobile TV basso da terra, di design: corpo su gambe sottili, schermo sul piano con piede
        const cw = W;
        const uh = 0.34;
        bx(cw, uh, D, 0, 0.14, 0, M.wood);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(0.03, 0.14, 0.03, sx * (cw / 2 - 0.08), 0, sz * (D / 2 - 0.06), M.metal);
        const top = 0.14 + uh;
        const w2 = Math.min(cw - 0.1, 1.2);
        const h2 = w2 * 0.5625;
        bx(w2, h2, 0.04, 0, top + 0.05, 0, M.dark);
        bx(w2 - 0.04, h2 - 0.04, 0.008, 0, top + 0.07, 0.024, screen);
        bx(0.3, 0.03, 0.16, 0, top, 0, M.metal);
        break;
      }
      bx(sw, sh, 0.04, 0, 0.62, -D / 2 + 0.06, M.dark);
      bx(sw - 0.04, sh - 0.04, 0.008, 0, 0.64, -D / 2 + 0.084, screen);
      bx(0.18, 0.14, 0.04, 0, 0.62 + sh / 2 - 0.07, -D / 2 + 0.02, M.metal);
      bx(sw * 0.55, 0.06, 0.07, 0, 0.5, -D / 2 + 0.07, M.dark);
      break;
    }
    case 'sofa':
    case 'sofa_corner':
    case 'armchair': {
      // basamento con gambe dello stile, braccioli (quadrati, tondi, a rullo, sottili), sedute e schienali a cuscini
      const slim = style.arm === 'slim';
      const arm = slim ? 0.08 : it.type === 'armchair' ? 0.14 : 0.16;
      const backT = 0.2;
      const lowSofa = style.low;
      const seatY = lowSofa ? 0.2 : 0.3;
      const corner = it.type === 'sofa_corner';
      const mainD = corner ? Math.min(0.95, D) : D;
      const flip = corner && it.flip ? -1 : 1;
      const zb = -D / 2;                       // retro
      const mainZ = zb + mainD / 2;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) leg(sx * (W / 2 - 0.08), sz * (D / 2 - 0.08), lowSofa ? 0.05 : 0.1);
      bx(W - 2 * arm, 0.22, mainD - 0.04, 0, lowSofa ? 0.05 : 0.1, mainZ, M.fabric);
      const n = it.type === 'armchair' ? 1 : Math.max(2, Math.round((W - 2 * arm) / 0.75));
      const sw = (W - 2 * arm) / n;
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + arm + sw * (i + 0.5);
        soft(sw - 0.012, 0.15, mainD - backT - 0.02, x, seatY, zb + backT + (mainD - backT) / 2, M.fabric, { pinch: 0.3 });
        soft(sw - 0.012, lowSofa ? 0.32 : 0.42, backT - 0.04, x, seatY + 0.1, zb + backT / 2 + 0.02, M.fabric, { pinch: 0.3, tilt: -0.1 });
        if (style.tuft) for (const dx of [-0.2, 0, 0.2].filter((v) => Math.abs(v) < sw / 2 - 0.05)) ball(0.013, x + dx, seatY + 0.34, zb + backT - 0.015, metalMat);
      }
      const armH = lowSofa ? 0.42 : 0.6;
      for (const sx of [-1, 1]) {
        const ax = sx * (W / 2 - arm / 2);
        if (style.arm === 'round') {
          bx(arm, armH - arm / 2, mainD, ax, lowSofa ? 0.05 : 0.1, mainZ, M.fabric);
          const roll = cy(arm / 2, arm / 2, mainD, ax, 0, mainZ, M.fabric, 16);
          roll.rotation.x = Math.PI / 2;
          roll.position.set(ax, (lowSofa ? 0.05 : 0.1) + armH - arm / 2, mainZ);
        } else if (style.arm === 'rolled') {
          bx(arm * 0.8, armH - 0.08, mainD, ax, lowSofa ? 0.05 : 0.1, mainZ, M.fabric);
          const roll = cy(arm * 0.62, arm * 0.62, mainD, ax, 0, mainZ, M.fabric, 18);
          roll.rotation.x = Math.PI / 2;
          roll.position.set(ax, (lowSofa ? 0.05 : 0.1) + armH - 0.04, mainZ);
        } else {
          bx(arm, armH, mainD, ax, lowSofa ? 0.05 : 0.1, mainZ, M.fabric);
        }
      }
      bx(W, lowSofa ? 0.12 : 0.2, 0.06, 0, lowSofa ? 0.4 : 0.5, zb + 0.03, M.fabric);                    // fascia dietro lo schienale
      if (corner) {
        // penisola: seduta lunga sul lato della chaise, senza schienale
        const cw = Math.min(0.95, W - 2 * arm);
        const cx = flip * (W / 2 - arm - cw / 2);
        const cd = D - mainD;
        bx(cw, 0.22, cd, cx, lowSofa ? 0.05 : 0.1, zb + mainD + cd / 2, M.fabric);
        bx(cw - 0.012, 0.15, cd - 0.012, cx, seatY, zb + mainD + cd / 2, M.fabric);
      }
      const pil = m('pillow', theme.accent || '#c9b79c');
      if (it.type !== 'armchair') {
        for (const sx of [-1, 1]) soft(0.38, 0.13, 0.36, sx * (W / 2 - arm - 0.28), seatY + 0.16, zb + backT + 0.12, pil, { pinch: 0.58, rot: sx * 0.3, tilt: 1.15 });
      }
      break;
    }
    case 'sideboard': {
      // madia: zoccolo su gambe dello stile, due o tre ante con maniglie, piano in legno
      const doors = Math.max(2, Math.round(Math.max(W, D) / 0.6));
      const front = W >= D;
      const span = front ? W : D;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) leg(sx * (W / 2 - 0.06), sz * (D / 2 - 0.06), 0.16);
      bx(W, 0.6, D, 0, 0.16, 0, M.cabinet);
      for (let i = 0; i < doors; i++) {
        const o = -span / 2 + (span * (i + 0.5)) / doors;
        const fw = span / doors - 0.02;
        if (front) {
          bx(fw, 0.54, 0.015, o, 0.19, D / 2 + 0.006, wood);
          pull(o + (i % 2 ? fw / 2 - 0.05 : -fw / 2 + 0.05), 0.46, D / 2 + 0.006, true);
        } else {
          bx(0.015, 0.54, fw, W / 2 + 0.006, 0.19, o, wood);
          bx(0.02, 0.14, 0.012, W / 2 + 0.02, 0.42, o + (i % 2 ? fw / 2 - 0.04 : -fw / 2 + 0.04), metalMat);
        }
      }
      bx(W + 0.03, 0.04, D + 0.03, 0, 0.76, 0, wood);
      break;
    }
    case 'plant': {
      // vaso in ceramica con terra, steli e foglie a ciuffi
      const r = Math.min(W, D) / 2;
      const pot = m('pot', theme.pot || '#e2d6c2');
      cy(r * 0.62, r * 0.46, 0.34, 0, 0, 0, pot, 20);
      cy(r * 0.56, r * 0.56, 0.02, 0, 0.33, 0, m('soil', '#3d2f24'), 20);
      const leaf = M.plant;
      const dark = m('leaf2', '#4f7d48');
      const rnd = seeded(`${it.x}|${it.y}|plant`);
      for (let i = 0; i < 7; i++) {
        const a = (i * 2 * Math.PI) / 7;
        const rr = r * (0.25 + 0.2 * (i % 2));
        const h = 0.55 + 0.12 * (i % 3);
        const stem = cy(0.01, 0.015, h, Math.cos(a) * rr * 0.4, 0.34, Math.sin(a) * rr * 0.4, dark, 6);
        stem.rotation.z = Math.cos(a) * 0.25;
        stem.rotation.x = -Math.sin(a) * 0.25;
        // un ciuffo di foglie lanceolate che si aprono verso l'esterno e ricadono (non dischi impilati)
        const tx = Math.cos(a) * rr;
        const tz = Math.sin(a) * rr;
        for (let k = 0; k < 5; k++) {
          const a2 = a + (k / 5) * 2 * Math.PI + rnd() * 0.5;
          const pitch = 0.45 + rnd() * 0.5;
          const dir = new THREE.Vector3(Math.sin(a2) * Math.cos(pitch), 0.18 - Math.sin(pitch) * 0.75, Math.cos(a2) * Math.cos(pitch)).normalize();
          const len = 0.22 + rnd() * 0.08;
          const lf = ball(0.5, tx + dir.x * len * 0.5, 0.34 + h + dir.y * len * 0.5 + 0.02, tz + dir.z * len * 0.5, (i + k) % 2 ? leaf : dark, 0.09, 0.016, len);
          lf.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        }
      }
      for (let k = 0; k < 6; k++) {   // foglie al centro, più alte
        const a2 = (k / 6) * 2 * Math.PI;
        const dir = new THREE.Vector3(Math.sin(a2) * 0.45, 0.85, Math.cos(a2) * 0.45).normalize();
        const lf = ball(0.5, dir.x * 0.12, 0.9 + dir.y * 0.12, dir.z * 0.12, k % 2 ? leaf : dark, 0.1, 0.016, 0.3);
        lf.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      }
      break;
    }
    case 'tree': {
      // tronco e chioma a più masse
      const r = Math.min(W, D) / 2;
      const bark = m('bark', '#6d5237');
      cy(r * 0.12, r * 0.17, 1.7, 0, 0, 0, bark, 12);
      const crown = [[0, 2.5, 0, 1], [0.35, 2.15, 0.2, 0.7], [-0.3, 2.2, -0.2, 0.7], [0.1, 2.9, -0.15, 0.62], [-0.2, 2.1, 0.3, 0.6]];
      crown.forEach(([x, y, z, k], i) => ball(r * k, x * r, y, z * r, i % 2 ? M.plant : m('leaf2', '#4f7d48'), 1, 0.85, 1));
      break;
    }
    case 'hedge': {
      // siepe: massa verde con la sommità a lobi
      const gm = M.plant;
      const dk = m('leaf2', '#4f7d48');
      const hgt = 1.15;
      bx(W, hgt - 0.3, D * 0.9, 0, 0.1, 0, dk);
      const n = Math.max(2, Math.round(W / (D * 0.9)));
      for (let i = 0; i < n; i++) ball(0.5, -W / 2 + (W * (i + 0.5)) / n, hgt - 0.28, 0, i % 2 ? gm : dk, (W / n) * 1.05, 0.6, D * 1.0);
      break;
    }
    case 'fence': {
      // recinzione in legno: pali, due traverse e doghe verticali
      const posts = Math.max(2, Math.round(W / 1.5) + 1);
      for (let i = 0; i < posts; i++) bx(0.08, 1.1, Math.max(D, 0.08), -W / 2 + (W * i) / (posts - 1), 0, 0, wood);
      for (const y of [0.25, 0.8]) bx(W, 0.05, 0.04, 0, y, D / 2 - 0.02, wood);
      const slats = Math.max(2, Math.floor(W / 0.12));
      for (let i = 0; i < slats; i++) bx(0.07, 0.95, 0.02, -W / 2 + (W * (i + 0.5)) / slats, 0.05, D / 2 + 0.01, wood);
      break;
    }
    case 'path': {
      // percorso pedonale: letto di ghiaia con lastre in pietra separate da fughe
      const along = W >= D ? 'x' : 'z';
      const L = along === 'x' ? W : D;
      const T = along === 'x' ? D : W;
      bx(W, 0.012, D, 0, 0, 0, m('gravel', '#cfc7b8'));
      const rows = Math.max(1, Math.round(L / 0.8));
      const cols = Math.max(1, Math.round(T / 0.55));
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const lw = L / rows - 0.04;
          const tw = T / cols - 0.04;
          const a = -L / 2 + (L * (i + 0.5)) / rows;
          const b = -T / 2 + (T * (j + 0.5)) / cols;
          if (along === 'x') bx(lw, 0.03, tw, a, 0.012, b, M.stone);
          else bx(tw, 0.03, lw, b, 0.012, a, M.stone);
        }
      }
      break;
    }
    case 'gate_pedestrian': {
      // cancello pedonale: due pilastri, anta con montanti e traverse, maniglia
      const iron = m('iron', '#2f353d', { metalness: 0.5, roughness: 0.4 });
      const pw = 0.14;
      for (const sx of [-1, 1]) bx(pw, 1.75, Math.max(D, pw), sx * (W / 2 + pw / 2 - 0.01), 0, 0, M.stone);
      const lw = W - 0.04;
      for (const y of [0.15, 1.35]) bx(lw, 0.05, 0.03, 0, y, 0, iron);
      const bars = Math.max(4, Math.round(lw / 0.1));
      for (let i = 0; i < bars; i++) bx(0.02, 1.25, 0.02, -lw / 2 + (lw * (i + 0.5)) / bars, 0.2, 0, iron);
      bx(0.03, 1.45, 0.035, -lw / 2, 0.1, 0, iron);
      bx(0.03, 1.45, 0.035, lw / 2, 0.1, 0, iron);
      bx(0.1, 0.03, 0.05, lw / 2 - 0.08, 0.95, 0, chrome);
      break;
    }
    case 'gate_driveway': {
      // cancello carraio scorrevole: pilastri, anta a doghe orizzontali con guida in alto
      const iron = m('iron', '#2f353d', { metalness: 0.5, roughness: 0.4 });
      const pw = 0.3;
      for (const sx of [-1, 1]) bx(pw, 1.9, Math.max(D, pw), sx * (W / 2 + pw / 2 - 0.02), 0, 0, M.stone);
      bx(W + 0.2, 0.05, 0.05, 0, 1.75, D / 2, iron);
      const slats = 9;
      for (let i = 0; i < slats; i++) bx(W - 0.04, 0.1, 0.03, 0, 0.1 + i * 0.17, D / 2 - 0.02, i % 2 ? iron : m('iron2', '#444b55'));
      for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) bx(0.05, 1.6, 0.05, x, 0.1, D / 2 - 0.02, iron);
      break;
    }
    case 'washer':
    case 'dryer': {
      // elettrodomestico da incasso: corpo bianco, oblò con vetro e anello, pannello comandi con manopola e display
      const body = m('appliance', '#f2f4f6', { roughness: 0.35 });
      bx(W, 0.85, D, 0, 0, 0, body);
      bx(W - 0.02, 0.02, D - 0.02, 0, 0.845, 0, m('applitop', '#e5e8ec'));
      const r = Math.min(W, 0.6) * 0.32;
      const doorRing = cy(r, r, 0.03, 0, 0.36, D / 2 + 0.01, m('ring', it.type === 'dryer' ? '#aeb6c0' : '#8e99a6', { metalness: 0.6, roughness: 0.3 }), 28);
      doorRing.rotation.x = Math.PI / 2;
      const glassDoor = cy(r * 0.78, r * 0.78, 0.034, 0, 0.36, D / 2 + 0.012, m('porthole', '#1c2a36', { roughness: 0.1, transparent: true, opacity: 0.85 }), 28);
      glassDoor.rotation.x = Math.PI / 2;
      bx(W - 0.08, 0.1, 0.012, 0, 0.7, D / 2 + 0.006, m('panel', '#d9dde3'));
      const knob = cy(0.035, 0.035, 0.02, -W / 4, 0.75, D / 2 + 0.016, M.metal, 16);
      knob.rotation.x = Math.PI / 2;
      bx(0.12, 0.035, 0.008, W / 4, 0.72, D / 2 + 0.014, m('display', '#2a3a4a', { emissive: '#4fa8ff', emissiveIntensity: 0.25 }));
      break;
    }
    case 'vacuum': {
      // scopa elettrica Dyson V15 senza fili, in piedi sulla sua base a pavimento: testina piatta, tubo in nichel,
      // bidone trasparente con anello giallo, corpo motore, batteria e impugnatura con grilletto
      const nickel = m('dysonnickel', '#b7bcc4', { metalness: 0.85, roughness: 0.25 });
      const yellow = m('dysonyellow', '#f2c400', { roughness: 0.4 });
      const dark = m('dysonblack', '#1c1f24', { roughness: 0.45 });
      const bin = m('dysonbin', '#d9eef7', { transparent: true, opacity: 0.4, roughness: 0.05 });
      const R = Math.min(W, D) / 2;
      cy(R * 0.9, R * 0.92, 0.025, 0, 0, 0, dark, 28);                   // base a pavimento
      bx(0.07, 0.09, 0.05, 0, 0.025, -R * 0.45, dark);                    // colonna della base
      const head = bx(0.26, 0.045, 0.13, 0, 0.03, R * 0.15, dark);        // testina
      bx(0.24, 0.012, 0.1, 0, 0.074, R * 0.15, nickel);
      bx(0.26, 0.01, 0.014, 0, 0.034, R * 0.15 + 0.07, yellow);           // bordo della testina
      head.rotation.x = -0.06;
      cy(0.022, 0.026, 0.68, 0, 0.07, -R * 0.12, nickel, 16);              // tubo
      cy(0.032, 0.032, 0.04, 0, 0.7, -R * 0.12, dark, 16);                // raccordo
      cy(0.05, 0.05, 0.2, 0, 0.78, -R * 0.12, bin, 20);                   // bidone trasparente
      cy(0.052, 0.052, 0.03, 0, 0.96, -R * 0.12, yellow, 20);             // anello giallo
      cy(0.045, 0.045, 0.2, 0, 0.99, -R * 0.12, nickel, 18);              // corpo motore
      bx(0.07, 0.1, 0.1, 0, 1.17, -R * 0.12, dark);                       // batteria
      const grip = bx(0.035, 0.22, 0.035, 0, 1.0, -R * 0.12 - 0.1, dark); // impugnatura
      grip.rotation.x = 0.35;
      bx(0.02, 0.07, 0.025, 0, 1.0, -R * 0.12 - 0.04, yellow);            // grilletto
      break;
    }
    case 'nightstand': {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) leg(sx * (W / 2 - 0.04), sz * (D / 2 - 0.04), 0.12);
      bx(W, 0.4, D, 0, 0.12, 0, M.cabinet);
      bx(W - 0.05, 0.16, 0.014, 0, 0.36, D / 2 + 0.006, wood);
      pull(0, 0.44, D / 2 + 0.006, false);
      bx(W - 0.05, 0.14, 0.014, 0, 0.19, D / 2 + 0.006, wood);
      pull(0, 0.26, D / 2 + 0.006, false);
      bx(W + 0.02, 0.03, D + 0.02, 0, 0.52, 0, wood);
      // piantina da comodino: vaso e tre foglie lanceolate, dentro il piano esistente
      const px = -W * 0.24;
      const pz = -D * 0.14;
      const pr = Math.min(W, D) * 0.105;
      const pot = m('nightstand-pot', theme.pot || '#e9e4dc', { roughness: 0.82 });
      const soil = m('nightstand-soil', '#49382c', { roughness: 1 });
      const leaf = m('nightstand-leaf', '#73985d', { roughness: 0.9, side: THREE.DoubleSide });
      const leafDark = m('nightstand-leaf-dark', '#4f7547', { roughness: 0.92, side: THREE.DoubleSide });
      cy(pr * 0.82, pr * 0.66, 0.075, px, 0.55, pz, pot, 16);
      cy(pr * 0.68, pr * 0.68, 0.008, px, 0.625, pz, soil, 16);
      const rnd = seeded(`${it.x}|${it.y}|nightstand-plant`);
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3 + (rnd() - 0.5) * 0.22;
        const dir = new THREE.Vector3(Math.cos(a) * 0.55, 0.78, Math.sin(a) * 0.55).normalize();
        const stem = cy(0.004, 0.006, 0.055, px + dir.x * 0.018, 0.63, pz + dir.z * 0.018, leafDark, 6);
        stem.rotation.x = -dir.z * 0.35;
        stem.rotation.z = dir.x * 0.35;
        const lf = ball(0.5, px + dir.x * 0.046, 0.68 + dir.y * 0.046, pz + dir.z * 0.046,
          i % 2 ? leafDark : leaf, 0.05, 0.012, 0.1);
        lf.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      }
      break;
    }
    case 'desk': {
      // piano; pannelli o gambe dello stile, cassettiera a lato e schienale basso
      bx(W, 0.04, D, 0, 0.71, 0, wood, 0.018);
      if (style.legs === 'metal' || style.legs === 'turned') {
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) leg(sx * (W / 2 - 0.06), sz * (D / 2 - 0.06), 0.71, 0.06);
        bx(W - 0.1, 0.06, D - 0.1, 0, 0.64, 0, wood);
      } else {
        bx(0.03, 0.71, D - 0.04, -W / 2 + 0.03, 0, 0, wood);
        bx(W - 0.08, 0.35, 0.02, 0, 0.3, -D / 2 + 0.04, wood);
      }
      if (W >= 1.0) {
        const px = W / 2 - 0.22;
        bx(0.4, 0.62, D - 0.06, px, 0.08, 0, M.cabinet);
        for (let i = 0; i < 3; i++) {
          bx(0.36, 0.17, 0.014, px, 0.1 + i * 0.2, D / 2 - 0.025, wood);
          pull(px, 0.18 + i * 0.2, D / 2 - 0.025, false);
        }
      }
      // postazione: MacBook aperto su un supporto in alluminio, con la sua tastiera e il suo mouse, rivolti verso la sedia (+z)
      {
        const ty = 0.75;
        const alu = m('macalu', '#c9ced6', { metalness: 0.85, roughness: 0.3 });
        const keys = m('mackeys', '#2a2d33', { roughness: 0.6 });
        const screen = m('macscreen', '#07090c', { roughness: 0.08, metalness: 0.3 });
        const white = m('machite', '#f3f4f6', { roughness: 0.35 });
        const px = W >= 1.0 ? -0.1 * W : 0;                    // il MacBook un po' a sinistra del centro
        const pz = -D * 0.18;                                    // verso il fondo della scrivania
        for (const sx of [-1, 1]) bx(0.02, 0.1, 0.18, px + sx * 0.12, ty, pz - 0.01, alu);   // supporto
        const base = bx(0.31, 0.012, 0.22, px, ty + 0.1, pz, alu);
        bx(0.27, 0.003, 0.09, px, ty + 0.112, pz - 0.03, keys);   // tastiera
        bx(0.11, 0.002, 0.07, px, ty + 0.1125, pz + 0.07, m('mactrack', '#d6dbe2', { metalness: 0.5, roughness: 0.3 }));   // trackpad
        base.rotation.x = -0.14;
        const lid = new THREE.Group();
        const shell = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.215, 0.008), alu);
        shell.position.set(0, 0.1075, 0);
        const display = new THREE.Mesh(new THREE.BoxGeometry(0.295, 0.2, 0.002), screen);
        display.position.set(0, 0.1075, 0.0045);
        const logo = new THREE.Mesh(new THREE.CircleGeometry(0.014, 16), m('maclogo', '#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.5 }));
        logo.position.set(0, 0.1075, -0.0045);
        logo.rotation.y = Math.PI;
        lid.add(shell, display, logo);
        lid.traverse((c) => { if (c.isMesh) c.castShadow = true; });
        lid.position.set(px, ty + 0.1, pz - 0.105);
        lid.rotation.x = -0.28;
        g.add(lid);
        // tastiera esterna e mouse davanti, sulla stessa linea della sedia
        const kz = D / 2 - 0.12;
        bx(0.28, 0.008, 0.115, px, ty, kz, alu);
        bx(0.262, 0.004, 0.1, px, ty + 0.008, kz, white);
        if (W >= 0.9) {
          const mouse = ball(0.5, px + 0.24, ty + 0.011, kz, white, 0.058, 0.04, 0.11);
          mouse.name = 'mouse';
        }
      }
      break;
    }
    case 'table': {
      bx(W, 0.04, D, 0, 0.71, 0, wood, 0.018);
      bx(W - 0.12, 0.07, D - 0.12, 0, 0.64, 0, wood);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) leg(sx * (W / 2 - 0.06), sz * (D / 2 - 0.06), 0.64, 0.06);
      if (Math.min(W, D) >= 0.55) {
        const scale = Math.min(1, Math.min(W, D) / 0.9);
        const runner = m('table-cloth', theme.rug || theme.fabric, { roughness: 0.96 });
        const bowl = m('table-bowl', '#f2eee6', { roughness: 0.42 });
        const fruit = [m('table-fruit-red', '#bd5946'), m('table-fruit-gold', '#d6a644'), m('table-fruit-green', '#75924d')];
        bx(W * 0.6, 0.006, Math.min(D * 0.25, 0.22) * scale, 0, 0.75, 0, runner, 0.003);
        cy(0.065 * scale, 0.082 * scale, 0.025 * scale, 0, 0.756, 0, bowl, 20);
        for (const [i, x] of [-1, 0, 1].entries()) {
          const z = i === 1 ? 0.008 : -0.008;
          ball(0.5, x * 0.032 * scale, 0.756 + 0.049 * scale, z * scale, fruit[i], 0.052 * scale, 0.042 * scale, 0.062 * scale);
        }
      }
      break;
    }
    case 'table_round': {
      cy(W / 2, W / 2, 0.04, 0, 0.71, 0, wood, 40);
      if (style.legs === 'metal' || style.id === 'modern') {
        cy(0.04, 0.04, 0.68, 0, 0.03, 0, style.legs === 'metal' ? metalMat : wood, 16);
        cy(W * 0.3, W * 0.32, 0.03, 0, 0, 0, style.legs === 'metal' ? metalMat : wood, 32);
      } else {
        for (let i = 0; i < 3; i++) {
          const a = (i * 2 * Math.PI) / 3 + 0.5;
          leg(Math.cos(a) * W * 0.3, Math.sin(a) * W * 0.3, 0.7, 0.06);
        }
      }
      break;
    }
    case 'coffee_table': {
      bx(W, 0.04, D, 0, 0.36, 0, wood, 0.018);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) leg(sx * (W / 2 - 0.05), sz * (D / 2 - 0.05), 0.36);
      bx(W - 0.1, 0.02, D - 0.1, 0, 0.14, 0, wood);
      break;
    }
    case 'kitchen_counter': {
      // basi con ante e cassetti, piano di lavoro, lavello con miscelatore, piano cottura a 4 fuochi, cappa e paraschizzi
      const n = Math.max(2, Math.round(W / 0.6));
      const uw = W / n;
      bx(W, 0.1, D - 0.06, 0, 0, -0.01, darkLine);
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + uw * (i + 0.5);
        bx(uw - 0.012, 0.74, D - 0.02, x, 0.1, -0.01, M.cabinet);
        if (i % 3 === 1) {
          for (let k = 0; k < 3; k++) { bx(uw - 0.04, 0.2, 0.016, x, 0.14 + k * 0.23, D / 2 - 0.01 + 0.008, wood); pull(x, 0.28 + k * 0.23, D / 2 - 0.01 + 0.008, false); }
        } else {
          bx(uw - 0.04, 0.68, 0.016, x, 0.14, D / 2 - 0.01 + 0.008, wood);
          pull(x + (i % 2 ? uw / 2 - 0.06 : -uw / 2 + 0.06), 0.56, D / 2 - 0.01 + 0.008, true);
        }
      }
      bx(W + 0.01, 0.04, D + 0.03, 0, 0.84, 0.0, M.counter);
      bx(W, 0.45, 0.015, 0, 0.88, -D / 2 + 0.006, m('splash', '#e8e5de'));
      const sx = -W / 4;
      bx(0.5, 0.02, 0.38, sx, 0.87, 0.02, m('sinkbowl', '#c3c9d0', { metalness: 0.5, roughness: 0.3 }));
      cy(0.012, 0.012, 0.22, sx, 0.88, -D / 2 + 0.1, chrome, 10);
      bx(0.018, 0.018, 0.15, sx, 1.08, -D / 2 + 0.17, chrome);
      const hx = W / 4;
      bx(0.58, 0.008, 0.5, hx, 0.88, 0.0, m('hob', '#14171b', { roughness: 0.15 }));
      for (const [bx0, bz0] of [[-0.13, -0.11], [0.13, -0.11], [-0.13, 0.11], [0.13, 0.11]]) cy(0.07, 0.07, 0.012, hx + bx0, 0.888, bz0, m('burner', '#3a4048'), 18);
      bx(0.62, 0.08, 0.42, hx, 1.52, -D / 2 + 0.22, metalMat);
      bx(0.28, 0.62, 0.22, hx, 1.6, -D / 2 + 0.13, metalMat);
      break;
    }
    case 'kitchen_peninsula': {
      // isola: basi con ante, piano con sporgenza per gli sgabelli e due o tre sgabelli sul lato aperto (+z)
      const n = Math.max(2, Math.round(W / 0.6));
      const uw = W / n;
      bx(W, 0.1, D - 0.06, 0, 0, -0.04, darkLine);
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + uw * (i + 0.5);
        bx(uw - 0.012, 0.74, D - 0.14, x, 0.1, -0.07, M.cabinet);
        bx(uw - 0.04, 0.66, 0.016, x, 0.14, -D / 2 + 0.005, wood);
      }
      bx(W + 0.02, 0.04, D + 0.2, 0, 0.84, 0.1, M.counter);
      const stools = Math.max(2, Math.min(4, Math.floor(W / 0.6)));
      for (let k = 0; k < stools; k++) {
        const x = -W / 2 + (W * (k + 0.5)) / stools;
        cy(0.17, 0.17, 0.04, x, 0.66, D / 2 + 0.38, M.fabric, 20);
        cy(0.016, 0.016, 0.64, x, 0.02, D / 2 + 0.38, metalMat, 10);
        cy(0.15, 0.15, 0.012, x, 0.02, D / 2 + 0.38, metalMat, 20);
        cy(0.1, 0.1, 0.012, x, 0.3, D / 2 + 0.38, metalMat, 16);
      }
      break;
    }
    case 'shoe_cabinet': {
      bx(W, 0.94, D, 0, 0.06, 0, M.cabinet);
      for (const sx of [-1, 1]) cy(0.02, 0.02, 0.06, sx * (W / 2 - 0.05), 0, 0, darkLine, 8);
      const rows = 3;
      for (let i = 0; i < rows; i++) {
        bx(W - 0.04, 0.27, 0.014, 0, 0.1 + i * 0.3, D / 2 + 0.006, wood);
        pull(0, 0.3 + i * 0.3, D / 2 + 0.006, false);
      }
      bx(W + 0.02, 0.025, D + 0.02, 0, 1.0, 0, wood);
      break;
    }
    case 'console': {
      bx(W, 0.04, D, 0, 0.76, 0, wood);
      bx(W - 0.08, 0.1, D - 0.04, 0, 0.66, 0, wood);
      bx(W * 0.42, 0.08, 0.014, 0, 0.67, D / 2 - 0.015, M.cabinet);
      pull(0, 0.7, D / 2 - 0.015, false);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) leg(sx * (W / 2 - 0.05), sz * (D / 2 - 0.05), 0.66);
      break;
    }
    case 'floor_lamp': {
      cy(0.15, 0.17, 0.03, 0, 0, 0, metalMat, 24);
      cy(0.012, 0.012, 1.45, 0, 0.03, 0, metalMat, 10);
      const shade = M.lamp;
      if (style.id === 'industrial') {
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), metalMat);
        place(dome, 0, 1.46, 0);
        ball(0.05, 0, 1.45, 0, shade);
      } else if (style.id === 'classic' || style.id === 'luxury') {
        cy(0.13, 0.23, 0.3, 0, 1.3, 0, shade, 28);
        cy(0.235, 0.235, 0.012, 0, 1.3, 0, metalMat, 28);
        cy(0.135, 0.135, 0.012, 0, 1.6, 0, metalMat, 28);
      } else {
        cy(0.18, 0.18, 0.3, 0, 1.3, 0, shade, 28);
      }
      break;
    }
    case 'bath_column': {
      // colonna contenitore: nicchia aperta con asciugamani arrotolati, sotto ante con maniglie
      bx(W, 1.78, D, 0, 0.04, 0, M.cabinet);
      bx(W - 0.06, 0.55, 0.01, 0, 1.2, D / 2 - 0.02, m('niche', '#e9e5dc'));
      for (const y of [1.2, 1.55]) bx(W - 0.04, 0.02, D - 0.04, 0, y, 0, wood);
      for (const [sx, y, c] of [[-0.1, 1.23, '#f2f2f2'], [0.1, 1.23, '#cfd8dc'], [0, 1.57, '#f6efe4']]) {
        cy(0.045, 0.045, Math.min(W - 0.1, 0.3), sx * (W / 0.45) * 0.45, y, 0.0, m(`towel${c}`, c), 14).rotation.z = Math.PI / 2;
      }
      bx(W - 0.04, 0.55, 0.014, 0, 0.08, D / 2 + 0.006, wood);
      pull(W * 0.3, 0.5, D / 2 + 0.006, true);
      bx(W - 0.04, 0.4, 0.014, 0, 0.7, D / 2 + 0.006, wood);
      pull(W * 0.3, 0.9, D / 2 + 0.006, true);
      break;
    }
    case 'towel_radiator': {
      // scaldasalviette a scaletta: montanti laterali e barre orizzontali
      const rad = m('radiator', style.id === 'luxury' ? '#c4cad3' : '#f4f4f4', { metalness: style.id === 'luxury' ? 0.7 : 0.1, roughness: 0.3 });
      const L = Math.max(W, D);
      const alongX = W >= D;
      const put = (a, y, len, vertical) => {
        const t = cy(0.014, 0.014, len, 0, 0, 0, rad, 10);
        if (vertical) t.position.set(alongX ? a : 0, y + len / 2, alongX ? 0 : a);
        else { t.rotation.z = alongX ? Math.PI / 2 : 0; if (!alongX) t.rotation.x = Math.PI / 2; t.position.set(0, y, 0); }
      };
      for (const sx of [-1, 1]) put(sx * (L / 2 - 0.02), 0.1, 1.1, true);
      for (let i = 0; i < 9; i++) {
        const t = cy(0.013, 0.013, L - 0.04, 0, 0, 0, rad, 10);
        if (alongX) t.rotation.z = Math.PI / 2; else t.rotation.x = Math.PI / 2;
        t.position.set(0, 0.16 + i * 0.115, 0);
      }
      break;
    }
    case 'utility_sink': {
      // lavatoio: mobile sotto, vasca profonda in acciaio, miscelatore alto e paraschizzi
      bx(W, 0.5, D, 0, 0, 0, M.cabinet);
      bx(W - 0.02, 0.05, D, 0, 0.5, 0, M.metal);
      const bowl = m('steel', '#c9ced4', { metalness: 0.6, roughness: 0.3 });
      // vasca vuota: quattro pareti in acciaio e fondo scuro più in basso
      const bw = W - 0.1;
      const bd = D - 0.1;
      bx(bw, 0.02, bd, 0, 0.55, 0, m('deep', '#9aa2ab'));
      bx(bw, 0.28, 0.02, 0, 0.57, -bd / 2 + 0.01, bowl);
      bx(bw, 0.28, 0.02, 0, 0.57, bd / 2 - 0.01, bowl);
      bx(0.02, 0.28, bd - 0.04, -bw / 2 + 0.01, 0.57, 0, bowl);
      bx(0.02, 0.28, bd - 0.04, bw / 2 - 0.01, 0.57, 0, bowl);
      cy(0.014, 0.014, 0.28, 0, 0.85, -D / 2 + 0.05, chrome, 10);
      bx(0.02, 0.02, 0.18, 0, 1.12, -D / 2 + 0.13, chrome);
      bx(W, 0.2, 0.02, 0, 0.88, -D / 2 + 0.01, m('splash', '#dde2e6'));
      break;
    }
    case 'minibar': {
      bx(W, 0.85, D, 0, 0, 0, M.cabinet);
      bx(W - 0.06, 0.62, 0.012, 0, 0.12, D / 2 + 0.006, glass);
      const bott = m('bottle', '#456a4a', { transparent: true, opacity: 0.85 });
      for (let i = 0; i < 4; i++) cy(0.03, 0.03, 0.26, -W / 2 + 0.1 + i * ((W - 0.2) / 3), 0.3, 0, i % 2 ? bott : m('bottle2', '#8a5a2b'), 12);
      bx(W - 0.06, 0.012, D - 0.06, 0, 0.28, 0, chrome);
      pull(W / 2 - 0.05, 0.45, D / 2 + 0.006, true);
      bx(W + 0.02, 0.03, D + 0.02, 0, 0.85, 0, wood);
      break;
    }
    case 'workbench': {
      // banco da lavoro: piano spesso, telaio in ferro, ripiano, morsa e pannello portautensili
      bx(W, 0.06, D, 0, 0.84, 0, wood);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bx(0.05, 0.84, 0.05, sx * (W / 2 - 0.06), 0, sz * (D / 2 - 0.06), M.metal);
      bx(W - 0.1, 0.03, D - 0.1, 0, 0.2, 0, wood);
      bx(W, 0.7, 0.02, 0, 0.9, -D / 2 + 0.01, m('peg', '#c9b896'));
      bx(0.14, 0.1, 0.12, W / 2 - 0.2, 0.9, D / 2 - 0.12, M.metal);
      for (let i = 0; i < 4; i++) bx(0.03, 0.2 + 0.03 * (i % 2), 0.03, -W / 2 + 0.25 + i * 0.22, 1.3, -D / 2 + 0.04, i % 2 ? M.dark : M.metal);
      break;
    }
    case 'laundry_basket': {
      const r = Math.min(W, D) / 2;
      const wick = m('wicker', '#b99a68');
      cy(r, r * 0.86, 0.5, 0, 0, 0, wick, 24);
      cy(r * 0.9, r * 0.9, 0.02, 0, 0.5, 0, m('cloth', '#e8e1d6'), 24);
      ball(r * 0.8, 0, 0.5, 0, m('cloth', '#e8e1d6'), 1, 0.45, 1);
      for (const sx of [-1, 1]) bx(0.04, 0.04, 0.1, sx * (r - 0.01), 0.4, 0, wick);
      break;
    }
    case 'gazebo': {
      // gazebo in legno: piattaforma, quattro pali, travi e tetto a padiglione, panca sul fondo
      const roofMat = m('gazroof', '#8b6b4a', { side: 2 });
      bx(W, 0.08, D, 0, 0, 0, wood);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bx(0.12, 2.3, 0.12, sx * (W / 2 - 0.1), 0.08, sz * (D / 2 - 0.1), wood);
      bx(W - 0.1, 0.12, 0.1, 0, 2.28, -D / 2 + 0.1, wood);
      bx(W - 0.1, 0.12, 0.1, 0, 2.28, D / 2 - 0.1, wood);
      bx(0.1, 0.12, D - 0.1, -W / 2 + 0.1, 2.28, 0, wood);
      bx(0.1, 0.12, D - 0.1, W / 2 - 0.1, 2.28, 0, wood);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(W, D) * 0.78, 0.9, 4), roofMat);
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(W / Math.max(W, D), 1, D / Math.max(W, D));
      place(roof, 0, 2.4 + 0.45, 0);
      bx(W - 0.6, 0.42, 0.36, 0, 0.08, -D / 2 + 0.34, wood);
      bx(W - 0.6, 0.35, 0.05, 0, 0.5, -D / 2 + 0.2, wood);
      break;
    }
    case 'office_chair': {
      // base a cinque razze con rotelle, pistone, seduta, schienale inclinato e braccioli. Schienale verso -z
      const fabric = m('chairfab', '#3a4250');
      const star = 5;
      const r = Math.min(W, D) * 0.52;
      for (let i = 0; i < star; i++) {
        const a = (i * 2 * Math.PI) / star;
        const arm = bx(r, 0.025, 0.045, 0, 0.085, 0, darkLine);
        arm.position.set(Math.cos(a) * r / 2, 0.1, Math.sin(a) * r / 2);
        arm.rotation.y = -a;
        ball(0.028, Math.cos(a) * r, 0.04, Math.sin(a) * r, darkLine);
      }
      cy(0.03, 0.03, 0.3, 0, 0.1, 0, chrome, 12);
      bx(0.46, 0.08, 0.46, 0, 0.4, 0.02, fabric);
      const back = bx(0.42, 0.5, 0.07, 0, 0.55, -0.2, fabric);
      back.rotation.x = -0.12;
      bx(0.06, 0.2, 0.05, 0, 0.44, -0.17, darkLine);
      for (const sx of [-1, 1]) {
        bx(0.04, 0.2, 0.04, sx * 0.25, 0.47, 0.0, darkLine);
        bx(0.05, 0.03, 0.26, sx * 0.25, 0.66, 0.0, fabric);
      }
      break;
    }
    default:
      return null;
  }
  g.position.set(it.x + it.w / 2, 0, it.y + it.h / 2);
  g.rotation.y = YAW[it.facing || 'S'] - (((it.rot || 0) % 360) * Math.PI) / 180;   // rotazione libera (gradi, in senso orario visto dall'alto) sopra il verso
  return g;
}
