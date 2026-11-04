import { TabBar } from '../glass';
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
  return (
    <div className="pf-insp-tabs-wrap">
      <TabBar className="pf-insp-tabbar" aria-label="Sezioni del pannello" value={tab} onValueChange={onTab}
        items={INSPECTOR_TABS.map(([id, label]) => ({ value: id, label }))} />
    </div>
  );
}
