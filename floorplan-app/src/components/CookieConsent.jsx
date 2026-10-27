import { useEffect, useRef, useState } from 'react';
import { Cookie, X } from 'lucide-react';

/* Banner del consenso (al primo accesso) e finestra con preferenze + informativa (sempre richiamabile). */

export function CookieBanner({ onAcceptAll, onNecessaryOnly, onCustomize }) {
  return (
    <div className="pf-cookie-banner" role="region" aria-label="Consenso cookie">
      <Cookie size={20} className="pf-cookie-icon" aria-hidden="true" />
      <p>
        Planify usa l’archiviazione del browser per le funzioni tecniche (tema, collegamento al motore). Con il tuo
        consenso salva anche la <b>cronologia delle planimetrie</b> su questo dispositivo e raccoglie
        <b> statistiche anonime</b> di utilizzo. Nessuna profilazione, nessun dato inviato a terzi per pubblicità.{' '}
        <button type="button" className="pf-link" onClick={onCustomize}>Informativa e preferenze</button>
      </p>
      <div className="pf-cookie-actions">
        <button type="button" className="pf-secondary" onClick={onNecessaryOnly}>Solo necessari</button>
        <button type="button" className="pf-primary" onClick={onAcceptAll}>Accetta tutto</button>
      </div>
    </div>
  );
}

function Toggle({ checked, disabled, onChange, label }) {
  return (
    <label className={`pf-toggle ${disabled ? 'is-disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <span aria-hidden="true" />
      <b className="sr-only">{label}</b>
    </label>
  );
}

const STORAGE_ROWS = [
  ['planify.consent', 'Ricorda le tue scelte su questa finestra', 'Necessario', '12 mesi'],
  ['planify.theme', 'Tema chiaro / scuro', 'Necessario', 'Fino a cancellazione'],
  ['planify.backend', 'Indirizzo del motore di generazione', 'Necessario', 'Fino a cancellazione'],
  ['planify.sketchCorrection', 'Tipo di correzione del disegno a mano', 'Necessario', 'Fino a cancellazione'],
  ['planify.history', 'Cronologia e planimetrie salvate', 'Funzionale (consenso)', 'Fino a cancellazione'],
];

export function CookieDialog({ consent, onSave, onClose }) {
  const [history, setHistory] = useState(consent?.history ?? true);
  const [analytics, setAnalytics] = useState(consent?.analytics ?? false);
  const dialogRef = useRef(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal?.();
    const onCancel = (e) => {
      e.preventDefault();
      onClose();
    };
    el?.addEventListener('cancel', onCancel);
    return () => el?.removeEventListener('cancel', onCancel);
  }, [onClose]);

  return (
    <dialog ref={dialogRef} className="pf-dialog" aria-labelledby="pf-cookie-title">
      <header className="pf-dialog-head">
        <h2 id="pf-cookie-title"><Cookie size={18} /> Cookie e privacy</h2>
        <button type="button" className="pf-icon-btn" onClick={onClose} aria-label="Chiudi"><X size={18} /></button>
      </header>

      <div className="pf-dialog-body">
        <section className="pf-consent-row">
          <div>
            <h3>Strettamente necessari</h3>
            <p>Tema, indirizzo del motore e la tua scelta sul consenso. Servono al funzionamento e non richiedono consenso.</p>
          </div>
          <Toggle checked disabled label="Necessari, sempre attivi" />
        </section>
        <section className="pf-consent-row">
          <div>
            <h3>Cronologia delle planimetrie</h3>
            <p>Conserva sul tuo dispositivo le piante generate o disegnate e quelle che salvi con la stella, così le ritrovi
              alla prossima visita. I dati non lasciano il browser.</p>
          </div>
          <Toggle checked={history} onChange={setHistory} label="Cronologia" />
        </section>
        <section className="pf-consent-row">
          <div>
            <h3>Statistiche anonime</h3>
            <p>Vercel Web Analytics conta visite e pagine in forma aggregata, senza cookie e senza identificarti.</p>
          </div>
          <Toggle checked={analytics} onChange={setAnalytics} label="Statistiche" />
        </section>

        <details className="pf-details">
          <summary><span>Informativa completa</span></summary>
          <div className="pf-policy">
            <p>
              <b>Cosa usiamo.</b> Planify non installa cookie di profilazione né di terze parti. Usa l’archiviazione locale del
              browser (localStorage), che ai sensi della normativa sui cookie (art. 122 Codice Privacy, Direttiva ePrivacy)
              è equiparata ai cookie: gli strumenti tecnici sono sempre attivi, quelli funzionali e statistici solo con il
              tuo consenso.
            </p>
            <table className="pf-policy-table">
              <thead><tr><th>Chiave</th><th>Finalità</th><th>Tipo</th><th>Durata</th></tr></thead>
              <tbody>
                {STORAGE_ROWS.map(([k, what, type, dur]) => (
                  <tr key={k}><td><code>{k}</code></td><td>{what}</td><td>{type}</td><td>{dur}</td></tr>
                ))}
              </tbody>
            </table>
            <p>
              <b>Dati inviati al server.</b> Quando generi una pianta o esporti in DXF, le misure e la pianta vengono inviate
              al motore di calcolo solo per elaborare la richiesta; non vengono conservate.
            </p>
            <p>
              <b>I tuoi diritti.</b> Puoi cambiare idea in qualsiasi momento da «Cookie» in alto a destra: revocando il
              consenso alla cronologia, i dati salvati vengono cancellati subito da questo dispositivo. Puoi anche
              cancellarli dalle impostazioni del browser.
            </p>
          </div>
        </details>
      </div>

      <footer className="pf-dialog-foot">
        <button type="button" className="pf-secondary" onClick={() => onSave({ history: false, analytics: false })}>
          Rifiuta facoltativi
        </button>
        <button type="button" className="pf-primary" onClick={() => onSave({ history, analytics })}>
          Salva preferenze
        </button>
      </footer>
    </dialog>
  );
}
