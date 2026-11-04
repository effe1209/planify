import { useRef, useState } from 'react';
import { Armchair, Eraser, FlipHorizontal2, Plus, RotateCw, Sliders, Trash2, Upload, X } from 'lucide-react';
import { FLOOR_PALETTES, FURNITURE, FURNITURE_LABEL, ROOM_KINDS } from '../constants';
import { forUse } from '../lib/materialLibrary';
import FinishPicker from './FinishPicker';
import { GButton, GRange, GText, SegmentedControl } from '../glass';

const NAME_CHIPS = ['Soggiorno', 'Cucina', 'Camera da Letto', 'Bagno', 'Studio', 'Guardaroba', 'Palestra'];

/* Pannello di personalizzazione della stanza selezionata: nome, uso, finitura, arredi. */
const ASYMMETRIC = new Set(['sofa_corner', 'shower_round', 'shower_walkin', 'kitchen_peninsula', 'wardrobe_corner', 'wardrobe_open_corner']);

export default function RoomEditor({ room, furniture, library = [], onChange, onRotate, onFlip, onRemoveItem, onAddItem, onImportModel, onFurnish, busy, onClose, mezz = null, kitchen = null }) {
  const [newId, setNewId] = useState('bed_double');
  const [importBusy, setImportBusy] = useState(false);
  const modelInput = useRef(null);
  const groups = [...new Set(FURNITURE.map((f) => f.group))];

  return (
    <section className="pf-sec pf-customizer">
      <div className="pf-customizer-head">
        <span className="pf-customizer-title"><Sliders size={14} /> {room.mezz ? 'Soppalco' : 'Modifica locale'}</span>
        <button type="button" className="pf-customizer-close" onClick={onClose} title="Chiudi" aria-label="Chiudi">
          <X size={15} />
        </button>
      </div>

      {!room.mezz && (<>
      <label className="pf-field-sm">
        <span>Nome del locale</span>
        <GText className="pf-input-sm" value={room.name} onChange={(e) => onChange({ name: e.target.value })} />
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

      <FinishPicker value={room.look} title="Colore e materiale del locale"
        onChange={(look) => onChange({ look: look || undefined, ...(look?.floor?.color && { color: look.floor.color }) })} />

      {library.length > 0 && ['floor', 'wall'].map((use) => {
        const list = forUse(library, use);
        const cur = room.finish?.[use];
        if (!list.length && !cur) return null;
        return (
          <label key={use} className="pf-field-sm">
            <span>{use === 'floor' ? 'Materiale del pavimento' : 'Materiale delle pareti'}</span>
            <select className="pf-input-sm" value={cur?.id || ''} aria-label={use === 'floor' ? 'Materiale del pavimento' : 'Materiale delle pareti'}
              onChange={(e) => {
                const it = list.find((x) => x.id === e.target.value);
                const finish = { ...(room.finish || {}) };
                if (it) finish[use] = it; else delete finish[use];
                onChange({ finish: Object.keys(finish).length ? finish : undefined, ...(use === 'floor' && it?.color && { color: it.color }) });
              }}>
              <option value="">Nessuno (come lo stile)</option>
              {cur && !list.some((x) => x.id === cur.id) && <option value={cur.id}>{cur.name} (non più in libreria)</option>}
              {list.map((it) => <option key={it.id} value={it.id}>{[it.brand, it.name].filter(Boolean).join(' · ')} · {it.price.toLocaleString('it-IT')} €/{it.unit === 'm2' ? 'm²' : it.unit}</option>)}
            </select>
          </label>
        );
      })}

      </>)}

      {kitchen && (
        <div className="pf-field-sm pf-kitchen-style">
          <span>Tipo di cucina</span>
          <SegmentedControl className="pf-gseg" aria-label="Tipo di cucina" value={kitchen.style}
            style={{ '--lg-tab-width': '130px', '--lg-tab-height': '28px' }}
            items={[{ value: 'base', label: 'Base' }, { value: 'full', label: 'Completa' }]} onValueChange={kitchen.onStyle} />
          <p className="pf-hint">
            {kitchen.style === 'full'
              ? `Cucina completa: ${kitchen.columns.length ? `colonne con ${kitchen.columns.join(', ')}` : 'nessuna colonna'}${kitchen.cabinets ? ` e ${kitchen.cabinets} pensili` : ''}.`
              : 'Base: piano con lavello, cottura e cappa. «Completa» aggiunge colonne per frigo, forno e microonde, lavatrice, e i pensili.'}
          </p>
          {kitchen.notes?.map((n) => <p key={n} className="pf-warn" role="status">{n}</p>)}
        </div>
      )}

      {mezz && <MezzSize mezz={mezz} area={room.w * room.h} />}

      <div className="pf-field-sm">
        <span>{room.mezz ? `Arredi del soppalco (${furniture.length})` : `Arredi nella stanza (${furniture.length})`}</span>
        <div className="pf-furn-list">
          {furniture.map(({ item, index }) => (
            <div key={index} className="pf-furn-row">
              <span>{item.name || FURNITURE_LABEL[item.type] || item.type} <em>{item.w} × {item.h} m</em></span>
              <div className="pf-furn-actions">
                {!item.wallMounted && ASYMMETRIC.has(item.type) && (
                  <GButton type="button" className="pf-btn-icon" title="Specchia" onClick={() => onFlip(index)}>
                    <FlipHorizontal2 size={12} />
                  </GButton>
                )}
                {!item.wallMounted && <GButton type="button" className="pf-btn-icon" title="Ruota di 90°" onClick={() => onRotate(index)}>
                  <RotateCw size={12} />
                </GButton>}
                <GButton type="button" className="pf-btn-icon is-danger" title="Elimina" onClick={() => onRemoveItem(index)}>
                  <Trash2 size={12} />
                </GButton>
              </div>
            </div>
          ))}
        </div>
      </div>

      {onImportModel && (
        <div className="pf-field-sm">
          <span>Modello personalizzato</span>
          <input ref={modelInput} type="file" accept=".glb,model/gltf-binary" hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setImportBusy(true);
              try { await onImportModel(file); } finally { setImportBusy(false); }
            }} />
          <GButton type="button" className="pf-btn-add" disabled={importBusy} onClick={() => modelInput.current?.click()}>
            <Upload size={13} /> {importBusy ? 'Importazione…' : 'Importa modello Blender (.glb)'}
          </GButton>
          <p className="pf-hint">L’ingombro si può modificare dopo l’importazione.</p>
        </div>
      )}

      {onFurnish && (
        <div className="pf-field-sm">
          <span>Arredo del locale</span>
          <div className="pf-row">
            <GButton type="button" className="pf-btn-add" disabled={busy} onClick={() => onFurnish(false)}>
              <Armchair size={13} /> Arreda questo locale
            </GButton>
            <GButton type="button" className="pf-btn-add" disabled={busy} onClick={() => onFurnish(true)}>
              <Eraser size={13} /> Svuota
            </GButton>
          </div>
        </div>
      )}

      <div className="pf-field-sm">
        <span>Aggiungi arredo</span>
        <div className="pf-add-furn">
          <select value={newId} onChange={(e) => setNewId(e.target.value)}>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {FURNITURE.filter((f) => f.group === g).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </optgroup>
            ))}
          </select>
          <GButton type="button" className="pf-btn-add" onClick={() => onAddItem(newId)}>
            <Plus size={13} /> Aggiungi
          </GButton>
        </div>
      </div>
    </section>
  );
}

