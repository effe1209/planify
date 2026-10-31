# Piano: aspirapolvere Dyson, sensori e impianto elettrico nel 3D, MacBook sulle scrivanie

Stato di partenza (verificato nel codice):
- L'aspirapolvere (`vacuum`, 0,4 × 0,4 m, nel garage e nella lavanderia) è un cilindro rosso su ruote con tubo, in
  `lib/furniture3d.js`.
- I sensori Ajax stanno in `project.security.devices` ({ id, modello, x, y, piano, direzione … }) e si vedono solo nella
  pianta 2D (`lib/ajax.js`, `components/Ajax*`); nel 3D non esistono.
- L'impianto elettrico (`planElectric`, `lib/electric.js`) è calcolato solo quando si apre «Progetta impianto elettrico»:
  produce punti {tipo, x, y, nx, ny verso l'interno, circuito} per punti luce, applique, interruttori, deviatori, prese,
  prese dedicate, TV e dati, quadro, emergenza, e collegamenti (comandi → luce, quadro → cassette). Nel 3D non esiste nulla
  di tutto ciò, e le uniche luci sono la lampada da terra e il sole.
- Le scrivanie (camere, studio, direzione, open space, hotel) hanno la sedia da ufficio ma nessun computer.

## 1. Aspirapolvere Dyson
- Nuovo modello al posto del cilindro: scopa elettrica senza fili (stile V15) con corpo in nichel, bidone trasparente,
  cuffia e spazzola a testa piatta, impugnatura con grilletto, accenti colorati (fucsia/giallo/blu), appoggiata alla
  base a pavimento (dock) che sta nei 0,4 × 0,4 m dell'ingombro.
- Stesso nome per l'oggetto nel DXF (blocco ASPIRAPOLVERE_40X40_<STILE>), layer per materiale come gli altri.
- In pianta 2D il simbolo cambia di conseguenza (base tonda con l'asta).

## 2. MacBook, tastiera e mouse sulle scrivanie
- MacBook aperto (alluminio, schermo con bordi neri e logo, tastiera e trackpad), con la sua tastiera esterna (tipo Magic
  Keyboard) e il suo mouse (tipo Magic Mouse), appoggiati sul piano e rivolti verso la sedia da ufficio.
- Posizione: centrata sul lato della scrivania verso la sedia; il MacBook sta dietro la tastiera, il mouse a destra.
  Si adatta a scrivanie piccole (1,0 m: solo MacBook e mouse).
- Dove: studio, direzione, open space (una postazione per scrivania), camere con scrivania e camere d'hotel.

## 3. Sensori Ajax nel 3D
- Un modello 3D per famiglia: hub (scatola con anello luminoso), tastiera touchscreen, sirena da esterno, DoorProtect
  (due moduli sul telaio della porta), MotionProtect/Curtain/CombiProtect (corpo bianco con lente), MotionCam, FireProtect
  (disco a soffitto), LeaksProtect (a terra); colori bianco/nero come i prodotti.
- Quota realistica: sensori di movimento a 2,3-2,4 m e angolati, DoorProtect sul telaio, tastiera a 1,3 m, fumo a soffitto,
  perdite a terra, sirena fuori a 2,5 m.
- Interruttore «Sensori» nella vista 3D; si vedono solo se la sicurezza è stata progettata. Opzione: i coni di copertura
  calcolati (come in pianta) in 3D, semitrasparenti.

## 4. Impianto elettrico e luci nel 3D
- Si disegna solo quando l'impianto è stato calcolato (lo stesso livello CEI 64-8 scelto per la tavola), con un interruttore
  «Impianto» nel 3D.
- Simboli reali a quota: prese a 0,30 m (in cucina sopra il piano a 1,10 m), interruttori e deviatori a 1,05 m accanto alle porte,
  TV e dati a 0,30 m, quadro a 1,50 m, emergenza a 0,30 m, punti luce a soffitto e applique a 2,0 m, luci esterne e paletti da
  giardino, wallbox.
- Luci a soffitto: corpi illuminanti veri (plafoniere, faretti o sospensioni a seconda dello stile d'interni).
- «Luci accese»: i punti luce diventano emissivi e danno luce vera ai locali (con un tetto di luci puntuali per non
  appesantire iPad e telefono: le più vicine alla camera, le altre solo come bagliore).
- Collegamenti (comando → luce, quadro → cassette): come linee colorate sottili sotto il soffitto, a richiesta.

## 5. DXF e layer
- Impianto e sensori come blocchi (PRESA, INTERRUTTORE, PLAFONIERA, AJAX_MOTIONPROTECT…) sui layer IMP_PRESE, IMP_LUCI,
  IMP_COMANDI, SENSORI; il MacBook, la tastiera e il mouse dentro il blocco della scrivania o come blocchi propri.

## 6. Verifica
Prove automatiche: ogni punto dell'impianto e ogni sensore finiscono nella scena alla quota giusta e nel DXF come blocco,
nessun oggetto fuori dai muri. Controllo visivo in screenshot di camera, cucina, bagno e ingresso, con e senza «Luci accese».
Prestazioni: numero di mesh e di luci per scena, con tetto sulle luci puntuali.

## Ordine di lavoro
1. Dyson e MacBook (arredi puri, rapidi).
2. Sensori Ajax nel 3D.
3. Impianto elettrico e luci nel 3D, con interruttori «Impianto», «Sensori», «Luci accese».
4. DXF per impianti e sensori, test e controllo visivo.

## Stato (fatto)
Scelte: Dyson V15 su base, MacBook dentro la scrivania, simboli reali con luci vere accese, coni di copertura e DXF.
- Aspirapolvere: scopa Dyson V15 in piedi sulla base (testina, tubo in nichel, bidone trasparente con anello giallo, batteria).
- Scrivanie: MacBook aperto su supporto in alluminio, tastiera esterna e mouse, rivolti verso la sedia (il mouse manca sotto 0,9 m).
- Sensori Ajax: hub, tastiera, sirena, DoorProtect, rilevatori di movimento/tendina/camera/esterni, fumo e perdite, a quota e con la
  direzione calcolate (`lib/overlays3d.js`); coni di rilevazione dal diagramma Ajax (`lib/coverage.js`).
- Impianto: prese a 0,30 m, comandi a 1,05 m, quadri a 1,50 m, wallbox, termostato, videocitofono, cassette, punti luce
  (plafoniere nello stile della casa) e collegamenti come tubi sottili.
- «Luci accese»: bagliore dei corpi illuminanti, luci puntuali vere (al massimo 10 per scena) e scena abbassata come di sera.
- Interruttori nella vista 3D: Sensori, Copertura, Impianto, Cavi, Luci accese (compaiono solo se calcolati).
- DXF 3D: sensori e impianto come blocchi su layer SENSORI, IMP_PRESE, IMP_COMANDI, IMP_QUADRI, IMP_LUCI, IMP_CAVI, COPERTURA; gli
  elementi nascosti non escono.
