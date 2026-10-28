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
