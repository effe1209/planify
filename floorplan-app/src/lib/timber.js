/*
 * Struttura in legno (materials.structure = 'wood'): pilastri d'angolo ai bordi di ogni ala, travi a vista nei soffitti dei locali
 * grandi e portico davanti al portoncino con deck, due pilastri, trave e tettoia. I travetti sotto la gronda stanno in buildRoof
 * (lib/scene3d.js, rafterTails). Misure in metri, coordinate della pianta (x, quota, z = y della pianta).
 */
import { roofWings } from './roof';

const WALL_T = 0.2;
const BEAM_ROOMS = new Set(['living', 'living_kitchen', 'open', 'kitchen', 'dining', 'bed', 'master', 'study']);

const woodMat = (THREE, color, rough = 0.75) => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough });
  m.userData.pbr = 'plank';          // nel render diventa legno vero (lib/pbr.js)
  m.userData.pbrTint = color;
  return m;
};

function add(THREE, group, mat, [w, h, d], [x, y, z], layer, rot = null) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  if (rot) m.rotation.set(...rot);
  m.castShadow = m.receiveShadow = true;
  m.userData.layer = layer;
  group.add(m);
  return m;
}

/* I pilastri ai vertici esterni delle ali (non quelli a metà facciata, dove due ali si toccano). */
function cornerPosts(THREE, group, mat, plan, y0, H) {
  const wings = roofWings(plan);
  const e = 0.02;
  const inside = (x, z, w) => x > w.x0 - e && x < w.x1 + e && z > w.y0 - e && z < w.y1 + e;
  const corner = (x, z, w) => (Math.abs(x - w.x0) < e || Math.abs(x - w.x1) < e) && (Math.abs(z - w.y0) < e || Math.abs(z - w.y1) < e);
  const seen = new Set();
  for (const w of wings) {
    for (const [x, z] of [[w.x0, w.y0], [w.x1, w.y0], [w.x0, w.y1], [w.x1, w.y1]]) {
      const key = `${x.toFixed(2)}|${z.toFixed(2)}`;
      if (seen.has(key)) continue;
      // il punto sta dentro o sul bordo di un'altra ala e non ne è un vertice: è a metà facciata
      if (wings.some((o) => o !== w && inside(x, z, o) && !corner(x, z, o))) continue;
      seen.add(key);
      add(THREE, group, mat, [0.24, H, 0.24], [x, y0, z], 'STRUTTURA');
    }
  }
}

/* Travi a vista: una ogni ~1,2 m lungo il lato maggiore del locale, appena sotto il soffitto, dentro i muri interni (non li attraversano).
   Layer TRAVI: nella pianta 3D dall'alto si tolgono con il tetto. I locali sotto il soppalco restano senza (il suo solaio è già il soffitto). */
function ceilingBeams(THREE, group, mat, plan, y0, H) {
  const mz = plan.mezzanine;
  const half = (plan.wallThickness || 10) / (plan.scale || 50) / 2;   // metà spessore dei muri
  const bh = 0.2;
  for (const r of plan.rooms) {
    if (r.kind === 'garden' || r.poly || !BEAM_ROOMS.has(r.kind) || r.w * r.h < 8) continue;
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    if (mz && cx > mz.x - 0.01 && cx < mz.x + mz.w + 0.01 && cy > mz.y - 0.01 && cy < mz.y + mz.h + 0.01) continue;
    const alongX = r.w >= r.h;                    // le travi attraversano il lato corto
    const long = alongX ? r.w : r.h;
    const span = (alongX ? r.h : r.w) - 2 * half - 0.03;
    const n = Math.max(2, Math.round(long / 1.2) - 1);
    for (let i = 1; i <= n; i++) {
      const t = (long * i) / (n + 1);
      const y = y0 + H - bh - 0.03;
      if (alongX) add(THREE, group, mat, [0.16, bh, span], [r.x + t, y, cy], 'TRAVI');
      else add(THREE, group, mat, [span, bh, 0.16], [cx, y, r.y + t], 'TRAVI');
    }
  }
}

