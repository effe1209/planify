/*
 * Stili d'interni nel 3D: ogni stile ha un «kit» di materiali per muri interni ed esterni, zoccolo, cornici, pavimenti,
 * tetto, infissi, porte e maniglie, più i dettagli architettonici (cornicione, battiscopa). Le texture si disegnano al volo
 * su un canvas (nessun file), 1 metro per ripetizione, e si tengono in cache: scene e rifacimenti riusano le stesse.
 * Senza `document` (prove con Node) le texture mancano e restano i colori pieni.
 */

export const STYLE_KITS = {
  modern: {
    wallIn: { color: '#f4f2ee', tex: 'stucco', tone: '#e5e1da' },
    facade: { color: '#d8dbde', tex: 'stucco', tone: '#c3c7cb' },
    plinth: '#4b5058', trim: '#f2f2f2', cornice: false, baseboard: { h: 0.07, color: '#f7f7f5' },
    roof: { kind: 'slate', color: '#454b52', tone: '#363b41' },
    floor: { kind: 'plank', a: '#dcc7a4', b: '#cdb48c', joint: '#a98f68' },
    wet: { kind: 'tile', a: '#e9edf0', b: '#dfe4e8', joint: '#b8c0c8' },
    frame: '#3a3f46', door: '#f1efec', handle: '#c4cad3', rail: '#3a3f46', iron: '#2f353d', leg: 'wood',
  },
  classic: {
    wallIn: { color: '#f2e9d8', tex: 'stucco', tone: '#e4d6bb' },
    facade: { color: '#e3c690', tex: 'stucco', tone: '#cfae73' },
    plinth: '#b7a589', trim: '#fbf6ea', cornice: true, baseboard: { h: 0.14, color: '#fbf6ea' },
    roof: { kind: 'tile', color: '#a5503a', tone: '#8a3f2d' },
    floor: { kind: 'herringbone', a: '#bb8d5a', b: '#a57a49', joint: '#7a5630' },
    wet: { kind: 'tile', a: '#eae2d2', b: '#ddd3bf', joint: '#b7ab93' },
    frame: '#fbf6ea', door: '#7a5a3b', handle: '#b8914a', rail: '#2c2a28', iron: '#2a2826', leg: 'turned',
  },
  nordic: {
    wallIn: { color: '#fbfaf7', tex: 'stucco', tone: '#eeece6' },
    facade: { color: '#f3f3ef', tex: 'cladding', tone: '#dedcd4' },
    plinth: '#cdb892', trim: '#ffffff', cornice: false, baseboard: { h: 0.08, color: '#ffffff' },
    roof: { kind: 'metal', color: '#6c7379', tone: '#585f65' },
    floor: { kind: 'plank', a: '#eddcc0', b: '#e3d0b0', joint: '#c4ac84' },
    wet: { kind: 'tile', a: '#f0f2f2', b: '#e6e9ea', joint: '#c3cacc' },
    frame: '#ffffff', door: '#f4f2ee', handle: '#6b7280', rail: '#f2f2f2', iron: '#3c4147', leg: 'wood',
  },
  industrial: {
    wallIn: { color: '#d3d0ca', tex: 'concrete', tone: '#b9b6b0' },
    facade: { color: '#9b5240', tex: 'brick', tone: '#cfc6b8' },
    plinth: '#2f3438', trim: '#2b3036', cornice: false, baseboard: { h: 0.1, color: '#2b3036' },
    roof: { kind: 'metal', color: '#33383d', tone: '#262a2e' },
    floor: { kind: 'concrete', a: '#a1a5a8', b: '#8e9296', joint: '#6e7276' },
    wet: { kind: 'tile', a: '#cdd1d4', b: '#c2c7ca', joint: '#7b8186' },
    frame: '#1d2126', door: '#2b3036', handle: '#15181b', rail: '#1d2126', iron: '#1d2126', leg: 'metal',
  },
  japandi: {
    wallIn: { color: '#efe8da', tex: 'stucco', tone: '#e1d8c5' },
    facade: { color: '#d9ccb4', tex: 'stucco', tone: '#c8b898' },
    plinth: '#5a4632', trim: '#6b5339', cornice: false, baseboard: { h: 0.05, color: '#6b5339' },
    roof: { kind: 'slate', color: '#4a4137', tone: '#3b332b' },
    floor: { kind: 'plank', a: '#dcc39b', b: '#cfb388', joint: '#a98c62' },
    wet: { kind: 'tile', a: '#e6e2d8', b: '#dad5c8', joint: '#b9b2a2' },
    frame: '#3d3a33', door: '#a98b62', handle: '#2d2a25', rail: '#3d3a33', iron: '#2d2a25', leg: 'wood',
  },
  luxury: {
    wallIn: { color: '#f6f1ea', tex: 'stucco', tone: '#e8e0d3' },
    facade: { color: '#ece4d6', tex: 'travertine', tone: '#d3c6ae' },
    plinth: '#c7b79d', trim: '#d9c08a', cornice: true, baseboard: { h: 0.16, color: '#fbf8f2' },
    roof: { kind: 'tile', color: '#7c4a3a', tone: '#653a2d' },
    floor: { kind: 'herringbone', a: '#dccbab', b: '#cbb98f', joint: '#a8946a' },
    wet: { kind: 'marble', a: '#f3f1ee', b: '#b9b4ac', joint: '#d6d1c8' },
    frame: '#2a2a2a', door: '#efe7da', handle: '#b08d57', rail: '#b08d57', iron: '#2a2a2a', leg: 'metal',
  },
};

