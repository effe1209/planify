import { useCallback, useEffect, useState } from 'react';
import { normalizeBaseUrl } from '../lib/utils';
import { requestBase, waitForEngine } from '../lib/engine';

/* Funzioni che il sito si aspetta dal motore (vedi FEATURES in main.py). */
export const REQUIRED_FEATURES = ['room_program', 'kitchen_mode', 'peninsula'];

const KEEP_ALIVE_MS = 10 * 60 * 1000;   // sotto i ~15 minuti dopo cui Render spegne il servizio gratuito

/*
 * Stato del motore collegato, letto da /health:
 *   off      nessun URL configurato
 *   checking prima verifica in corso
 *   waking   il server si sta avviando (avvio a freddo): si riprova da soli
 *   ok       motore aggiornato: tutti i filtri vengono applicati
 *   old      motore raggiungibile ma vecchio: ignora i filtri che non conosce
 *   error    nessuna risposta dopo ~3 minuti (`reason` dice perché); `retry()` riprova
 */
export function useEngine(backendUrl) {
  const base = requestBase(normalizeBaseUrl(backendUrl));
  const [result, setResult] = useState({ base: null });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!base) return undefined;
    const controller = new AbortController();
    const check = async () => {
      try {
        const data = await waitForEngine(base, {
          signal: controller.signal,
          onWaiting: (seconds) => setResult({ base, attempt, status: 'waking', seconds }),
        });
        const features = Array.isArray(data.features) ? data.features : [];
        const missing = REQUIRED_FEATURES.filter((f) => !features.includes(f));
        setResult({ base, attempt, status: missing.length ? 'old' : 'ok', version: data.version, features, missing });
      } catch (err) {
        if (err.name !== 'AbortError') setResult({ base, attempt, status: 'error', reason: err.message });
      }
    };
    const timer = setTimeout(check, 500);
    // finché la pagina è aperta, un ping ogni 10 minuti evita che Render spenga il motore
    const keepAlive = setInterval(() => {
      if (document.visibilityState === 'visible') fetch(`${base}/health`, { cache: 'no-store' }).catch(() => {});
    }, KEEP_ALIVE_MS);
    return () => {
      clearTimeout(timer);
      clearInterval(keepAlive);
      controller.abort();
    };
  }, [base, attempt]);

  if (!base) return { status: 'off', retry };
  // finché la risposta non riguarda l'URL e il tentativo attuali, la verifica è in corso
  return result.base === base && result.attempt === attempt ? { ...result, retry } : { status: 'checking', retry };
}
