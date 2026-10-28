import { Droplets, Trash2, TriangleAlert } from 'lucide-react';
import { GENERATORS, PIPES, PKIND_ORDER, PKINDS } from '../lib/plumbing';
import { fmtM } from '../lib/utils';
import { PlumbingGlyph } from './PlumbingLayer';

/*
 * Impianto idrico-sanitario: generatore dell'acqua calda, tavola on/off, apparecchi e collettore del piano,
 * colonne di scarico di tutto il progetto con portata e diametro, legenda e distinta.
 */
export default function PlumbingPanel({ config, data, floorId, sheet, onStart, onSheet, onChange, onClear }) {
  if (!config) {
    return (
      <section className="pf-sec pf-electric">
        <h2>Impianto idraulico</h2>
        <p className="pf-hint">
          Attacchi di acqua fredda, calda e scarico di ogni sanitario, collettore di piano, contatore, generatore
          dell'acqua calda e colonne di scarico allineate tra i piani fino alla fognatura. Una tavola a parte.
        </p>
        <div className="pf-security-actions">
          <button type="button" className="pf-btn-add" onClick={onStart}><Droplets size={14} /> Progetta impianto idraulico</button>
        </div>
      </section>
    );
  }
  const fl = data?.floors[floorId];
  const counts = new Map();
  for (const p of fl?.points || []) counts.set(p.kind, (counts.get(p.kind) || 0) + 1);
  const legend = [...counts].sort((a, b) => PKIND_ORDER.indexOf(a[0]) - PKIND_ORDER.indexOf(b[0]));
  const lineKinds = [...new Set((fl?.lines || []).map((l) => l.kind))];
  const fixtures = new Map();
  for (const f of fl?.fixtures || []) fixtures.set(f.name, (fixtures.get(f.name) || 0) + 1);
  const stacksHere = (data?.stacks || []).filter((s) => fl?.points.some((p) => (p.kind === 'stack' || p.kind === 'stack_pass') && p.tag === s.id));

  return (
    <section className="pf-sec pf-electric">
      <h2>Impianto idraulico</h2>
      <div className="pf-field-sm">
        <span>Acqua calda</span>
        <div className="pf-seg" role="radiogroup" aria-label="Generatore dell'acqua calda">
          {Object.entries(GENERATORS).map(([id, g]) => (
            <button key={id} type="button" role="radio" aria-checked={config.generator === id} title={g.label}
              className={config.generator === id ? 'is-on' : ''} onClick={() => onChange({ generator: id })}>
              {{ heatpump: 'Pompa di calore', gas: 'Caldaia', electric: 'Scaldabagno' }[id]}
            </button>
          ))}
        </div>
      </div>
      <label className="pf-check">
        <input type="checkbox" checked={config.lines} onChange={(e) => onChange({ lines: e.target.checked })} />
        <span>Tubazioni <em>(fredda, calda, scarichi e dorsali)</em></span>
      </label>
      <div className="pf-security-actions">
        <button type="button" className="pf-btn-add" onClick={() => onSheet(sheet === 'plumbing' ? 'arch' : 'plumbing')}>
          <Droplets size={14} /> {sheet === 'plumbing' ? 'Torna alla pianta' : 'Mostra tavola idraulica'}
        </button>
        <button type="button" className="pf-mini" onClick={onClear} title="Rimuovi l'impianto idraulico dal progetto"
          aria-label="Rimuovi l'impianto idraulico"><Trash2 size={13} /></button>
      </div>

      {fl && (
        <>
          <p className="pf-hint">
            {fixtures.size ? [...fixtures].map(([n, q]) => `${n} ×${q}`).join(' · ') : 'Nessun sanitario su questo piano.'}
            {fl.supply && <><br />Collettore: <b>{fl.points.find((p) => p.kind === 'manifold')?.outputs}</b> uscite ·
              dorsale {fmtM(fl.supply.q)} l/s, multistrato {fl.supply.pipe}</>}
          </p>

          {stacksHere.length > 0 && (
            <table className="pf-el-table">
              <thead><tr><th>Colonna</th><th>ΣDU</th><th>Qww</th><th>Ø</th></tr></thead>
              <tbody>
                {stacksHere.map((s) => (
                  <tr key={s.id} className={s.ok ? '' : 'is-short'} title={s.rooms.join(', ')}>
                    <td>{s.id}<small> · {s.floors} {s.floors === 1 ? 'piano' : 'piani'}</small></td>
                    <td>{fmtM(s.du)}</td>
                    <td>{fmtM(s.q)} l/s</td>
                    <td>{s.d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {fl.notes.length > 0 && (
            <ul className="pf-notes">
              {fl.notes.map((n, i) => <li key={i}><TriangleAlert size={13} /> <span>{n}</span></li>)}
            </ul>
          )}

          <ul className="pf-el-legend">
            {legend.map(([kind, qty]) => (
              <li key={kind}>
                <svg width="24" height="22" viewBox="-12 -11 24 22" aria-hidden="true"><PlumbingGlyph kind={kind} tag={
                  kind === 'generator' ? GENERATORS[config.generator].tag : undefined} /></svg>
                <span>{kind === 'generator' ? GENERATORS[config.generator].label : PKINDS[kind].label}</span>
                <b>×{qty}</b>
              </li>
            ))}
            {lineKinds.map((k) => (
              <li key={`l-${k}`}>
                <svg width="24" height="22" viewBox="0 -11 24 22" aria-hidden="true">
                  <line x1="2" y1="0" x2="22" y2="0" stroke={PIPES[k].stroke} strokeWidth={PIPES[k].width + 0.4}
                    strokeDasharray={PIPES[k].dash} />
                </svg>
                <span>{PIPES[k].label}</span>
                <b />
              </li>
            ))}
          </ul>
        </>
      )}

      {data?.stacks.length > 0 && (
        <details className="pf-bom">
          <summary>Colonne di scarico del progetto</summary>
          <table>
            <thead><tr><th>Colonna</th><th>Locali serviti</th><th>Portata e Ø</th></tr></thead>
            <tbody>
              {data.stacks.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.id}</b><small>{s.floors} {s.floors === 1 ? 'piano' : 'piani'} · {s.length} m</small></td>
                  <td>{s.rooms.join(', ')}</td>
                  <td>{fmtM(s.q)} l/s<small>Ø{s.d} · ΣDU {fmtM(s.du)}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="pf-hint">Qww = 0,5 · √ΣDU (UNI EN 12056-2, abitazioni); colonne con ventilazione primaria oltre la copertura.</p>
        </details>
      )}
      {data?.bom.length > 0 && (
        <details className="pf-bom">
          <summary>Distinta di tutto il progetto</summary>
          <table>
            <thead><tr><th>Componente</th><th>Q.tà</th></tr></thead>
            <tbody>
              {data.bom.map((b) => <tr key={b.key}><td>{b.label}</td><td>{fmtM(b.qty)} {b.unit}</td></tr>)}
            </tbody>
          </table>
          <p className="pf-hint">Metri di tubo dai percorsi disegnati, più il 10% per sfridi e raccordi.</p>
        </details>
      )}
      <p className="pf-hint pf-el-disclaimer">
        Schema indicativo per preventivi e per l'idraulico: percorsi, pendenze e diametri vanno verificati in cantiere;
        il progetto e la dichiarazione di conformità spettano a un tecnico abilitato (DM 37/08).
      </p>
    </section>
  );
}