/* Dimensione del soppalco: cursore e campo in metri; sotto 1/3 del loft è la misura usuale della norma, oltre avvisa. */
function MezzSize({ mezz, area }) {
  const ratio = mezz.ratio(mezz.cur);
  const over = ratio > 1 / 3 + 1e-6;
  return (
    <div className="pf-field-sm pf-mezz-size">
      <span>{mezz.label} del soppalco</span>
      <div className="pf-row">
        <GRange min={mezz.min} max={mezz.max} step="0.05" value={mezz.cur} aria-label={`${mezz.label} del soppalco`}
          onChange={(e) => mezz.onSize(parseFloat(e.target.value))} />
        <input type="number" className="pf-input-sm pf-mezz-num" min={mezz.min} max={mezz.max} step="0.05" value={mezz.cur}
          aria-label={`${mezz.label} del soppalco in metri`} onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) mezz.onSize(v); }} />
        <em>m</em>
      </div>
      <p className={`pf-hint ${over ? 'pf-hint-warn' : ''}`} role="status">
        {area.toFixed(1).replace('.', ',')} m² · {(ratio * 100).toFixed(0)}% del loft
        {over ? ': oltre 1/3, il limite usuale della norma (alcuni comuni ammettono di più)' : ': entro 1/3, a norma'}
      </p>
    </div>
  );
}
