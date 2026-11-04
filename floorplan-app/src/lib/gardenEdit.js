/*
 * Cancelli e camminamenti del giardino spostabili a mano: cancello carrabile (con il suo vialetto o la rampa), cancello pedonale
 * (con il suo camminamento) e camminamento da solo. Le siepi della recinzione si ricalcolano nei varchi. Lavorano sul piano del
 * giardino generato dal motore (arredi `gate_driveway`, `gate_pedestrian`, `path`, `ramp`, `fence` e la porta `kind: 'gate'`).
 * Ogni funzione ritorna { plan } oppure { error }.
 */
const EDGE = 0.6;     // siepe laterale e un po' di margine
const GAP = 0.3;      // aria minima tra i due cancelli
const GRID = 0.05;
const r3 = (v) => Math.round(v * 1000) / 1000;
const snap = (v) => Math.round(v / GRID) * GRID;
const near = (a, b) => Math.abs(a - b) < 0.02;

const roomOf = (plan) => plan.rooms.find((r) => r.kind === 'garden');

/* Le parti che si possono spostare, con la posizione attuale (x di sinistra) e la larghezza; null dove il giardino non le ha. */
export function gardenParts(plan) {
  const r = roomOf(plan);
  if (!r) return null;
  const gp = plan.furniture.find((f) => f.type === 'gate_pedestrian');
  const gd = plan.furniture.find((f) => f.type === 'gate_driveway');
  const walk = gp && plan.furniture.find((f) => f.type === 'path' && near(f.x, gp.x) && near(f.w, gp.w));
  return {
    room: r,
    walk: gp ? { x: gp.x, w: gp.w, min: r.x + EDGE, max: r.x + r.w - EDGE - gp.w } : null,
    drive: gd ? { x: gd.x, w: gd.w, min: r.x + EDGE, max: r.x + r.w - EDGE - gd.w } : null,
    path: walk ? { x: walk.x, w: walk.w, min: r.x + EDGE, max: r.x + r.w - EDGE - walk.w } : null,
  };
}

/* Recinzione tra i due cancelli: tratti di siepe dove non c'è un varco. */
function refence(plan, furniture) {
  const r = roomOf(plan);
  const tpl = plan.furniture.find((f) => f.type === 'fence') || { type: 'fence', rot: 0, facing: 'N', room: r.id, flip: false };
  const gp = furniture.find((f) => f.type === 'gate_pedestrian');
  const gd = furniture.find((f) => f.type === 'gate_driveway');
  const cuts = [gp, gd].filter(Boolean).map((g) => [g.x, g.x + g.w]).sort((a, b) => a[0] - b[0]);
  const base = furniture.filter((f) => f.type !== 'fence');
  const gy = (gp || gd)?.y ?? r.y + r.h - 0.15;
  const fences = [];
  let x = r.x;
  for (const [a, b] of [...cuts, [r.x + r.w, r.x + r.w]]) {
    if (a - x > 0.3) fences.push({ ...tpl, x: r3(x), y: gy, w: r3(a - x), h: 0.15 });
    x = Math.max(x, b);
  }
  return [...base, ...fences];
}

function overlapsGate(x, w, other) {
  return other && x < other.x + other.w + GAP && x + w > other.x - GAP;
}

/*
 * Sposta `part` ('walk' | 'drive' | 'path') in modo che il suo lato sinistro stia a `x` (m, nel piano del giardino). Il cancello pedonale
 * porta con sé il suo camminamento, quello carrabile il vialetto o la rampa; 'path' muove solo il camminamento.
 */
export function moveGardenPart(plan, part, x) {
  const parts = gardenParts(plan);
  const p = parts?.[part];
  if (!p) return { error: 'Questa parte non c\'è nel giardino' };
  const nx = snap(Math.min(p.max, Math.max(p.min, x)));
  const dx = r3(nx - p.x);
  if (Math.abs(dx) < 1e-6) return { plan };
  if (part === 'walk' && overlapsGate(nx, p.w, parts.drive)) return { error: 'Il cancello pedonale finirebbe contro quello carrabile' };
  if (part === 'drive' && overlapsGate(nx, p.w, parts.walk)) return { error: 'Il cancello carrabile finirebbe contro quello pedonale' };
  const gp = plan.furniture.find((f) => f.type === 'gate_pedestrian');
  const gd = plan.furniture.find((f) => f.type === 'gate_driveway');
  const walkPath = parts.path && plan.furniture.find((f) => f.type === 'path' && near(f.x, gp?.x ?? -99) && near(f.w, gp?.w ?? -99));
  const moves = (f) => {
    if (part === 'walk') return f === gp || f === walkPath;
    if (part === 'path') return f === walkPath;
    return f === gd || ((f.type === 'path' || f.type === 'ramp') && gd && near(f.x, gd.x) && near(f.w, gd.w));
  };
  let furniture = plan.furniture.map((f) => (moves(f) ? { ...f, x: r3(f.x + dx) } : f));
  furniture = refence(plan, furniture);
  const doors = part === 'walk' ? plan.doors.map((d) => (d.kind === 'gate' ? { ...d, x: r3(d.x + dx) } : d)) : plan.doors;
  return { plan: { ...plan, furniture, doors } };
}
