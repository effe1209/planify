/*
 * Collegamento al motore (backend FastAPI).
 *
 * Sul piano gratuito di Render il servizio si spegne dopo ~15 minuti di inattività: la prima richiesta
 * riceve una pagina HTML «Application loading» (spesso senza intestazioni CORS, quindi il browser la vede
 * come errore di rete) finché il server non è ripartito, in genere entro un minuto (dopo un deploy anche di più). Questi casi sono
 * trattati come «in avvio» e si riprova, invece di dichiarare il motore irraggiungibile al primo colpo.
 */

const PING_TIMEOUT_MS = 15000;
const RETRY_EVERY_MS = 4000;
export const WAKE_TIMEOUT_MS = 180000;   // dopo un deploy il piano gratuito può superare i 2 minuti

/* Una lettura di /health: { ok: true, data } oppure { ok: false, reason }. Lancia solo se `signal` è annullato. */
export async function pingEngine(base, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(`${base}/health`, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return { ok: false, reason: `risposta HTTP ${res.status}` };
    const text = await res.text();
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch {
      return { ok: false, reason: 'il server risponde con una pagina di caricamento' };
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    return { ok: false, reason: err.name === 'AbortError' ? 'nessuna risposta entro 15 secondi' : 'connessione rifiutata o server in avvio' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => {
    clearTimeout(t);
    reject(new DOMException('Aborted', 'AbortError'));
  }, { once: true });
});

/*
 * Attende che il motore risponda, riprovando per al massimo `maxMs`.
 * `onWaiting(secondi)` viene chiamata a ogni tentativo fallito (per mostrare «si sta avviando»).
 */
export async function waitForEngine(base, { signal, onWaiting, maxMs = WAKE_TIMEOUT_MS } = {}) {
  const start = Date.now();
  for (;;) {
    const r = await pingEngine(base, signal);
    if (r.ok) return r.data;
    const waited = Date.now() - start;
    if (waited >= maxMs) {
      throw new Error(`il motore ${base} non risponde da ${Math.round(waited / 1000)} secondi (${r.reason}). Controlla l'URL e lo stato del servizio su Render.`);
    }
    onWaiting?.(Math.round(waited / 1000));
    await sleep(RETRY_EVERY_MS, signal);
  }
}
