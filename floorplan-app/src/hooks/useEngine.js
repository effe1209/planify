import { useEffect, useState } from 'react';
import { normalizeBaseUrl } from '../lib/utils';

/* Funzioni che il sito si aspetta dal motore (vedi FEATURES in main.py). */
export const REQUIRED_FEATURES = ['room_program', 'kitchen_mode', 'peninsula'];

/*
 * Stato del motore collegato, letto da /health:
 *   off      nessun URL configurato
 *   checking verifica in corso
 *   ok       motore aggiornato: tutti i filtri vengono applicati
 *   old      motore raggiungibile ma vecchio: ignora i filtri che non conosce
 *   error    motore non raggiungibile
 */
export function useEngine(backendUrl) {
  const base = normalizeBaseUrl(backendUrl);
  const [result, setResult] = useState({ base: null });

  useEffect(() => {
    if (!base) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${base}/health`, { signal: controller.signal });
        const data = await res.json();
        const features = Array.isArray(data.features) ? data.features : [];
        const missing = REQUIRED_FEATURES.filter((f) => !features.includes(f));
        setResult({ base, status: missing.length ? 'old' : 'ok', version: data.version, features, missing });
      } catch (err) {
        if (err.name !== 'AbortError') setResult({ base, status: 'error' });
      }
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [base]);

  if (!base) return { status: 'off' };
  // finché la risposta non riguarda l'URL attuale, la verifica è in corso
  return result.base === base ? result : { status: 'checking' };
}
