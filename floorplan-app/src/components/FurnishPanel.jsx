import { Armchair, Eraser, Wand2 } from 'lucide-react';
import { STYLES } from '../constants';
import { GButton } from '../glass';

/* Arredare la pianta così com'è (importata o modificata): stile a scelta, tutto il piano o un locale per volta. */
export default function FurnishPanel({ plan, style, busy, onStyle, onFurnish, onClear }) {
  const empty = !plan.furniture?.length;
  return (
    <section className="pf-sec pf-furnish">
      <h2>Arredo</h2>
      <p className="pf-hint">
        {empty
          ? 'La pianta è senza arredi: scegli lo stile e arreda tutti i locali. Muri, porte e finestre restano come sono.'
          : 'Riarreda tutti i locali con lo stile scelto (gli arredi spostati a mano vanno persi). Per un locale solo, selezionalo in pianta.'}
      </p>
      <div className="pf-chips" role="radiogroup" aria-label="Stile">
        {STYLES.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={style === s.id} disabled={busy}
            className={`pf-chip ${style === s.id ? 'is-on' : ''}`} onClick={() => onStyle(s.id)} title={s.desc}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="pf-row">
        <GButton type="button" className="pf-btn-add" disabled={busy} onClick={onFurnish}>
          {empty ? <Wand2 size={13} /> : <Armchair size={13} />} {empty ? 'Arreda tutto' : 'Riarreda tutto'}
        </GButton>
        {!empty && (
          <GButton type="button" className="pf-btn-add" disabled={busy} onClick={onClear}>
            <Eraser size={13} /> Svuota
          </GButton>
        )}
      </div>
    </section>
  );
}
