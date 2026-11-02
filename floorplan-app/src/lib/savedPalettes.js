/*
 * Palette salvate dall'utente: restano nel browser (valgono per tutti i progetti) così, cambiando stile, si può
 * rimettere con un clic la palette fatta. Ogni voce: { id, name, colors: { walls, facade, floor, wood, fabric } }.
 */
import { cleanPalette } from './palette';
import { newId, storage } from './utils';

export const SAVED_PALETTES_KEY = 'planify.palettes';
const MAX = 24;

const tidy = (list) => (Array.isArray(list) ? list : [])
  .map((e) => ({ id: String(e?.id || ''), name: String(e?.name || '').trim().slice(0, 40), colors: cleanPalette(e?.colors) }))
  .filter((e) => e.id && e.name && e.colors)
  .slice(0, MAX);

export const loadPalettes = () => tidy(storage.getJson(SAVED_PALETTES_KEY, []));

const write = (list) => { storage.set(SAVED_PALETTES_KEY, JSON.stringify(list)); return list; };

/* Salva (o aggiorna, se il nome c'è già) una palette; ritorna l'elenco aggiornato. */
export function savePalette(name, colors, list = loadPalettes()) {
  const n = String(name || '').trim().slice(0, 40);
  const c = cleanPalette(colors);
  if (!n || !c) return list;
  const same = list.find((e) => e.name.toLowerCase() === n.toLowerCase());
  const rest = list.filter((e) => e !== same);
  return write([{ id: same?.id || newId(), name: n, colors: c }, ...rest].slice(0, MAX));
}

export const deletePalette = (id, list = loadPalettes()) => write(list.filter((e) => e.id !== id));
