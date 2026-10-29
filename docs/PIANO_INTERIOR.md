# Piano operativo — arredare come un interior designer

## Com'è oggi

Il motore (`planner.py`, classe `Placer` e funzioni `furnish_*`) mette ogni arredo nel **primo posto in
cui entra**, scorrendo i muri in un ordine fisso (di solito «lontano dalla porta»). Controlla bene gli
ingombri (porte, finestre, passaggi davanti ai mobili), ma non le **relazioni** tra gli oggetti e con la
luce: la TV può finire con la finestra alle spalle, il divano con lo schienale verso chi entra, il letto
con la testiera sotto la finestra, il WC di fronte alla porta, il lavello lontano dalla finestra.

## Idea

Per gli arredi principali si provano **tutte** le collocazioni possibili e si tiene quella con il
punteggio migliore secondo regole da interior designer, invece della prima che entra. Le stesse regole
entrano nella valutazione progettuale, così tra le varianti vince anche l'arredo migliore.

## Punti

1. **Zona TV e luce naturale** — si valutano tutte le coppie parete TV / parete divano: niente finestra
   dietro la TV (controluce), meglio nessuna alle spalle del divano (riflessi sullo schermo), TV su una
   parete perpendicolare alle finestre; distanza di visione adatta a una TV da 65" (≈ 2,2–3,2 m);
   schienale del divano non rivolto alla porta da cui si entra; nessun tavolo tra TV e divano.
2. **Percorsi liberi** — tra le porte di uno stesso locale resta un passaggio di 80 cm (a L, lungo il
   lato più esterno del locale) che nessun arredo taglia; se così l'arredo essenziale non entra, si
   rinuncia al percorso e lo si segnala.
3. **Cucina** — lavello verso la finestra, piano cottura mai sotto la finestra (il piano di lavoro si
   specchia per ottenerlo).
4. **Camere** — testiera del letto non sotto la finestra né sulla parete della porta, letto non in asse
   con la porta; armadio sulla parete piena più lunga; scrivania perpendicolare alla finestra con la luce
   da sinistra.
5. **Bagni** — doccia/vasca nella parte più riservata, WC su una parete laterale (non di fronte alla
   porta), lavabo sulla parete che si vede entrando.
6. **Valutazione progettuale** — le regole sopra diventano punti di forza / criticità nel punteggio
   («La TV ha una finestra alle spalle: controluce», «Letto con la testiera sotto la finestra»…).
7. **Verifica** — confronto prima/dopo su centinaia di piante (arredi non inseriti, problemi di
   validazione, punteggio, quante regole sono rispettate), test automatici e prova nell'app.

## Risultati (29/10/2026)

Misurati con `python3 tests/test_interior.py` su 72 appartamenti (6 tagli × 12 varianti), quota di
piante che violano la regola:

| Regola | Prima | Dopo |
|---|---|---|
| TV con una finestra accanto (controluce) | 69% | 4% |
| Divano con lo schienale verso una porta | 68% | 4% |
| Tavolo tra TV e divano | 1% | 0% |
| Passaggi tra le porte tagliati da un arredo | 34% | 0% |
| Piano cottura sotto la finestra | 76% | 0% |
| Testiera del letto sotto la finestra | 51% | 17% |
| WC di fronte alla porta | 19% | 4% |
| Scrivania rivolta alla finestra | 67% | ~55% |

Arredi non inseriti e problemi di validazione: 0 prima e dopo. Compromessi voluti:
- quando le finestre sono su due pareti vicine, il divano va davanti a una finestra pur di non avere la
  TV in controluce (riflessi meno fastidiosi dell'abbagliamento);
- nelle camere piccole (≈ 3 × 3,8 m) il letto resta sotto la finestra o accanto alla porta quando
  l'alternativa farebbe perdere l'armadio; per spostarlo si accetta al massimo un comodino in meno;
- la scrivania va perpendicolare alla finestra quando quel muro è libero; nelle camere piccole i muri
  laterali sono già occupati da letto e armadio, quindi finisce spesso sotto la finestra.

Il piano di lavoro ora porta con sé le posizioni di lavello e fuochi (`parts`), usate dal disegno e
dalle tavole elettrica e idraulica.
