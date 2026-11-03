import { Footprints, Trash2 } from 'lucide-react';
import { FLOOR_RISE, extStairGeometry, facadeEdges } from '../lib/extStair';

const SIDES = [['N', 'Nord'], ['E', 'Est'], ['S', 'Sud'], ['W', 'Ovest']];

/*
 * Scala esterna al giardino: per la casa che comincia al primo piano e si scende in giardino da fuori. Si sceglie il lato della
 * facciata, dove sta lungo il muro, se la rampa va verso il giardino o corre lungo la facciata, larghezza e dislivello.
 */
export default function ExtStairPanel({ plan, level, onSet, onRemove, error }) {
  const es = plan.extStair;
  const side = es?.side;
  const defaultRise = Math.max(1, typeof level === 'number' ? level : 1) * FLOOR_RISE;
  const set = (patch) => onSet({ side: side || 'S', t: es?.t ?? 0.5, w: es?.w ?? 1, mode: es?.mode ?? 'straight', flip: es?.flip ?? false, rise: es?.rise ?? defaultRise, ...patch });
  const g = es ? extStairGeometry(es) : null;
  return (
    <section className="pf-sec pf-extstair-panel">
      <h2><Footprints size={14} /> Scala esterna al giardino</h2>
      {!es ? (
        <>
          <p className="pf-hint">Per la casa al primo piano con la scala che scende in giardino: pianerottolo davanti alla porta e rampa fino a terra. Metti una porta sul muro della scala.</p>
          <div className="pf-segtools" role="group" aria-label="Lato della facciata">
            {SIDES.map(([id, label]) => (
              <button key={id} type="button" disabled={!facadeEdges(plan, id).length} onClick={() => set({ side: id })}>{label}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="pf-segtools" role="radiogroup" aria-label="Lato della facciata">
            {SIDES.map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={side === id} className={side === id ? 'is-on' : ''} disabled={!facadeEdges(plan, id).length}
                onClick={() => set({ side: id })}>{label}</button>
            ))}
          </div>
          <div className="pf-segtools is-small" role="radiogroup" aria-label="Forma della rampa">
            {[['straight', 'Verso il giardino'], ['side', 'Lungo la facciata']].map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={es.mode === id} className={es.mode === id ? 'is-on' : ''} onClick={() => set({ mode: id })}>{label}</button>
            ))}
          </div>
          <label className="pf-field-sm">
            <span>Posizione lungo il muro</span>
            <input type="range" min={0} max={1} step={0.02} value={es.t ?? 0.5} aria-label="Posizione della scala lungo il muro" onChange={(e) => set({ t: Number(e.target.value) })} />
          </label>
          {es.mode === 'side' && (
            <label className="pf-check"><input type="checkbox" checked={!!es.flip} onChange={(e) => set({ flip: e.target.checked })} /><span>Rampa dall&apos;altra parte</span></label>
          )}
          <label className="pf-field-sm">
            <span>Larghezza della rampa: {Math.round(es.w * 100)} cm</span>
            <input type="range" min={0.8} max={1.6} step={0.05} value={es.w} aria-label="Larghezza della rampa" onChange={(e) => set({ w: Number(e.target.value) })} />
          </label>
          <label className="pf-field-sm">
            <span>Dislivello dal giardino: {es.rise.toFixed(2).replace('.', ',')} m</span>
            <input type="range" min={0.5} max={6} step={0.05} value={es.rise} aria-label="Dislivello dal giardino" onChange={(e) => set({ rise: Number(e.target.value) })} />
          </label>
          <p className="pf-hint">{g.count} alzate da {Math.round((es.rise / g.count) * 100)} cm; ingombro {g.bounds.w.toFixed(1).replace('.', ',')} × {g.bounds.h.toFixed(1).replace('.', ',')} m.</p>
          <button type="button" className="pf-minibtn is-danger" onClick={onRemove}><Trash2 size={12} /> Togli la scala esterna</button>
        </>
      )}
      {error && <p className="pf-warn" role="alert">{error}</p>}
    </section>
  );
}
