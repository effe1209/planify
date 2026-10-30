# Piano: conformità alla normativa nazionale e al Regolamento Edilizio

Obiettivo: le piante generate, importate o modificate a mano devono rispettare le norme edilizie italiane,
e il programma deve dirlo chiaramente (cosa è a norma, cosa no, quale articolo, come correggere).

> Nota di metodo. Le cifre qui sotto sono quelle che conosco con buona sicurezza; quelle segnate **(verificare)**
> vanno controllate sul testo in vigore prima di entrare nel codice. Il programma è un aiuto alla progettazione:
> non sostituisce il progetto di un tecnico abilitato né l'istruttoria del Comune.

## 1. Cosa c'è già e cosa no

| Tema | Stato oggi |
|---|---|
| Camera doppia ≥ 14 m², singola ≥ 9 m², soggiorno ≥ 14 m² | Imposto in generazione e in `validate` |
| Bagno: la norma nazionale non fissa una superficie; il motore usa 4 m² (principale) e 3 m² (altri) come valori di progetto | Imposto in generazione, non nel pannello Conformità |
| Rapporto aeroilluminante 1/8 | Solo come punteggio in `design_review`, non come vincolo |
| Porte 90/80 cm, corridoio 1,30 m, muri 20 cm | Costanti fisse |
| Scale: pedata 27 cm, pianerottolo 1 m | Geometria, nessuna verifica di norma |
| Altezze interne | Non nel modello dati (solo altezza muri nel 3D) |
| Accessibilità (L. 13/89, DM 236/89) | Assente |
| Antincendio garage, rampe | Rampa disegnata, nessuna verifica di pendenza |
| Distanze da confini e fabbricati | Assente (il lotto non esiste come dato) |
| Superfici di legge (SU, SNR, commerciale) | Solo area lorda/netta |

## 2. Il quadro normativo da coprire

**A. Abitabilità e igiene (nazionale)**
- DM 5/7/1975: altezza minima 2,70 m (2,40 m per corridoi, bagni, ripostigli); superfici minime di camere
  (9 / 14 m²), soggiorno (14 m²), alloggio minimo (28 m² per 1 persona, 38 m² per 2 **(verificare)**);
  aerazione e illuminazione naturale pari a 1/8 della superficie del pavimento; servizio igienico con finestra
  o aspirazione forzata; cucina con aerazione propria.
- Il «bagno ≥ 6 m²» **non è un minimo nazionale**: lo è, al più, in alcuni Regolamenti Edilizi o per i bagni
  accessibili. Il motore usa 4 m² (principale) e 3 m² (altri) come valori di progetto, senza citarli come legge.

**B. Accessibilità**
- L. 13/1989 e DM 236/1989: tre livelli (accessibile, visitabile, adattabile). Indicativamente: porte ≥ 80 cm,
  corridoi ≥ 100 cm, spazio di rotazione 150 cm nel bagno, ascensore oltre il limite di piani, scale ≥ 120 cm
  nei condomini **(verificare)**.

**C. Sicurezza**
- Scale e parapetti: alzata/pedata, regola 2a + p ≈ 62–64 cm, parapetto ≥ 1,00 m **(verificare)**, larghezza minima.
- Autorimesse (DM 1/2/1986 e antincendio): pendenza rampe max 20% (15% in curva) **(verificare)**, larghezza,
  stallo minimo 2,5 × 5 m; parcheggi pertinenziali L. 122/1989 (1 m² ogni 10 m³).
- Impianti: DM 37/2008 (conformità), CEI 64-8 (livelli prestazionali: punti luce e prese per locale),
  UNI 7129 (gas: aerazione cucina).

**D. Urbanistica ed edilizia**
- DM 1444/1968 art. 9: 10 m tra pareti finestrate; Codice Civile artt. 873 e 905: distanze fra costruzioni e dai
  confini, vedute. Indici (superficie coperta, volume, altezza max) dai PRG/PGT comunali.
- DPR 380/2001: titolo abilitativo (CILA, SCIA, permesso di costruire) e «stato legittimo» (collegato al catasto).
- Energia: D.Lgs 192/2005 e decreti attuativi (requisiti minimi, orientamento, finestrature).
- Calcolo superfici: DM 801/1977 (SU, SNR), DPR 138/1998 (superficie catastale/commerciale).

