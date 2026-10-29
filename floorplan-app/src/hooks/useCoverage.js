import { useEffect, useRef, useState } from 'react';
import { coverFloor } from '../lib/coverage';

/*
 * Copertura del piano aperto, calcolata in un Web Worker: mentre un calcolo è in corso si tiene solo l'ultima
 * richiesta (durante il trascinamento di un sensore arrivano molte posizioni). Senza Worker calcola sul posto.
 * Restituisce { rooms, openings, sensors } dell'ultimo calcolo concluso per questa pianta, o null.
 */
export function useCoverage(plan, devices, doors, enabled) {
  const [result, setResult] = useState(null);
  const worker = useRef(null);
  const state = useRef({ busy: false, pending: null, seq: 0, plans: {} });

  useEffect(() => () => worker.current?.terminate(), []);

  useEffect(() => {
    if (!enabled || !plan || !devices) return undefined;
    const job = { plan, devices, doors };
    const st = state.current;
    let cancelled = false;
    const send = (j) => {
      st.busy = true;
      st.seq += 1;
      st.plans = { [st.seq]: j.plan };   // il risultato vale solo per la pianta da cui è partito
      worker.current.postMessage({ id: st.seq, ...j });
    };
    if (typeof Worker === 'undefined') {
      const t = setTimeout(() => !cancelled && setResult({ ...coverFloor(plan, devices, { doors }), plan }), 0);
      return () => { cancelled = true; clearTimeout(t); };
    }
    if (!worker.current) {
      worker.current = new Worker(new URL('../lib/coverage.worker.js', import.meta.url), { type: 'module' });
      worker.current.onmessage = (e) => {
        st.busy = false;
        if (!e.data.error) setResult({ ...e.data, plan: st.plans[e.data.id] });
        if (st.pending) {
          const next = st.pending;
          st.pending = null;
          send(next);
        }
      };
    }
    if (st.busy) st.pending = job;
    else send(job);
    return () => { cancelled = true; };
  }, [enabled, plan, devices, doors]);

  return enabled && result?.plan === plan ? result : null;
}
