import { DoorOpen, FlipHorizontal2, Move, PanelTop, Trash2, X } from 'lucide-react';
import { openingLine, runOf } from '../lib/walls';

/* Modifica diretta della pianta: attiva i muri e le aperture trascinabili, aggiunge porte e finestre, regola quella selezionata. */
export default function EditPlanPanel({ plan, on, addMode, selected, busy, onToggle, onAdd, onResize, onFlip, onRemove, onClose }) {
  const o = selected ? (selected.kind === 'door' ? plan.doors : plan.windows)[selected.index] : null;
  const run = o ? runOf(plan, o) : null;
  const max = run ? Math.max(0.6, +(run.hi - run.lo - 0.3).toFixed(2)) : 4;
  return (
    <section className="pf-sec pf-editplan">
      <h2>Modifica pianta</h2>
      <button type="button" className={`pf-btn-add ${on ? 'is-on' : ''}`} onClick={onToggle} aria-pressed={on} disabled={busy}>
        <Move size={13} /> {on ? 'Termina la modifica' : 'Modifica muri e aperture'}
      </button>
      {on && (
        <>
          <p className="pf-hint">
            Trascina i muri interni (in blu) per cambiare la misura dei locali; trascina porte e finestre lungo il muro.
            I locali che cambiano vengono riarredati.
          </p>
          <div className="pf-row">
            <button type="button" className={`pf-btn-add ${addMode === 'door' ? 'is-on' : ''}`} onClick={() => onAdd('door')}><DoorOpen size={13} /> Aggiungi porta</button>
            <button type="button" className={`pf-btn-add ${addMode === 'window' ? 'is-on' : ''}`} onClick={() => onAdd('window')}><PanelTop size={13} /> Aggiungi finestra</button>
          </div>
          {addMode && <p className="pf-hint">Clicca sul muro dove metterla{addMode === 'window' ? ' (solo muri esterni)' : ''}.</p>}
        </>
      )}
      {on && o && (
        <div className="pf-field-sm">
          <span>{selected.kind === 'door' ? (o.entrance ? 'Porta d’ingresso' : 'Porta') : 'Finestra'} selezionata
            <button type="button" className="pf-customizer-close" onClick={onClose} aria-label="Deseleziona"><X size={14} /></button>
          </span>
          <label className="pf-field-sm">
            <span>Larghezza (m)</span>
            <input type="number" className="pf-input-sm" min="0.6" max={max} step="0.05" value={o.w}
              onChange={(e) => { const v = parseFloat(e.target.value); if (v >= 0.6) onResize(v); }} />
          </label>
          <div className="pf-row">
            {selected.kind === 'door' && !o.entrance && o.kind !== 'garage' && (
              <button type="button" className="pf-btn-add" onClick={onFlip}><FlipHorizontal2 size={13} /> Inverti apertura</button>
            )}
            <button type="button" className="pf-btn-add" onClick={onRemove}><Trash2 size={13} /> Elimina</button>
          </div>
          <p className="pf-hint">Posizione lungo il muro: {openingLine(o, plan.dimensions.width, plan.dimensions.length).start.toFixed(2).replace('.', ',')} m.</p>
        </div>
      )}
    </section>
  );
}