**E. Regolamento Edilizio (RET + Comune)**
- Esiste lo schema nazionale (Intesa Stato-Regioni del 20/10/2016) ma ogni Comune lo recepisce e lo modifica:
  altezze, superfici, rapporti 1/8 o 1/10, soppalchi, bagni, cucine, box, distanze. Non è codificabile «una volta
  per tutte»: serve un meccanismo, non una tabella.

## 3. Scelte possibili per il Regolamento Edilizio

**Opzione 1: profilo normativo con regole a dati (consigliata)**
Le regole stanno in un file JSON versionato (id, valore, unità, articolo, gravità, ambito). Un profilo
«Nazionale» è il default; il profilo «Comune» sovrascrive solo i parametri che cambiano. L'utente sceglie un
profilo o lo modifica; alcuni Comuni noti possono essere precaricati dopo verifica sul testo.
- Pro: aggiornabile senza toccare il codice, ogni verifica cita la fonte, un solo meccanismo per nazionale e locale.
- Contro: i profili comunali vanno compilati e mantenuti a mano.

**Opzione 2: solo norma nazionale nel codice**
Più veloce, ma i Comuni più restrittivi non sono coperti e ogni cambio richiede una modifica al codice.

**Opzione 3: lettura del Regolamento del Comune caricato dall'utente (PDF) con Claude**
L'utente carica il suo Regolamento Edilizio, il modello estrae i parametri e l'utente li conferma uno a uno.
- Pro: copre ogni Comune senza compilare nulla.
- Contro: costo e latenza, rischio di estrazioni sbagliate (per questo la conferma umana è obbligatoria), serve un
  servizio che chiami il modello (non c'è oggi). Si può aggiungere sopra l'Opzione 1 in un secondo momento.

**Come si applicano le regole** (si può combinare):
- *Vincolo in generazione*: il motore non produce varianti fuori norma, se esiste una soluzione (già fatto per le aree).
- *Verifica su qualsiasi pianta*: pannello «Conformità» che controlla anche DXF/PDF importati e piante modificate a
  mano, con tre esiti (conforme, attenzione, non conforme), articolo di riferimento e correzione suggerita.
- *Relazione*: esportazione in PDF della verifica, da allegare al progetto.

Raccomandazione: **Opzione 1 + verifica su qualsiasi pianta + vincolo in generazione dove possibile**, Opzione 3 come
fase finale.

## 4. Piano di lavoro

**Fase 1: fondamenta (motore dati delle regole)**
1. Modello dati: altezza interna per piano e per locale; destinazione d'uso (abitazione, ufficio, hotel, garage).
2. File `norme/nazionale.json` con le regole della §2 (con fonte e stato «verificato / da verificare»).
3. Modulo `compliance.py` che valuta una pianta rispetto a un profilo e restituisce l'elenco delle violazioni.
4. Test: una pianta conforme e una per ogni regola violata.

**Fase 2: verifiche per tema** (ognuna con test)
5. Aree e dimensioni: superfici minime, lato minimo dei locali, alloggio minimo, bagno (con il valore del profilo).
6. Aeroilluminazione e ventilazione: 1/8 come vincolo, bagno senza finestra → richiesta di aspirazione forzata,
   cucina con aerazione.
7. Altezze: 2,70 / 2,40 m, soppalchi e mansarde (altezza media).
8. Scale e parapetti: alzata, pedata, larghezza, pianerottoli, parapetto.
9. Accessibilità: porte, corridoi, spazio di rotazione nel bagno, un bagno visitabile per alloggio.
10. Garage: pendenza rampa, larghezza, stalli, dotazione L. 122/89.

**Fase 3: interfaccia**
11. Pannello «Conformità» con filtro per gravità; clic su una voce evidenzia il locale in pianta.
12. Selettore di profilo (Nazionale / Comune) e modifica dei parametri.
13. Opzione «Genera solo piante conformi» e correzione automatica dove è possibile (ad esempio allargare una camera).
14. Esportazione della relazione di conformità in PDF.

**Fase 4: oltre la pianta**
15. Lotto: dimensioni del terreno, distanze dai confini e dai fabbricati, indici (superficie coperta, altezza).
16. Superfici di legge: SU, SNR e superficie commerciale nel computo.
17. Energia: orientamento (Nord in pianta), rapporto finestrato per esposizione.
18. Lettura del Regolamento del Comune da PDF (Opzione 3), con conferma dei parametri.

## 5. Cosa manca oggi nel sito (oltre alla normativa)

Per importanza:
1. **Salvataggio e account**: i progetti vivono nel browser (cronologia locale) e nel link di condivisione; manca un
   salvataggio sul cloud e il lavoro su più dispositivi.
2. **Nord e orientamento**: non c'è, ed è un dato che serve alla norma energetica e alla scelta delle finestre.
3. **Sezioni e prospetti**: oggi esistono pianta e 3D, ma un progetto per il Comune richiede anche sezioni con le
   altezze e i prospetti.
4. **Muri portanti e tramezzi**: non distinti; serve a sapere cosa si può spostare in una ristrutturazione.
5. **Tetto e coperture** (e sottotetto abitabile): assenti nel modello.
6. **Touch e telefono**: manina e zoom con due dita, tavolozze utilizzabili su tablet (oggi pensato per il mouse).
7. **Import PDF**: lettura in automatico anche senza motore online (oggi senza `pdf_import` ogni PDF diventa uno
   schizzo da ricalcare), scelta della pagina nei PDF a più pagine, ridistribuzione del motore su Render.
8. **Catasto**: il tuo PDF reale come test di regressione (anonimizzato) e correzione dei limiti noti (piano terra
   letto solo nel contorno).
9. **Qualità**: test dell'interfaccia (end-to-end) e integrazione continua; oggi i test sono script lanciati a mano.
10. **Esportazioni**: IFC/BIM e quote complete in DXF per il tecnico.

## 6. Stato (scelta: solo norma nazionale)

Decisione presa: **solo norma nazionale**, niente profili comunali per ora; la verifica **segnala** (non blocca) e
dove il motore può rispettare la norma lo fa già in generazione.

Fatto:
- `floorplan-app/src/lib/compliance.js`: verifica su qualsiasi pianta (generata, importata, modificata a mano) di
  superfici minime di camere e soggiorno, alloggio minimo 28/38 m², rapporto aeroilluminante 1/8, servizio igienico
  (presenza, finestra o aspirazione forzata), cucina, porte, corridoi, scale dritte, bagno con spazio di rotazione.
- Pannello «Conformità normativa» nella barra laterale, con la fonte di ogni voce e il clic sul locale.
- Test: `floorplan-app/tests/compliance.test.mjs`; le piante generate dal motore (appartamenti e monolocali ≥ 35 m²)
  risultano senza violazioni.
- Il monolocale ora garantisce la camera da 9 m² quando lo spazio lo permette (sotto ~40 m² resta la segnalazione).

Fase 2 completata (tranne i parapetti):
- Altezza interna per piano (campo nel pannello, 2,70 m predefinita): 2,70 m nei locali abitabili, 2,40 m in corridoi,
  bagni e ripostigli. Non cambia ancora l'altezza dei muri nel 3D.
- Scale: larghezza rampa ≥ 80 cm, alzata sul dislivello di un piano (comoda fino a 18 cm, oltre 20 cm non accettabile),
  regola 2a + p = 62-64 cm. Le scale disegnate sono state allungate (rampa unica 4,6 m, a U 3,2 m, a L con bracci da
  2,4 m) perché con 27 cm di pedata servono 17-18 gradini per salire 3,0 m.
- Garage e rampe: pendenza ≤ 20%, larghezza rampa ≥ 3 m, posto auto 2,5 × 5 m per ogni auto (verificare le fonti).
- Il motore ora dimensiona le finestre delle camere sull'1/8 del pavimento.

Da fare: parapetti (altezza ≥ 1 m, non nel modello), verifica degli articoli citati sul testo in vigore, vincolo in
generazione per l'1/8 in tutti gli schemi, altezza dei muri 3D legata al dato del piano, relazione PDF.

## 7. Decisioni che servono da te

1. Profilo: Opzione 1 (consigliata), 2 o 3?
2. (Risolta) Il bagno non ha un minimo nazionale: il motore usa 4 m² come valore di progetto; il 6 m² era una richiesta, non una norma.
3. Quale Comune (o quali) vuoi precaricare per primo?
4. Il programma deve **bloccare** la generazione fuori norma o **segnalare** soltanto?
5. Da dove parto: Fase 1 per intero, oppure prima il pannello «Conformità» sulle norme già imposte (aree, 1/8, porte)?
