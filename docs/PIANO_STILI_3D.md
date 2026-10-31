# Piano: oggetti rifiniti, stili d'interni nel 3D, muri esterni colorati

Stato di partenza (verificato nel codice):
- Hanno un modello 3D vero: letto, armadio, cassettiera, scaffali, libreria, auto, moto, WC, bidet, lavabo, doccia, vasca,
  sedia da ufficio, TV, divani, poltrona, madia, pianta, albero, siepe, recinzione, passo pedonale, cancelli, lavatrice,
  asciugatrice, aspirapolvere (`lib/furniture3d.js`).
- Sono ancora scatole (18 tipi): comodino, scrivania, tavolo, tavolo tondo (con gambe), tavolino, piano cucina, penisola,
  scarpiera, credenza (console), lampada da terra, colonna bagno, scaldasalviette, lavatoio, minibar, banco da lavoro,
  cesto, gazebo. Anche porte (solo il vano, senza anta), finestre (solo vetro), scale (senza corrimano) e tetto sono semplici.
- Gli stili (`lib/themes.js`) cambiano solo qualche colore (legno, tessuto, piumone, vaso) e, in 2D, la forma dei pezzi
  (angoli, braccioli, gambe, capitonné). Nel 3D la forma non cambia e muri, pavimenti e tetto hanno colori fissi:
  muri `#f3f0ea` dentro e fuori, pavimento a tinta unita per tipo di locale, nessuna differenza fra i sei stili.
- Lo stile è per piano (`meta.style`); la casa intera si costruisce piano per piano con il tema di ciascuno.

## 1. Fondamenta: un sistema di stile 3D
- Ogni stile ha un «kit 3D»: colori di muri interni ed esterni, zoccolo, cornici, tetto, metalli, e per il pavimento un
  materiale vero (listoni, spina di pesce, cemento, marmo per i bagni) con texture generate al volo (canvas, nessun file).
- Grammatica delle forme già in `FORMS` (angoli, braccioli, gambe tornite/metallo/legno, capitonné, mobili bassi) resa
  anche in 3D.
- Materiali condivisi e texture in cache, per non appesantire il 3D su iPad e telefono.

## 2. Muri esterni colorati
- Ogni tratto di muro ha una faccia interna e una esterna: l'esterno si riconosce dal lato senza locali. Facce con
  materiali diversi, quindi dentro resta l'intonaco chiaro e fuori il colore dello stile.
- Facciata per stile (proposta): moderno intonaco grigio chiaro con zoccolo antracite; classico ocra/crema con zoccolo in
  pietra e cornicione; nordico bianco con rivestimento in listelli di legno chiaro a tratti; industriale mattone
  o cemento scuro con serramenti neri; japandi beige caldo con listelli in legno scuro; luxury travertino/avorio con
  profili oro.
- Tetto, grondaie, davanzali e infissi nei colori dello stile (coppi, ardesia, lamiera, legno).

## 3. Oggetti ancora da rifinire (18 tipi)
Comodino (cassetto, gambe), scrivania (piano, gambe, cassettiera), tavolo e tavolo tondo (gambe per stile), tavolino,
cucina (basi con ante, piano, lavello, piano cottura, cappa, frigorifero), penisola con sgabelli, scarpiera, credenza,
lampada da terra, colonna bagno, scaldasalviette, lavatoio, minibar, banco da lavoro, cesto, gazebo con tetto.
In più i dettagli che oggi mancano: ante delle porte con maniglia e stipiti, infissi e davanzali delle finestre, corrimano
e balaustra delle scale, battiscopa, tende.

## 4. Gli stili sugli oggetti (varianti)
Stessa famiglia di oggetto, forma diversa per stile: divano con braccioli quadrati/a rullo/sottili, gambe tornite o in
metallo, testiera del letto capitonné (classico, luxury) o bassa su pedana (japandi) o in ferro (industriale), maniglie
in ottone/nero/cromo, lampade e tavoli per stile. Cambiano anche cancelli, recinzioni e siepi (ferro nero, ottone, legno).

## 5. DXF
Ogni variante di stile è un blocco diverso (nome con suffisso dello stile: LETTO_160X200_CLASSICO). Opzione: layer per
materiale (LEGNO, TESSUTO, METALLO, VETRO, INTONACO) così in CAD si assegnano i materiali.

## 6. Verifica
Prove automatiche: ogni stile produce colori e forme diversi (test su materiali e geometrie), i blocchi DXF non si
scontrano fra stili. Controllo visivo: sei stili × (esterno, soggiorno, camera, bagno) in screenshot a confronto.
Prestazioni: conteggio di pezzi e di texture per scena, senza rallentare iPad e iPhone.

## Ordine di lavoro
1. Fondamenta di stile + muri esterni e interni, pavimenti e tetto (è ciò che si vede di più, cambia tutta la casa).
2. Dettagli architettonici: ante delle porte, infissi, corrimano.
3. I 18 oggetti ancora a scatola.
4. Varianti di stile degli oggetti (gambe, braccioli, testiere, maniglie).
5. DXF con stile e materiali, test e confronto visivo.

## Stato (fatto)
Scelte: una sola facciata per la casa (stile del piano terra), texture sottili, anche porte, finestre e scale, DXF con layer per materiale.
- `lib/style3d.js`: sei kit (moderno, classico, nordico, industriale, japandi, luxury) con muri interni ed esterni, zoccolo,
  cornicione, battiscopa, pavimenti (listoni, spina di pesce, cemento; piastrelle o marmo nei bagni), tetto (coppi, ardesia,
  lamiera), infissi, porte, maniglie e ringhiere; texture generate al volo e in cache.
- Muri: faccia interna chiara, faccia esterna nel materiale della facciata (intonaco, mattone, listelli, travertino), zoccolo
  e cornicione dove lo stile li prevede.
- Porte con anta socchiusa, stipiti e maniglia; basculante a pannelli; finestre con telaio, traversa e davanzale; ringhiera
  attorno all'apertura delle scale (vetro nel moderno, barre nell'industriale, balaustri negli altri).
- Tutti gli arredi hanno un modello: i 18 ancora a scatola (comodino, scrivania, tavoli, cucina, penisola con sgabelli, scarpiera,
  console, lampada, colonna bagno, scaldasalviette, lavatoio, minibar, banco da lavoro, cesto, gazebo) sono ora oggetti.
- Varianti per stile: gambe (legno, tornite, metallo), braccioli (quadrati, tondi, a rullo, sottili), testiere (capitonné,
  tubo di ferro, listelli, bassa su pedana), maniglie (barra, pomello, presa incassata), divano basso nel japandi.
- DXF 3D: blocchi con il suffisso dello stile (LETTO_160X200_CLASSIC) e layer per materiale (ARR_LEGNO, ARR_TESSUTO, ARR_METALLO,
  ARR_VETRO…); porte, ringhiere e scale su layer propri.
