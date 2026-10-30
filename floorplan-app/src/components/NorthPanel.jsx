import { Compass } from 'lucide-react';
import { SECTORS, exposures, normNorth } from '../lib/orientation';

const NAME = { N: 'Nord', E: 'Est', S: 'Sud', O: 'Ovest' };

/* Orientamento della casa: dove sta il nord sul foglio e quanto vetro guarda ogni punto cardinale. */
export default function NorthPanel({ plan, north = 0, onNorth }) {
  const ex = exposures(plan, north);
  const tot = SECTORS.reduce((a, k) => a + ex[k], 0) || 1;
  const nord = ex.N / tot;
  return (
    <section className="pf-sec pf-north">
      <h2>Orientamento</h2>
      <div className="pf-north-row">
        <svg viewBox="-24 -24 48 48" width="44" height="44" aria-hidden="true">
          <circle r="21" fill="none" stroke="currentColor" strokeOpacity="0.3" />
          <g transform={`rotate(${north})`}>
            <path d="M0 -17 L6 10 L0 5 L-6 10 Z" fill="currentColor" />
            <text y="-19" fontSize="0" />
          </g>
        </svg>
        <label className="pf-field">
          <span>Nord ruotato di</span>
          <div>
            <input type="number" min="0" max="359" step="5" value={north}
              onChange={(e) => onNorth(normNorth(e.target.value))} />
            <em>°</em>
          </div>
        </label>
      </div>
      <input type="range" min="0" max="359" step="5" value={north} aria-label="Rotazione del nord"
        onChange={(e) => onNorth(normNorth(e.target.value))} className="pf-north-range" />
      <ul className="pf-north-list">
        {SECTORS.map((k) => (
          <li key={k}><Compass size={12} /> <span>{NAME[k]}</span><b>{ex[k].toFixed(1).replace('.', ',')} m²</b></li>
        ))}
      </ul>
      {ex.N + ex.E + ex.S + ex.O > 0 && (
        <p className="pf-hint">
          {nord > 0.4
            ? 'Molto vetro a nord: per l’energia meglio spostarlo verso sud, est o ovest.'
            : ex.S >= ex.N ? 'Buona esposizione: più vetro a sud che a nord.' : 'Vetro di finestre per esposizione, altezza assunta 1,40 m.'}
        </p>
      )}
    </section>
  );
}
