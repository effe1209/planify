import { CheckCircle2, Lightbulb } from 'lucide-react';

/* Valutazione progettuale calcolata dal motore: punteggio, punti di forza e cosa migliorare. */
export default function DesignReport({ design }) {
  if (!design) return null;
  const { score, grade, strengths = [], issues = [] } = design;
  const tone = score >= 85 ? 'is-great' : score >= 70 ? 'is-good' : 'is-weak';
  return (
    <section className="pf-sec pf-design">
      <h2>Valutazione del progetto</h2>
      <div className={`pf-design-score ${tone}`}>
        <svg viewBox="0 0 36 36" width="54" height="54" aria-hidden="true">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="3.5" />
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 97.4} 97.4`} transform="rotate(-90 18 18)" />
        </svg>
        <div>
          <strong>{score}<small>/100</small></strong>
          <span>{grade}</span>
        </div>
      </div>
      {strengths.length > 0 && (
        <ul className="pf-design-list">
          {strengths.map((t) => <li key={t} className="is-ok"><CheckCircle2 size={14} /><span>{t}</span></li>)}
        </ul>
      )}
      {issues.length > 0 && (
        <ul className="pf-design-list">
          {issues.map((t) => <li key={t} className="is-tip"><Lightbulb size={14} /><span>{t}</span></li>)}
        </ul>
      )}
      <p className="pf-hint">
        Il motore genera più varianti e sceglie quella che valuta meglio per luce, circolazione, proporzioni, privacy
        e arredo. Prova «Nuova variante» per vedere alternative.
      </p>
    </section>
  );
}
