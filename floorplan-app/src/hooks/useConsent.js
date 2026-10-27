import { useCallback, useState } from 'react';
import { storage } from '../lib/utils';

/*
 * Consenso a cookie e archiviazione locale.
 *   - necessari (sempre attivi): preferenze tecniche (tema, URL del motore) e la scelta stessa
 *   - history:   salvare la cronologia delle planimetrie su questo dispositivo
 *   - analytics: statistiche di utilizzo anonime (Vercel Web Analytics, senza cookie)
 * Si chiede di nuovo il consenso quando cambia la versione dell'informativa.
 */
export const CONSENT_KEY = 'planify.consent';
export const CONSENT_VERSION = 1;

const MAX_AGE_MS = 365 * 24 * 3600 * 1000;   // il consenso va rinnovato dopo 12 mesi

function read() {
  const c = storage.getJson(CONSENT_KEY);
  if (!c || c.version !== CONSENT_VERSION) return null;
  return Date.now() - Date.parse(c.date) < MAX_AGE_MS ? c : null;
}

export function useConsent() {
  const [consent, setConsent] = useState(read);

  const save = useCallback((choice) => {
    const next = {
      version: CONSENT_VERSION,
      history: !!choice.history,
      analytics: !!choice.analytics,
      date: new Date().toISOString(),
    };
    storage.setJson(CONSENT_KEY, next);
    setConsent(next);
  }, []);

  return {
    consent,
    decided: consent !== null,
    allowHistory: !!consent?.history,
    allowAnalytics: !!consent?.analytics,
    save,
  };
}
