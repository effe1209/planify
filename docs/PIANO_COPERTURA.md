# Piano operativo — copertura reale dei sensori Ajax

Obiettivo: il flusso completo per un installatore è pianta → arredo automatico → sensori piazzati e orientati → coni d'ombra reali calcolati sugli arredi → relazione e DXF a layer da allegare al preventivo.

I dati dei sensori vengono da `floorplan-app/src/data/ajax-specs.json`, raccolti dalle fonti ufficiali e controllati come descritto in `docs/AJAX_SPECS_VERIFICA.md`.

## Punto 1 — Motore di copertura 2,5D (`lib/coverage.js`)

Il motore è puro: niente React e niente DOM, così potrà girare in un Web Worker.

- **Ostacoli come volumi.** Ogni ostacolo è un parallelepipedo con quota inferiore e superiore:
  - muri pieni a tutta altezza (2,7 m);
  - porte chiuse, che bloccano fino all'architrave (2,1 m);
  - porte aperte, che lasciano libero il vano sotto l'architrave;
  - finestre e vetrate: muro sotto il davanzale e vetro opaco per il PIR;
  - arredi tra la loro quota di partenza e la loro altezza (le stesse misure della vista 3D). Si possono correggere per ogni singolo pezzo con `it.z`.
- **Modello del sensore**, ricavato dalle specifiche:
  - posizione, direzione e altezza di montaggio;
  - portata in funzione dell'angolo dall'asse;
  - apertura orizzontale e verticale, per volumetrici, tende e barriere da esterno.
- **Visibilità.** La pianta si divide in una griglia di celle da 10 cm (25 cm in giardino). Per ogni cella si controlla la persona a tre altezze: 0,5, 1,0 e 1,5 m. Un punto è visto se:
  - è entro la portata;
  - è entro l'angolo orizzontale e la fascia verticale;
  - il segmento 3D dal sensore al punto non attraversa nessun volume.
- **Esito per cella:**
  - coperta (almeno due punti del corpo visti);
  - parziale (un solo punto);
  - cieca;
  - occupata da un arredo;
  - numero di sensori che la vedono, per le sovrapposizioni.
- **Spiegazione delle zone cieche.** Per ogni cella cieca che sarebbe nel campo di un sensore si registra la causa:
  - l'ostacolo che la nasconde;
  - «sotto il rilevatore»;
  - «fuori portata».

  Da qui nascono avvisi come «Camera: zona cieca di 1,8 m² dietro l'armadio».
- **Metriche:**
  - percentuale coperta per locale e per piano;
  - zone cieche raggruppate per causa;
  - varchi verso l'esterno, ciascuno protetto oppure no (contatto, tenda, rottura vetri o volumetrico che vede il passaggio).
- **Verifica.** Test con Node su piante generate dal motore, più casi costruiti a mano: un armadio deve fare ombra, un divano basso no, la porta chiusa sì e quella aperta no, una vetrata deve bloccare.

## Punto 2 — Sensori in pianta

- Ogni sensore ha direzione e altezza. Il posizionamento automatico di oggi li orienta già in modo sensato:
  - i volumetrici d'angolo guardano verso il centro del locale;
  - le tende corrono lungo la vetrata;
  - le barriere da esterno corrono lungo la facciata.
- In pianta il sensore si trascina, si ruota con la maniglia o con i tasti, e altezza e modello si cambiano nel pannello. Ogni modifica si annulla e si ripete come per gli arredi.
- Stato delle porte (tutte aperte, tutte chiuse o una per una) e altezza modificabile di ogni arredo nel pannello dell'arredo.

## Punto 3 — Layer di copertura e pannello

- **Disegno sulla pianta:**
  - area coperta sfumata;
  - parziale a tratteggio;
  - zone cieche in rosso;
  - sovrapposizioni più intense;
  - ventaglio e asse di ogni sensore.
- **Ricalcolo** in un Web Worker mentre si trascina un sensore, così l'interfaccia resta fluida.
- **Pannello:**
  - copertura per locale con barra percentuale;
  - elenco delle zone cieche con la loro causa (un clic evidenzia la zona);
  - varchi protetti e non protetti;
  - ipotesi di calcolo.

## Punto 4 — Relazione di copertura

Esportazione in PDF con:
- una tavola di copertura per piano;
- la tabella dei sensori (modello, locale, posizione, direzione, altezza);
- la copertura per locale e le zone cieche;
- lo stato dei varchi e la distinta dei materiali;
- le ipotesi di calcolo e i limiti, cioè cosa il modello non simula. La conformità resta responsabilità dell'installatore, secondo la CEI 79-3 e la EN 50131.

