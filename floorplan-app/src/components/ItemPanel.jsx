import { useState } from 'react';
import { FlipHorizontal2, Link2, RotateCcw, RotateCw, Trash2, TriangleAlert, Unlink2, X } from 'lucide-react';
import { FURNITURE_LABEL } from '../constants';
import { itemProblems, SIZE_MAX, SIZE_MIN } from '../lib/furnitureEdit';
import { validColor } from '../lib/furnitureColor';
import { furnitureZ } from '../lib/scene3d';
import { fmtM } from '../lib/utils';

/*
 * Arredo selezionato sulla pianta: misure, altezza (conta per le ombre dei sensori d'allarme e per la vista 3D
 * dei volumi), problemi di posizione e comandi (anche da tastiera).
 */
const SWATCHES = ['#f1ead9', '#d9c7a1', '#7d8050', '#8fa3a8', '#c58b6d', '#4b4f56', '#9a6b4a', '#ffffff'];

export default function ItemPanel({ plan, index, onRotate, onFlip, onRemove, onHeight, onMountHeight, onSize, onColor, onRotation, onClose }) {
  const [lock, setLock] = useState(true);
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
      {onSize && (
        <div className="pf-row2">
          <label className="pf-field-sm">
            <span>Larghezza (m)</span>
            <input className="pf-input-sm" type="number" min={SIZE_MIN} max={SIZE_MAX} step="0.05" value={+it.w.toFixed(2)}
              onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) onSize({ w: v }, lock); }} />
          </label>
          <label className="pf-field-sm">
            <span>Profondità (m)</span>
            <input className="pf-input-sm" type="number" min={SIZE_MIN} max={SIZE_MAX} step="0.05" value={+it.h.toFixed(2)}
              onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) onSize({ h: v }, lock); }} />
          </label>
          <button type="button" className="pf-mini" aria-pressed={lock} onClick={() => setLock(!lock)}
            title={lock ? 'Proporzioni bloccate' : 'Proporzioni libere'}>
            {lock ? <Link2 size={13} /> : <Unlink2 size={13} />}
          </button>
        </div>
      )}
      {onRotation && !it.wallMounted && (
        <div className="pf-row2">
          <label className="pf-field-sm">
            <span>Rotazione (°)</span>
            <input className="pf-input-sm" type="number" min="0" max="359" step="1" value={Math.round(it.rot || 0)} aria-label="Rotazione in gradi"
              onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onRotation(v); }} />
          </label>
          <button type="button" className="pf-mini" onClick={() => onRotation((it.rot || 0) - 15)} title="Ruota di 15° in senso antiorario (Q)" aria-label="Ruota di 15 gradi a sinistra">−15°</button>
          <button type="button" className="pf-mini" onClick={() => onRotation((it.rot || 0) + 15)} title="Ruota di 15° in senso orario (E)" aria-label="Ruota di 15 gradi a destra">+15°</button>
          {it.rot ? <button type="button" className="pf-mini" onClick={() => onRotation(0)} title="Torna dritto"><RotateCcw size={13} /> 0°</button> : null}
        </div>
      )}
      {onColor && (
        <div className="pf-item-color">
          <span className="pf-hint">Colore</span>
          <div className="pf-item-swatches" role="group" aria-label="Colore dell'arredo">
            {SWATCHES.map((c) => (
              <button key={c} type="button" className={`pf-swatch-btn${validColor(it.color) === c ? ' is-on' : ''}`}
                style={{ background: c }} aria-label={`Colore ${c}`} onClick={() => onColor(c)} />
            ))}
            <input type="color" aria-label="Altro colore" value={validColor(it.color) || '#cccccc'} onChange={(e) => onColor(e.target.value)} />
            {it.color && (
              <button type="button" className="pf-mini" onClick={() => onColor(null)} title="Torna al colore dello stile">
                <RotateCcw size={13} /> Stile
              </button>
            )}
          </div>
        </div>
      )}
      {it.decor && onMountHeight ? (
        <div className="pf-row2">
          <label className="pf-field-sm">
            <span>Altezza da terra (m)</span>
            <input className="pf-input-sm" type="number" min="0" max="2.6" step="0.05" value={+(it.mountHeight ?? z0).toFixed(2)}
              onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onMountHeight(Math.min(2.6, Math.max(0, v))); }} />
          </label>
        </div>
      ) : onHeight && (
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
        {!it.wallMounted && <button type="button" className="pf-mini" onClick={onRotate} title="Ruota di 90° (R)"><RotateCw size={13} /> Ruota</button>}
        {!it.wallMounted && <button type="button" className="pf-mini" onClick={onFlip} title="Specchia (F)"><FlipHorizontal2 size={13} /> Specchia</button>}
        <button type="button" className="pf-mini is-danger" onClick={onRemove} title="Elimina (Canc)"><Trash2 size={13} /> Elimina</button>
      </div>
      <p className="pf-hint">Trascina per spostare (aggancio a 5 cm e ai muri) · frecce 5 cm, Maiusc+frecce 25 cm · R ruota di 90° · Q/E di 15° · maniglia in pianta per l'angolo libero · ⌘Z annulla</p>
    </section>
  );
}