/* Portico davanti al portoncino: deck, due pilastri, trave e tettoia a una falda. */
function porch(THREE, group, wood, roofColor, plan, y0) {
  const door = plan.doors.find((d) => d.entrance && !d.kind);
  if (!door || !plan.rooms.some((r) => r.kind !== 'garden')) return;
  const { width: W, length: L } = plan.dimensions;
  const vertical = door.rot === 90;
  const side = vertical ? (door.x < W / 2 ? 'W' : 'E') : (door.y < L / 2 ? 'N' : 'S');
  const wallLen = vertical ? L : W;
  // il portico sta dentro la facciata (e quindi dentro il giardino, che parte dagli spigoli della casa): si restringe e si sposta verso l'interno se il portoncino è vicino all'angolo
  const pw = Math.max(Math.min(Math.max(2.8, door.w + 1.6), wallLen - 0.3), Math.min(door.w + 0.6, wallLen - 0.3));
  const margin = 0.15;
  const along = Math.max(pw / 2 + margin, Math.min(wallLen - pw / 2 - margin, vertical ? door.y + door.w / 2 : door.x + door.w / 2));
  const D = 1.8;
  const g = new THREE.Group();                    // locale: fuori = +z, lungo il muro = x
  const post = woodMat(THREE, '#6b4a2e');
  const deck = woodMat(THREE, '#9a7650', 0.85);
  const H = 2.55;
  add(THREE, g, deck, [pw, 0.1, D], [0, 0, D / 2], 'STRUTTURA');
  for (const sx of [-1, 1]) add(THREE, g, post, [0.16, H, 0.16], [sx * (pw / 2 - 0.12), 0.1, D - 0.14], 'STRUTTURA');
  add(THREE, g, post, [pw, 0.2, 0.2], [0, 0.1 + H, D - 0.14], 'STRUTTURA');
  // tettoia: scende dal muro (2,95 m) verso l'esterno
  const rise = 0.4;
  const len = Math.hypot(D + 0.3, rise);
  const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.85 });
  const slab = add(THREE, g, roofMat, [pw + 0.3, 0.08, len], [0, 0, 0], 'TETTO');
  slab.position.set(0, 0.1 + H + 0.2 + rise / 2, (D + 0.15) / 2 - 0.1);
  slab.rotation.x = Math.atan2(rise, D + 0.3);
  for (const sx of [-1, 1]) {                      // due saette
    add(THREE, g, post, [0.09, 0.09, 0.9], [sx * (pw / 2 - 0.12), 0.1 + H - 0.5, D - 0.6], 'STRUTTURA', [Math.PI / 4, 0, 0]);
  }
  const spot = { S: [along, door.y + WALL_T / 2, 0], N: [along, door.y - WALL_T / 2, Math.PI], E: [door.x + WALL_T / 2, along, Math.PI / 2], W: [door.x - WALL_T / 2, along, -Math.PI / 2] }[side];
  const [px, pz, ry] = vertical ? [spot[0], spot[1], spot[2]] : [spot[0], spot[1], spot[2]];
  g.position.set(px, y0, pz);
  g.rotation.y = ry;
  g.name = 'PORTICO';
  group.add(g);
}

/*
 * Tutta la struttura in legno: `floors` = [{ plan, y }] (y = quota del piano). Il portico va sul piano più basso con un portoncino
 * al livello della strada. Ritorna un gruppo (vuoto se non c'è niente da fare).
 */
export function buildTimber(THREE, floors, { roofColor = '#a98558', beams = true } = {}) {
  const g = new THREE.Group();
  g.name = 'STRUTTURA_LEGNO';
  const beam = woodMat(THREE, '#8a6540');
  const post = woodMat(THREE, '#6b4a2e');
  for (const f of floors) {
    const H = f.plan.height || 2.7;
    cornerPosts(THREE, g, post, f.plan, f.y, H);
    if (beams) ceilingBeams(THREE, g, beam, f.plan, f.y, H);
  }
  const ground = [...floors].sort((a, b) => a.y - b.y).find((f) => f.plan.doors?.some((d) => d.entrance && !d.kind));
  if (ground) porch(THREE, g, post, roofColor, ground.plan, ground.y);
  return g;
}

/* Travetti sotto la gronda di un'ala a due falde: uno ogni ~70 cm sui lati lunghi, inclinati come la falda. Gruppo da aggiungere al tetto. */
export function rafterTails(THREE, wings, { slope, overhang }) {
  const g = new THREE.Group();
  const mat = woodMat(THREE, '#6b4a2e');
  const a = (slope * Math.PI) / 180;
  const len = overhang / Math.cos(a);
  const drop = overhang * Math.tan(a);
  for (const w of wings) {
    const alongX = w.x1 - w.x0 >= w.y1 - w.y0;
    const [s0, s1] = alongX ? [w.x0, w.x1] : [w.y0, w.y1];
    const n = Math.max(2, Math.round((s1 - s0) / 0.7));
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n;
      for (const side of [-1, 1]) {
        const base = alongX ? (side < 0 ? w.y0 : w.y1) : (side < 0 ? w.x0 : w.x1);
        const out = base + side * overhang / 2;
        const m = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.09 : len, 0.14, alongX ? len : 0.09), mat);
        m.position.set(alongX ? s : out, -drop / 2 - 0.1, alongX ? out : s);
        // la falda scende verso l'esterno: il travetto la segue
        if (alongX) m.rotation.x = side < 0 ? a : -a; else m.rotation.z = side < 0 ? -a : a;
        m.castShadow = true;
        m.userData.layer = 'STRUTTURA';
        g.add(m);
      }
    }
  }
  return g;
}
