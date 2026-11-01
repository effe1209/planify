# Prompt: funzioni da progettista (sezioni, quote, tavola tecnica, render)

Da inviare dopo la correzione di soppalco, porta scorrevole e TV. Lavorare su `new_features`; pubblicare su `main` solo su richiesta. Rispondere in italiano. Prima di scrivere codice, leggere `docs/PIANO_FUNZIONI.md` e `docs/PIANO_DESIGN_E_USO.md`, poi proporre il piano e chiedere ciò che manca.

## Punto di partenza (già nel codice, da riusare, non rifare)
- `lib/elevation.js`: prospetti e sezioni calcolati dalle piante (muri, solai, vetri, porte, tetto, terreno). Non conosce ancora il soppalco del loft (`plan.mezzanine`: quota, solaio, parapetto, scala, bagnetto).
- `lib/sheet.js` e `components/SheetsView.jsx`: impaginazione del foglio e SVG.
- `lib/pdfExport.js`: PDF del progetto (copertina, casa in 3D, una pagina per piano, tavole impianti, distinte).
- `lib/render3d.js`: immagine 3D fuori schermo, inquadratura a 3/4, ombre del sole.
- `lib/glb.js`, `lib/dxf3d.js`, `lib/dxf.js`: esportazioni per Blender/Unreal/CAD.
- `lib/schedule.js`: abaco serramenti (P1, F1…). `lib/estimate.js`: preventivo. `lib/compliance.js`: norme.
- Il loft ha doppia altezza, soppalco ridimensionabile (`lib/mezz.js`), tre viste (completa, sotto, sopra).

## Cosa serve a chi progetta
- **Architetto**: pianta quotata e leggibile in stampa, sezioni che mostrano le altezze utili (sotto soppalco ≥ 2,40 m, sopra ≥ 2,20 m, parapetto ≥ 1 m), prospetti, superfici dei locali e rapporti aeroilluminanti in tavola, scala di stampa vera (1:50, 1:100).
- **Ingegnere/tecnico**: quote di muri e aperture, quote altimetriche, abaco serramenti, tavole degli impianti già pronte da accostare alla pianta, segno di sezione in pianta.
- **Designer**: materiali e stili coerenti, luci vere, viste scelte (a volo d'uccello, interno a altezza occhi, per locale), render in alta risoluzione, sfondo e ora del giorno.

## Fasi (una alla volta, con test e commit a ogni fase)
1. **Sezioni del loft.** Segno di sezione trascinabile sulla pianta (A-A, B-B), sezione longitudinale e trasversale con soppalco, solaio, parapetto, scala a gradini, arredi tagliati e quote altimetriche. Estendere `elevation.js` con `plan.mezzanine`; test nel formato di `tests/elevation.test.mjs`.
2. **Quote automatiche in pianta.** Catene di quote esterne (tre livelli: totale, interassi, aperture) e quote interne dei locali; opzione acceso/spento nelle vedute; esporta in SVG, PDF e DXF (layer `QUOTE`).
3. **Tavola tecnica.** Cartiglio (progetto, data, scala, tavola n.), legenda locali con superfici, abaco serramenti, orientamento nord, formato A3/A4 e scala scelti; pagina nel PDF del progetto.
4. **Render.** Pannello «Render»: scelta dell'inquadratura (3/4, pianta 3D, interno altezza occhi per locale), risoluzione (1920, 3840), ora del giorno e sole, sfondo; luci e specchi veri, tende, tappeti. Esporta PNG e dentro il PDF. Mantenere l'esportazione GLB per Blender.
5. **Viste del loft nel 3D.** Interruttore Completa/Sotto/Sopra anche nel 3D (taglio del soffitto o del soppalco) e sezione 3D con piano di taglio.

## Regole di lavoro
- Prima di ogni fase: `graphify query` sul codice interessato (vedi `CLAUDE.md`); dopo il codice: `graphify update .`.
- Nessun controllo a occhio per «fatto»: test Node (`node --import ./tests/loader.mjs tests/<x>.test.mjs`), test Python del motore, Playwright (`PLANIFY_PY=<python> npx playwright test --project=desktop`) e screenshot controllati prima di dichiarare finito.
- Non pubblicare senza un «sì, pubblica» esplicito. Se cambia `planner.py`, ricordare il deploy manuale di Render.

## Domande da fare prima di cominciare
1. Formato di stampa e scala predefiniti (A3 1:50, A4 1:100)? Le quote in cm o in m?
2. Il cartiglio deve avere logo e dati dello studio? Quali campi (committente, progettista, n. pratica)?
3. Render: bastano viste automatiche o serve scegliere la telecamera a mano nel 3D?
4. Le sezioni vanno anche nel PDF del progetto e nel DXF (2D)? Con quali layer?
5. Per il loft: la sezione deve segnalare in rosso le altezze fuori norma?
