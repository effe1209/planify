import { RotateCcw } from 'lucide-react';
import { MATERIALS } from '../lib/materials';
import { GButton } from '../glass';

const HEX = /^#[0-9a-f]{6}$/i;
const ROWS = { floor: ['Pavimento', 'floor'], wall: ['Pareti', 'walls'] };

/*
 * Materiale e colore di un pezzo della casa (un locale o un muro) che sostituiscono quelli dello stile.
 * value = { floor?: { mat?, color? }, wall?: { mat?, color? } }; parts = ['floor', 'wall'] o solo ['wall'].
 */
export default function FinishPicker({ value, parts = ['floor', 'wall'], onChange, title = 'Colore e materiale' }) {
  const set = (part, patch) => {
    const cur = { ...(value?.[part] || {}), ...patch };
    for (const k of Object.keys(cur)) if (!cur[k]) delete cur[k];
    const next = { ...(value || {}) };
    if (Object.keys(cur).length) next[part] = cur; else delete next[part];
    onChange(Object.keys(next).length ? next : null);
  };
  return (
    <div className="pf-field-sm pf-finish">
      <span>{title}</span>
      {parts.map((part) => {
        const [label, key] = ROWS[part];
        const cur = value?.[part] || {};
        return (
          <div key={part} className="pf-finish-row">
            <label>
              <em>{label}</em>
              <select className="pf-input-sm" value={cur.mat || ''} aria-label={`Materiale: ${label}`} onChange={(e) => set(part, { mat: e.target.value })}>
                <option value="">Come lo stile</option>
                {MATERIALS[key].map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <input type="color" aria-label={`Colore: ${label}`} value={HEX.test(cur.color || '') ? cur.color : (MATERIALS[key].find((m) => m.id === cur.mat)?.spec.color || MATERIALS[key].find((m) => m.id === cur.mat)?.spec.a || '#e6e2da')}
              onChange={(e) => set(part, { color: e.target.value })} />
            <GButton type="button" className="pf-btn-icon" title="Ripristina lo stile" aria-label={`Ripristina ${label}`} disabled={!value?.[part]}
              onClick={() => set(part, { mat: null, color: null })}><RotateCcw size={12} /></GButton>
          </div>
        );
      })}
    </div>
  );
}
