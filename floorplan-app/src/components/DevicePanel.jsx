import { useMemo } from 'react';
import { RotateCcw, RotateCw, Trash2, TriangleAlert, X } from 'lucide-react';
import { AJAX_MODELS } from '../lib/ajax';
import { aimDevice, coverFloor, deviceWarnings, sensorModel } from '../lib/coverage';

/* Modelli intercambiabili: stessi impieghi (interno / esterno). */
const SWAP = {
  indoor: ['motionprotect', 'combiprotect', 'motioncam_phod', 'motionprotect_curtain'],
  outdoor: ['motioncam_outdoor', 'dualcurtain_outdoor'],
};
const groupOf = (model) => Object.keys(SWAP).find((k) => SWAP[k].includes(model));
const num = (v) => String(v).replace('.', ',');

/*
 * Dispositivo selezionato sulla pianta: modello, altezza e direzione di montaggio, copertura del suo locale
 * (lib/coverage.js) e avvisi di posizionamento del manuale Ajax.
 */
export default function DevicePanel({ plan, device, devices, doors, onChange, onRemove, onClose }) {
  const m = sensorModel(device.model);
  const aimed = m && m.kind !== 'glass';
  const { dir, h } = aimed ? aimDevice(plan, device) : { dir: 0, h: 0 };
  const room = useMemo(() => {
    if (!aimed || device.room == null) return null;
    const here = devices.filter((d) => d.floor === device.floor);
    return coverFloor(plan, here, { doors, only: [device.room] }).rooms[0] || null;
  }, [aimed, plan, devices, device, doors]);
  const warnings = deviceWarnings(plan, device, devices);
  const group = groupOf(device.model);
  const turn = (by) => onChange({ dir: ((Math.round(dir + by) % 360) + 360) % 360 });

  return (
    <section className="pf-sec pf-item-panel">
      <div className="pf-item-head">
        <h2>{AJAX_MODELS[device.model]?.name || device.model}</h2>
        <button type="button" className="pf-btn-icon" onClick={onClose} aria-label="Deseleziona"><X size={14} /></button>
      </div>
      <p className="pf-hint">{device.roomName || 'Esterno'} · {device.purpose}</p>

      {group && (
        <label className="pf-field-sm">
          <span>Modello</span>
          <select className="pf-input-sm" value={device.model} onChange={(e) => onChange({ model: e.target.value, h: undefined })}>
            {SWAP[group].map((id) => <option key={id} value={id}>{AJAX_MODELS[id]?.name || id}</option>)}
          </select>
        </label>
      )}

      {aimed && (
        <div className="pf-row2">
          <label className="pf-field-sm">
            <span>Altezza (m)</span>
            <input className="pf-input-sm" type="number" min="0.3" max="3.5" step="0.1" value={h}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v)) onChange({ h: Math.min(3.5, Math.max(0.3, v)) });
              }} />
          </label>
          <label className="pf-field-sm">
            <span>Direzione (°)</span>
            <input className="pf-input-sm" type="number" step="5" value={Math.round(((dir % 360) + 360) % 360)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v)) onChange({ dir: ((v % 360) + 360) % 360 });
              }} />
          </label>
        </div>
      )}

      {aimed && (
        <p className="pf-hint">
          {m.kind === 'volumetric' && <>Portata fino a {num(m.profile[0][1])} m, apertura {num(m.hAngle)}°. </>}
          {m.kind !== 'volumetric' && <>Portata fino a {num(m.range)} m, apertura {num(m.hAngle)}°. </>}
          {room && <>Copertura di «{room.name}»: <b>{room.pct}%</b>{room.pctAny > room.pct ? ` (${room.pctAny}% con le zone parziali)` : ''}.</>}
        </p>
      )}
      {room?.blindCauses.length > 0 && (
        <p className="pf-hint">
          Zone cieche: {room.blindCauses.slice(0, 3).map((c) => `${c.label.toLowerCase()} ${num(c.area.toFixed(1))} m²`).join(', ')}.
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="pf-notes">
          {warnings.map((w) => <li key={w}><TriangleAlert size={13} /> <span>{w}</span></li>)}
        </ul>
      )}

      <div className="pf-security-actions">
        {aimed && (
          <>
            <button type="button" className="pf-mini" onClick={() => turn(-15)} title="Ruota di 15° (Maiusc+R)"><RotateCcw size={13} /> 15°</button>
            <button type="button" className="pf-mini" onClick={() => turn(15)} title="Ruota di 15° (R)"><RotateCw size={13} /> 15°</button>
          </>
        )}
        <button type="button" className="pf-mini is-danger" onClick={onRemove} title="Elimina (Canc)"><Trash2 size={13} /> Elimina</button>
      </div>
      <p className="pf-hint">
        Trascina il simbolo per spostare{aimed ? ', la maniglia sull\'asse per ruotare' : ''} · frecce 5 cm · R ruota · ⌘Z annulla
      </p>
    </section>
  );
}
