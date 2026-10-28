import { Check, Trash2, TriangleAlert, Zap } from 'lucide-react';
import { APPLIANCES, KIND_ORDER, KINDS, LEVELS } from '../lib/electric';
import { ElectricGlyph } from './ElectricLayer';

/*
 * Impianto elettrico: livello CEI 64-8, tavola elettrica on/off, verifica delle dotazioni per locale,
 * circuiti del quadro del piano, legenda e distinta di tutto il progetto.
 */
export default function ElectricPanel({ config, data, floorId, sheet, onStart, onSheet, onChange, onClear }) {
  if (!config) {
    return (
      <section className="pf-sec pf-electric">
        <h2>Impianto elettrico</h2>
        <p className="pf-hint">
          Punti luce, comandi, prese, prese dedicate agli elettrodomestici, TV e dati, quadro e circuiti su ogni piano,
          secondo i livelli della norma CEI 64-8. Una tavola a parte, sopra la pianta.
        </p>
        <div className="pf-security-actions">
          <button type="button" className="pf-btn-add" onClick={onStart}><Zap size={14} /> Progetta impianto elettrico</button>
        </div>
      </section>
    );
  }
  const fl = data?.floors[floorId];
  const counts = new Map();
  for (const p of fl?.points || []) {
    const key = p.kind === 'dedicated' ? `dedicated:${p.tag}` : p.kind;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const legend = [...counts].map(([key, qty]) => {
    const [kind, tag] = key.split(':');
    return { kind, tag, qty, label: tag ? `${KINDS[kind].label} · ${APPLIANCES[tag] || tag}` : KINDS[kind].label };
  }).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const total = data ? Object.values(data.floors).reduce((s, f) => s + f.points.length, 0) : 0;
  const ok = (r) => r.got.sockets >= r.need.sockets && r.got.lights >= r.need.lights
    && r.got.tv >= r.need.tv && r.got.data >= r.need.data;

  return (
    <section className="pf-sec pf-electric">
      <h2>Impianto elettrico</h2>
      <div className="pf-field-sm">
        <span>Livello prestazionale CEI 64-8</span>
        <div className="pf-seg" role="radiogroup" aria-label="Livello CEI 64-8">
          {[1, 2, 3].map((lv) => (
            <button key={lv} type="button" role="radio" aria-checked={config.level === lv}
              className={config.level === lv ? 'is-on' : ''} onClick={() => onChange({ level: lv })}>{LEVELS[lv].label}</button>
          ))}
        </div>
      </div>
      <p className="pf-hint">{LEVELS[config.level].desc}</p>
      <label className="pf-check">
        <input type="checkbox" checked={config.links} onChange={(e) => onChange({ links: e.target.checked })} />
        <span>Collegamenti <em>(comandi → luci e dorsali dal quadro)</em></span>
      </label>
      <div className="pf-security-actions">
        <button type="button" className="pf-btn-add" onClick={() => onSheet(sheet === 'electric' ? 'arch' : 'electric')}>
          <Zap size={14} /> {sheet === 'electric' ? 'Torna alla pianta' : 'Mostra tavola elettrica'}
        </button>
        <button type="button" className="pf-mini" onClick={onClear} title="Rimuovi l'impianto elettrico dal progetto"
          aria-label="Rimuovi l'impianto elettrico"><Trash2 size={13} /></button>
      </div>

      {fl && (
        <>
          <p className="pf-hint"><b>{fl.points.length}</b> punti su questo piano, <b>{total}</b> nel progetto.</p>
          <table className="pf-el-table">
            <thead><tr><th>Locale</th><th>Prese</th><th>Luci</th><th>TV/Dati</th><th /></tr></thead>
            <tbody>
              {fl.rooms.map((r) => (
                <tr key={r.id} className={ok(r) ? '' : 'is-short'}>
                  <td>{r.name}</td>
                  <td>{r.got.sockets}/{r.need.sockets}</td>
                  <td>{r.got.lights}/{r.need.lights}</td>
                  <td>{r.got.tv + r.got.data}/{r.need.tv + r.need.data}</td>
                  <td>{ok(r) ? <Check size={13} aria-label="conforme" /> : <TriangleAlert size={13} aria-label="sotto il minimo" />}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <details className="pf-bom" open>
            <summary>Quadro: circuiti del piano ({fl.circuits.filter((c) => c.key !== 'S').length} di potenza, minimo {fl.minCircuits})</summary>
            <table>
              <thead><tr><th>Circuito</th><th>Protezione e cavo</th><th>Punti</th></tr></thead>
              <tbody>
                {fl.circuits.map((c) => (
                  <tr key={c.key}>
                    <td><b>{c.key}</b><small>{c.name}</small></td>
                    <td>{c.prot}<small>{c.cable}</small></td>
                    <td>{c.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pf-hint">
              Generale magnetotermico in base al contratto; differenziali 30 mA tipo A divisi in almeno due gruppi
              (giorno / notte) così un guasto non spegne tutta la casa.
            </p>
          </details>

          {fl.notes.length > 0 && (
            <ul className="pf-notes">
              {fl.notes.map((n, i) => <li key={i}><TriangleAlert size={13} /> <span>{n}</span></li>)}
            </ul>
          )}

          <ul className="pf-el-legend">
            {legend.map((l) => (
              <li key={`${l.kind}-${l.tag || ''}`}>
                <ElectricGlyph kind={l.kind} tag={l.tag} />
                <span>{l.label}</span>
                <b>×{l.qty}</b>
              </li>
            ))}
          </ul>
        </>
      )}

      {data?.bom.length > 0 && (
        <details className="pf-bom">
          <summary>Distinta di tutto il progetto</summary>
          <table>
            <thead><tr><th>Componente</th><th>Q.tà</th></tr></thead>
            <tbody>
              {data.bom.map((b) => <tr key={`${b.kind}-${b.tag || ''}`}><td>{b.label}</td><td>{b.qty}</td></tr>)}
            </tbody>
          </table>
        </details>
      )}
      <p className="pf-hint pf-el-disclaimer">
        Schema indicativo per preventivi e per l'installatore: il progetto esecutivo e la dichiarazione di conformità
        spettano a un tecnico abilitato (DM 37/08).
      </p>
    </section>
  );
}
