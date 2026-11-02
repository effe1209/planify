/*
 * Materiali della casa: per facciata, tetto, pareti interne e pavimenti si sceglie il tipo (legno, pietra, mattoni…) e, a parte, il
 * colore (lib/palette.js). In più la struttura: «in legno» aggiunge pilastri d'angolo, travi a vista, portico all'ingresso e travetti
 * sotto la gronda (lib/timber.js). Vale per tutto il progetto: project.materials = { facade?, roof?, walls?, floor?, structure? }.
 * Una chiave assente = il materiale dello stile del piano.
 */

/* Ogni voce porta il suo aspetto di partenza (colore e seconda tinta della texture): il colore scelto in «Colori» lo sostituisce. */
export const MATERIALS = {
  facade: [
    { id: 'stucco', label: 'Intonaco', spec: { tex: 'stucco', color: '#e6e2da', tone: '#cfcac0' } },
    { id: 'brick', label: 'Mattoni', spec: { tex: 'brick', color: '#9b5240', tone: '#cfc6b8' } },
    { id: 'woodlap', label: 'Legno a doghe', spec: { tex: 'woodlap', color: '#b0865a', tone: '#7d5a38' } },
    { id: 'cladding', label: 'Legno verticale', spec: { tex: 'cladding', color: '#a7835c', tone: '#6f5033' } },
    { id: 'log', label: 'Tronchi', spec: { tex: 'logwall', color: '#b98a58', tone: '#7a5230' } },
    { id: 'stone', label: 'Pietra', spec: { tex: 'stone', color: '#b9b2a4', tone: '#8d877b' } },
    { id: 'concrete', label: 'Cemento', spec: { tex: 'concrete', color: '#b7b5af', tone: '#9a9892' } },
    { id: 'travertine', label: 'Travertino', spec: { tex: 'travertine', color: '#ece4d6', tone: '#d3c6ae' } },
  ],
  roof: [
    { id: 'tile', label: 'Tegole', spec: { kind: 'tile', color: '#a5503a', tone: '#8a3f2d' } },
    { id: 'slate', label: 'Ardesia', spec: { kind: 'slate', color: '#454b52', tone: '#363b41' } },
    { id: 'metal', label: 'Lamiera', spec: { kind: 'metal', color: '#6c7379', tone: '#585f65' } },
    { id: 'shingle', label: 'Scandole di legno', spec: { kind: 'shingle', color: '#a98558', tone: '#7a5a38' } },
  ],
  walls: [
    { id: 'plaster', label: 'Intonaco', spec: { tex: 'stucco', color: '#f4f2ee', tone: '#e5e1da' } },
    { id: 'wood', label: 'Legno', spec: { tex: 'cladding', color: '#b5906a', tone: '#7b5a3a' } },
    { id: 'concrete', label: 'Cemento', spec: { tex: 'concrete', color: '#d3d0ca', tone: '#b9b6b0' } },
    { id: 'brick', label: 'Mattoni a vista', spec: { tex: 'brick', color: '#a85d48', tone: '#d3cbbd' } },
    { id: 'wallpaper', label: 'Carta da parati', spec: { tex: 'wallpaper', color: '#efe8da', tone: '#b9a98d' } },
  ],
  floor: [
    { id: 'plank', label: 'Parquet', spec: { kind: 'plank', a: '#dcc7a4', b: '#cdb48c', joint: '#a98f68' } },
    { id: 'herringbone', label: 'Spina di pesce', spec: { kind: 'herringbone', a: '#bb8d5a', b: '#a57a49', joint: '#7a5630' } },
    { id: 'concrete', label: 'Cemento', spec: { kind: 'concrete', a: '#a1a5a8', b: '#8e9296', joint: '#6e7276' } },
    { id: 'tile', label: 'Piastrelle', spec: { kind: 'tile', a: '#e2dcd0', b: '#d6cfc1', joint: '#b3aa98' } },
    { id: 'marble', label: 'Marmo', spec: { kind: 'marble', a: '#f3f1ee', b: '#b9b4ac', joint: '#d6d1c8' } },
  ],
};

export const MATERIAL_ROWS = [
  { key: 'facade', label: 'Facciata' },
  { key: 'roof', label: 'Tetto' },
  { key: 'walls', label: 'Pareti interne' },
  { key: 'floor', label: 'Pavimenti' },
];

