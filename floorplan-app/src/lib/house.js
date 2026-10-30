/*
 * Casa su più piani: cosa va su ogni piano e come si divide il programma del modulo tra i piani.
 *
 * Ogni piano ha un `program`: 'full' (giorno e notte), 'day' (soggiorno, cucina, bagno di servizio) o
 * 'night' (camere e bagni). Il motore genera tutti i piani insieme con la scala nello stesso punto
 * (POST /generate-house); un piano aggiunto dopo riprende la scala del piano accanto (core).
 */
import { FLOOR_PRESETS } from './project';

export const PROGRAMS = [['full', 'Completo'], ['day', 'Giorno'], ['night', 'Notte']];
export const PROGRAM_LABEL = Object.fromEntries(PROGRAMS);

export const STAIR_TYPES = [['auto', 'Auto'], ['u', 'A U'], ['l', 'A L'], ['straight', 'Rampa']];

export const HOUSE_PRESETS = [
  { id: 'day-night', label: 'Giorno al PT · notte al 1°',
    floors: [{ level: 0, program: 'day' }, { level: 1, program: 'night' }] },
  { id: 'full-attic', label: 'Tutto al PT · mansarda',
    floors: [{ level: 0, program: 'full' }, { level: 1, program: 'night', name: 'Mansarda' }] },
  { id: 'three', label: 'Giorno al PT · notte su due piani',
    floors: [{ level: 0, program: 'day' }, { level: 1, program: 'night' }, { level: 2, program: 'night' }] },
];

export const MAX_HOUSE_LEVEL = 3;

export const GARAGE_FLOOR = { level: -1, program: 'garage', name: 'Piano interrato / garage' };

/* Garage interrato (sotto il piano terra, con la rampa) o al piano strada (la casa parte dal primo piano). */
export const GARAGE_MODES = [['basement', 'Interrato con rampa'], ['street', 'Al piano strada']];

/* Di quanti livelli salgono i piani abitati: uno con il garage al piano strada. */
export const houseShift = (form) => (form.houseGarage && form.garageMode === 'street' ? 1 : 0);

export function floorName(f) {
  if (f.name) return f.name;
  if (f.program === 'garage') return f.level === 0 ? 'Piano terra / garage' : GARAGE_FLOOR.name;
  return FLOOR_PRESETS.find((p) => p.level === f.level && !p.type)?.name || `Piano ${f.level}`;
}

/* Programma proposto per un nuovo piano: sopra la zona giorno va la notte, sotto la zona giorno. */
export function suggestProgram(project, level) {
  if (!project || typeof level !== 'number') return 'full';
  const near = project.floors.find((f) => typeof f.level === 'number' && Math.abs(f.level - level) === 1);
  const prog = near?.params?.program;
  if (level < 0) return 'day';
  if (prog === 'day' || prog === 'full') return 'night';
  if (prog === 'night') return level > (near?.level ?? 0) ? 'night' : 'day';
  return level > 0 ? 'night' : 'full';
}

/*
 * Piani da chiedere al motore, con le camere del modulo divise tra i piani notte (prima quelli «Notte»,
 * poi quelli «Completo»), a turno: prima le matrimoniali, poi le singole. Studio, ripostiglio e lavanderia
 * vanno al piano giorno, la suite al piano notte.
 */
export function houseFloorsRequest(form, { street = true } = {}) {
  const shift = street ? houseShift(form) : 0;
  const garage = form.houseGarage ? [{
    level: shift ? 0 : GARAGE_FLOOR.level, program: 'garage',
    needs: { laundry: form.garageLaundry, storage: form.garageStorage },
  }] : [];
  return [...garage, ...programFloors(form).map((f) => ({ ...f, level: f.level + shift }))];
}

function programFloors(form) {
  const floors = form.houseFloors;
  const sleeping = [
    ...floors.filter((f) => f.program === 'night'),
    ...floors.filter((f) => f.program === 'full'),
  ];
  const beds = new Map(floors.map((f) => [f, { doubles: 0, singles: 0 }]));
  let i = 0;
  for (const kind of ['doubles', 'singles']) {
    for (let k = 0; k < form[kind] && sleeping.length; k++) beds.get(sleeping[i++ % sleeping.length])[kind] += 1;
  }
  const hasDay = floors.some((f) => f.program !== 'night');
  return floors.map((f) => {
    const day = f.program !== 'night';
    const sleep = f.program !== 'day';
    const b = beds.get(f);
    return {
      level: f.level,
      program: f.program,
      ...(sleep && {
        double_bedrooms: b.doubles,
        single_bedrooms: b.singles,
        bathrooms: form.baths === 'auto' ? null : form.baths,
      }),
      kitchen: form.kitchen,
      peninsula: day && form.peninsula,
      needs: {
        entry: form.entry,
        suite: sleep && form.suite,
        study: (day || !hasDay) && form.study,
        storage: (day || !hasDay) && form.storage,
        laundry: (day || !hasDay) && form.laundry,
      },
    };
  });
}
