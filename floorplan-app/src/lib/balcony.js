/*
 * Balcone: un locale esterno (kind 'balcony') appoggiato alla casa. Non ha muri: sui lati che non toccano altri locali
 * c'è il parapetto di vetro. `balconyRailings` dà quei tratti, in metri, per la pianta 2D e per il 3D.
 */
const EPS = 0.02;

/* [{ x1, y1, x2, y2 }] — tratti di parapetto, orizzontali o verticali, lungo i lati liberi dei balconi. */
export function balconyRailings(plan) {
  const rooms = plan?.rooms || [];
  const out = [];
  for (const b of rooms.filter((r) => r.kind === 'balcony')) {
    const others = rooms.filter((r) => r !== b);
    const sides = [
      { a: b.x, c: b.x + b.w, at: b.y, horiz: true },            // lato alto
      { a: b.x, c: b.x + b.w, at: b.y + b.h, horiz: true },      // lato basso
      { a: b.y, c: b.y + b.h, at: b.x, horiz: false },           // lato sinistro
      { a: b.y, c: b.y + b.h, at: b.x + b.w, horiz: false },     // lato destro
    ];
    for (const { a, c, at, horiz } of sides) {
      // tratti del lato coperti da un altro locale che lo tocca: lì c'è il muro della casa, non il parapetto
      const covered = [];
      for (const q of others) {
        const [q0, q1, e0, e1] = horiz ? [q.x, q.x + q.w, q.y, q.y + q.h] : [q.y, q.y + q.h, q.x, q.x + q.w];
        if (Math.abs(e0 - at) <= EPS || Math.abs(e1 - at) <= EPS) covered.push([Math.max(a, q0), Math.min(c, q1)]);
      }
      covered.sort((p, q) => p[0] - q[0]);
      let cur = a;
      const emit = (from, to) => {
        if (to - from > 0.05) out.push(horiz ? { x1: from, y1: at, x2: to, y2: at } : { x1: at, y1: from, x2: at, y2: to });
      };
      for (const [from, to] of covered) {
        if (to <= from) continue;
        emit(cur, Math.min(from, c));
        cur = Math.max(cur, to);
      }
      emit(cur, c);
    }
  }
  return out;
}
