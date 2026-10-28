import { Minus, Plus } from 'lucide-react';

/* Controlli del programma dell'appartamento: camere, bagni, cucina, penisola. */

function Stepper({ label, value, min, max, onChange }) {
  return (
    <div className="pf-stepper">
      <span>{label}</span>
      <div>
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
          aria-label={`Meno ${label.toLowerCase()}`}><Minus size={13} /></button>
        <strong aria-live="polite">{value}</strong>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
          aria-label={`Più ${label.toLowerCase()}`}><Plus size={13} /></button>
      </div>
    </div>
  );
}

function Segmented({ label, value, options, onChange }) {
  return (
    <div className="pf-field-sm">
      <span>{label}</span>
      <div className="pf-seg" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v}
            className={value === v ? 'is-on' : ''} onClick={() => onChange(v)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

const NEEDS = [
  ['suite', 'Suite padronale', '(bagno privato e cabina armadio)'],
  ['study', 'Studio', '(smart working)'],
  ['storage', 'Ripostiglio / lavanderia', ''],
];

export default function LayoutOptions({ form, setF }) {
  const beds = form.doubles + form.singles;
  return (
    <div className="pf-program">
      <Stepper label="Camere matrimoniali" value={form.doubles} min={form.singles ? 0 : 1} max={4}
        onChange={(v) => setF('doubles', v)} />
      <Stepper label="Camere singole" value={form.singles} min={form.doubles ? 0 : 1} max={4}
        onChange={(v) => setF('singles', v)} />
      <Segmented label="Bagni" value={form.baths} onChange={(v) => setF('baths', v)}
        options={[['auto', 'Auto'], [1, '1'], [2, '2'], [3, '3']]} />
      <Segmented label="Cucina" value={form.kitchen} onChange={(v) => setF('kitchen', v)}
        options={[['auto', 'Automatica'], ['open', 'A vista'], ['closed', 'Separata']]} />
      <label className="pf-check">
        <input type="checkbox" checked={form.peninsula} onChange={(e) => setF('peninsula', e.target.checked)} />
        <span>Penisola in cucina <em>(se lo spazio lo consente)</em></span>
      </label>

      <div className="pf-needs">
        <span className="pf-needs-title">Come vivi la casa</span>
        <Segmented label="Ingresso separato" value={form.entry} onChange={(v) => setF('entry', v)}
          options={[['auto', 'Il migliore'], [true, 'Sì'], [false, 'No']]} />
        {NEEDS.map(([key, label, hint]) => (
          <label key={key} className="pf-check" title={hint}>
            <input type="checkbox" checked={form[key]} onChange={(e) => setF(key, e.target.checked)} />
            <span>{label} <em>{hint}</em></span>
          </label>
        ))}
      </div>
      <p className="pf-hint">
        {beds} {beds === 1 ? 'camera' : 'camere'} · {beds + 1} locali. Se qualcosa non entra nelle misure, la pianta lo
        segnala nelle note e propone il massimo possibile.
      </p>
    </div>
  );
}

