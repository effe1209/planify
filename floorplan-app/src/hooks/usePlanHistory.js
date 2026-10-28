import { useCallback, useEffect, useState } from 'react';
import { newId, storage } from '../lib/utils';
import { activeFloor, normalizeProject, updateFloor } from '../lib/project';

/*
 * Cronologia dei progetti. Ogni voce è un progetto multi-piano (vedi lib/project.js):
 * { id, name, saved, createdAt, activeFloor, floors: [{ id, name, level, plan, meta, params, sketch? }] }.
 *   - le modifiche fatte alla pianta aperta aggiornano la sua voce (niente lavoro perso)
 *   - le voci "salvate" (stella) non vengono mai scartate né cancellate da «Svuota»
 *   - con il consenso, tutto resta su questo dispositivo (localStorage) tra una visita e l'altra
 */
const KEY = 'planify.history';
const MAX_RECENT = 12;   // voci non salvate tenute in memoria
const MAX_SAVED = 40;

function trim(list) {
  let recent = 0;
  return list.filter((e) => e.saved || ++recent <= MAX_RECENT).slice(0, MAX_SAVED + MAX_RECENT);
}

/* Scrive su localStorage; se la quota è piena scarta le voci non salvate più vecchie e riprova. */
function persist(list) {
  let rest = list;
  while (!storage.setJson(KEY, rest)) {
    const idx = rest.map((e) => !e.saved).lastIndexOf(true);
    if (idx < 0) return false;
    rest = rest.filter((_, i) => i !== idx);
  }
  return true;
}

/**
 * @param {'on'|'off'|'pending'} storageMode  'pending' = l'utente non ha ancora scelto: non si salva
 *   ma nemmeno si cancella; 'off' = consenso negato o revocato: i dati salvati vengono rimossi.
 */
export function usePlanHistory(storageMode) {
  const enabled = storageMode === 'on';
  // anche in attesa di scelta si rilegge quanto salvato con un consenso precedente (es. scaduto):
  // se l'utente riaccetta, la cronologia non va persa
  const [entries, setEntries] = useState(() => {
    const stored = storageMode !== 'off' ? storage.getJson(KEY, []) : [];
    return Array.isArray(stored) ? stored.map(normalizeProject) : [];
  });
  const [currentId, setCurrentId] = useState(() => entries[0]?.id ?? null);

  // consenso revocato: i dati salvati spariscono subito; consenso attivo: ogni modifica viene salvata
  useEffect(() => {
    if (storageMode === 'off') storage.remove(KEY);
    else if (enabled) persist(entries);
  }, [entries, enabled, storageMode]);

  const add = useCallback((entry) => {
    const full = normalizeProject({ id: newId(), createdAt: new Date().toISOString(), saved: false, name: '', ...entry });
    setEntries((list) => trim([full, ...list]));
    setCurrentId(full.id);
    return full;
  }, []);

  const update = useCallback((id, fn) => {
    setEntries((list) => list.map((e) => (e.id === id ? fn(e) : e)));
  }, []);

  /* Modifica la pianta del piano attivo del progetto. */
  const updatePlan = useCallback((id, fn) => update(id, (e) => {
    const floor = activeFloor(e);
    return floor ? updateFloor(e, floor.id, (f) => ({ ...f, plan: fn(f.plan) })) : e;
  }), [update]);
  const toggleSaved = useCallback((id) => update(id, (e) => ({ ...e, saved: !e.saved })), [update]);
  const rename = useCallback((id, name) => update(id, (e) => ({ ...e, name })), [update]);

  const remove = useCallback((id) => {
    setEntries((list) => list.filter((e) => e.id !== id));
    setCurrentId((cur) => (cur === id ? null : cur));
  }, []);

  /* Svuota la cronologia tenendo le planimetrie salvate e quella aperta. */
  const clear = useCallback(() => {
    setEntries((list) => list.filter((e) => e.saved || e.id === currentId));
  }, [currentId]);

  const current = entries.find((e) => e.id === currentId) || null;

  return { entries, current, currentId, setCurrentId, add, update, updatePlan, toggleSaved, rename, remove, clear };
}
