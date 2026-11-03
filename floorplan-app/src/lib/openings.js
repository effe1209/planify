/*
 * Tipi di apertura. Una finestra ha `type` '' (finestra) o 'panoramic' (vetrata panoramica fissa, a tutta altezza); una porta
 * ha `type` '' (a battente) o 'sliding' (vetrata scorrevole: una vetrata panoramica che si apre, per esempio sul balcone).
 * Senza `type` vale quello di prima, quindi i progetti già salvati non cambiano.
 */
export const SILL = 0.9;           // davanzale di una finestra
export const WINDOW_TOP = 2.1;     // architrave di una finestra o di una porta
export const PANORAMIC_H = 2.4;    // altezza della vetrata panoramica (dal pavimento)
export const PANORAMIC_MAX = 6;    // larghezza massima di una vetrata (m)
export const WINDOW_H = 1.4;       // altezza di una finestra comune (m) per i calcoli di luce e computo

export const isPanoramic = (o) => o?.type === 'panoramic' || o?.type === 'sliding';
export const isSliding = (o) => o?.type === 'sliding';

/* Altezza del vetro dal pavimento: [da, a] in metri, con il soffitto `wallH`. */
export function glassSpan(o, wallH = 2.7) {
  return isPanoramic(o)
    ? { sill: 0, top: Math.min(PANORAMIC_H, wallH - 0.1) }
    : { sill: SILL, top: Math.min(WINDOW_TOP, wallH) };
}

/* Altezza utile del vetro (m) per luce e computo. */
export const glassHeight = (o, wallH = 2.7) => { const g = glassSpan(o, wallH); return g.top - g.sill; };

/* Nome del tipo di apertura, per l'abaco e il pannello di modifica. */
export function openingLabel(o, kind) {
  if (kind === 'door') return o.type === 'sliding' ? 'Vetrata scorrevole' : null;
  return o.type === 'panoramic' ? 'Vetrata panoramica' : null;
}
