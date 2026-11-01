import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, DoorOpen, FlipHorizontal2, Merge, PanelTop, Scissors, Trash2, Unlink, X } from 'lucide-react';
import { canMerge, checkStair, openingLine, runOf, stairRoom } from '../lib/walls';

const STAIR_TYPES = [['straight', 'Rampa'], ['l', 'A L'], ['u', 'A U']];
const ENTRY = [['N', ArrowUp, 'Parte dal lato nord'], ['E', ArrowRight, 'Parte dal lato est'], ['S', ArrowDown, 'Parte dal lato sud'], ['W', ArrowLeft, 'Parte dal lato ovest']];

/* Comandi della modifica diretta (compare con la modifica attiva): aggiungere, dividere, e regolare l'elemento selezionato. */
export default function EditPlanPanel({
  plan, addMode, splitDir, selected, selectedWall, selectedStair, stairsHere,
  onAdd, onSplitDir, onResize, onFlip, onRemove, onClose, onMerge, onOpenWall, onStair, onCloseWall, onCloseStair,
}) {
  const o = selected ? (selected.kind === 'door' ? plan.doors : plan.windows)[selected.index] : null;
  const run = o ? runOf(plan, o) : null;
  const max = run ? Math.max(0.6, +(run.hi - run.lo - 0.3).toFixed(2)) : 4;
  const name = (id) => plan.rooms.find((r) => r.id === id)?.name || '';
  const stair = selectedStair ? stairRoom(plan)?.stair : null;
  return (
    <section className="pf-sec pf-editplan">
      <h2>Modifica pianta</h2>
      <p className="pf-hint">
        Trascina i muri interni (in blu) per cambiare la misura dei locali; un clic su un muro lo seleziona.
        Trascina porte, finestre e il vano scala. Annulla con Ctrl/Cmd+Z.
      </p>
      <div className="pf-row">
        <button type="button" className={`pf-btn-add ${addMode === 'door' ? 'is-on' : ''}`} onClick={() => onAdd('door')}><DoorOpen size={13} /> Porta</button>
        <button type="button" className={`pf-btn-add ${addMode === 'window' ? 'is-on' : ''}`} onClick={() => onAdd('window')}><PanelTop size={13} /> Finestra</button>
        <button type="button" className={`pf-btn-add ${addMode === 'split' ? 'is-on' : ''}`} onClick={() => onAdd('split')}><Scissors size={13} /> Dividi locale</button>
      </div>
      {(addMode === 'door' || addMode === 'window') && <p className="pf-hint">Clicca sul muro dove metterla{addMode === 'window' ? ' (solo muri esterni)' : ''}.</p>}
      {addMode === 'split' && (
        <>
          <div className="pf-row" role="radiogroup" aria-label="Direzione del taglio">
            <button type="button" role="radio" aria-checked={splitDir === 'v'} className={`pf-chip ${splitDir === 'v' ? 'is-on' : ''}`} onClick={() => onSplitDir('v')}>Muro verticale</button>
            <button type="button" role="radio" aria-checked={splitDir === 'h'} className={`pf-chip ${splitDir === 'h' ? 'is-on' : ''}`} onClick={() => onSplitDir('h')}>Muro orizzontale</button>
          </div>
          <p className="pf-hint">Clicca nel locale dove mettere il muro: le due parti restano collegate da una porta.</p>
        </>
      )}

      {selectedWall && (
        <div className="pf-field-sm">
          <span>Muro tra «{name(selectedWall.a)}» e «{name(selectedWall.b)}»
            <button type="button" className="pf-customizer-close" onClick={onCloseWall} aria-label="Deseleziona"><X size={14} /></button>
          </span>
          <div className="pf-row">
            <button type="button" className="pf-btn-add" disabled={!canMerge(plan, selectedWall.a, selectedWall.b)} onClick={onMerge}
              title="Un solo locale (serve che i due formino un rettangolo)"><Merge size={13} /> Unisci i locali</button>
            <button type="button" className="pf-btn-add" onClick={onOpenWall} title="Il muro sparisce, i locali restano una zona unica"><Unlink size={13} /> Apri il muro</button>
          </div>
        </div>
      )}

      {stair && (
        <div className="pf-field-sm">
          <span>Scala {stairsHere > 1 ? `(uguale su ${stairsHere} piani)` : ''}
            <button type="button" className="pf-customizer-close" onClick={onCloseStair} aria-label="Deseleziona"><X size={14} /></button>
          </span>
          <div className="pf-row" role="radiogroup" aria-label="Tipo di scala">
            {STAIR_TYPES.map(([id, label]) => {
              const c = checkStair(plan, { type: id });
              return (
                <button key={id} type="button" role="radio" aria-checked={stair.type === id} disabled={!c.ok && stair.type !== id} title={c.ok ? undefined : c.why}
                  className={`pf-chip ${stair.type === id ? 'is-on' : ''}`} onClick={() => onStair({ type: id })}>{label}</button>
              );
            })}
          </div>
          <span>Da dove si sale</span>
          <div className="pf-row" role="radiogroup" aria-label="Lato di partenza">
            {ENTRY.map(([id, Icon, label]) => {
              const c = checkStair(plan, { entry: id });
              return (
                <button key={id} type="button" role="radio" aria-checked={stair.entry === id} disabled={!c.ok && stair.entry !== id} title={c.ok ? label : `${label}: ${c.why}`}
                  aria-label={label} className={`pf-chip ${stair.entry === id ? 'is-on' : ''}`} onClick={() => onStair({ entry: id })}><Icon size={13} /></button>
              );
            })}
            {(() => {
              const other = { E: 'W', W: 'E', N: 'S', S: 'N' }[stair.hand];
              const c = checkStair(plan, { hand: other });
              return (
                <button type="button" className="pf-chip" disabled={!c.ok} title={c.ok ? 'Specchia la rampa' : c.why} onClick={() => onStair({ hand: other })}>
                  <FlipHorizontal2 size={13} /> Specchia
                </button>
              );
            })()}
          </div>
          <p className="pf-hint">Trascina il vano scala per spostarlo: scambia spazio con i locali ai due lati, su tutti i piani.</p>
        </div>
      )}

      {o && (
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

