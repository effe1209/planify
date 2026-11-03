import { FlipHorizontal2, Trash2, X } from 'lucide-react';

/* Pannello della modifica diretta di una pianta disegnata a mano: porta o finestra selezionata (larghezza, verso, elimina). */
export default function SketchEditPanel({ plan, selected, warning, onResize, onFlip, onRemove, onClose }) {
  const o = selected ? (selected.kind === 'door' ? plan.doors : plan.windows)[selected.index] : null;
  return (
    <section className="pf-sec pf-editplan">
      <h2>Modifica pianta disegnata</h2>
      {!o && (
        <p className="pf-tip">
          Trascina un vertice (cerchietto) o un lato per cambiare la forma del locale: i locali vicini seguono il muro in comune. Trascina il locale per spostarlo con i suoi arredi,
          un clic lo seleziona (nome, colori, arredi). Con «Porta» e «Finestra» ne aggiungi di nuove; quelle esistenti si trascinano lungo il muro. Annulla con Ctrl/Cmd+Z.
        </p>
      )}
      {warning && <p className="pf-warn" role="alert">{warning}</p>}
      {o && (
        <div className="pf-editcard">
          <header>
            <span>{selected.kind === 'door' ? (o.entrance ? 'Portoncino' : 'Porta') : 'Finestra'}</span>
            <button type="button" className="pf-x" onClick={onClose} aria-label="Deseleziona"><X size={13} /></button>
          </header>
          <label className="pf-field-sm">
            <span>Larghezza: {Math.round(o.w * 100)} cm</span>
            <input type="range" min={0.5} max={selected.kind === 'door' ? 1.4 : 3} step={0.05} value={o.w} aria-label="Larghezza"
              onChange={(e) => onResize(Number(e.target.value))} />
          </label>
          <div className="pf-minirow">
            {selected.kind === 'door' && (
              <button type="button" className="pf-minibtn" onClick={onFlip} title="Cambia il verso di apertura"><FlipHorizontal2 size={12} /> Verso</button>
            )}
            <button type="button" className="pf-minibtn is-danger" onClick={onRemove} title="Elimina (Canc)"><Trash2 size={12} /> Elimina</button>
          </div>
        </div>
      )}
    </section>
  );
}