export const styleKit = (id) => STYLE_KITS[id] || STYLE_KITS.modern;

/* ── texture ───────────────────────────────────────────────────────────── */
const cache = new Map();

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const css = ([r, g, b], a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
const mix = (a, b, t) => hex(a).map((v, i) => v + (hex(b)[i] - v) * t);
const lcg = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

function paint(kind, a, b, c) {
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const rnd = lcg(kind.length * 977 + a.charCodeAt(1) * 31 + b.charCodeAt(2));
  g.fillStyle = a;
  g.fillRect(0, 0, N, N);
  const speckle = (n, dark, light, size = 1.4, alpha = 0.18) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = css(rnd() < 0.5 ? hex(dark) : hex(light), alpha * (0.4 + rnd()));
      g.fillRect(rnd() * N, rnd() * N, size * (0.5 + rnd()), size * (0.5 + rnd()));
    }
  };
  switch (kind) {
    case 'stucco':
      speckle(1800, b, '#ffffff', 1.5, 0.14);
      break;
    case 'concrete':
      for (let i = 0; i < 26; i++) {
        const x = rnd() * N, y = rnd() * N, r = 30 + rnd() * 70;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, css(rnd() < 0.5 ? hex(b) : hex('#ffffff'), 0.12));
        gr.addColorStop(1, css(hex(a), 0));
        g.fillStyle = gr;
        g.fillRect(0, 0, N, N);
      }
      speckle(1400, b, '#ffffff', 1.3, 0.16);
      g.strokeStyle = css(hex(c || b), 0.35);
      g.lineWidth = 1.5;
      g.strokeRect(0, 0, N, N);   // giunto di getto ogni metro
      break;
    case 'plank': {
      const w = 36;   // 14 cm
      for (let i = 0; i * w < N; i++) {
        g.fillStyle = css(mix(a, b, rnd()));
        g.fillRect(i * w, 0, w, N);
        const y = rnd() * N;
        g.fillStyle = css(hex(c), 0.55);
        g.fillRect(i * w, y, w, 1.5);
        for (let k = 0; k < 6; k++) {   // venature
          g.fillStyle = css(hex(c), 0.08);
          g.fillRect(i * w + rnd() * w, rnd() * N, 1, 30 + rnd() * 60);
        }
        g.fillStyle = css(hex(c), 0.7);
        g.fillRect(i * w, 0, 1.2, N);
      }
      break;
    }
    case 'herringbone': {
      const S = 64;
      for (let r = 0; r * S < N + S; r++) {
        for (let q = 0; q * S < N + S; q++) {
          g.save();
          g.beginPath();
          g.rect(q * S, r * S, S, S);
          g.clip();
          g.translate(q * S + S / 2, r * S + S / 2);
          g.rotate(((q + r) % 2 ? -1 : 1) * Math.PI / 4);
          for (let k = -5; k <= 5; k++) {
            g.fillStyle = css(mix(a, b, rnd()));
            g.fillRect(-S, k * 16 - 8, 2 * S, 15);
            g.fillStyle = css(hex(c), 0.7);
            g.fillRect(-S, k * 16 - 9, 2 * S, 1.2);
          }
          g.restore();
        }
      }
      break;
    }
    case 'tile': {
      const T = 77;   // 30 cm
      for (let r = 0; r * T < N + T; r++) {
        for (let q = 0; q * T < N + T; q++) {
          g.fillStyle = css(mix(a, b, rnd() * 0.8));
          g.fillRect(q * T, r * T, T, T);
        }
      }
      g.strokeStyle = css(hex(c), 0.9);
      g.lineWidth = 2;
      for (let i = 0; i * T < N + T; i++) {
        g.beginPath(); g.moveTo(i * T, 0); g.lineTo(i * T, N); g.stroke();
        g.beginPath(); g.moveTo(0, i * T); g.lineTo(N, i * T); g.stroke();
      }
      break;
    }
    case 'marble': {
      speckle(500, b, '#ffffff', 2.2, 0.06);
      for (let i = 0; i < 7; i++) {
        g.strokeStyle = css(hex(b), 0.16 + rnd() * 0.18);
        g.lineWidth = 0.8 + rnd() * 1.6;
        g.beginPath();
        let x = rnd() * N, y = 0;
        g.moveTo(x, y);
        while (y < N) { x += (rnd() - 0.5) * 60; y += 30 + rnd() * 30; g.lineTo(x, y); }
        g.stroke();
      }
      g.strokeStyle = css(hex(c), 0.8);
      g.lineWidth = 2;
      g.strokeRect(0, 0, N, N);
      break;
    }
    case 'brick': {
      const bw = 64, bh = 16;
      g.fillStyle = css(hex(b));   // malta
      g.fillRect(0, 0, N, N);
      for (let r = 0; r * bh < N; r++) {
        for (let q = -1; q * bw < N; q++) {
          g.fillStyle = css(mix(a, '#2a1a14', rnd() * 0.28));
          g.fillRect(q * bw + (r % 2 ? bw / 2 : 0) + 1.5, r * bh + 1.5, bw - 3, bh - 3);
        }
      }
      speckle(500, '#2a1a14', '#ffffff', 1.4, 0.1);
      break;
    }
    case 'cladding': {
      const w = 32;   // listelli da 12,5 cm
      for (let i = 0; i * w < N; i++) {
        g.fillStyle = css(mix(a, b, rnd() * 0.6));
        g.fillRect(i * w, 0, w, N);
        g.fillStyle = css(hex(b), 0.9);
        g.fillRect(i * w, 0, 1.6, N);
        for (let k = 0; k < 5; k++) {
          g.fillStyle = css(hex(b), 0.1);
          g.fillRect(i * w + 4 + rnd() * (w - 8), rnd() * N, 1, 40 + rnd() * 80);
        }
      }
      break;
    }
    case 'travertine': {
      for (let i = 0; i < 60; i++) {
        g.fillStyle = css(rnd() < 0.5 ? hex(b) : hex('#ffffff'), 0.08 + rnd() * 0.08);
        g.fillRect(0, rnd() * N, N, 1 + rnd() * 4);
      }
      for (let i = 0; i < 160; i++) {
        g.fillStyle = css(hex(b), 0.25 + rnd() * 0.25);
        g.beginPath();
        g.ellipse(rnd() * N, rnd() * N, 1 + rnd() * 5, 0.6 + rnd() * 1.2, 0, 0, 7);
        g.fill();
      }
      g.strokeStyle = css(hex(b), 0.5);
      g.lineWidth = 1.5;
      for (const y of [0, N / 2]) { g.beginPath(); g.moveTo(0, y); g.lineTo(N, y); g.stroke(); }
      break;
    }
    case 'tileroof': {   // coppi: file sfalsate
      const rh = 16;
      for (let r = 0; r * rh < N; r++) {
        for (let q = -1; q * 32 < N; q++) {
          g.fillStyle = css(mix(a, b, rnd() * 0.9));
          g.fillRect(q * 32 + (r % 2 ? 16 : 0), r * rh, 32, rh);
          g.fillStyle = css(hex(b), 0.7);
          g.fillRect(q * 32 + (r % 2 ? 16 : 0), r * rh + rh - 2.5, 32, 2.5);
          g.fillRect(q * 32 + (r % 2 ? 16 : 0), r * rh, 1.5, rh);
        }
      }
      break;
    }
    case 'slateroof': {
      const rh = 22;
      for (let r = 0; r * rh < N; r++) {
        for (let q = -1; q * 36 < N; q++) {
          g.fillStyle = css(mix(a, b, rnd() * 0.8));
          g.fillRect(q * 36 + (r % 2 ? 18 : 0), r * rh, 36, rh);
          g.fillStyle = css(hex(b), 0.6);
          g.fillRect(q * 36 + (r % 2 ? 18 : 0), r * rh + rh - 2, 36, 2);
        }
      }
      break;
    }
    case 'metalroof': {   // lamiera aggraffata
      for (let i = 0; i * 42 < N + 42; i++) {
        g.fillStyle = css(mix(a, b, rnd() * 0.25));
        g.fillRect(i * 42, 0, 42, N);
        g.fillStyle = css(hex(b), 0.9);
        g.fillRect(i * 42, 0, 3, N);
        g.fillStyle = css(hex('#ffffff'), 0.14);
        g.fillRect(i * 42 + 3, 0, 1.5, N);
      }
      break;
    }
    default:
      break;
  }
  return cv;
}

