import { useState } from 'react';
import { Spline, Undo2, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, DoorOpen, FlipHorizontal2, Merge, PanelTop, RectangleHorizontal, Scissors, Trash2, Unlink, X } from 'lucide-react';
import { canMerge, checkStair, openingLine, runOf, stairRoom } from '../lib/walls';
import FinishPicker from './FinishPicker';
import { PANORAMIC_MAX, isPanoramic } from '../lib/openings';
import { GButton, GCheck } from '../glass';

const STAIR_TYPES = [['straight', 'Rampa'], ['l', 'A L'], ['u', 'A U']];
const ENTRY = [['N', ArrowUp, 'Parte dal lato nord'], ['E', ArrowRight, 'Parte dal lato est'], ['S', ArrowDown, 'Parte dal lato sud'], ['W', ArrowLeft, 'Parte dal lato ovest']];

/* Strumenti della modifica, nella barra fissa in cima: aggiungere una porta o una finestra, dividere un locale. */
export function EditTools({ addMode, splitDir, onAdd, onSplitDir, only = null }) {
  const tools = [['door', DoorOpen, 'Porta', 'Aggiungi una porta: clicca sul muro'], ['window', PanelTop, 'Finestra', 'Aggiungi una finestra: clicca su un muro esterno'],
    ['panoramic', RectangleHorizontal, 'Vetrata', 'Aggiungi una vetrata panoramica a tutta altezza: clicca su un muro esterno o verso il balcone'],
    ['sliding', RectangleHorizontal, 'Scorrevole', 'Aggiungi una vetrata scorrevole a tutta altezza: clicca su un muro, anche verso il balcone', true],
    ['balcony', PanelTop, 'Balcone', 'Aggiungi un balcone: clicca su un muro esterno, nasce un balcone con una finestra sul muro', true],
    ['split', Scissors, 'Muro', 'Aggiungi un muro: trascina nel locale per tracciarlo, poi tiralo col mouse per spostarlo']];
  return (
    <div className="pf-edittools">
      <div className="pf-segtools" role="group" aria-label="Strumenti di modifica">
        {tools.filter(([id, , , , sketchOnly]) => (only ? only.includes(id) : !sketchOnly)).map(([id, Icon, label, tip]) => (
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
          {addMode === 'split' ? 'Trascina nel locale lungo la linea del muro (la direzione si capisce dal gesto) oppure clicca per usare la direzione scelta. Le due parti restano collegate da una porta; il muro nuovo si sposta poi col mouse. Esc per annullare.'
            : addMode === 'balcony' ? 'Clicca su un muro esterno: il balcone nasce lì (1,2 m di profondità) con una finestra sul muro, che poi cambi in porta o vetrata dal pannello; trascina i lati del balcone per ridimensionarlo. Esc per annullare.'
            : `Clicca sul muro dove metterla${addMode === 'window' ? ' (solo muri esterni)' : addMode === 'panoramic' ? ' (muri esterni o verso il balcone)' : addMode === 'sliding' ? ' (anche tra due locali o verso il balcone)' : ''}. Esc per annullare.`}
        </p>
      )}
    </div>
  );
}

/* Comandi della modifica diretta (compare con la modifica attiva): aggiungere, dividere, e regolare l'elemento selezionato. */
export default function EditPlanPanel({
  plan, selected, selectedWall, selectedStair, stairsHere, warning,
  onResize, onFlip, onRemove, onClose, onMerge, onOpenWall, onStair, onCloseWall, onCloseStair, onType, onColor, onCurve, onStraighten, curving, onWallLook,
}) {
  const o = selected ? (selected.kind === 'door' ? plan.doors : plan.windows)[selected.index] : null;
  const run = o ? runOf(plan, o) : null;
  const max = run ? Math.max(0.6, +(Math.min(run.hi - run.lo - 0.1, o && isPanoramic(o) ? PANORAMIC_MAX : 99)).toFixed(2)) : 4;
  const typeOptions = !o ? null : selected.kind === 'window'
    ? [['window', 'Finestra'], ['panoramic', 'Vetrata panoramica'], ['sliding', 'Vetrata scorrevole']]
    : o.entrance || o.kind ? null : [['door', 'Porta'], ['sliding', 'Vetrata scorrevole'], ['panoramic', 'Vetrata fissa']];
  const curType = !o ? '' : o.type === 'sliding' ? 'sliding' : o.type === 'panoramic' ? 'panoramic' : selected.kind === 'door' ? 'door' : 'window';
  const name = (id) => plan.rooms.find((r) => r.id === id)?.name || 'esterno';
  const stair = selectedStair ? stairRoom(plan)?.stair : null;
  const idle = !selectedWall && !stair && !o;
  return (
    <section className="pf-sec pf-editplan">
      <h2>Modifica pianta</h2>
      {idle && <p className="pf-tip">Trascina un muro (in verde) per cambiare la misura dei locali, anche quelli esterni. Un clic lo seleziona. Annulla con Ctrl/Cmd+Z.</p>}
      {warning && <p className="pf-warn" role="alert">{warning}</p>}
      {idle && onCurve && <CurveCard plan={plan} onCurve={onCurve} onStraighten={onStraighten} busy={curving} />}

      {selectedWall && (
        <div className="pf-editcard">
          <header>
            <span>Muro tra «{name(selectedWall.a)}» e «{name(selectedWall.b)}»</span>
            <button type="button" className="pf-x" onClick={onCloseWall} aria-label="Deseleziona"><X size={13} /></button>
          </header>
          <div className="pf-minirow">
            <GButton type="button" className="pf-minibtn" disabled={!canMerge(plan, selectedWall.a, selectedWall.b)} onClick={onMerge}
              title="Un solo locale (serve che i due formino un rettangolo)"><Merge size={12} /> Unisci</GButton>
            <GButton type="button" className="pf-minibtn" onClick={onOpenWall} title="Il muro sparisce, i locali restano una zona unica"><Unlink size={12} /> Apri muro</GButton>
          </div>
          {onWallLook && (
            <FinishPicker parts={['wall']} title="Colore e materiale del muro"
              value={plan.wallLooks?.[`${Math.min(selectedWall.a, selectedWall.b)}-${Math.max(selectedWall.a, selectedWall.b)}`] ? { wall: plan.wallLooks[`${Math.min(selectedWall.a, selectedWall.b)}-${Math.max(selectedWall.a, selectedWall.b)}`] } : null}
              onChange={(v) => onWallLook(v?.wall || null)} />
          )}
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
                <GButton type="button" className="pf-minibtn is-icon" disabled={!c.ok} aria-label="Specchia la rampa" title={c.ok ? 'Specchia la rampa' : c.why} onClick={() => onStair({ hand: other })}>
                  <FlipHorizontal2 size={13} />
                </GButton>
              );
            })()}
          </div>
          <p className="pf-tip">Trascina il vano per spostarlo; i suoi bordi si ridimensionano come gli altri muri.</p>
        </div>
      )}

      {o && (
        <div className="pf-editcard">
          <header>
            <span>{o.type === 'sliding' ? 'Vetrata scorrevole' : o.type === 'panoramic' ? 'Vetrata panoramica' : selected.kind === 'door' ? (o.entrance ? 'Porta d’ingresso' : 'Porta') : 'Finestra'} · {openingLine(o, plan.dimensions.width, plan.dimensions.length).start.toFixed(2).replace('.', ',')} m dal bordo</span>
            <button type="button" className="pf-x" onClick={onClose} aria-label="Deseleziona"><X size={13} /></button>
          </header>
          {typeOptions && onType && (
            <div className="pf-seg pf-seg-small" role="radiogroup" aria-label="Tipo di apertura">
              {typeOptions.map(([v, text]) => (
                <button key={v} type="button" role="radio" aria-checked={curType === v} className={curType === v ? 'is-on' : ''} onClick={() => onType(v)}>{text}</button>
              ))}
            </div>
          )}
          {onColor && (
            <div className="pf-minirow">
              <label className="pf-miniinput">
                <span>Colore</span>
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color : '#ffffff'} aria-label="Colore dell'infisso o della porta"
                  onChange={(e) => onColor(e.target.value)} />
              </label>
              {o.color && <GButton type="button" className="pf-minibtn" onClick={() => onColor(null)} title="Torna al colore dello stile">Stile</GButton>}
            </div>
          )}
          <div className="pf-minirow">
            <label className="pf-miniinput">
              <span>Larghezza</span>
              <input type="number" min="0.5" max={max} step="0.05" value={o.w} aria-label="Larghezza in metri"
                onChange={(e) => { const v = parseFloat(e.target.value); if (v >= 0.5) onResize(v); }} />
              <em>m</em>
            </label>
            {selected.kind === 'door' && !o.entrance && o.kind !== 'garage' && o.type !== 'sliding' && (
              <GButton type="button" className="pf-minibtn is-icon" onClick={onFlip} aria-label="Inverti apertura" title="Inverti il verso di apertura"><FlipHorizontal2 size={13} /></GButton>
            )}
            <GButton type="button" className="pf-minibtn is-icon is-danger" onClick={onRemove} aria-label="Elimina" title="Elimina (Canc)"><Trash2 size={13} /></GButton>
          </div>
        </div>
      )}
    </section>
  );
}

