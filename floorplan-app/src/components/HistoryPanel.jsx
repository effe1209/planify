import { Star, Trash2, X } from 'lucide-react';
import { SHAPE_NAME, TYPE_NAME } from '../constants';
import { fmtM } from '../lib/utils';
import PlanSvg from './PlanSvg';

const THUMB_LAYERS = { furniture: false, labels: false, dims: false, grid: false };

const entryTitle = (e) => e.name || `${TYPE_NAME[e.meta?.type] || 'Pianta'} ${SHAPE_NAME[e.plan.shape] || ''}`.trim();

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
            title={`${entryTitle(e)} · ${fmtM(e.plan.dimensions.width)} × ${fmtM(e.plan.dimensions.length)} m`}>
            <PlanSvg plan={e.plan} layers={THUMB_LAYERS} thumb />
            <span>{entryTitle(e)}</span>
          </button>
          <div className="pf-thumb-actions">
            <button type="button" className={`pf-btn-icon ${e.saved ? 'is-starred' : ''}`}
              onClick={() => onToggleSaved(e.id)}
              title={e.saved ? 'Togli dalle salvate' : 'Salva: non verrà cancellata'}
              aria-label={e.saved ? 'Togli dalle salvate' : 'Salva planimetria'} aria-pressed={e.saved}>
              <Star size={12} fill={e.saved ? 'currentColor' : 'none'} />
            </button>
            <button type="button" className="pf-btn-icon is-danger" onClick={() => onRemove(e.id)}
              title="Elimina dalla cronologia" aria-label="Elimina dalla cronologia">
              <X size={12} />
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
            <button type="button" className="pf-link" onClick={onClear}>
              <Trash2 size={13} /> Svuota
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
