import { RotateCcw } from 'lucide-react';
import { LOOKS, MATERIALS, MATERIAL_ROWS, STRUCTURES, cleanMaterials } from '../lib/materials';

/* Materiali della casa: per facciata, tetto, pareti e pavimenti si sceglie il tipo; la struttura in legno aggiunge pilastri, travi e portico.
   Le combinazioni pronte impostano materiali e colori insieme. */
export default function MaterialsPanel({ materials, onChange, onLook }) {
  const cur = cleanMaterials(materials) || {};
  const set = (key, value) => onChange(cleanMaterials({ ...cur, [key]: value || undefined }));
  return (
    <section className="pf-sec pf-materials">
      <h2>Materiali della casa</h2>
      <p className="pf-hint">Scegli di che cosa sono fatti facciata, tetto, pareti e pavimenti. Il colore si regola a parte in «Colori della casa».</p>
      <div className="pf-chips" role="group" aria-label="Combinazioni pronte">
        {LOOKS.map((l) => (
          <button key={l.id} type="button" className="pf-chip" onClick={() => onLook({ materials: cleanMaterials(l.materials), palette: l.palette })}>{l.name}</button>
        ))}
      </div>
      <ul className="pf-mat-list">
        {MATERIAL_ROWS.map(({ key, label }) => (
          <li key={key}>
            <label>
              <span>{label}</span>
              <select value={cur[key] || ''} aria-label={`Materiale: ${label}`} onChange={(e) => set(key, e.target.value)}>
                <option value="">Come lo stile</option>
                {MATERIALS[key].map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
          </li>
        ))}
        <li>
          <label>
            <span>Struttura</span>
            <select value={cur.structure || 'standard'} aria-label="Struttura della casa" onChange={(e) => set('structure', e.target.value === 'wood' ? 'wood' : undefined)}>
              {STRUCTURES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        </li>
        {cur.structure === 'wood' && (
          <li>
            <label className="pf-check">
              <input type="checkbox" checked={cur.porch !== false} aria-label="Portico d'ingresso"
                onChange={(e) => onChange(cleanMaterials({ ...cur, porch: e.target.checked ? undefined : false }))} />
              <span>Portico d&apos;ingresso <em>(la tettoia sopra il portoncino)</em></span>
            </label>
          </li>
        )}
      </ul>
      <div className="pf-row">
        <button type="button" className="pf-btn-add" disabled={!Object.keys(cur).length} onClick={() => onChange(null)}>
          <RotateCcw size={13} /> Torna ai materiali dello stile
        </button>
      </div>
    </section>
  );
}
