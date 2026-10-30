/*
 * Verifica di conformità di una pianta alla normativa nazionale (nessun Regolamento comunale).
 * Funziona su qualsiasi pianta: generata, importata da DXF/PDF/catasto o modificata a mano.
 *
 * Fonti: DM 5/7/1975 (requisiti igienico-sanitari), L. 13/1989 e DM 236/1989 (accessibilità).
 * Il programma è un aiuto alla progettazione: non sostituisce il progetto di un tecnico abilitato.
 * Non verificabili oggi (non sono nel modello dati): altezze interne, parapetti, distanze, impianti.
 */

export const NORME = {
  DM1975: 'DM 5/7/1975',
  DM236: 'DM 236/1989',
};

const HABITABLE = ['bed', 'living', 'living_kitchen', 'kitchen', 'study', 'dining', 'hotel_room'];
const LIVING = ['living', 'living_kitchen'];
const NON_RESIDENTIAL = ['garage', 'garden', 'office', 'hotel-room'];

export const WINDOW_H = 1.4;          // altezza assunta delle finestre: il modello non la memorizza
const MIN_AREA = { double: 14, single: 9, living: 14 };
const DWELLING_MIN = { one: 28, two: 38 };   // alloggio minimo per 1 e per 2 persone
const DOOR_MIN = { inner: 0.75, innerOk: 0.8, entrance: 0.8 };
const CORRIDOR_MIN = 1.0;
const BATH_ROTATION = 1.5;            // spazio di rotazione di una carrozzina nel bagno
const BATH_WINDOW_MIN = 0.5;          // m² di finestra apribile per un bagno senza aspirazione forzata
const STAIR_MIN = 0.8;

const m2 = (v) => `${v.toFixed(1).replace('.', ',')} m²`;
const m = (v) => `${v.toFixed(2).replace('.', ',')} m`;

/* Il segmento di una finestra o di una porta sta sul bordo di quale locale? (tolleranza: spessore del muro) */
function segment(o) {
  return o.rot === 90 ? { x0: o.x, x1: o.x, y0: o.y, y1: o.y + o.w } : { x0: o.x, x1: o.x + o.w, y0: o.y, y1: o.y };
}

function roomsTouching(plan, o, tol = 0.3) {
  const s = segment(o);
  return plan.rooms.filter((r) => {
    const insideX = s.x1 >= r.x - tol && s.x0 <= r.x + r.w + tol;
    const insideY = s.y1 >= r.y - tol && s.y0 <= r.y + r.h + tol;
    if (!insideX || !insideY) return false;
    // sul bordo (non dentro il locale): la distanza dal perimetro è al massimo il muro
    const nearEdge = o.rot === 90
      ? Math.min(Math.abs(s.x0 - r.x), Math.abs(s.x0 - (r.x + r.w))) <= tol
      : Math.min(Math.abs(s.y0 - r.y), Math.abs(s.y0 - (r.y + r.h))) <= tol;
    return nearEdge;
  });
}

/* Una finestra illumina il locale che ha dietro e basta: sul muro tra due locali conta quello da cui si apre. */
function windowsByRoom(plan) {
  const byRoom = new Map(plan.rooms.map((r) => [r.id, 0]));
  for (const w of plan.windows || []) {
    const touching = roomsTouching(plan, w);
    if (!touching.length) continue;
    const share = (w.w * WINDOW_H) / touching.length;
    touching.forEach((r) => byRoom.set(r.id, byRoom.get(r.id) + share));
  }
  return byRoom;
}

/*
 * plan: la pianta nel formato del motore. opts.type: tipo di piano (apartment, open-space, garage, …).
 * Restituisce { items: [{ id, level: 'fail'|'warn', roomId?, text, ref }], ok: [testi], fail, warn, residential }.
 */
