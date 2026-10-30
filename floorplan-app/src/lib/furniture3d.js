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
};

const YAW = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };
const r2 = (v) => Math.round(v * 100) / 100;

/* Nome del blocco per tipo e misure: LETTO_160X200. */
export const objectKey = (type, w, d) => `${OBJECT_NAMES[type] || type.toUpperCase()}_${Math.round(w * 100)}X${Math.round(d * 100)}`;

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
export function buildObject(THREE, it, M, mat) {
  if (!hasObject(it.type)) return null;
  const [W, D] = localSize(it);
  const g = new THREE.Group();
  g.name = OBJECT_NAMES[it.type];
  g.userData.furniture = { type: it.type, w: r2(W), d: r2(D), key: objectKey(it.type, W, D) };
  const own = {};   // materiali propri dell'oggetto, creati una volta sola
  const m = (key, color, extra) => (own[key] ||= mat(color, extra));

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

  switch (it.type) {
    case 'bed': {
      // base con gambe, materasso, piumone che scende ai lati, cuscini e testiera
      const baseTop = 0.34;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bx(0.07, 0.12, 0.07, sx * (W / 2 - 0.06), 0, sz * (D / 2 - 0.06), wood);
      bx(W, 0.22, D - 0.04, 0, 0.12, 0.02, wood);
      bx(W - 0.06, 0.2, D - 0.12, 0, baseTop, 0.02, white);
      const len = (D - 0.12) * 0.64;
      bx(W + 0.02, 0.09, len, 0, baseTop + 0.15, D / 2 - 0.06 - len / 2, M.duvet);
      bx(W + 0.02, 0.22, 0.05, 0, baseTop - 0.05, D / 2 - 0.08, M.duvet);   // lembo davanti
      const pillows = W > 1.2 ? 2 : 1;
      for (let i = 0; i < pillows; i++) {
        const x = pillows === 2 ? (i ? 1 : -1) * W / 4 : 0;
        bx(Math.min(0.55, (W - 0.1) / pillows - 0.06), 0.13, 0.36, x, baseTop + 0.2, -D / 2 + 0.34, white);
      }
      bx(W, 0.95, 0.07, 0, 0.1, -D / 2 + 0.035, wood);
      bx(W + 0.06, 0.05, 0.1, 0, 1.05, -D / 2 + 0.05, wood);
      break;
    }
    case 'wardrobe': {
      // corpo su zoccolo, ante con fessure e maniglie, cornice in alto
      const H = 2.2;
      bx(W, 0.06, D - 0.04, 0, 0, -0.01, darkLine);
      bx(W, H - 0.11, D, 0, 0.06, 0, M.cabinet);
      bx(W + 0.02, 0.05, D + 0.02, 0, H - 0.05, 0, M.cabinet);
      const doors = Math.max(2, Math.round(Math.max(W, D) / 0.6));
      // le ante stanno sul lato lungo che guarda in avanti (+z); per un armadio più profondo che largo le ante sono sul lato corto
      const front = W >= D;
      const span = front ? W : D;
      for (let i = 1; i < doors; i++) {
        const o = -span / 2 + (span * i) / doors;
        if (front) bx(0.008, H - 0.16, 0.012, o, 0.08, D / 2 + 0.004, darkLine);
        else bx(0.012, H - 0.16, 0.008, W / 2 + 0.004, 0.08, o, darkLine);
      }
      for (let i = 0; i < doors; i += 2) {
        const o = -span / 2 + (span * (i + 1)) / doors;
        for (const k of [-0.035, 0.035]) {
          if (front) bx(0.015, 0.2, 0.02, o + k, 0.95, D / 2 + 0.012, chrome);
          else bx(0.02, 0.2, 0.015, W / 2 + 0.012, 0.95, o + k, chrome);
        }
      }
      break;
    }
    case 'dresser': {
      // cassettiera: quattro gambe, corpo, cassetti con pomelli, piano sporgente
      const rows = W > 0.7 ? 3 : 4;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) bx(0.05, 0.12, 0.05, sx * (W / 2 - 0.05), 0, sz * (D / 2 - 0.05), wood);
      bx(W, 0.72, D, 0, 0.12, 0, M.cabinet);
      const dh = 0.72 / rows;
      for (let i = 0; i < rows; i++) {
        bx(W - 0.05, dh - 0.02, 0.015, 0, 0.13 + i * dh, D / 2 + 0.006, wood);
        cy(0.012, 0.012, 0.03, 0, 0.12 + i * dh + dh / 2, D / 2 + 0.03, chrome, 12).rotation.x = Math.PI / 2;
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
