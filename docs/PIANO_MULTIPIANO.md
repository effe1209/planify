# Piano operativo — scale sensate e casa su più piani

## Il problema oggi

- Ogni piano viene generato dal motore (`planner.py`) **da solo**, come se fosse un appartamento
  indipendente: ha sempre la sua porta d'ingresso, il suo soggiorno, la sua zona notte.
- La scala viene cercata **dopo**, nel browser (`floorplan-app/src/lib/stairs.js`), dentro locali già
  disegnati. Il disimpegno è largo 1,30 m e l'ingresso ~2,4 × 1,3 m: una scala (1,0 × 3,6 m o
  2,0 × 2,6 m) con 90 cm di passaggio accanto non ci sta quasi mai, quindi finisce nel soggiorno.
- Al primo piano l'«Ingresso» con porta sulla facciata non ha senso: l'ingresso è l'arrivo della scala.

## Idea di fondo (modulare)

La scala diventa un **locale vero** (`kind: "stairs"`) che il motore prevede *mentre* distribuisce la
pianta, non un oggetto appoggiato dopo. Ogni piano si descrive con tre parametri indipendenti, che
valgono per qualsiasi combinazione (appartamento singolo, casa su due piani, villetta con interrato…):

| Parametro | Valori | Significato |
|---|---|---|
| `program` | `full` · `day` · `night` · (`garage`, `garden` come oggi) | quali locali vanno su questo piano |
| `access` | `street` · `stairs` · `both` | da dove si entra: porta sulla facciata, arrivo della scala, o entrambi |
| `core` | `null` oppure `{x, y, w, h, type, up}` | posizione della scala già fissata da un altro piano (`null` = la sceglie il motore) |

Un appartamento singolo è `program=full, access=street, core=null` → **identico a oggi**.

## Punti

1. **Locale scala nel motore** — nuovo `kind: "stairs"` in `planner.py` (colori, arredi esclusi,
   esportazione, validazione). Il layout dell'appartamento può riservare un posto alla scala
   *attaccato al disimpegno/ingresso e a un muro*, in una delle file (come oggi bagno o ripostiglio),
   oppure in testa al disimpegno. Se `core` è dato, la scala va esattamente lì.
2. **Ruolo del piano (`access`)** — con `access="stairs"` niente porta d'ingresso sulla facciata:
   l'arrivo della scala sostituisce l'«Ingresso» e si apre sul disimpegno. Il piano terra di una casa
   ha `access="both"` (porta + partenza scala vicino all'ingresso).
3. **Programma del piano (`program`)** — `day`: soggiorno, cucina, pranzo, bagno di servizio,
   eventuale studio/lavanderia; `night`: camere, bagni, disimpegno, nessuna cucina; `full`: come oggi.
   Riuso delle funzioni esistenti (`make_side`, zona giorno) invece di layout nuovi da zero.
4. **Endpoint `/generate-house`** — riceve sagoma e lista piani (`[{level, program, access}]`),
   genera il piano d'ingresso, ne prende la scala e genera gli altri con `core` fissato e la stessa
   sagoma; prova più varianti e tiene la combinazione col punteggio complessivo migliore.
   `/generate-plan` accetta comunque `program/access/core` per generare un piano alla volta.
5. **Frontend: scale dal motore** — `lib/stairs.js` usa i locali `stairs` della pianta quando ci sono;
   il vecchio algoritmo resta solo per progetti salvati e piante da schizzo, ma corretto per
   preferire bordo e circolazione invece del centro del soggiorno.
6. **Frontend: «Aggiungi piano» intelligente** — generando un piano sopra/sotto uno esistente l'app
   passa da sola `core` (scala del piano accanto), `access="stairs"`, stesse misure e sagoma, e
   propone il programma (es. sopra un piano giorno → notte).
7. **Frontend: «Casa su più piani» in un colpo** — nel form, accanto ad Appartamento, una modalità
   *Casa*: numero di piani e distribuzione (preset «Giorno al PT, notte al 1°», «Tutto al PT +
   mansarda», personalizzata per piano). Una sola generazione crea il progetto con tutti i piani.
8. **Coerenza verticale** — stessa sagoma e muri perimetrali tra i piani; dove possibile bagni
   sovrapposti (scarichi); vista globale, PDF e DXF mostrano la scala come locale.
9. **Verifica** — script di prova Python (scala allineata tra i piani, accesso corretto, nessuna
   sovrapposizione, ogni locale raggiungibile) + build e prova nell'app.

## Stato (28/10/2026)

Scelte concordate: scala nella **circolazione** (vano aperto sul disimpegno, soggiorno solo come
ripiego), tipi **U, L e rampa unica**, distribuzione **preset + personalizza**, motore aggiornato.

| Punto | Stato | Dove |
|---|---|---|
| 1 Locale scala nel motore | fatto | `planner.py`: `STAIR_SLOT`, `layout_apartment(stair=…)`, `export_stairs` |
| 2 Ruolo del piano (`access`) | fatto | niente porta d'ingresso con `access="stairs"`; validazione e punteggio partono dalla scala |
| 3 Programma (`program`) | fatto | `day` = soggiorno, cucina, bagno di servizio (+ studio/ripostiglio/lavanderia); `night` = camere e bagni, zona relax se avanza ≥ 3,5 m |
| 4 `/generate-house` | fatto | `planner.generate_house`, `main.py` (motore 7.2.0, feature `stairs`, `floor_program`, `house`) |
| 5 Frontend: scale dal motore | fatto | `lib/stairs.js` (vano del motore, ripiego sul vecchio metodo), `PlanSvg.jsx` (`EngineStair`) |
| 6 «Aggiungi piano» intelligente | fatto | stesse misure del piano accanto, `core`, `access`, programma proposto; pulsante «Rigenera questo piano con la scala allineata» per i piani creati prima |
| 7 «Casa su più piani» | fatto | `components/HouseOptions.jsx`, `lib/house.js` |
| 8 Coerenza verticale | in parte | stessa sagoma (rettangolare) e misure; vista globale e PDF mostrano le scale. Da fare: bagni sovrapposti, sagome L/U/T su più piani, interrato/garage con scala |
| 9 Verifica | fatto | `tests/test_house.py`; nessuna differenza sugli appartamenti senza scala a parità di seed |

Limiti noti: con la scala la pianta è rettangolare; le camere si dividono tra i piani in automatico
(prima i piani «Notte»); il garage interrato non ha ancora il vano scala.