## Punto 5 — DXF a layer per il CAD

Esportazione con questi layer:
- MURI, PORTE, FINESTRE, ARREDI (l'altezza come testo o attributo), AREE e TESTI;
- SENSORI, come blocchi con modello, altezza e direzione;
- COPERTURA, ZONE_CIECHE e VENTAGLI;
- QUOTE.

Il DXF si genera nel browser, perché lì ci sono già sensori e coperture.

## Punto 6 — Più avanti

Importazione di DXF reali del cliente con muri e aperture, non solo le aree dei locali. Serve per lavorare su piante esistenti e non generate.

## Stato

- **Punto 1 — fatto.** `lib/coverage.js`, test in `floorplan-app/tests/coverage.test.mjs`:

  ```
  node --import ./tests/loader.mjs tests/coverage.test.mjs [pianta.json]
  ```
- **Punto 2 — fatto.**
  - Il posizionamento automatico aggiunge un volumetrico «trappola» nel disimpegno, e nell'ingresso se è ampio o se manca il disimpegno.
  - Mette un volumetrico anche in cucina e nelle camere che danno sull'esterno; quello delle camere è segnato come da escludere con l'inserimento notturno.
  - Ogni volumetrico va nel montaggio che copre di più tra angoli e centri delle pareti lunghe. Sono esclusi i punti a meno di 1 m dalla centrale e sono penalizzati quelli con la lente verso una finestra o verso il piano cottura.
  - I sensori si trascinano e si ruotano (maniglia, R, frecce) con annulla e ripeti.
  - Il pannello del sensore permette di cambiare modello, altezza e direzione, e mostra la copertura del locale, le cause delle zone cieche e gli avvisi.
  - Si può impostare lo stato delle porte interne (tutte chiuse o tutte aperte) e l'altezza di ogni arredo.
- **Punto 3 — fatto.**
  - Copertura disegnata in pianta: verde coperto, più intenso dove si sovrappongono più sensori; giallo parziale; rosso cieco; grigio per i locali senza un sensore proprio.
  - Il calcolo gira in un Web Worker (`lib/coverage.worker.js`, `hooks/useCoverage.js`) e si aggiorna anche mentre si trascina un sensore.
  - Pannello «Copertura sensori» con:
    - totale dei locali sorvegliati;
    - barra per locale;
    - zone cieche con la causa (un clic le evidenzia in pianta);
    - locali senza sensore proprio, con la quota vista dai sensori vicini;
    - varchi verso l'esterno protetti e non protetti;
    - ipotesi di calcolo.
  - Ogni porta si apre e si chiude nel calcolo con un clic in pianta (`security.doorStates` per piano).
- **Punto 4 — fatto.** Pulsante «Relazione di copertura (PDF)» nel pannello della copertura (`lib/coverageReport.js`, caricato solo al clic). Contenuto:
  - copertina con riepilogo per piano, sintesi e metodo;
  - una tavola di copertura per piano, con zone colorate, codici dei rilevatori (R1, R2…), stato delle porte, legenda e copertura per locale;
  - tabella dei rilevatori (modello, locale, posizione, direzione, altezza, scopo e avvisi);
  - copertura per locale con le cause delle zone cieche;
  - varchi verso l'esterno;
  - distinta materiali;
  - ipotesi, fonti ufficiali dei dati e limiti.
- **Punto 5 — fatto.** Il pulsante «DXF (CAD)» genera nel browser un DXF R12 (AC1009), leggibile da AutoCAD, BricsCAD, DraftSight, LibreCAD e QCAD (`lib/dxf.js`, test in `tests/dxf.test.mjs`, verificato con l'audit di ezdxf).
  - 15 layer con colori: AREE, MURI, PORTE, FINESTRE, ARREDI, ARREDI_TESTI (nome e altezza), TESTI, QUOTE, SENSORI, DISPOSITIVI, SENSORI_CAMPO, COPERTURA, COPERTURA_PARZIALE, ZONE_CIECHE, NON_SORVEGLIATO.
  - I dispositivi Ajax sono blocchi `AJAX_<sigla>` con gli attributi CODICE, MODELLO, LOCALE, ALTEZZA e DIREZIONE. I codici sono gli stessi della relazione.
  - Gli importatori (browser e Python) leggono anche le POLYLINE R12, quindi i file esportati si riaprono e si leggono più DXF dei clienti.
