# Specifiche Ajax per il calcolo della copertura: report di verifica

I dati sono in `floorplan-app/src/data/ajax-specs.json`. Sono stati raccolti il 29/10/2026 dalle pagine ufficiali `ajax.systems` (schede tecniche in italiano e manuali d'uso). Ogni valore ha il link alla sua fonte.

## Come leggere questo report

- **Ufficiale:** il valore è scritto nel testo della scheda o del manuale Ajax.
- **Dal diagramma:** il valore è misurato sui pixel dei diagrammi ufficiali dei manuali. Ajax non lo scrive in cifre.
- **Calcolato:** il valore è ricavato da noi a partire da quelli ufficiali.
- **Da verificare:** il valore non è stato trovato oppure è ambiguo.

## Volumetrici interni (lente da 88,5°)

Usano la stessa lente MotionProtect, MotionProtect Plus, MotionCam, MotionCam PhOD e CombiProtect.

| Dato | Valore | Tipo |
|---|---|---|
| Portata in asse | 12 m, con il rilevatore montato a 2,4 m | Ufficiale |
| Apertura orizzontale | 88,5° | Ufficiale |
| Altezza di montaggio | 2,4 m | Ufficiale |
| Immunità agli animali | fino a 20 kg e 50 cm di altezza; sensibilità alta 25 cm, media 35 cm, bassa 50 cm | Ufficiale |
| Velocità rilevata | da 0,3 a 2,0 m/s | Ufficiale |
| Vetro | non rileva il movimento dietro il vetro | Ufficiale (manuale) |
| Grado EN 50131 | 2 | Ufficiale |
| Fasci verticali | 5 fasce sotto l'orizzontale: 0–4°, 7–12°, 15–21°, 24–32°, 36–47° | Dal diagramma |
| Portata ai bordi del ventaglio | 12 m in asse, circa 11,5 m a ±22°, circa 10,7 m a ±34°, circa 9,4 m a ±44° | Dal diagramma |
| Zona cieca sotto il rilevatore | a terra fino a 2,2 m dal muro, all'altezza del busto (1 m) fino a 1,3 m, all'altezza della testa (1,7 m) fino a 0,6 m | Calcolato |

**Come sono stati misurati i dati dal diagramma.** I fasci verticali sono stati misurati su tre diagrammi distinti (MotionProtect, MotionCam e CombiProtect), che sono risultati uguali entro 0,4°. Per questo il dato è affidabile, ma resta una lettura di un'immagine.

## Rilevatori a tenda e da esterno

| Modello | Portata | Orizzontale | Verticale | Montaggio | Animali | Classe |
|---|---|---|---|---|---|---|
| MotionProtect Curtain | 6–15 m (correlazione disattivata), 6–8 m (attivata) | 6° | 90° | 2,4 m | montato capovolto | IV |
| DualCurtain Outdoor | 4–15 m per lato, regolabile | 4,5° | 90° | 0,8–1,3 m (porte); 0,5–0,6 m sopra il davanzale (finestre) | altezza fino a 80 cm | IV, IP54 |
| MotionCam Outdoor | 3–15 m, regolabile | 90° | non indicato | 0,8–1,3 m | altezza fino a 80 cm | IV, IP55 |
| MotionProtect Outdoor | 3–15 m, regolabile | 90° | non indicato | 0,8–1,3 m | altezza fino a 80 cm | IV, IP55 |
| GlassProtect | 0,3–9 m (rottura vetri) | 180° | — | — | — | — |

Il rilevatore di rottura vetri di CombiProtect ha gli stessi dati di GlassProtect: 0,3–9 m e 180°.

## Punti da verificare

1. **MotionCam Outdoor PhOD.** Il catalogo dell'app usa questa variante, mentre i dati sono quelli di MotionCam Outdoor Jeweller. Va confermato che abbiano la stessa portata e gli stessi angoli.
2. **Angolo verticale dei rilevatori da esterno.** Per MotionCam Outdoor e MotionProtect Outdoor la scheda indica «N/A». Montati a 0,8–1,3 m guardano quasi in orizzontale: il calcolo li tratterà come una fascia orizzontale all'altezza di montaggio.
3. **Angolo di ripresa della fotocamera dei MotionCam interni.** Non è indicato, mentre per MotionCam Outdoor è 105° × 50°. Serve solo per la verifica fotografica, non per la copertura.
4. **Classe ambientale EN 50131.** Manca per MotionProtect, MotionProtect Plus, MotionCam PhOD e GlassProtect: la pagina cita la certificazione senza riportare il valore. Non serve al calcolo, ma è utile nella relazione.
5. **DoorProtect Plus.** È un contatto magnetico, quindi protegge il punto e non ha un'area di copertura. Non è nel file e non serve al calcolo.
6. **Portata dei rilevatori a tenda.** Ajax scrive «fino a 6–15 m»: ho preso 15 m come valore massimo, con la sensibilità che lo riduce.

## Ipotesi che il calcolo userà, da scrivere nella relazione

- Il corpo umano è rilevato se almeno un fascio lo interseca tra 0,3 m (o l'altezza di immunità agli animali) e 1,7 m di altezza.
- I fasci sono trattati come piani continui sull'orizzontale. Gli spazi stretti tra un ventaglio e l'altro sono ignorati, perché chi cammina li attraversa.
- Muri e vetrate bloccano. Le porte bloccano oppure no secondo lo stato scelto. Gli arredi bloccano fino alla loro altezza.
- Le condizioni ambientali (sole diretto, fonti di calore, correnti d'aria) non sono simulate. Restano avvisi di posizionamento.