const SIDES = [['N', 'Alto'], ['S', 'Basso'], ['W', 'Sinistra'], ['E', 'Destra']];

/* Facciata curva: lato (come sulla pianta), freccia dell'arco e, se serve, solo un tratto del lato. */
function CurveCard({ plan, onCurve, onStraighten, busy }) {
  const [side, setSide] = useState('S');
  const [bulge, setBulge] = useState(1.2);
  const [partial, setPartial] = useState(false);
  const full = side === 'N' || side === 'S' ? plan.dimensions.width : plan.dimensions.length;
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(null);
  const hi = to ?? full;
  const curved = !!plan.curve;
  return (
    <div className="pf-editcard">
      <header><span>{curved ? `Facciata curva · ${SIDES.find(([v]) => v === plan.curve.side)?.[1] || ''}` : 'Curva una facciata'}</span></header>
      {curved ? (
        <div className="pf-minirow">
          <GButton type="button" className="pf-minibtn" disabled={!onStraighten} onClick={onStraighten}
            title="Torna alla pianta dritta com'era prima della curva (le modifiche fatte dopo si perdono; Annulla le recupera)">
            <Undo2 size={12} /> Raddrizza
          </GButton>
        </div>
      ) : (
        <>
          <div className="pf-seg pf-seg-small" role="radiogroup" aria-label="Lato da curvare">
            {SIDES.map(([v, text]) => (
              <button key={v} type="button" role="radio" aria-checked={side === v} className={side === v ? 'is-on' : ''}
                onClick={() => { setSide(v); setTo(null); setFrom(0); }}>{text}</button>
            ))}
          </div>
          <div className="pf-minirow">
            <label className="pf-miniinput">
              <span>Freccia</span>
              <input type="number" min="0.2" max="3" step="0.1" value={bulge} aria-label="Freccia dell'arco in metri"
                onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) setBulge(v); }} />
              <em>m</em>
            </label>
            <label className="pf-check"><GCheck checked={partial} onChange={(e) => setPartial(e.target.checked)} /><span>Solo un tratto</span></label>
          </div>
          {partial && (
            <div className="pf-minirow">
              <label className="pf-miniinput"><span>Da</span>
                <input type="number" min="0" max={full} step="0.1" value={from} aria-label="Inizio del tratto in metri"
                  onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) setFrom(v); }} /><em>m</em></label>
              <label className="pf-miniinput"><span>A</span>
                <input type="number" min="0" max={full} step="0.1" value={+hi.toFixed(2)} aria-label="Fine del tratto in metri"
                  onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) setTo(v); }} /><em>m</em></label>
            </div>
          )}
          <div className="pf-minirow">
            <GButton type="button" className="pf-minibtn" disabled={busy} onClick={() => onCurve({ side, bulge, ...(partial && { a0: from, a1: hi }) })}>
              <Spline size={12} /> {busy ? 'Curvo…' : 'Curva'}
            </GButton>
          </div>
          <p className="pf-tip">Muri, stanze, porte e finestre seguono l'arco; la pianta cresce della freccia. Una sola facciata per piano.</p>
        </>
      )}
    </div>
  );
}
