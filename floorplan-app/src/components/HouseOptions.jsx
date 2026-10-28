import { Minus, Plus } from 'lucide-react';
import { HOUSE_PRESETS, MAX_HOUSE_LEVEL, PROGRAMS, STAIR_TYPES, floorName } from '../lib/house';
import { levelLabel } from '../lib/project';

/*
 * Casa su più piani. Senza `pending`: interruttore «Casa su più piani», preset e programma di ogni piano.
 * Con `pending` (si sta aggiungendo un piano a un progetto): programma del nuovo piano e tipo di scala;
 * se il piano accanto ha già il vano scala (`stairFixed`) la scala è quella e non si sceglie.
 */
function Seg({ label, value, options, onChange }) {
  return (
    <div className="pf-field-sm">
      <span>{label}</span>
      <div className="pf-seg" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v}
            className={value === v ? 'is-on' : ''} onClick={() => onChange(v)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

export default function HouseOptions({ form, setF, pending = null, stairFixed = false, garage = false }) {
  if (pending) {
    return (
      <div className="pf-needs">
        <span className="pf-needs-title">Questo piano nella casa</span>
        <Seg label={`Locali di «${pending.name}»`} value={form.floorProgram} options={PROGRAMS}
          onChange={(v) => setF('floorProgram', v)} />
        {stairFixed ? (
          <p className="pf-hint">La scala riprende il vano del piano accanto: stessa posizione, stesse misure del piano.</p>
        ) : (
          <Seg label="Scala" value={form.stairType} options={STAIR_TYPES} onChange={(v) => setF('stairType', v)} />
        )}
      </div>
    );
  }

  const floors = form.houseFloors;
  const setFloors = (list) => {
    setF('houseFloors', list);
    setF('housePreset', HOUSE_PRESETS.find((p) => JSON.stringify(p.floors) === JSON.stringify(list))?.id || 'custom');
  };
  const top = Math.max(...floors.map((f) => f.level));
  return (
    <div className="pf-needs">
      <label className="pf-check">
        <input type="checkbox" checked={form.house} onChange={(e) => setF('house', e.target.checked)} />
        <span>Casa su più piani <em>(zona giorno e zona notte su piani diversi, collegati dalla scala)</em></span>
      </label>
      {form.house && (
        <>
          <div className="pf-chips">
            {HOUSE_PRESETS.map((p) => (
              <button key={p.id} type="button" className={`pf-chip ${form.housePreset === p.id ? 'is-on' : ''}`}
                aria-pressed={form.housePreset === p.id} onClick={() => setFloors(p.floors)}>
                {p.label}
              </button>
            ))}
          </div>
          {[...floors].sort((a, b) => b.level - a.level).map((f) => (
            <div key={f.level} className="pf-house-floor">
              <Seg label={`${levelLabel(f.level)} · ${floorName(f)}`} value={f.program} options={PROGRAMS}
                onChange={(v) => setFloors(floors.map((x) => (x === f ? { ...x, program: v } : x)))} />
            </div>
          ))}
          <div className="pf-stepper">
            <span>Piani</span>
            <div>
              <button type="button" disabled={floors.length <= 2} aria-label="Togli l'ultimo piano"
                onClick={() => setFloors(floors.filter((f) => f.level !== top))}><Minus size={13} /></button>
              <strong aria-live="polite">{floors.length}</strong>
              <button type="button" disabled={top >= MAX_HOUSE_LEVEL} aria-label="Aggiungi un piano sopra"
                onClick={() => setFloors([...floors, { level: top + 1, program: 'night' }])}><Plus size={13} /></button>
            </div>
          </div>
          {garage && (
            <label className="pf-check">
              <input type="checkbox" checked={form.houseGarage} onChange={(e) => setF('houseGarage', e.target.checked)} />
              <span>Piano interrato con garage <em>(la scala scende in un vano chiuso con porta sul box)</em></span>
            </label>
          )}
          <Seg label="Scala" value={form.stairType} options={STAIR_TYPES} onChange={(v) => setF('stairType', v)} />
          <p className="pf-hint">
            Le misure valgono per ogni piano; la pianta è rettangolare così i piani si sovrappongono. Le camere si
            dividono tra i piani «Notte» (poi «Completo»); studio, ripostiglio e lavanderia vanno al piano giorno;
            ogni piano cerca di avere i bagni sopra quelli del piano di sotto.
          </p>
        </>
      )}
    </div>
  );
}
