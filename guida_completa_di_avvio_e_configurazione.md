# Guida Passo-Passo per l'Avvio dell'Applicazione AI Floor Plan

Questa guida ti spiegherà esattamente come mettere online e collegare il **Backend Python** (su Hugging Face Spaces o Render) e il **Frontend React** (su Vercel o in locale), il tutto in modo **completamente gratuito**.

---

## PARTE 1: Distribuzione del Backend Python (Gratuito)

Il backend elabora i calcoli procedurali/AI per generare le stanze e l'arredamento.

### Opzione A: Hugging Face Spaces (Consigliato per modelli AI)

1. **Crea un Account**:
   * Registrati gratuitamente su [Hugging Face](https://huggingface.org/).
2. **Crea uno Space**:
   * Clicca sulla tua foto profilo in alto a destra e seleziona **New Space**.
   * Inserisci un nome (es. `my-floorplan-backend`).
   * Sotto **Space SDK**, seleziona **Docker** (oppure *Blank*).
   * Seleziona il piano **Free CPU / Docker** (o GPU se disponibile per il tuo account).
   * Imposta la visibilità su **Public**.
   * Clicca su **Create Space**.
3. **Carica i File**:
   * Vai nella scheda **Files and versions** del tuo Space.
   * Carica i 3 file creati nell'editor:
     * `main.py`
     * `requirements.txt`
     * `Dockerfile`
4. **Ottieni l'URL dell'API**:
   * Attendi che Hugging Face completi il *Building* del container (l'icona in alto diventerà verde con scritto *Running*).
   * L'URL del tuo server backend avrà questa struttura:
     `https://TUO-USERNAME-NOME-SPACE.hf.space`

---

### Opzione B: Render.com (Alternativa per Web Service)

1. Registrati su [Render.com](https://render.com/).
2. Crea un nuovo **Web Service** collegato al tuo repository GitHub contenente `main.py`, `requirements.txt` e `Dockerfile`.
3. Seleziona il piano **Free**.
4. Render rileverà il `Dockerfile` ed eseguirà l'applicazione esponendola su una porta pubblica HTTPS.

---

## PARTE 2: Test e Avvio Locale (Opzionale)

Se vuoi provare tutto sul tuo computer prima di pubblicare:

### 1. Avviare il Backend in Locale:
```bash
# Installa le dipendenze
pip install -r requirements.txt

# Avvia il server FastAPI su localhost:7860
uvicorn main:app --reload --port 7860
```
Il server sarà raggiungibile a `http://localhost:7860`.

### 2. Avviare il Frontend in Locale:
Con un qualsiasi progetto React (es. creato con `npm create vite@latest`):
* Sovrascrivi il file `src/App.jsx` con il codice React generato nell'editor.
* Assicurati di installare i pacchetti necessari:
  ```bash
  npm install lucide-react
  ```
* Avvia con `npm run dev`.

---

## PARTE 3: Pubblicare il Frontend su Vercel (Gratuito)

1. **Crea un account** su [Vercel](https://vercel.com/) (puoi accedere tramite GitHub).
2. Carica il codice del Frontend su un repository GitHub personale.
3. Su Vercel, clicca su **Add New** > **Project** ed importa il tuo repository.
4. Clicca su **Deploy**. In pochi secondi il sito sarà raggiungibile da qualsiasi browser.

---

## PARTE 4: Collegare Frontend e Backend

1. Apri la tua applicazione web (su Vercel o in locale).
2. Nel pannello laterale a sinistra, individua la voce **URL Server AI (HuggingFace/Render)**.
3. Incolla l'URL pubblico ottenuto al punto 1 (es. `https://username-my-space.hf.space`).
4. Inserisci le dimensioni desiderate e clicca su **Genera Pianta Gratuita**.

> **Nota:** Se il backend non è collegato o è spento, la Web App utilizzerà automaticamente il motore di simulazione grafica integrato per mostrare comunque l'anteprima 2D/3D.