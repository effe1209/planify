import { FlipHorizontal2, RotateCcw, RotateCw, Trash2, TriangleAlert, X } from 'lucide-react';
import { FURNITURE_LABEL } from '../constants';
import { itemProblems } from '../lib/furnitureEdit';
import { furnitureZ } from '../lib/scene3d';
import { fmtM } from '../lib/utils';

/*
 * Arredo selezionato sulla pianta: misure, altezza (conta per le ombre dei sensori d'allarme e per la vista 3D
 * dei volumi), problemi di posizione e comandi (anche da tastiera).
 */
export default function ItemPanel({ plan, index, onRotate, onFlip, onRemove, onHeight, onClose }) {
  const it = plan.furniture[index];
  if (!it) return null;
  const [z0, zTop] = it.z || furnitureZ(it.type);
  const room = plan.rooms.find((r) => r.id === it.room);
  const problems = itemProblems(plan, index);
  return (
    <section className="pf-sec pf-item-panel">
      <div className="pf-item-head">
        <h2>{FURNITURE_LABEL[it.type] || it.type}</h2>
        <button type="button" className="pf-btn-icon" onClick={onClose} aria-label="Deseleziona"><X size={14} /></button>
      </div>
      <p className="pf-hint">
        {fmtM(it.w)} × {fmtM(it.h)} m{room?.name ? ` · ${room.name}` : ''}
      </p>
      {onHeight && (
        <div className="pf-row2">
          <label className="pf-field-sm">
            <span>Altezza (m){z0 > 0 ? ` da ${fmtM(z0)} m` : ''}</span>
            <input className="pf-input-sm" type="number" min="0.05" max="3" step="0.05" value={+(zTop - z0).toFixed(2)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v > 0) onHeight([z0, +(z0 + Math.min(3, v)).toFixed(2)]);
              }} />
          </label>
          {it.z && (
            <button type="button" className="pf-mini" onClick={() => onHeight(null)} title="Torna all'altezza standard">
              <RotateCcw size={13} /> Standard
            </button>
          )}
        </div>
      )}
      {problems.length > 0 ? (
        <ul className="pf-notes">
          {problems.map((p) => <li key={p}><TriangleAlert size={13} /> <span>{p}</span></li>)}
        </ul>
      ) : (
        <p className="pf-hint pf-item-ok">Posizione libera: nessuna sovrapposizione e passaggi liberi.</p>
      )}
      <div className="pf-security-actions">
        <button type="button" className="pf-mini" onClick={onRotate} title="Ruota di 90° (R)"><RotateCw size={13} /> Ruota</button>
        <button type="button" className="pf-mini" onClick={onFlip} title="Specchia (F)"><FlipHorizontal2 size={13} /> Specchia</button>
        <button type="button" className="pf-mini is-danger" onClick={onRemove} title="Elimina (Canc)"><Trash2 size={13} /> Elimina</button>
      </div>
      <p className="pf-hint">Trascina per spostare (aggancio a 5 cm e ai muri) · frecce 5 cm, Maiusc+frecce 25 cm · R ruota · ⌘Z annulla</p>
    </section>
  );
}
