/*
 * Abaco dei serramenti: porte e finestre di tutto il progetto raggruppate per tipo e misura, con un codice
 * (P1, P2… porte; F1, F2… finestre) che compare anche in pianta nella vista tecnica.
 *   scheduleFor(project) → { rows: [{ code, type, w, h, qty, places, open }], codes: { [floorId]: { doors: [code], windows: [code] } } }
 * Misure in metri (luce netta del vano). Altezze tipiche: porte 2,10 m, basculante 2,40 m, finestre 1,40 m
 * (davanzale a 0,90 m), portefinestre da 2,00 m di larghezza in su 2,40 m.
 */
import { opening } from './ajax';

const doorType = (d) => (d.kind === 'garage' ? 'Porta basculante' : d.entrance ? "Portoncino d'ingresso" : 'Porta interna a battente');
const doorH = (d) => (d.kind === 'garage' ? 2.4 : 2.1);
const winType = (w) => (w.w >= 2.0 ? 'Portafinestra' : 'Finestra');
const winH = (w) => (w.w >= 2.0 ? 2.4 : 1.4);
const r2 = (v) => Math.round(v * 100) / 100;

export function scheduleFor(project) {
  const groups = new Map();
  const codes = {};
  for (const f of project.floors) {
    const plan = f.plan;
    if (!plan?.doors) continue;
    codes[f.id] = { doors: [], windows: [] };
    const roomName = (op) => op.room?.name || (op.room?.kind === 'garage' ? 'Garage' : 'Esterno');
    plan.doors.forEach((d, i) => {
      if (d.kind === 'gate') {
        codes[f.id].doors[i] = null;
        return;
      }
      const type = doorType(d);
      const key = `P|${type}|${r2(d.w)}`;
      const g = groups.get(key) || { prefix: 'P', type, w: r2(d.w), h: doorH(d), qty: 0, places: [], open: new Set() };
      g.qty += 1;
      g.places.push(`${roomName(opening(plan, d))} (${f.name})`);
      if (d.kind !== 'garage') g.open.add(d.openDir > 0 ? 'destra' : 'sinistra');
      groups.set(key, g);
      codes[f.id].doors[i] = key;
    });
    plan.windows.forEach((w, i) => {
      const type = winType(w);
      const key = `F|${type}|${r2(w.w)}`;
      const g = groups.get(key) || { prefix: 'F', type, w: r2(w.w), h: winH(w), qty: 0, places: [], open: new Set(['anta-ribalta']) };
      g.qty += 1;
      g.places.push(`${roomName(opening(plan, w))} (${f.name})`);
      groups.set(key, g);
      codes[f.id].windows[i] = key;
    });
  }
  // numerazione: prima le porte poi le finestre, per misura crescente
  const ordered = [...groups.entries()].sort(([, a], [, b]) => b.prefix.localeCompare(a.prefix) || a.type.localeCompare(b.type) || a.w - b.w);
  const name = new Map();
  const count = { P: 0, F: 0 };
  for (const [key, g] of ordered) name.set(key, `${g.prefix}${++count[g.prefix]}`);
  for (const c of Object.values(codes)) {
    c.doors = c.doors.map((k) => (k ? name.get(k) : null));
    c.windows = c.windows.map((k) => name.get(k));
  }
  const rows = ordered.map(([key, g]) => {
    const places = new Map();
    for (const p of g.places) places.set(p, (places.get(p) || 0) + 1);
    return { code: name.get(key), type: g.type, w: g.w, h: g.h, qty: g.qty, open: [...g.open].join(', '),
      places: [...places].map(([p, q]) => (q > 1 ? `${p} ×${q}` : p)) };
  });
  return { rows, codes };
}
