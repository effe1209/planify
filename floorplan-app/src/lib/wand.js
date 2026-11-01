/*
 * Bacchetta magica per ricalcare una pianta su un'immagine (pagina di un PDF scansionato): un clic dentro un locale e si trova
 * lo spazio chiuso dai muri. Funziona su una mappa di grigi (0 = nero, 255 = bianco), senza librerie.
 *
 *  1. I pixel scuri sono muri, quote e scritte. Si ingrossano di un raggio `r` (circa mezza porta) così i varchi delle porte si chiudono.
 *  2. Dal punto cliccato si riempie lo spazio libero: è il locale, senza i muri ingrossati.
 *  3. Il locale si riallarga di `r` (dove non c'è muro vero) e si misura lo spessore del muro per portare il bordo a metà muro:
 *     due locali vicini così si toccano, come vuole lo schizzo.
 *  4. Se il locale riempie quasi tutto il suo rettangolo si dà un rettangolo, altrimenti il contorno ortogonale.
 * Misure in pixel dell'immagine; `mpp` = metri per pixel.
 */
const DARK = 150;

/* Ingrossamento quadrato di `r` pixel, in due passate (righe e colonne) con somme cumulate. */
export function dilate(mask, w, h, r) {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const ps = new Int32Array(Math.max(w, h) + 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) ps[x + 1] = ps[x] + mask[y * w + x];
    for (let x = 0; x < w; x++) tmp[y * w + x] = ps[Math.min(w, x + r + 1)] - ps[Math.max(0, x - r)] > 0 ? 1 : 0;
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) ps[y + 1] = ps[y] + tmp[y * w + x];
    for (let y = 0; y < h; y++) out[y * w + x] = ps[Math.min(h, y + r + 1)] - ps[Math.max(0, y - r)] > 0 ? 1 : 0;
  }
  return out;
}

/* Riempimento a 4 vicini dello spazio libero (mask = 0) dal punto (sx, sy): { region, count, border } o null. */
function flood(blocked, w, h, sx, sy) {
  if (blocked[sy * w + sx]) return null;
  const region = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  queue[tail++] = sy * w + sx;
  region[sy * w + sx] = 1;
  let border = false;
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (region[j] || blocked[j]) continue;
      region[j] = 1;
      queue[tail++] = j;
    }
  }
  return { region, count: tail, border };
}

/* Spessore (px) del muro che parte dal bordo del rettangolo, misurato in cinque punti lungo il lato. */
function wallThickness(dark, w, h, rect, side) {
  const vals = [];
  for (let k = 1; k <= 5; k++) {
    const t = k / 6;
    let n = 0;
    if (side === 'W' || side === 'E') {
      const y = Math.round(rect.y0 + (rect.y1 - rect.y0) * t);
      const dir = side === 'W' ? -1 : 1;
      let x = side === 'W' ? rect.x0 - 1 : rect.x1;
      while (x >= 0 && x < w && dark[y * w + x] && n < 80) { n++; x += dir; }
    } else {
      const x = Math.round(rect.x0 + (rect.x1 - rect.x0) * t);
      const dir = side === 'N' ? -1 : 1;
      let y = side === 'N' ? rect.y0 - 1 : rect.y1;
      while (y >= 0 && y < h && dark[y * w + x] && n < 80) { n++; y += dir; }
    }
    vals.push(n);
  }
  vals.sort((a, b) => a - b);
  return vals[2];   // la mediana: una scritta o una porta su un lato non falsa la misura
}

/* Contorno ortogonale della maschera a celle: anelli di spigoli orientati, poi si tiene il più grande. */
function outline(cells, cw, ch) {
  const edges = new Map();   // "x,y" di partenza → [x, y] di arrivo
  const filled = (x, y) => x >= 0 && y >= 0 && x < cw && y < ch && cells[y * cw + x] === 1;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      if (!filled(x, y)) continue;
      if (!filled(x, y - 1)) edges.set(`${x},${y}`, [x + 1, y]);
      if (!filled(x + 1, y)) edges.set(`${x + 1},${y}`, [x + 1, y + 1]);
      if (!filled(x, y + 1)) edges.set(`${x + 1},${y + 1}`, [x, y + 1]);
      if (!filled(x - 1, y)) edges.set(`${x},${y + 1}`, [x, y]);
    }
  }
  const loops = [];
  while (edges.size) {
    const [startKey] = edges.keys();
    let key = startKey;
    const pts = [];
    while (edges.has(key)) {
      const [nx, ny] = edges.get(key);
      edges.delete(key);
      const [x, y] = key.split(',').map(Number);
      pts.push([x, y]);
      key = `${nx},${ny}`;
    }
    loops.push(pts);
  }
  const area = (p) => Math.abs(p.reduce((s, [x, y], i) => s + x * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * y, 0) / 2);
  const big = loops.sort((a, b) => area(b) - area(a))[0] || [];
  // punti allineati: restano solo gli angoli
  return big.filter((p, i) => {
    const a = big[(i + big.length - 1) % big.length];
    const b = big[(i + 1) % big.length];
    return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
  });
}

