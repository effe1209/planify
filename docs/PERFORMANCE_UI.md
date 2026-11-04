# Quanto è pesante l'interfaccia

L'interfaccia in Liquid Glass usa effetti che il browser ricalcola a ogni fotogramma (`backdrop-filter`). Per sapere se pesano sul tuo computer:

1. Apri l'app con un progetto, meglio dalla build (`npm run build && npx vite preview`) perché la modalità di sviluppo è più lenta.
2. Apri la console del browser (Cmd+Opt+J) e incolla il contenuto di [`floorplan-app/scripts/fps-bench.js`](../floorplan-app/scripts/fps-bench.js).
3. Dopo circa 20 secondi esce una tabella con i fotogrammi al secondo mentre si scorre il pannello e si ruota il 3D, e le stesse prove **senza sfocatura**: la differenza è il costo del vetro.

| fps | giudizio |
|---|---|
| 55 o più | fluida |
| 30-55 | si nota |
| meno di 30 | pesante |

Prove a mano: DevTools → *Rendering* → «Frame Rendering Stats» (contatore dei fotogrammi) e «Paint flashing» (le zone che si ridisegnano).

## Misure fatte (Chromium, 1280×800, monolocale con 3D)

| Versione | Scorrere il pannello | Ruotare il 3D |
|---|---|---|
| `main` (senza vetro) | 165 fps | 160 fps |
| Liquid Glass, prima della correzione | 25 fps | 26 fps |
| Liquid Glass, senza sfocatura (prova) | 165 fps | 165 fps |
| Liquid Glass, dopo la correzione | 165 fps | 162 fps |

Il costo veniva dalla sfocatura su pannelli e pulsanti, che ricalcolava lo sfondo a ogni fotogramma. Ora i pannelli laterali (che stanno accanto alla pianta, non sopra) e i controlli al loro interno non sfocano: restano il riempimento e il bordo di vetro. La sfocatura rimane solo sulla barra in alto e sulle barre che galleggiano sulla pianta. Peso del pacchetto: +17 KB compressi di JavaScript.
