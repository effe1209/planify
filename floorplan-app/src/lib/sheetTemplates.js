/*
 * Modelli di tavola: formato, orientamento, scala, cornice, spessore delle linee, bianco e nero, carattere, cartiglio (studio,
 * committente, progettista, pratica, titolo e nota). Si salvano nel progetto (`project.sheetTemplates`, quindi anche nel cloud) e,
 * per riusarli negli altri progetti, nel browser (localStorage «planify.sheetTemplates»).
 */
import { SHEET_FORMATS, SHEET_SCALES } from './techSheet';

export const TEMPLATES_KEY = 'planify.sheetTemplates';
export const FONTS = [['helvetica', 'Helvetica'], ['times', 'Times'], ['courier', 'Courier']];
export const LINE_WEIGHTS = [['thin', 'Sottili', 0.6], ['normal', 'Normali', 1], ['bold', 'Marcate', 1.6]];
export const DEFAULT_TEMPLATE = {
  name: 'Standard', format: 'A3', orientation: 'landscape', scale: 'auto', margin: 10, frame: true, lines: 'normal', mono: false, font: 'helvetica',
  studio: '', client: '', designer: '', ref: '', title: '', note: '',
};

const str = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/* Solo valori ammessi: un modello salvato a mano o da un'altra versione non rompe le tavole. */
export function cleanTemplate(t) {
  const d = DEFAULT_TEMPLATE;
  const scale = SHEET_SCALES.includes(Number(t?.scale)) ? Number(t.scale) : 'auto';
  const margin = Math.min(20, Math.max(5, Math.round(Number(t?.margin) || d.margin)));
  return {
    id: typeof t?.id === 'string' && t.id ? t.id : `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    name: str(t?.name, 40) || d.name,
    format: SHEET_FORMATS[t?.format] ? t.format : d.format,
    orientation: t?.orientation === 'portrait' ? 'portrait' : 'landscape',
    scale, margin,
    frame: t?.frame !== false,
    lines: LINE_WEIGHTS.some(([id]) => id === t?.lines) ? t.lines : d.lines,
    mono: !!t?.mono,
    font: FONTS.some(([id]) => id === t?.font) ? t.font : d.font,
    studio: str(t?.studio, 60), client: str(t?.client), designer: str(t?.designer), ref: str(t?.ref, 40),
    title: str(t?.title, 60), note: str(t?.note, 200),
  };
}

export function storedTemplates() {
  try {
    const list = JSON.parse(globalThis.localStorage?.getItem(TEMPLATES_KEY) || '[]');
    return Array.isArray(list) ? list.map(cleanTemplate) : [];
  } catch {
    return [];
  }
}

export function storeTemplates(list) {
  try {
    globalThis.localStorage?.setItem(TEMPLATES_KEY, JSON.stringify(list.map(cleanTemplate)));
  } catch {
    /* spazio non disponibile: restano quelli del progetto */
  }
}

/* Modelli del progetto e del browser, senza doppioni (il progetto vince a parità di id). */
export function listTemplates(project) {
  const own = Array.isArray(project?.sheetTemplates) ? project.sheetTemplates.map(cleanTemplate) : [];
  const ids = new Set(own.map((t) => t.id));
  return [...own, ...storedTemplates().filter((t) => !ids.has(t.id))];
}

/* Opzioni per l'esportazione: formato fisico, scala, cartiglio sopra il marchio del progetto. */
export function templateOptions(t) {
  const c = cleanTemplate(t);
  const weight = LINE_WEIGHTS.find(([id]) => id === c.lines)?.[2] ?? 1;
  return {
    format: c.format, scale: c.scale, portrait: c.orientation === 'portrait', margin: c.margin, frame: c.frame, lineScale: weight, mono: c.mono, font: c.font,
    branding: { name: c.studio, client: c.client, designer: c.designer, ref: c.ref }, title: c.title, note: c.note,
  };
}
