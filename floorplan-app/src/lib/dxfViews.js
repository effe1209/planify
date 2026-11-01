/*
 * Prospetti e sezioni (lib/elevation.js) dentro il DXF della pianta, sotto la pianta, in metri, ognuno con i suoi layer
 * (PROSPETTI_*, SEZIONI_*, VISTE_*), così il CAD li accende e spegne come le altre parti del disegno.
 * Un disegno = { title, shapes, dims?, minX, maxX, minY, maxY }; la quota del disegno (y verso l'alto) diventa y della pianta (verso il basso).
 */
export const VIEW_LAYERS = [
  ['PROSPETTI_MURI', 7, 'CONTINUOUS', 'Prospetti: facciate e solai'],
  ['PROSPETTI_APERTURE', 4, 'CONTINUOUS', 'Prospetti: finestre e porte'],
  ['PROSPETTI_TETTO', 1, 'CONTINUOUS', 'Prospetti: tetto'],
  ['SEZIONI_MURI', 7, 'CONTINUOUS', 'Sezioni: muri tagliati'],
  ['SEZIONI_SOLAI', 9, 'CONTINUOUS', 'Sezioni: solai e soppalco'],
  ['SEZIONI_LOCALI', 8, 'CONTINUOUS', 'Sezioni: contorno dei locali'],
  ['SEZIONI_ARREDI', 30, 'CONTINUOUS', 'Sezioni: arredi tagliati'],
  ['SEZIONI_SCALE', 8, 'CONTINUOUS', 'Sezioni: gradini'],
  ['SEZIONI_PARAPETTI', 4, 'CONTINUOUS', 'Sezioni: parapetto del soppalco'],
  ['SEZIONI_QUOTE', 7, 'CONTINUOUS', 'Sezioni: altezze libere in cm'],
  ['SEZIONI_QUOTE_FUORI_NORMA', 1, 'CONTINUOUS', 'Sezioni: altezze libere fuori norma (rosso)'],
  ['VISTE_TERRENO', 8, 'CONTINUOUS', 'Prospetti e sezioni: linea del terreno e quote dei piani'],
  ['VISTE_TESTI', 7, 'CONTINUOUS', 'Prospetti e sezioni: titoli e nomi dei locali'],
];

const GAP = 3;      // metri fra un disegno e il successivo
const DIM_W = 3.4;  // spazio a destra di un disegno con quote

const isSection = (d) => /^Sezione/.test(d.title);
const widthOf = (d) => d.maxX - d.minX + 1.2 + (d.dims?.length ? DIM_W : 0);

/* Dove va ogni disegno: prospetti in una riga, sezioni in quella sotto, sotto la pianta lunga L. Ritorna anche l'ingombro. */
export function layoutViews(drawings, L) {
  const rows = [drawings.filter((d) => !isSection(d)), drawings.filter(isSection)].filter((r) => r.length);
  const placed = [];
  let top = L + 6;
  let maxX = 0;
  for (const row of rows) {
    const h = Math.max(...row.map((d) => d.maxY - d.minY));
    const baseY = top + 2.5 + h;   // 2,5 m per il titolo sopra il disegno più alto
    let x = 1.5;
    for (const d of row) {
      placed.push({ d, ox: x - d.minX, baseY, row: placed.length });
      x += widthOf(d) + GAP;
    }
    maxX = Math.max(maxX, x);
    top = baseY + 4;
  }
  return { placed, maxX, bottom: top };
}

const LAYER = {
  elevation: { wall: 'PROSPETTI_MURI', below: 'PROSPETTI_MURI', slab: 'PROSPETTI_MURI', glass: 'PROSPETTI_APERTURE', door: 'PROSPETTI_APERTURE', roof: 'PROSPETTI_TETTO' },
  section: { wall: 'SEZIONI_MURI', slab: 'SEZIONI_SOLAI', room: 'SEZIONI_LOCALI', furn: 'SEZIONI_ARREDI', stair: 'SEZIONI_SCALE', glass: 'SEZIONI_PARAPETTI' },
};

/* Scrive i disegni con il writer del DXF (poly, line, text in coordinate di pianta). */
export function drawViews(d, placed, marks = []) {
  const f = (p, x, y, minY) => [p.ox + x, p.baseY - (y - minY)];
  for (const p of placed) {
    const { d: v } = p;
    const kinds = LAYER[isSection(v) ? 'section' : 'elevation'];
    const X = (x, y) => f(p, x, y, v.minY);
    d.text('VISTE_TESTI', [p.ox + (v.minX + v.maxX) / 2, p.baseY - (v.maxY - v.minY) - 1.2], 0.35, v.title);
    for (const s of v.shapes) {
      const layer = kinds[s.kind];
      if (!layer) continue;
      d.poly(layer, s.pts.map(([x, y]) => X(x, y)));
      if (s.kind === 'room' && s.name) {
        const [cx, cy] = [(s.pts[0][0] + s.pts[1][0]) / 2, (s.pts[0][1] + s.pts[2][1]) / 2];
        d.text('VISTE_TESTI', X(cx, cy), 0.2, `${s.name} h ${(s.h ?? 0).toFixed(2).replace('.', ',')} m`);
      }
    }
    // terreno e quote dei piani
    const g0 = X(v.minX - 0.5, 0);
    d.line('VISTE_TERRENO', g0, X(v.maxX + 0.5, 0));
    for (const m of marks) {
      d.line('VISTE_TERRENO', X(v.minX - 0.5, m.y), X(v.minX - 0.1, m.y));
      d.text('VISTE_TERRENO', X(v.minX - 1.1, m.y + 0.1), 0.18, m.label);
    }
    // altezze libere in cm: una colonna per quota a destra del disegno, in rosso se fuori norma
    (v.dims || []).forEach((q, i) => {
      const layer = q.bad ? 'SEZIONI_QUOTE_FUORI_NORMA' : 'SEZIONI_QUOTE';
      const x = v.maxX + 0.7 + (i % 3) * 0.9;
      d.line(layer, X(x, q.y0), X(x, q.y1));
      for (const y of [q.y0, q.y1]) {
        d.line(layer, X(v.maxX + 0.2, y), X(x + 0.15, y));
        d.line(layer, X(x - 0.1, y - 0.1), X(x + 0.1, y + 0.1));
      }
      d.text(layer, X(x + 0.45, (q.y0 + q.y1) / 2), 0.16, `${q.label} ${Math.round((q.y1 - q.y0) * 100)} cm${q.bad ? ' FUORI NORMA' : ''}`);
    });
  }
}