export const STRUCTURES = [
  { id: 'standard', label: 'Tradizionale' },
  { id: 'wood', label: 'In legno' },
];

const find = (key, id) => MATERIALS[key]?.find((m) => m.id === id) || null;

/* Solo scelte valide, senza cose sconosciute; null se non resta niente. */
export function cleanMaterials(m) {
  const out = {};
  if (m) {
    for (const { key } of MATERIAL_ROWS) if (find(key, m[key])) out[key] = m[key];
    if (m.structure === 'wood') out.structure = 'wood';
  }
  return Object.keys(out).length ? out : null;
}

/* Il kit dello stile con i materiali scelti. Un materiale uguale a quello dello stile ne lascia i colori; in legno anche telai e porte. */
export function kitWithMaterials(kit, materials) {
  const m = cleanMaterials(materials);
  if (!m) return kit;
  const out = { ...kit };
  if (m.facade) {
    const spec = find('facade', m.facade).spec;
    out.facade = kit.facade.tex === spec.tex ? kit.facade : { ...spec };
  }
  if (m.walls) {
    const spec = find('walls', m.walls).spec;
    out.wallIn = kit.wallIn.tex === spec.tex ? kit.wallIn : { ...spec };
  }
  if (m.roof) {
    const spec = find('roof', m.roof).spec;
    out.roof = kit.roof.kind === spec.kind ? kit.roof : { ...spec };
  }
  if (m.floor) {
    const spec = find('floor', m.floor).spec;
    out.floor = kit.floor.kind === spec.kind ? kit.floor : { ...spec };
  }
  if (m.structure === 'wood') {
    // casa in legno: infissi, porte, ringhiere e zoccolo nei toni del legno scuro
    Object.assign(out, { frame: '#5b3f27', door: '#7a5a3b', trim: '#8b6a45', plinth: '#5a4632', rail: '#5a4632', handle: '#3a2b1d' });
    out.baseboard = { ...kit.baseboard, color: '#8b6a45' };
  }
  return out;
}

/* Combinazioni pronte: materiali, struttura e colori insieme (si ritoccano dopo). */
export const LOOKS = [
  { id: 'chalet', name: 'Chalet in legno', materials: { facade: 'log', roof: 'shingle', walls: 'wood', floor: 'plank', structure: 'wood' },
    palette: { walls: '#d9b98e', facade: '#a8794a', floor: '#c9a678', wood: '#8a5a33', fabric: '#8f3b2f' } },
  { id: 'nordic', name: 'Casa nordica', materials: { facade: 'woodlap', roof: 'metal', walls: 'plaster', floor: 'plank', structure: 'wood' },
    palette: { walls: '#fbfaf7', facade: '#f1f0ec', floor: '#e6d3b0', wood: '#e6d3b0', fabric: '#c9d3cc' } },
  { id: 'stone', name: 'Casa di pietra', materials: { facade: 'stone', roof: 'tile', walls: 'plaster', floor: 'herringbone' },
    palette: { walls: '#f2eadb', facade: '#b9b2a4', floor: '#b08a5a', wood: '#a9714a', fabric: '#c9b79c' } },
  { id: 'industrial', name: 'Mattoni industriali', materials: { facade: 'brick', roof: 'metal', walls: 'brick', floor: 'concrete' },
    palette: { walls: '#d3d0ca', facade: '#9b5240', floor: '#a1a5a8', wood: '#8a6a4a', fabric: '#6b7076' } },
  { id: 'villa', name: 'Villa moderna', materials: { facade: 'stucco', roof: 'slate', walls: 'plaster', floor: 'marble' },
    palette: { walls: '#f6f4f0', facade: '#e8e6e1', floor: '#f3f1ee', wood: '#d8c4a2', fabric: '#bfc7d1' } },
  { id: 'mediterranean', name: 'Mediterranea', materials: { facade: 'stucco', roof: 'tile', walls: 'plaster', floor: 'tile' },
    palette: { walls: '#fbf3e4', facade: '#f1e2c3', floor: '#c98f6b', wood: '#b0774e', fabric: '#4f7ea8' } },
];
