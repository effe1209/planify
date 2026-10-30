import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { checkCompliance } from '../lib/compliance';

/* Verifica della pianta rispetto alla normativa nazionale: ogni voce cita la fonte; un clic porta al locale. */
export default function CompliancePanel({ plan, type, onSelectRoom }) {
  const res = useMemo(() => checkCompliance(plan, { type }), [plan, type]);
  if (!plan) return null;
  const tone = res.fail ? 'is-weak' : res.warn ? 'is-good' : 'is-great';
  const title = res.fail
    ? `${res.fail} ${res.fail === 1 ? 'punto non conforme' : 'punti non conformi'}`
    : res.warn ? 'Conforme, con alcune attenzioni' : 'Conforme alla norma nazionale';
  return (
    <section className="pf-sec pf-compliance">
      <h2>Conformità normativa</h2>
      <div className={`pf-design-score ${tone}`}>
        <div>
          <strong>{title}</strong>
          <span>{res.warn > 0 && res.fail > 0 ? `${res.warn} ${res.warn === 1 ? 'attenzione' : 'attenzioni'} · ` : ''}Norma nazionale (DM 5/7/1975, DM 236/1989)</span>
        </div>
      </div>
      {res.items.length > 0 && (
        <ul className="pf-design-list">
          {res.items.map((it, i) => (
            <li key={`${it.id}-${i}`} className={it.level === 'fail' ? 'is-bad' : 'is-tip'}>
              {it.level === 'fail' ? <XCircle size={14} /> : <AlertTriangle size={14} />}
              <span>
                {it.roomId != null
                  ? <button type="button" className="pf-link" onClick={() => onSelectRoom?.(it.roomId)}>{it.text}</button>
                  : it.text}
                <small className="pf-ref"> · {it.ref}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
      {res.ok.length > 0 && (
        <ul className="pf-design-list">
          {res.ok.map((t) => <li key={t} className="is-ok"><CheckCircle2 size={14} /><span>{t}</span></li>)}
        </ul>
      )}
      <p className="pf-hint">
        Verifica automatica sulla sola norma nazionale: il Regolamento Edilizio del tuo Comune può chiedere di più.
        Altezze, parapetti, distanze e impianti non sono ancora controllati. Non sostituisce il progetto di un tecnico abilitato.
      </p>
    </section>
  );
}
