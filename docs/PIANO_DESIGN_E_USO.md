# Piano operativo — bellezza degli interni e strumenti d'uso

## Punto 2 — Bellezza degli arredi (disegno)

Oggi gli arredi sono disegnati in `floorplan-app/src/components/PlanSvg.jsx` (mappa `FURNITURE`) come forme
piatte, e lo stile (`lib/themes.js`) cambia quasi solo i colori.

- **2a — Disegni più ricchi.** Nuovo modulo `components/FurnitureArt.jsx` con i pezzi principali ridisegnati:
  divano e angolare (cuscini di seduta e schienale, cuscini decorativi, plaid), poltrona, letto (testiera,
  lenzuolo risvoltato, cuscini, piumone trapuntato, coperta ai piedi), tavoli rettangolare e tondo (venature,
  sedie con seduta e schienale), tavolino, scrivania (lampada, portatile), comodino con lampada, armadio con
  maniglie, piano cucina (fuochi, lavello con rubinetto, ante con maniglie), piante di tre specie diverse;
  tappeti con trama e frange.
- **2b — Arredi e decorazioni mancanti.** Nel motore: madia in soggiorno, libreria in soggiorno e studio,
  cassettiera in camera matrimoniale, scarpiera e specchio all'ingresso, lampada da terra accanto al divano
  (sempre rispettando percorsi e regole già esistenti). Nel disegno, come i tappeti: tende alle finestre dei
  locali abitabili, quadri sopra divano e letto, specchio sopra il lavabo.
- **2c — Stili diversi nelle forme.** Ogni stile ha una «grammatica» delle forme e una tavolozza di materiali
  con un colore d'accento: moderno (linee squadrate, braccioli dritti), nordico (legno chiaro, angoli molto
  arrotondati), classico (braccioli a rullo, tavolo con bordo sagomato e gambe tornite, testiera imbottita),
  industriale (telai in metallo, divano in cuoio), japandi (mobili bassi, letto a terra con pedana, linee
  essenziali), lusso (velluto, dettagli ottone).
- **2d — Vista presentazione / tecnica.** Pulsante «Tecnico» nella barra: pianta in bianco e nero da cantiere
  (niente pavimenti, ombre, tappeti e decorazioni; arredi solo a contorno); «Presentazione» è la vista di oggi
  arricchita. Vale anche per PNG/SVG/PDF esportati dalla vista corrente.

## Punto 3 — Strumenti d'uso (dopo conferma)

- **3a — Spostare e ruotare gli arredi** con il trascinamento: aggancio ai muri e alla griglia di 5 cm,
  rotazione a 90°, avviso se l'arredo si sovrappone a un altro o blocca una porta, annulla / ripeti.
- **3b — Vista 3D** della pianta arredata: muri estrusi, porte e finestre come vani, arredi come volumi con i
  colori dello stile, rotazione e zoom con il mouse.
- **3c — Preventivo indicativo**: superfici (pavimenti, pareti), serramenti, impianti dalle distinte già
  calcolate, arredi; prezzi unitari modificabili e totale per voce, nel pannello e nel PDF.
- **3d — Abaco dei serramenti e quote interne**: tabella di porte e finestre con misure e quantità, quote
  interne dei locali in pianta e nel PDF.
- **3e — Link di condivisione in sola lettura**: il progetto compresso nell'indirizzo (nessun server), aperto
  in una vista senza modifica.

## Stato del punto 2 (29/10/2026) — fatto

- 2a: `lib/furnitureArt.jsx` (disegni) e `components/FurnitureParts.jsx` (cuscini, braccioli, sedie,
  venature, piante), `components/Rug.jsx` (tappeti con trama e frange).
- 2b: nel motore madia, libreria, lampada da terra, cassettiera, scarpiera; nel disegno `lib/decor.js` +
  `components/Decor.jsx` per tende, quadri e specchi (mai sopra un vetro).
- 2c: `lib/themes.js` con la grammatica delle forme per stile (round, arm, legs, low, tuft, rugPattern,
  accent, metal, leather).
- 2d: pulsante «Tecnico» nella barra (layers.technical).
