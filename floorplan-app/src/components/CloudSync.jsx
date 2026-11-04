import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { sharePayload } from '../lib/share';
import { GButton } from '../glass';

/*
 * Salvataggio automatico sul cloud, in un componente a parte: il suo stato (Salvo…, Salvato, offline, conflitto) non fa
 * ridisegnare la pianta e la vista 3D. Salva 2,5 s dopo l'ultima modifica, solo per i progetti già sul cloud; l'indicatore ha
 * una larghezza fissa e non sposta il resto della barra. `apiRef.current.baseline(project)` dice che un progetto è appena stato
 * aperto dal cloud (è già salvato).
 */
export default function CloudSync({ cx, current, shared, onUpdate, onAdd, apiRef }) {
  const [status, setStatus] = useState('idle');   // idle | saving | saved | error | conflict
  const sig = useRef(new Map());                  // progetto locale → ultima versione salvata (per non salvare due volte lo stesso)
  const latest = useRef(current);
  latest.current = current;

  if (apiRef) apiRef.current = { baseline: (p) => sig.current.set(p.id, JSON.stringify(sharePayload(p))) };

  const save = async (project, { force = false } = {}) => {
    const s = JSON.stringify(sharePayload(project));
    setStatus('saving');
    try {
      const res = await cx.api.current.save(project, { force });
      sig.current.set(project.id, s);
      onUpdate(project.id, (p) => ({ ...p, cloudSaved: res.updated_at, cloudShare: res.share_token }));
      setStatus('saved');
    } catch (err) {
      setStatus(err.conflict ? 'conflict' : 'error');
    }
  };

  useEffect(() => {
    if (!cx.user || !current?.cloudId || shared || status === 'conflict' || status === 'saving') return undefined;
    const t = setTimeout(() => {
      const c = latest.current;
      const s = JSON.stringify(sharePayload(c));
      if (!sig.current.has(c.id)) { sig.current.set(c.id, s); return; }   // appena aperto o collegato: è già sul cloud
      if (sig.current.get(c.id) !== s) save(c);
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, cx.user, shared, status]);
  useEffect(() => { setStatus('idle'); }, [current?.id]);

  if (!current?.cloudId || !cx.user || shared) return null;
  const text = { idle: '', saving: 'Salvo…', saved: 'Salvato', error: 'Non salvato', conflict: 'Versione più recente' }[status];
  return (
    <span className={`pf-cloud-status is-${status}`} role="status" aria-live="polite">
      <span className="pf-cloud-status-text">{status === 'saved' && <Check size={12} />}{text}</span>
      {status === 'error' && <GButton type="button" className="pf-mini" onClick={() => save(current)}>Riprova</GButton>}
      {status === 'conflict' && (
        <>
          <GButton type="button" className="pf-mini" onClick={async () => {
            const { id: _l, ...p } = await cx.api.current.open(current.cloudId);
            const e = onAdd({ ...p, name: `${p.name || 'Progetto'} (cloud)` });
            apiRef?.current?.baseline(e);
          }}>Apri quella</GButton>
          <GButton type="button" className="pf-mini is-danger" onClick={() => save(current, { force: true })}>Tieni la mia</GButton>
        </>
      )}
    </span>
  );
}