/* Texture ripetibile di `kind` (1 m per ripetizione), o null se non c'è un canvas. */
export function texture(THREE, kind, a, b, c) {
  if (typeof document === 'undefined' || !kind) return null;
  const key = `${kind}|${a}|${b}|${c || ''}`;
  if (!cache.has(key)) {
    const t = new THREE.CanvasTexture(paint(kind, a, b || a, c));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    cache.set(key, t);
  }
  return cache.get(key);
}

/* Scala le UV di una BoxGeometry in metri: una texture per metro su ogni faccia (px/nx: d·h, py/ny: w·d, pz/nz: w·h). */
export function uvMeters(geo, w, h, d) {
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
  }
  uv.needsUpdate = true;
}

/* Materiali di un kit. `mat(color, extra)` crea un MeshStandardMaterial. */
export function kitMaterials(THREE, mat, kit) {
  const tex = (spec, extra = {}) => {
    const map = texture(THREE, spec.tex, spec.color, spec.tone);
    return mat(map ? '#ffffff' : spec.color, { ...(map && { map }), ...extra });   // con la texture il colore è già nell'immagine
  };
  const roofTex = { slate: 'slateroof', tile: 'tileroof', metal: 'metalroof' }[kit.roof.kind];
  const floorTex = (f) => {
    const map = texture(THREE, f.kind, f.a, f.b, f.joint);
    return mat(map ? '#ffffff' : f.a, { ...(map && { map }), roughness: f.kind === 'marble' ? 0.25 : f.kind === 'concrete' ? 0.95 : 0.7 });
  };
  const roofMap = texture(THREE, roofTex, kit.roof.color, kit.roof.tone);
  return {
    wallIn: tex(kit.wallIn),
    facade: tex(kit.facade),
    plinth: mat(kit.plinth),
    trim: mat(kit.trim),
    baseboard: mat(kit.baseboard.color),
    floor: floorTex(kit.floor),
    wet: floorTex(kit.wet),
    roof: mat(roofMap ? '#ffffff' : kit.roof.color, { ...(roofMap && { map: roofMap }), side: THREE.DoubleSide, roughness: kit.roof.kind === 'metal' ? 0.45 : 0.85 }),
    frame: mat(kit.frame, { roughness: 0.5 }),
    door: mat(kit.door, { roughness: 0.6 }),
    handle: mat(kit.handle, { metalness: 0.7, roughness: 0.3 }),
    rail: mat(kit.rail, { metalness: 0.4, roughness: 0.45 }),
    iron: mat(kit.iron, { metalness: 0.5, roughness: 0.4 }),
  };
}
