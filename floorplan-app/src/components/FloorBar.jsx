import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Layers, PenTool, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { FLOOR_PRESETS, levelLabel } from '../lib/project';

/*
 * Barra dei piani del progetto: selezione, rinomina (doppio clic), riordino, eliminazione,
 * aggiunta di un piano (generato, disegnato o duplicato) e passaggio alla vista globale.
 */
export default function FloorBar({
  project, activeId, globalView, pending, onSelect, onRename, onMove, onRemove,
  onAdd, onCancelAdd, onToggleGlobal, onLevel,
}) {
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(false);
  const [preset, setPreset] = useState(1);
  const [custom, setCustom] = useState('');
  const addBtn = useRef(null);
  const [menuPos, setMenuPos] = useState(null);
  // il menu è in coordinate della finestra: il contenitore della pianta ritaglia ciò che esce, quindi lo si tiene dentro lo schermo
  useLayoutEffect(() => {
    if (!menu || !addBtn.current) { setMenuPos(null); return undefined; }
    const place = () => {
      const r = addBtn.current.getBoundingClientRect();
      const w = Math.min(280, window.innerWidth - 16);
      setMenuPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), width: w });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [menu]);
  const floors = project.floors;

  const start = (mode) => {
    const p = FLOOR_PRESETS[preset];
    onAdd({ name: custom.trim() || p.name, level: p.level, type: p.type, mode });
    setMenu(false);
    setCustom('');
  };

  return (
    <div className="pf-floorbar" role="tablist" aria-label="Piani del progetto">
      <Layers size={15} className="pf-floorbar-icon" aria-hidden="true" />
      <div className="pf-floor-seg">
        {floors.map((f, i) => {
          const on = !globalView && f.id === activeId;
          return (
            <div key={f.id} className={`pf-floor ${on ? 'is-on' : ''}`}>
              {editing === f.id ? (
                <input
                  className="pf-floor-input"
                  defaultValue={f.name}
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => { onRename(f.id, e.target.value.trim() || f.name); setEditing(null); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
              ) : (
                <button type="button" role="tab" aria-selected={on} className="pf-floor-tab"
                  onClick={() => onSelect(f.id)} onDoubleClick={() => setEditing(f.id)} title="Doppio clic per rinominare">
                  <em>{levelLabel(f.level)}</em> {f.name}
                </button>
              )}
              {on && (
                <span className="pf-floor-actions">
                  {typeof f.level === 'number' && onLevel && (
                    <select className="pf-input-sm pf-floor-level" value={f.level} aria-label="Livello del piano"
                      title="Livello del piano: con «Primo piano» la casa sta sopra il giardino, che resta a terra (scala esterna dal pannello Pianta)"
                      onChange={(e) => onLevel(f.id, Number(e.target.value))}>
                      {FLOOR_PRESETS.filter((p) => typeof p.level === 'number').map((p) => <option key={p.level} value={p.level}>{p.name}</option>)}
                    </select>
                  )}
                  <button type="button" className="pf-btn-icon" disabled={i === 0} onClick={() => onMove(f.id, -1)}
                    title="Sposta prima" aria-label="Sposta prima"><ChevronLeft size={13} /></button>
                  <button type="button" className="pf-btn-icon" disabled={i === floors.length - 1} onClick={() => onMove(f.id, 1)}
                    title="Sposta dopo" aria-label="Sposta dopo"><ChevronRight size={13} /></button>
                  <button type="button" className="pf-btn-icon is-danger" disabled={floors.length <= 1}
                    onClick={() => onRemove(f.id)} title="Elimina piano" aria-label="Elimina piano"><Trash2 size={13} /></button>
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="pf-floor-add">
        <button ref={addBtn} type="button" className="pf-tool" onClick={() => setMenu(!menu)} aria-expanded={menu} title="Aggiungi un piano">
          <Plus size={14} /> <span className="pf-tl">Piano</span>
        </button>
        {menu && (
          <div className="pf-floor-menu" role="dialog" aria-label="Aggiungi piano" style={menuPos ? { position: 'fixed', ...menuPos } : undefined}>
            <label className="pf-field-sm">
              <span>Livello</span>
              <select className="pf-input-sm" value={preset} onChange={(e) => setPreset(Number(e.target.value))}>
                {FLOOR_PRESETS.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
              </select>
            </label>
            <label className="pf-field-sm">
              <span>Nome (facoltativo)</span>
              <input className="pf-input-sm" value={custom} placeholder={FLOOR_PRESETS[preset].name}
                onChange={(e) => setCustom(e.target.value)} />
            </label>
            <button type="button" className="pf-btn-add" onClick={() => start('generate')}>
              <Sparkles size={13} /> Genera con i parametri a sinistra
            </button>
            <button type="button" className="pf-tool" onClick={() => start('sketch')}><PenTool size={13} /> Disegna a mano</button>
            <button type="button" className="pf-tool" onClick={() => start('duplicate')}><Copy size={13} /> Duplica il piano attuale</button>
          </div>
        )}
      </div>

      {pending && (
        <span className="pf-floor-pending">
          Nuovo piano: <b>{pending.name}</b>
          <button type="button" className="pf-btn-icon" onClick={onCancelAdd} aria-label="Annulla nuovo piano"><X size={12} /></button>
        </span>
      )}

      <div className="pf-spacer" />
      {floors.length > 1 && (
        <button type="button" className={`pf-tool ${globalView ? 'is-on' : ''}`} onClick={onToggleGlobal} aria-pressed={globalView}
          title="Vista globale">
          <Layers size={14} /> <span className="pf-tl">Vista globale</span>
        </button>
      )}
    </div>
  );
}