/*
 * gray: Uint8Array w×h. Punto (px, py) in pixel. Ritorna { rect: {x0,y0,x1,y1} (px, a metà muro), ratio, poly: [[x,y]] in px (solo se
 * non è un rettangolo), area (m²) } oppure { error }.
 */
export function wandRoom(gray, w, h, px, py, mpp, { radii = [0.3, 0.45, 0.65], maxArea = 150 } = {}) {
  const sx = Math.round(px);
  const sy = Math.round(py);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return { error: 'Clic fuori dalla pianta' };
  const dark = new Uint8Array(w * h);
  for (let i = 0; i < dark.length; i++) dark[i] = gray[i] < DARK ? 1 : 0;
  if (dark[sy * w + sx]) return { error: 'Clicca dentro un locale, non su un muro o una scritta' };
  // un riempimento per ogni raggio: se ingrossando di più la regione si restringe molto, prima perdeva da una porta
  const tries = [];
  for (const rm of radii) {
    const r = Math.max(1, Math.round(rm / mpp));
    const blocked = dilate(dark, w, h, r);
    const start = flood(blocked, w, h, sx, sy) || (() => {
      // il punto è nella fascia ingrossata di un muro: si cerca il libero più vicino
      for (let d = 1; d <= r + 2; d++) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
        const x = sx + dx; const y = sy + dy;
        if (x >= 0 && y >= 0 && x < w && y < h && !blocked[y * w + x]) { const f = flood(blocked, w, h, x, y); if (f) return f; }
      }
      return null;
    })();
    if (!start || start.border || start.count * mpp * mpp > maxArea || start.count * mpp * mpp < 1.2) continue;
    tries.push({ r, start });
  }
  let pick = 0;
  while (pick + 1 < tries.length && tries[pick + 1].start.count < 0.85 * tries[pick].start.count) pick++;
  let found = null;
  if (tries.length) {
    const { r, start } = tries[pick];
    const grown = dilate(start.region, w, h, r);   // si riallarga fino al muro vero
    const room = new Uint8Array(w * h);
    for (let i = 0; i < room.length; i++) room[i] = grown[i] && !dark[i] ? 1 : 0;
    found = { room, r };
  }
  if (!found) return { error: 'Locale non chiuso: una porta aperta lascia passare. Prova a cliccare in un altro punto o ricalca con il rettangolo.' };
  const { room } = found;
  let x0 = w; let y0 = h; let x1 = 0; let y1 = 0; let count = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!room[y * w + x]) continue;
    count++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const rect = { x0, y0, x1: x1 + 1, y1: y1 + 1 };
  const ratio = count / ((rect.x1 - rect.x0) * (rect.y1 - rect.y0));
  const half = (side) => wallThickness(dark, w, h, rect, side) / 2;
  const out = { x0: rect.x0 - half('W'), y0: rect.y0 - half('N'), x1: rect.x1 + half('E'), y1: rect.y1 + half('S') };
  const area = (out.x1 - out.x0) * (out.y1 - out.y0) * mpp * mpp;
  if (ratio >= 0.88) return { rect: out, ratio, area };
  // locale a L o simili: contorno ortogonale su celle di 5 cm
  const cell = Math.max(1, Math.round(0.05 / mpp));
  const cw = Math.ceil(w / cell);
  const ch = Math.ceil(h / cell);
  const cells = new Uint8Array(cw * ch);
  const sum = new Uint16Array(cw * ch);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (room[y * w + x]) sum[Math.floor(y / cell) * cw + Math.floor(x / cell)]++;
  for (let i = 0; i < cells.length; i++) cells[i] = sum[i] > (cell * cell) / 2 ? 1 : 0;
  const poly = outline(cells, cw, ch).map(([x, y]) => [x * cell, y * cell]);
  return poly.length >= 4 ? { rect: out, ratio, poly, area: count * mpp * mpp } : { rect: out, ratio, area };
}
