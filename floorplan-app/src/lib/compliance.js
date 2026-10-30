/*
 * Verifica di conformità di una pianta alla normativa nazionale (nessun Regolamento comunale).
 * Funziona su qualsiasi pianta: generata, importata da DXF/PDF/catasto o modificata a mano.
 *
 * Fonti: DM 5/7/1975 (requisiti igienico-sanitari), L. 13/1989 e DM 236/1989 (accessibilità).
 * Il programma è un aiuto alla progettazione: non sostituisce il progetto di un tecnico abilitato.
 * Non verificabili oggi (non sono nel modello dati): parapetti, distanze, impianti, soffitti inclinati (mansarde).
 * L'altezza interna è un dato per piano (opts.height, 2,70 m se non indicata).
 */
import { stairGeometry } from './stairs';

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
export const DEFAULT_HEIGHT = 2.7;     // altezza netta predefinita dei piani
export const SLAB = 0.3;               // solaio tra un piano e l'altro
const HEIGHT_MIN = { habitable: 2.7, service: 2.4 };   // locali abitabili; corridoi, bagni, ripostigli
const SERVICE = ['corridor', 'entry', 'bath', 'wc', 'storage', 'laundry', 'closet'];
const RISER = { good: 0.18, max: 0.2 };   // alzata: oltre 18 cm scomoda, oltre 20 cm non accettabile
const RAMP = { slope: 0.2, width: 3.0 };  // rampe dei garage: pendenza massima 20%, larghezza minima (verificare)
const STALL = 12.5;                       // posto auto 2,5 × 5,0 m

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
export function checkCompliance(plan, { type, height = DEFAULT_HEIGHT, stairs = null } = {}) {
  const items = [];
  const ok = [];
  if (!plan?.rooms?.length) return { items, ok, fail: 0, warn: 0, residential: false };
  const residential = !NON_RESIDENTIAL.includes(type);
  const add = (id, level, text, ref, room) => items.push({ id, level, text, ref, ...(room ? { roomId: room.id } : {}) });
  const done = () => ({
    items, ok, fail: items.filter((i) => i.level === 'fail').length, warn: items.filter((i) => i.level === 'warn').length, residential,
  });
  const floorToFloor = height + SLAB;
  checkRamps(plan, floorToFloor, add, ok);
  if (!residential) {
    checkGarage(plan, add, ok);
    if (!items.length && !ok.length) ok.push('Per questa destinazione d’uso le verifiche abitative non si applicano.');
    return done();
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

  // 7) altezze interne
  const tall = rooms.filter((r) => !SERVICE.includes(r.kind));
  if (height < HEIGHT_MIN.habitable - 1e-6 && tall.length) {
    add('height', 'fail', `Altezza interna ${m(height)}: nei locali abitabili servono almeno ${m(HEIGHT_MIN.habitable)}`, NORME.DM1975, tall[0]);
  }
  if (height < HEIGHT_MIN.service - 1e-6 && rooms.some((r) => SERVICE.includes(r.kind))) {
    add('height', 'fail', `Altezza interna ${m(height)}: in corridoi, bagni e ripostigli servono almeno ${m(HEIGHT_MIN.service)}`, NORME.DM1975);
  }
  if (height >= HEIGHT_MIN.habitable - 1e-6) ok.push(`Altezza interna di ${m(height)} a norma`);

  // 8) scale: rampa larga almeno 80 cm; alzata e pedata sul dislivello di un piano (regola 2a + p = 62-64 cm)
  for (const st of stairs || plan.stairs || []) {
    const { risers, width } = stairGeometry(st);
    const room = plan.rooms.find((r) => r.id === st.room);
    if (width < STAIR_MIN - 0.005) add('stairs', 'fail', `Scala con rampa di ${m(width)}: almeno ${m(STAIR_MIN)}`, NORME.DM236, room);
    if (risers > 0) {
      const rise = floorToFloor / risers;
      const cm = (v) => `${(v * 100).toFixed(1).replace('.', ',')} cm`;
      if (rise > RISER.max + 1e-6) {
        add('stairs-rise', 'fail', `Scala con alzata di ${cm(rise)} (${risers} gradini in ${m(floorToFloor)}): oltre ${cm(RISER.max)} non è praticabile`, 'Regola dell\u2019arte', room);
      } else if (rise > RISER.good + 1e-6) {
        add('stairs-rise', 'warn', `Scala con alzata di ${cm(rise)}: scomoda (2a + p = ${Math.round((2 * rise + 0.27) * 100)} cm, ideale 62-64)`, 'Regola dell\u2019arte', room);
      } else {
        ok.push(`Scala con alzata di ${cm(rise)}: comoda`);
      }
    }
  }

  // 9) accessibilità: un bagno in cui ruota una carrozzina (visitabilità)
  if (baths.length) {
    if (!baths.some((r) => Math.min(r.w, r.h) >= BATH_ROTATION - 0.005)) {
      add('bath-rotation', 'warn', `Nessun bagno con lo spazio di rotazione di ${m(BATH_ROTATION)}: l’alloggio non è visitabile`, NORME.DM236, baths[0]);
    } else {
      ok.push('Almeno un bagno con spazio di rotazione per la carrozzina');
    }
  }

  return done();
}

/* Rampa carrabile verso un garage interrato (si disegna nel giardino): pendenza e larghezza. */
function checkRamps(plan, drop, add, ok) {
  for (const f of (plan.furniture || []).filter((x) => x.type === 'ramp')) {
    const len = Math.max(f.w, f.h);
    const wid = Math.min(f.w, f.h);
    const slope = drop / len;
    const pct = `${(slope * 100).toFixed(0)}%`;
    if (slope > RAMP.slope + 1e-3) {
      add('ramp', 'fail', `Rampa del garage lunga ${m(len)}: pendenza del ${pct} per ${m(drop)} di dislivello, al massimo ${RAMP.slope * 100}%`, 'DM 1/2/1986 (verificare)');
    } else {
      ok.push(`Rampa del garage con pendenza del ${pct}`);
    }
    if (wid < RAMP.width - 1e-3) add('ramp', 'warn', `Rampa larga ${m(wid)}: almeno ${m(RAMP.width)} a senso unico`, 'DM 1/2/1986 (verificare)');
  }
}

/* Autorimessa: un posto auto di 2,5 × 5 m (12,5 m²) per ogni auto disegnata. */
function checkGarage(plan, add, ok) {
  const rooms = plan.rooms.filter((r) => r.kind === 'garage');
  for (const r of rooms) {
    const cars = (plan.furniture || []).filter((f) => f.type === 'car' && f.room === r.id).length;
    if (cars && r.w * r.h < cars * STALL - 0.05) {
      add('stall', 'warn', `${r.name}: ${m2(r.w * r.h)} per ${cars} auto, servono ${m2(cars * STALL)} (posti da 2,5 × 5 m)`, 'DM 1/2/1986 (verificare)', r);
    } else if (cars) {
      ok.push(`${r.name}: posti auto da 2,5 × 5 m per tutte le auto`);
    }
  }
}
