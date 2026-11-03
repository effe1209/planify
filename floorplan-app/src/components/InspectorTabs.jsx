import { useRef } from 'react';
export const INSPECTOR_TABS = [
  ['plan', 'Pianta', 'Locali, orientamento, note e legenda'],
  ['furn', 'Arredi', 'Arredo, stile, palette, materiali e libreria'],
  ['sys', 'Impianti', 'Impianto elettrico, idraulico, allarme e copertura'],
  ['docs', 'Documenti', 'Preventivo, abaco, conformità e cronologia dei progetti'],
];

/*
 * Schede del pannello destro: un solo gruppo alla volta, così il pannello è corto. L'elemento selezionato (arredo, locale, apertura)
 * sta sempre sopra le schede, qualunque sia aperta. La barra è la prima cosa del pannello e resta ferma in cima mentre si scorre, anche con un elemento selezionato. Frecce sinistra/destra spostano la scheda.
 */
export default function InspectorTabs({ tab, onTab }) {
  const ref = useRef(null);
  const move = (e, i) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = INSPECTOR_TABS[(i + d + INSPECTOR_TABS.length) % INSPECTOR_TABS.length][0];
    onTab(next);
    requestAnimationFrame(() => ref.current?.querySelector(`[data-tab="${next}"]`)?.focus());
  };
  return (
    <div className="pf-insp-tabs-wrap">
    <div className="pf-insp-tabs" role="tablist" aria-label="Sezioni del pannello" ref={ref}>
      {INSPECTOR_TABS.map(([id, label, tip], i) => (
        <button key={id} type="button" role="tab" data-tab={id} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1}
          className={tab === id ? 'is-on' : ''} title={tip} onClick={() => onTab(id)} onKeyDown={(e) => move(e, i)}>
          {label}
        </button>
      ))}
    </div>
    </div>
  );
}
