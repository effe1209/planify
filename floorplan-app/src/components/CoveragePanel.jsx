import { Eye, EyeOff, FileText, TriangleAlert } from 'lucide-react';
import { ASSUMPTIONS, COVER_COLORS } from '../lib/coverage';

const rgba = ([r, g, b, a]) => `rgba(${r},${g},${b},${Math.min(1, (a / 255) * 2.2)})`;
const m2 = (v) => v.toLocaleString('it-IT', { maximumFractionDigits: 1 });
const OPENING = { door: 'Porta', window: 'Finestra' };

/*
 * Copertura del piano aperto (lib/coverage.js, calcolata nel Web Worker): totale, barra per locale, zone cieche
 * con la causa (clic per evidenziarle in pianta), varchi verso l'esterno, ipotesi e relazione PDF di tutto il progetto.
 */
export default function CoveragePanel({ coverage, shown, onToggle, highlight, onHighlight, onReport }) {
  const rooms = coverage?.rooms.filter((r) => r.area > 0) || [];
  const watched = rooms.filter((r) => r.own > 0);   // locali con un sensore montato dentro
  const unwatched = rooms.filter((r) => r.own === 0 && r.kind !== 'garden');
  const sum = (list, k) => list.reduce((a, r) => a + r[k], 0);
  const pct = (list, k) => (sum(list, 'area') ? Math.round((100 * sum(list, k)) / sum(list, 'area')) : 0);
  const openings = coverage?.openings || [];
  const open = openings.filter((o) => !o.ok);

  return (
    <section className="pf-sec pf-coverage">
      <div className="pf-item-head">
        <h2>Copertura sensori</h2>
        <button type="button" className="pf-mini" onClick={onToggle} aria-pressed={shown}
          title={shown ? 'Nascondi la copertura in pianta' : 'Mostra la copertura in pianta'}>
          {shown ? <EyeOff size={13} /> : <Eye size={13} />} {shown ? 'Nascondi' : 'Mostra'}
        </button>
      </div>
      {!coverage ? (
        <p className="pf-hint">{shown ? 'Calcolo in corso…' : 'Mostra la copertura per calcolare le zone viste dai sensori.'}</p>
      ) : (
        <>
          <p className="pf-total">
            <b>{pct(watched, 'covered')}%</b> coperto nei locali sorvegliati
            {pct(watched, 'partial') > 0 && <span> · +{pct(watched, 'partial')}% parziale</span>}
          </p>
          <ul className="pf-cov-legend">
            <li><i style={{ background: rgba(COVER_COLORS.covered) }} /> Coperto</li>
            <li><i style={{ background: rgba(COVER_COLORS.overlap) }} /> Più sensori</li>
            <li><i style={{ background: rgba(COVER_COLORS.partial) }} /> Parziale</li>
            <li><i style={{ background: rgba(COVER_COLORS.blind) }} /> Cieco</li>
            <li><i style={{ background: rgba(COVER_COLORS.unwatched) }} /> Non sorvegliato</li>
          </ul>

          <ul className="pf-cov-rooms">
            {watched.map((r) => {
              const causes = r.blindCauses.filter((c) => c.area >= 0.1).slice(0, 3);
              return (
                <li key={r.id}>
                  <div className="pf-cov-row">
                    <span>{r.name}</span>
                    <b>{r.pct}%</b>
                  </div>
                  <div className="pf-cov-bar" role="img" aria-label={`${r.pct}% coperto, ${r.pctAny - r.pct}% parziale`}>
                    <i style={{ width: `${r.pct}%`, background: rgba(COVER_COLORS.covered) }} />
                    <i style={{ width: `${r.pctAny - r.pct}%`, background: rgba(COVER_COLORS.partial) }} />
                  </div>
                  {causes.length > 0 && (
                    <div className="pf-cov-causes">
                      {causes.map((c) => {
                        const on = highlight?.room === r.id && highlight.idx === c.idx;
                        return (
                          <button key={c.idx} type="button" className={`pf-chip ${on ? 'is-on' : ''}`}
                            onClick={() => onHighlight(on ? null : { room: r.id, idx: c.idx })}
                            title="Evidenzia la zona in pianta">
                            {c.label.toLowerCase()} {m2(c.area)} m²
                          </button>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {unwatched.length > 0 && (
            <p className="pf-hint">Senza un sensore proprio: {unwatched.map((r) => (r.pctAny ? `${r.name} (visto al ${r.pctAny}%)` : r.name)).join(', ')}.</p>
          )}

          {openings.length > 0 && (
            <details className="pf-bom" open={open.length > 0}>
              <summary>
                Varchi verso l'esterno · {openings.length - open.length}/{openings.length} protetti
              </summary>
              {open.length > 0 && (
                <ul className="pf-notes">
                  {open.map((o) => (
                    <li key={`${o.type}-${o.index}`}><TriangleAlert size={13} />
                      <span>{OPENING[o.type]} di {m2(o.w)} m in «{o.roomName}»: nessun contatto, tenda o volumetrico la sorveglia.</span></li>
                  ))}
                </ul>
              )}
              <ul className="pf-cov-open">
                {openings.filter((o) => o.ok).map((o) => (
                  <li key={`${o.type}-${o.index}`}><span>{OPENING[o.type]} {m2(o.w)} m · {o.roomName}</span><b>{o.by.join(' + ')}</b></li>
                ))}
              </ul>
            </details>
          )}
          <p className="pf-hint">Clic su una porta in pianta per aprirla o chiuderla nel calcolo.</p>
          {onReport && (
            <div className="pf-security-actions">
              <button type="button" className="pf-btn-add" onClick={onReport}
                title="PDF da allegare al preventivo: tavole di copertura di tutti i piani, rilevatori, locali, varchi, ipotesi e fonti">
                <FileText size={14} /> Relazione di copertura (PDF)
              </button>
            </div>
          )}
          <details className="pf-bom">
            <summary>Ipotesi di calcolo</summary>
            <ul className="pf-notes">
              {ASSUMPTIONS.map((a) => <li key={a}><span>{a}</span></li>)}
              <li><span>Dati dei sensori dalle schede e dai manuali ufficiali Ajax. La conformità dell'impianto (CEI 79-3, EN 50131) resta dell'installatore.</span></li>
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
