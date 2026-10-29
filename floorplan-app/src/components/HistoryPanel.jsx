import { Star, Trash2 } from 'lucide-react';
import { SHAPE_NAME, TYPE_NAME } from '../constants';
import { fmtM } from '../lib/utils';
import PlanSvg from './PlanSvg';
import { activeFloor } from '../lib/project';

const THUMB_LAYERS = { furniture: false, labels: false, dims: false, grid: false };

const entryTitle = (e) => {
  if (e.floors.length > 1) return `${e.name || 'Progetto'} · ${e.floors.length} piani`;
  const f = activeFloor(e);
  return e.name || `${TYPE_NAME[f.meta?.type] || 'Pianta'} ${SHAPE_NAME[f.plan.shape] || ''}`.trim();
};

/* Cronologia: miniature con stella (salva in modo permanente) ed eliminazione singola. */
export default function HistoryPanel({ entries, currentId, persistent, onOpen, onToggleSaved, onRemove, onClear, onManageConsent }) {
  if (!entries.length) return null;
  const saved = entries.filter((e) => e.saved);
  const recent = entries.filter((e) => !e.saved);

  const grid = (list) => (
    <div className="pf-history-list">
      {list.map((e) => (
        <div key={e.id} className={`pf-thumb ${currentId === e.id ? 'is-on' : ''}`}>
          <button type="button" className="pf-thumb-open" onClick={() => onOpen(e)}
            title={`${entryTitle(e)} · ${fmtM(activeFloor(e).plan.dimensions.width)} × ${fmtM(activeFloor(e).plan.dimensions.length)} m`}>
            <PlanSvg plan={activeFloor(e).plan} layers={THUMB_LAYERS} thumb style={activeFloor(e).meta?.style} />
            <span>{entryTitle(e)}</span>
          </button>
          <div className="pf-thumb-actions">
            <button type="button" className="pf-thumb-btn is-delete" onClick={() => onRemove(e.id)}
              title="Elimina dalla cronologia" aria-label="Elimina dalla cronologia">
              <Trash2 size={13} strokeWidth={2.2} />
            </button>
            <button type="button" className={`pf-thumb-btn is-star ${e.saved ? 'is-on' : ''}`}
              onClick={() => onToggleSaved(e.id)}
              title={e.saved ? 'Togli dalle salvate' : 'Salva: non verrà cancellata'}
              aria-label={e.saved ? 'Togli dalle salvate' : 'Salva planimetria'} aria-pressed={e.saved}>
              <Star size={13} strokeWidth={2.2} fill={e.saved ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <section className="pf-sec pf-history">
      {saved.length > 0 && (
        <>
          <h2>Salvate</h2>
          {grid(saved)}
        </>
      )}
      {recent.length > 0 && (
        <>
          <div className="pf-history-head">
            <h2>Cronologia</h2>
            <button type="button" className="pf-clear-btn" onClick={onClear} title="Elimina le planimetrie non salvate">
              <Trash2 size={13} strokeWidth={2.2} /> Svuota
            </button>
          </div>
          {grid(recent)}
        </>
      )}
      {!persistent && (
        <p className="pf-hint">
          La cronologia si perde chiudendo la pagina.{' '}
          <button type="button" className="pf-link" onClick={onManageConsent}>Attiva il salvataggio</button>
        </p>
      )}
    </section>
  );
}