export function checkCompliance(plan, { type } = {}) {
  const items = [];
  const ok = [];
  if (!plan?.rooms?.length) return { items, ok, fail: 0, warn: 0, residential: false };
  const residential = !NON_RESIDENTIAL.includes(type);
  const add = (id, level, text, ref, room) => items.push({ id, level, text, ref, ...(room ? { roomId: room.id } : {}) });
  if (!residential) {
    return { items, ok: ['Per questa destinazione d’uso le verifiche abitative non si applicano.'], fail: 0, warn: 0, residential };
  }

  const rooms = plan.rooms.filter((r) => r.kind !== 'stairs');
  const area = (r) => r.w * r.h;
  const lit = windowsByRoom(plan);

  // 1) superfici minime dei locali
  let areasOk = true;
  for (const r of rooms) {
    let need = 0;
    let label = '';
    if (r.kind === 'bed') {
      const single = r.size === 'single';
      need = single ? MIN_AREA.single : MIN_AREA.double;
      label = single ? 'camera singola' : 'camera matrimoniale';
    } else if (LIVING.includes(r.kind)) {
      need = MIN_AREA.living;
      label = 'soggiorno';
    }
    if (need && area(r) < need - 0.05) {
      areasOk = false;
      add('area', 'fail', `${r.name}: ${m2(area(r))}, la ${label} deve avere almeno ${need} m²`, NORME.DM1975, r);
    }
  }
  if (areasOk && rooms.some((r) => r.kind === 'bed' || LIVING.includes(r.kind))) {
    ok.push('Superfici di camere e soggiorno a norma');
  }

  // 2) alloggio minimo: 28 m² per una persona, 38 m² per due (monolocale compreso)
  const dwelling = rooms.filter((r) => !['garage', 'garden'].includes(r.kind)).reduce((a, r) => a + area(r), 0);
  if (dwelling < DWELLING_MIN.one - 0.05) {
    add('dwelling', 'fail', `Alloggio di ${m2(dwelling)}: sotto i ${DWELLING_MIN.one} m² minimi anche per una sola persona`, NORME.DM1975);
  } else if (dwelling < DWELLING_MIN.two - 0.05) {
    add('dwelling', 'warn', `Alloggio di ${m2(dwelling)}: a norma solo per una persona (per due ne servono ${DWELLING_MIN.two} m²)`, NORME.DM1975);
  } else {
    ok.push(`Alloggio di ${m2(dwelling)}: a norma fino a due persone`);
  }

  // 3) aeroilluminazione: finestre almeno 1/8 del pavimento nei locali abitabili
  let lightOk = true;
  for (const r of rooms.filter((x) => HABITABLE.includes(x.kind))) {
    const win = lit.get(r.id) || 0;
    if (win < area(r) / 8 - 1e-6) {
      lightOk = false;
      add('light', 'fail', win === 0
        ? `${r.name}: nessuna finestra, serve almeno 1/8 del pavimento (${m2(area(r) / 8)})`
        : `${r.name}: finestre per ${m2(win)}, servono almeno ${m2(area(r) / 8)} (1/8 del pavimento)`, NORME.DM1975, r);
    }
  }
  if (lightOk) ok.push('Tutti i locali abitabili rispettano il rapporto aeroilluminante 1/8');

  // 4) bagni e cucine
  const baths = rooms.filter((r) => r.kind === 'bath');
  if (!baths.length && dwelling >= DWELLING_MIN.one) {
    add('bath', 'fail', 'Manca il servizio igienico: ogni alloggio deve averne uno completo', NORME.DM1975);
  }
  for (const r of [...baths, ...rooms.filter((x) => x.kind === 'wc')]) {
    const win = lit.get(r.id) || 0;
    if (win === 0) {
      add('bath-vent', 'warn', `${r.name}: senza finestra, serve l’aspirazione forzata`, NORME.DM1975, r);
    } else if (win < BATH_WINDOW_MIN) {
      add('bath-vent', 'warn', `${r.name}: finestra di ${m2(win)}, sotto i ${BATH_WINDOW_MIN} m² per l’aerazione naturale`, NORME.DM1975, r);
    }
  }
  for (const r of rooms.filter((x) => x.kind === 'kitchen')) {
    if (!(lit.get(r.id) > 0)) add('kitchen-vent', 'warn', `${r.name}: senza finestra, servono aerazione e cappa canalizzata`, NORME.DM1975, r);
  }

  // 5) porte
  let doorsOk = true;
  (plan.doors || []).forEach((d) => {
    const touching = roomsTouching(plan, d);
    const where = touching[0];
    if (d.entrance && d.w < DOOR_MIN.entrance - 0.005) {
      doorsOk = false;
      add('door', 'fail', `Portoncino di ${m(d.w)}: almeno ${m(DOOR_MIN.entrance)}`, NORME.DM236, where);
    } else if (!d.entrance && d.w < DOOR_MIN.inner - 0.005) {
      doorsOk = false;
      add('door', 'fail', `Porta di ${m(d.w)}${where ? ` in ${where.name}` : ''}: almeno ${m(DOOR_MIN.inner)}`, NORME.DM236, where);
    } else if (!d.entrance && d.w < DOOR_MIN.innerOk - 0.005) {
      doorsOk = false;
      add('door', 'warn', `Porta di ${m(d.w)}${where ? ` in ${where.name}` : ''}: sotto gli ${m(DOOR_MIN.innerOk)} non è accessibile`, NORME.DM236, where);
    }
  });
  if (doorsOk && (plan.doors || []).length) ok.push('Larghezza delle porte a norma');

  // 6) corridoi
  for (const r of rooms.filter((x) => x.kind === 'corridor')) {
    const w = Math.min(r.w, r.h);
    if (w < CORRIDOR_MIN - 0.005) add('corridor', 'fail', `Corridoio di ${m(w)}: almeno ${m(CORRIDOR_MIN)}`, NORME.DM236, r);
  }

  // 7) scale (rampa dritta: la larghezza è il lato corto del vano)
  for (const s of plan.stairs || []) {
    if (s.type !== 'straight') continue;
    const w = Math.min(s.w, s.h);
    const room = plan.rooms.find((r) => r.id === s.room);
    if (w < STAIR_MIN - 0.005) add('stairs', 'fail', `Scala di ${m(w)}: la rampa deve essere larga almeno ${m(STAIR_MIN)}`, NORME.DM236, room);
  }

  // 8) accessibilità: un bagno in cui ruota una carrozzina (visitabilità)
  if (baths.length) {
    if (!baths.some((r) => Math.min(r.w, r.h) >= BATH_ROTATION - 0.005)) {
      add('bath-rotation', 'warn', `Nessun bagno con lo spazio di rotazione di ${m(BATH_ROTATION)}: l’alloggio non è visitabile`, NORME.DM236, baths[0]);
    } else {
      ok.push('Almeno un bagno con spazio di rotazione per la carrozzina');
    }
  }

  return {
    items,
    ok,
    fail: items.filter((i) => i.level === 'fail').length,
    warn: items.filter((i) => i.level === 'warn').length,
    residential,
  };
}
