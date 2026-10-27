<div align="center">
  <img src="floorplan-app/public/favicon.svg" alt="Planify Logo" width="120" height="120" />

  <h1>Planify AI 📐</h1>
  
  <p>
    <strong>Un generatore automatico di planimetrie intelligenti, completo di muri, porte, finestre e arredi.</strong>
  </p>

  <p>
    <a href="#caratteristiche-principali">Caratteristiche</a> •
    <a href="#come-funziona">Come Funziona</a> •
    <a href="#installazione-e-avvio">Installazione</a> •
    <a href="#tecnologie-usate">Tecnologie</a>
  </p>
</div>

---

## 💡 Cos'è Planify?

**Planify** è un'applicazione full-stack progettata per generare planimetrie architettoniche in modo completamente automatico partendo da pochi semplici parametri (dimensioni, numero di locali, stile e forma dell'edificio). 

Il cuore del sistema è un **motore algoritmico in Python puro** (zero dipendenze) capace di calcolare layout complessi, tracciare muri, inserire aperture e arredare le stanze in modo logico e coerente. Il tutto è controllabile tramite una **moderna e reattiva interfaccia utente in React**, che permette di visualizzare i risultati in vettoriale, ispezionare le stanze ed esportare il progetto.

## ✨ Caratteristiche Principali

* 🏗️ **Sagome Dinamiche:** Genera non solo piante rettangolari, ma anche sagome a **L, U, T** o **scalari**.
* 🛋️ **Arredo Intelligente:** Posizionamento algoritmico dell'arredamento che rispetta gli ingombri, non blocca le porte e considera la posizione delle finestre.
* 🚪 **Connettività Spaziale:** Le porte vengono posizionate solo su muri condivisi e il motore garantisce che ogni stanza generata sia sempre raggiungibile.
* 🎨 **Visualizzazione Interattiva:**
  * Toggle dei livelli (nascondi/mostra arredi, quote, etichette e griglia).
  * Zoom, pan e tooltips per le stanze.
  * Supporto nativo per **Tema Chiaro** e **Tema Scuro**.
* 💾 **Esportazione Avanzata:** Scarica la tua planimetria in formato **SVG** (vettoriale di alta qualità), **PNG** (raster) o **JSON** (dati grezzi della pianta).
* 🎲 **Riproducibilità:** Grazie al sistema di *Seed*, puoi bloccare una variante che ti piace o generare infinite disposizioni diverse a parità di dimensioni.

## 🚀 Come Funziona

Il sistema è diviso in due componenti principali:

1. **Il Motore Backend (FastAPI + Python):** Riceve le richieste e avvia una pipeline di generazione in 5 step:
   * **Layout:** Suddivide lo spazio disponibile in stanze basandosi sulla tipologia (Appartamento, Ufficio, Open Space).
   * **Muri:** Calcola lo spessore e genera i perimetri in automatico dai confini delle zone.
   * **Porte:** Analizza le adiacenze e "buca" i muri per connettere gli spazi.
   * **Finestre:** Vengono posizionate in modo intelligente sui muri esterni.
   * **Arredi:** Una classe `Placer` prova a posizionare letti, divani, cucine e sanitari evitando collisioni.

2. **Il Frontend (React):** Offre un pannello di controllo per configurare larghezza, lunghezza e stile. Invia i dati al backend, riceve un JSON strutturato e lo disegna meticolosamente tramite SVG, garantendo una pulizia visiva da disegno tecnico (con tanto di quote e cartiglio).

## 🛠️ Installazione e Avvio

Il progetto richiede l'avvio separato del backend (API) e del frontend (UI).

### 1. Avvio del Backend (Motore Python)

Assicurati di avere Python installato sul tuo sistema, poi esegui:

```bash
# Installa le dipendenze (FastAPI e Uvicorn)
pip install fastapi uvicorn pydantic

# Avvia il server di sviluppo
uvicorn main:app --reload
