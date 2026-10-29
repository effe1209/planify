import { Calculator, RotateCcw, Trash2 } from 'lucide-react';
import { DEFAULT_PRICES } from '../lib/estimate';

const eur = (v) => `${Math.round(v).toLocaleString('it-IT')} €`;
const qtyFmt = (v) => v.toLocaleString('it-IT', { maximumFractionDigits: 1 });

/*
 * Preventivo indicativo di tutto il progetto: voci per categoria con quantità dalle piante e dagli impianti,
 * prezzi unitari modificabili (salvati nel progetto), imprevisti, IVA e costo al metro quadro.
 */
export default function EstimatePanel({ config, data, onStart, onChange, onClear }) {
  if (!config) {
    return (
      <section className="pf-sec pf-electric">
        <h2>Preventivo indicativo</h2>
        <p className="pf-hint">
          Stima dei costi di tutto il progetto: opere edili, pavimenti, serramenti, impianti e cucina, con quantità
          ricavate dalle piante e prezzi unitari che puoi modificare.
        </p>
        <div className="pf-security-actions">
          <button type="button" className="pf-btn-add" onClick={onStart}><Calculator size={14} /> Calcola preventivo</button>
        </div>
      </section>
    );
  }
  const setPrice = (key, v) => {
    const n = parseFloat(String(v).replace(',', '.'));
    onChange({ prices: { ...config.prices, [key]: Number.isFinite(n) && n >= 0 ? n : DEFAULT_PRICES[key] } });
  };
  const edited = Object.keys(config.prices || {}).length > 0;
  return (
    <section className="pf-sec pf-electric pf-estimate">
      <h2>Preventivo indicativo</h2>
      <p className="pf-total"><b>{eur(data.total)}</b> IVA compresa · {eur(data.perSqm)}/m² su {qtyFmt(data.area)} m²</p>
      <div className="pf-row2">
        <label className="pf-field-sm">
          <span>IVA</span>
          <select className="pf-input-sm" value={config.vat} onChange={(e) => onChange({ vat: Number(e.target.value) })}>
            <option value={10}>10% (ristrutturazione)</option>
            <option value={22}>22% (nuova costruzione)</option>
            <option value={4}>4% (prima casa, nuova)</option>
          </select>
        </label>
        <label className="pf-field-sm">
          <span>Imprevisti</span>
          <select className="pf-input-sm" value={config.contingency} onChange={(e) => onChange({ contingency: Number(e.target.value) })}>
            {[0, 5, 10, 15, 20].map((v) => <option key={v} value={v}>{v}%</option>)}
          </select>
        </label>
      </div>
      {data.byCat.map((c) => (
        <details key={c.cat} className="pf-bom">
          <summary>{c.cat} <b className="pf-cat-total">{eur(c.total)}</b></summary>
          <table className="pf-est-table">
            <thead><tr><th>Voce</th><th>Q.tà</th><th>€/u</th><th>Totale</th></tr></thead>
            <tbody>
              {c.rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td>{qtyFmt(r.qty)} {r.unit}</td>
                  <td>
                    <input className="pf-price" type="number" min="0" step="1" value={r.price} aria-label={`Prezzo unitario ${r.label}`}
                      onChange={(e) => setPrice(r.key, e.target.value)} />
                  </td>
                  <td>{eur(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
      <table className="pf-el-table">
        <tbody>
          <tr><td>Lavori</td><td>{eur(data.subtotal)}</td></tr>
          <tr><td>Imprevisti {data.contingency}%</td><td>{eur(data.extra)}</td></tr>
          <tr><td>IVA {data.vat}%</td><td>{eur(data.tax)}</td></tr>
          <tr><td><b>Totale</b></td><td><b>{eur(data.total)}</b></td></tr>
        </tbody>
      </table>
      <div className="pf-security-actions">
        {edited && (
          <button type="button" className="pf-mini" onClick={() => onChange({ prices: {} })} title="Torna ai prezzi predefiniti">
            <RotateCcw size={13} /> Prezzi predefiniti
          </button>
        )}
        <button type="button" className="pf-mini" onClick={onClear} title="Rimuovi il preventivo dal progetto"
          aria-label="Rimuovi il preventivo"><Trash2 size={13} /></button>
      </div>
      <p className="pf-hint pf-el-disclaimer">
        Prezzi medi indicativi (fornitura e posa, IVA esclusa): variano per zona, finiture e impresa. Arredi,
        progettazione, pratiche e oneri esclusi. Serve come ordine di grandezza, non come offerta.
      </p>
    </section>
  );
}
