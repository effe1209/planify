# Piano: nord, sezioni e prospetti, tetto, touch, test dell'interfaccia

Stato di partenza (verificato guardando il codice e l'app a 768×1024):
- Tre colonne fisse (barra a sinistra, pianta, pannello a destra): a 768 px la pianta resta larga ~60 px, quindi su iPad
  e telefono l'app è inutilizzabile. Esiste solo un container query per la barra degli strumenti.
- Il 3D (three.js, `lib/scene3d.js`) costruisce muri alti 2,70 m, solai e arredi; non ha tetto. OrbitControls gestisce già
  il tocco in 3D. Lo schizzo usa eventi pointer.
- Il modello dati ha altezza interna per piano (`meta.height`, aggiunta con la conformità) ma non ha l'orientamento,
  né l'altezza dei davanzali e delle finestre (assunta 1,40 m), né il tetto.

## 1. Nord e orientamento
- Dato: `project.north` = angolo in gradi (0 = nord verso l'alto del foglio), per progetto.
- Disegno: rosa dei venti sul foglio della pianta (SVG), nell'export SVG/PNG/PDF e nel DXF.
- Controllo: campo «Orientamento» nel pannello + manopola/trascinamento; il motore non cambia (il lato sud resta il
  «fronte strada» della generazione), cambia solo come la casa è orientata sul terreno.
- Effetti: la luce del sole nel 3D segue il nord; il pannello conformità può dire quali finestre sono a nord (energia).
- Test: rotazione dell'angolo, esposizione delle finestre per lato.

## 2. Sezioni e prospetti
- Prospetti: 4 viste automatiche (N, E, S, O) disegnate in SVG dalle piante dei piani: sagoma dei muri, solai, finestre
  e porte con altezze (davanzale 0,90 m, finestra 1,40 m, porta 2,10 m: parametri), tetto, quota del terreno.
- Sezioni: linea di taglio disegnata sulla pianta (A–A), con il verso; il disegno mostra muri tagliati campiti, solai,
  altezze nette dei locali, scale e quote. Sezione predefinita: una trasversale e una longitudinale.
- Dove si vedono: nuova scheda accanto a Pianta e 3D; esportazione SVG/PNG/PDF (pagine in più nel PDF di progetto) e DXF.
- Dipende da: nord (nomi dei prospetti), tetto (profilo in alto), altezze (già presenti).
- Test: la sezione di una casa a 2 piani ha le quote giuste (2,70 + 0,30 solaio), numero di finestre del prospetto.

## 3. Tetto (acceso/spento, soprattutto in 3D)
- Interruttore «Tetto» nella vista 3D (e anche in sezioni/prospetti). Spento = come oggi (vista dall'alto sui locali).
- Tipi: piano (terrazzo con parapetto), a due falde, a quattro falde; pendenza e sporto regolabili.
- Forma: per piante rettangolari è immediato. Per L, U e T la proposta è un tetto a due falde per ogni «ala» (le
  stanze si raggruppano in rettangoli come già fa il motore) oppure piano; il padiglione vero su forme irregolari
  (straight skeleton) è molto più lungo e lo lascerei fuori.
- Solo sull'ultimo piano abitato; il garage interrato e il giardino non hanno tetto.
- Test: il tetto non compare con l'interruttore spento, le falde coprono tutto l'ingombro.

## 4. Touch e schermi piccoli (iPad prima, poi telefono)
- Layout a breakpoint:
  - Tablet (≤ 1100 px): la pianta occupa tutto lo spazio; barra sinistra e pannello destro diventano cassetti che si
    aprono sopra (pulsanti già presenti nell'intestazione per mostrare/nascondere).
  - Telefono (≤ 700 px): barra inferiore con 3 schede (Crea / Pianta / Dettagli), il resto come foglio a scorrimento;
    strumenti in una riga scorrevole.
- Gesti: pizzico per lo zoom, due dita per spostare, un dito sullo sfondo per spostare (la «manina» è già in piedi con
  eventi pointer), pressione lunga per selezionare, trascinamento degli arredi con un dito.
- Misure: bersagli da almeno 44 px, niente comparse che dipendono dal passaggio del mouse, tastiera numerica sui campi.
- 3D: già orbita con un dito e zoom con due; aggiungere pulsanti per vista alta/lato.
- Verifica: emulazione a 768×1024 e 390×844 (verticale e orizzontale) con prove di ogni schermata.

## 5. Test dell'interfaccia (cosa vuol dire)
Oggi i test sono script che controllano calcoli (motore, norme, DXF). L'interfaccia no: se una modifica rompe un
pulsante o, come è successo, porta a una pagina bianca, nessun test lo vede. «Test dell'interfaccia» significa un
piccolo robot (Playwright) che apre l'app in un browser vero e fa le cose di un utente:
1. si apre senza errori in console (avrebbe preso la schermata bianca di oggi);
2. genera una pianta e controlla che compaiano locali, valutazione e conformità;
3. aggiunge un piano, sposta la pianta con la manina, passa al 3D e torna;
4. importa un DXF di prova e un PDF di prova (drag & drop);
5. ripete su iPad e telefono (le stesse prove con schermo piccolo e tocco).
Si lanciano con un comando (`npm run test:ui`) e, se vuoi, a ogni push con GitHub Actions. Serve il motore: nei test si
avvia quello locale.

## Ordine proposto
1. Test dell'interfaccia (base, 1 mattina): così le funzioni successive non rompono l'app senza accorgersene.
2. Touch/layout (è ciò che oggi blocca l'uso su iPad e telefono).
3. Nord, poi tetto (il tetto serve a prospetti e sezioni).
4. Sezioni e prospetti.

## Stato (fatto in questa sessione)
- Test dell'interfaccia: Playwright (`npm run test:ui`, 27 prove su desktop, iPad e iPhone in orizzontale) e
  `.github/workflows/ui-tests.yml` a ogni push. La prima volta: `npx playwright install chromium`.
- Touch: sotto 1180 px i pannelli sono cassetti sopra la pianta (si chiudono dopo la generazione o toccando fuori),
  pizzico a due dita per lo zoom e spostamento, bersagli da 44 px, barre in una riga su iPhone in orizzontale.
  Il telefono in verticale non è stato fatto (scelta: solo iPad e iPhone in orizzontale).
- Nord: angolo 0–359° per progetto, freccia ruotata sul foglio, sole del 3D che lo segue, pannello con il vetro per
  esposizione.
- Tetto: pulsante «Tetto» in 3D (acceso di default nella vista casa intera), piano o a due falde, un tetto per ogni
  ala rettangolare dell'edificio; si accende e spegne senza spostare l'inquadratura.
- Prospetti e sezioni: scheda «Prospetti» con N/E/S/O e due sezioni (tagli regolabili), quote dei piani, altezza
  netta dei locali, tetto; esportazione in un SVG. Mancano PDF, DXF e il disegno della linea di taglio sulla pianta.

## Arredi 3D come oggetti e DXF a blocchi
- Anche TV, divani (a 2-3 posti, angolare, poltrona), madia, piante, alberi, siepi, recinzioni, passo pedonale, cancello pedonale e
  carraio, lavatrice, asciugatrice e aspirapolvere sono oggetti 3D e blocchi nel DXF.
- Letto, armadio, cassettiera, scaffali, libreria, auto, moto, WC, bidet, lavabo, doccia, vasca e sedia da ufficio sono
  gruppi di pezzi con nome (`lib/furniture3d.js`), non più scatole. Gli altri arredi restano volumi.
- La sedia da ufficio (nuovo arredo `office_chair`) viene messa dal motore davanti a ogni scrivania (camere, studio,
  direzione, open space, camere d'hotel) e dallo schizzo; nelle piante senza posto libero non entra.
- Il DXF 3D esporta questi arredi come BLOCCHI (LETTO_160X200, AUTO_190X450, WC_40X70…) inseriti con la rotazione giusta
  invece di facce sparse: in AutoCAD o BricsCAD sono oggetti che si selezionano, si spostano e si contano. Il DWG non si
  scrive direttamente (formato proprietario): si apre il DXF e si salva come DWG.
