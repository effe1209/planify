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
  const bx = (w, h, d, x, y, z, mt) => place(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mt), x, y + h / 2, z);
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
      bx(W + 0.02, 0.09, len, 0, baseTop + 0.15, D / 2 - 0.06 - len / 2, M.duvet);
      bx(W + 0.02, 0.22, 0.05, 0, baseTop - 0.05, D / 2 - 0.08, M.duvet);   // lembo davanti
      const pillows = W > 1.2 ? 2 : 1;
      for (let i = 0; i < pillows; i++) {
        const x = pillows === 2 ? (i ? 1 : -1) * W / 4 : 0;
        bx(Math.min(0.55, (W - 0.1) / pillows - 0.06), 0.13, 0.36, x, baseTop + 0.2, -D / 2 + 0.34, white);
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
        bx(W, low ? 0.55 : 0.95, 0.07, 0, low ? 0.06 : 0.1, hz + 0.035, wood);
        bx(W + 0.06, 0.05, 0.1, 0, low ? 0.61 : 1.05, hz + 0.05, wood);
      }
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
      for (let i = 0; i <= n; i++) {
        const y = (i * (H - 0.03)) / n;
        bx(W - 0.06, 0.03, D - 0.02, 0, y, 0.0, M.cabinet);
        if (i > 0 && i < n) {
          let x = -W / 2 + 0.06;
          for (let j = 0; x < W / 2 - 0.1 && j < 14; j++) {
            const bw = 0.025 + 0.012 * ((i + j) % 3);
            bx(bw, 0.22 + 0.03 * ((i * 3 + j) % 4), D - 0.12, x + bw / 2, y + 0.03 - (H - 0.03) / n + (H - 0.03) / n, 0, m(`b${(i + j) % 5}`, cols[(i + j) % 5]));
            x += bw + 0.004;
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
    case 'shower':
    case 'shower_round':
    case 'shower_walkin': {
      // piatto, pannelli di vetro sui lati aperti e soffione sul lato muro
      bx(W, 0.06, D, 0, 0, 0, ceramic);
      bx(W - 0.14, 0.012, D - 0.14, 0, 0.062, 0, m('drain', '#dde3ea'));
      cy(0.03, 0.03, 0.012, 0, 0.07, 0, chrome, 12);
      bx(0.012, 2.0, D, W / 2 - 0.006, 0.06, 0, glass);
      if (it.type !== 'shower_walkin') bx(W, 2.0, 0.012, 0, 0.06, D / 2 - 0.006, glass);
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
        bx(sw - 0.012, 0.15, mainD - backT - 0.02, x, seatY, zb + backT + (mainD - backT) / 2, M.fabric);
        const bk = bx(sw - 0.012, lowSofa ? 0.32 : 0.42, backT - 0.04, x, seatY + 0.1, zb + backT / 2 + 0.02, M.fabric);
        bk.rotation.x = -0.1;
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
        for (const sx of [-1, 1]) bx(0.34, 0.34, 0.1, sx * (W / 2 - arm - 0.28), seatY + 0.16, zb + backT + 0.1, pil).rotation.y = sx * 0.3;
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
      for (let i = 0; i < 7; i++) {
        const a = (i * 2 * Math.PI) / 7;
        const rr = r * (0.25 + 0.2 * (i % 2));
        const h = 0.55 + 0.12 * (i % 3);
        const stem = cy(0.01, 0.015, h, Math.cos(a) * rr * 0.4, 0.34, Math.sin(a) * rr * 0.4, dark, 6);
        stem.rotation.z = Math.cos(a) * 0.25;
        stem.rotation.x = -Math.sin(a) * 0.25;
        ball(0.14 + 0.03 * (i % 3), Math.cos(a) * rr, 0.34 + h, Math.sin(a) * rr, i % 2 ? leaf : dark, 1.3, 0.45, 1);
      }
      ball(0.17, 0, 0.98, 0, leaf, 1.2, 0.8, 1.2);
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
      // aspirapolvere a traino: corpo cilindrico su ruote, tubo flessibile e bocchetta
      const body = m('vacbody', '#cf3a2f', { roughness: 0.4 });
      const r = Math.min(W, D) * 0.34;
      cy(r, r, 0.22, 0, 0.08, 0.02, body, 24);
      cy(r * 0.9, r * 0.9, 0.04, 0, 0.3, 0.02, M.dark, 24);
      for (const sx of [-1, 1]) wheel(0.045, 0.03, sx * (r + 0.01), 0.045, 0.06, M.dark);
      const hose = cy(0.018, 0.018, 0.5, 0, 0.3, -r * 0.3, M.dark, 10);
      hose.rotation.x = 0.5;
      cy(0.012, 0.012, 0.28, 0, 0.55, -r - 0.05, chrome, 8).rotation.x = 0.2;
      bx(0.22, 0.02, 0.07, 0, 0.0, -D / 2 + 0.04, M.dark);
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
      break;
    }
    case 'desk': {
      // piano; pannelli o gambe dello stile, cassettiera a lato e schienale basso
      bx(W, 0.04, D, 0, 0.71, 0, wood);
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
      break;
    }
    case 'table': {
      bx(W, 0.04, D, 0, 0.71, 0, wood);
      bx(W - 0.12, 0.07, D - 0.12, 0, 0.64, 0, wood);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) leg(sx * (W / 2 - 0.06), sz * (D / 2 - 0.06), 0.64, 0.06);
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
      bx(W, 0.04, D, 0, 0.36, 0, wood);
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
  g.rotation.y = YAW[it.facing || 'S'];
  return g;
}
