import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, DoorOpen, FlipHorizontal2, Merge, PanelTop, Scissors, Trash2, Unlink, X } from 'lucide-react';
import { canMerge, checkStair, openingLine, runOf, stairRoom } from '../lib/walls';

const STAIR_TYPES = [['straight', 'Rampa'], ['l', 'A L'], ['u', 'A U']];
const ENTRY = [['N', ArrowUp, 'Parte dal lato nord'], ['E', ArrowRight, 'Parte dal lato est'], ['S', ArrowDown, 'Parte dal lato sud'], ['W', ArrowLeft, 'Parte dal lato ovest']];

/* Strumenti della modifica, nella barra fissa in cima: aggiungere una porta o una finestra, dividere un locale. */
export function EditTools({ addMode, splitDir, onAdd, onSplitDir }) {
  const tools = [['door', DoorOpen, 'Porta', 'Aggiungi una porta: clicca sul muro'], ['window', PanelTop, 'Finestra', 'Aggiungi una finestra: clicca su un muro esterno'],
    ['split', Scissors, 'Dividi', 'Dividi un locale con un muro nuovo']];
  return (
    <div className="pf-edittools">
      <div className="pf-segtools" role="group" aria-label="Strumenti di modifica">
        {tools.map(([id, Icon, label, tip]) => (
          <button key={id} type="button" className={addMode === id ? 'is-on' : ''} aria-pressed={addMode === id} title={tip} onClick={() => onAdd(id)}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>
      {addMode === 'split' && (
        <div className="pf-segtools is-small" role="radiogroup" aria-label="Direzione del taglio">
          {[['v', 'Muro verticale'], ['h', 'Muro orizzontale']].map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={splitDir === id} className={splitDir === id ? 'is-on' : ''} onClick={() => onSplitDir(id)}>{label}</button>
          ))}
        </div>
      )}
      {addMode && (
        <p className="pf-tip">
          {addMode === 'split' ? 'Clicca nel locale dove mettere il muro: le due parti restano collegate da una porta.'
            : `Clicca sul muro dove metterla${addMode === 'window' ? ' (solo muri esterni)' : ''}. Esc per annullare.`}
        </p>
      )}
    </div>
  );
}

/* Comandi della modifica diretta (compare con la modifica attiva): aggiungere, dividere, e regolare l'elemento selezionato. */
export default function EditPlanPanel({
  plan, selected, selectedWall, selectedStair, stairsHere, warning,
  onResize, onFlip, onRemove, onClose, onMerge, onOpenWall, onStair, onCloseWall, onCloseStair,
}) {
  const o = selected ? (selected.kind === 'door' ? plan.doors : plan.windows)[selected.index] : null;
  const run = o ? runOf(plan, o) : null;
  const max = run ? Math.max(0.6, +(run.hi - run.lo - 0.1).toFixed(2)) : 4;
  const name = (id) => plan.rooms.find((r) => r.id === id)?.name || 'esterno';
  const stair = selectedStair ? stairRoom(plan)?.stair : null;
  const idle = !selectedWall && !stair && !o;
  return (
    <section className="pf-sec pf-editplan">
      <h2>Modifica pianta</h2>
      {idle && <p className="pf-tip">Trascina un muro (in blu) per cambiare la misura dei locali, anche quelli esterni. Un clic lo seleziona. Annulla con Ctrl/Cmd+Z.</p>}
      {warning && <p className="pf-warn" role="alert">{warning}</p>}

      {selectedWall && (
        <div className="pf-editcard">
          <header>
            <span>Muro tra «{name(selectedWall.a)}» e «{name(selectedWall.b)}»</span>
            <button type="button" className="pf-x" onClick={onCloseWall} aria-label="Deseleziona"><X size={13} /></button>
          </header>
          <div className="pf-minirow">
            <button type="button" className="pf-minibtn" disabled={!canMerge(plan, selectedWall.a, selectedWall.b)} onClick={onMerge}
              title="Un solo locale (serve che i due formino un rettangolo)"><Merge size={12} /> Unisci</button>
            <button type="button" className="pf-minibtn" onClick={onOpenWall} title="Il muro sparisce, i locali restano una zona unica"><Unlink size={12} /> Apri muro</button>
          </div>
        </div>
      )}

      {stair && (
        <div className="pf-editcard">
          <header>
            <span>Scala{stairsHere > 1 ? ` · uguale su ${stairsHere} piani` : ''}</span>
            <button type="button" className="pf-x" onClick={onCloseStair} aria-label="Deseleziona"><X size={13} /></button>
          </header>
          <div className="pf-minirow" role="radiogroup" aria-label="Tipo di scala">
            {STAIR_TYPES.map(([id, label]) => {
              const c = checkStair(plan, { type: id });
              return (
                <button key={id} type="button" role="radio" aria-checked={stair.type === id} disabled={!c.ok && stair.type !== id} title={c.ok ? undefined : c.why}
                  className={`pf-minibtn ${stair.type === id ? 'is-on' : ''}`} onClick={() => onStair({ type: id })}>{label}</button>
              );
            })}
          </div>
          <div className="pf-minirow" role="radiogroup" aria-label="Lato di partenza">
            <em>Si sale da</em>
            {ENTRY.map(([id, Icon, label]) => {
              const c = checkStair(plan, { entry: id });
              return (
                <button key={id} type="button" role="radio" aria-checked={stair.entry === id} disabled={!c.ok && stair.entry !== id} title={c.ok ? label : `${label}: ${c.why}`}
                  aria-label={label} className={`pf-minibtn is-icon ${stair.entry === id ? 'is-on' : ''}`} onClick={() => onStair({ entry: id })}><Icon size={13} /></button>
              );
            })}
            {(() => {
              const other = { E: 'W', W: 'E', N: 'S', S: 'N' }[stair.hand];
              const c = checkStair(plan, { hand: other });
              return (
                <button type="button" className="pf-minibtn is-icon" disabled={!c.ok} aria-label="Specchia la rampa" title={c.ok ? 'Specchia la rampa' : c.why} onClick={() => onStair({ hand: other })}>
                  <FlipHorizontal2 size={13} />
                </button>
              );
            })()}
          </div>
          <p className="pf-tip">Trascina il vano per spostarlo; i suoi bordi si ridimensionano come gli altri muri.</p>
        </div>
      )}

      {o && (
        <div className="pf-editcard">
          <header>
            <span>{selected.kind === 'door' ? (o.entrance ? 'Porta d’ingresso' : 'Porta') : 'Finestra'} · {openingLine(o, plan.dimensions.width, plan.dimensions.length).start.toFixed(2).replace('.', ',')} m dal bordo</span>
            <button type="button" className="pf-x" onClick={onClose} aria-label="Deseleziona"><X size={13} /></button>
          </header>
          <div className="pf-minirow">
            <label className="pf-miniinput">
              <span>Larghezza</span>
              <input type="number" min="0.5" max={max} step="0.05" value={o.w} aria-label="Larghezza in metri"
                onChange={(e) => { const v = parseFloat(e.target.value); if (v >= 0.5) onResize(v); }} />
              <em>m</em>
            </label>
            {selected.kind === 'door' && !o.entrance && o.kind !== 'garage' && (
              <button type="button" className="pf-minibtn is-icon" onClick={onFlip} aria-label="Inverti apertura" title="Inverti il verso di apertura"><FlipHorizontal2 size={13} /></button>
            )}
            <button type="button" className="pf-minibtn is-icon is-danger" onClick={onRemove} aria-label="Elimina" title="Elimina (Canc)"><Trash2 size={13} /></button>
          </div>
        </div>
      )}
    </section>
  );
}
