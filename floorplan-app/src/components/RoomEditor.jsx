import { useState } from 'react';
import { Plus, RotateCw, Sliders, Trash2, X } from 'lucide-react';
import { FLOOR_PALETTES, FURNITURE, FURNITURE_LABEL, ROOM_KINDS } from '../constants';

const NAME_CHIPS = ['Soggiorno', 'Cucina', 'Camera da Letto', 'Bagno', 'Studio', 'Guardaroba', 'Palestra'];

/* Pannello di personalizzazione della stanza selezionata: nome, uso, finitura, arredi. */
export default function RoomEditor({ room, furniture, onChange, onRotate, onRemoveItem, onAddItem, onClose }) {
  const [newType, setNewType] = useState('bed');

  return (
    <section className="pf-sec pf-customizer">
      <div className="pf-customizer-head">
        <span className="pf-customizer-title"><Sliders size={14} /> Modifica locale</span>
        <button type="button" className="pf-customizer-close" onClick={onClose} title="Chiudi" aria-label="Chiudi">
          <X size={15} />
        </button>
      </div>

      <label className="pf-field-sm">
        <span>Nome del locale</span>
        <input type="text" className="pf-input-sm" value={room.name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      <div className="pf-chips">
        {NAME_CHIPS.map((nm) => (
          <button key={nm} type="button" className="pf-chip" onClick={() => onChange({ name: nm })}>{nm}</button>
        ))}
      </div>

      <label className="pf-field-sm">
        <span>Destinazione d'uso</span>
        <select className="pf-input-sm" value={room.kind} onChange={(e) => onChange({ kind: e.target.value })}>
          {ROOM_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          {!ROOM_KINDS.some((k) => k.id === room.kind) && <option value={room.kind}>{room.kind}</option>}
        </select>
      </label>

      <div className="pf-field-sm">
        <span>Finitura e pavimento</span>
        <div className="pf-color-swatches">
          {FLOOR_PALETTES.map((fp) => (
            <button key={fp.name} type="button" className={`pf-swatch-btn ${room.color === fp.color ? 'is-on' : ''}`}
              style={{ background: fp.color }} title={fp.name} aria-label={fp.name}
              onClick={() => onChange({ color: fp.color })} />
          ))}
        </div>
      </div>

      <div className="pf-field-sm">
        <span>Arredi nella stanza ({furniture.length})</span>
        <div className="pf-furn-list">
          {furniture.map(({ item, index }) => (
            <div key={index} className="pf-furn-row">
              <span>{FURNITURE_LABEL[item.type] || item.type}</span>
              <div className="pf-furn-actions">
                <button type="button" className="pf-btn-icon" title="Ruota di 90°" onClick={() => onRotate(index)}>
                  <RotateCw size={12} />
                </button>
                <button type="button" className="pf-btn-icon is-danger" title="Elimina" onClick={() => onRemoveItem(index)}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pf-field-sm">
        <span>Aggiungi arredo</span>
        <div className="pf-add-furn">
          <select value={newType} onChange={(e) => setNewType(e.target.value)}>
            {FURNITURE.map((f) => <option key={f.type} value={f.type}>{f.label}</option>)}
          </select>
          <button type="button" className="pf-btn-add" onClick={() => onAddItem(newType)}>
            <Plus size={13} /> Aggiungi
          </button>
        </div>
      </div>
    </section>
  );
}
