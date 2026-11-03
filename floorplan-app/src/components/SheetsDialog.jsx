import { useEffect, useRef, useState } from 'react';
import { FileText, Ruler, X } from 'lucide-react';
import { SHEET_FORMATS, SHEET_SCALES } from '../lib/techSheet';

/* Tavole in scala: formato del foglio e scala di stampa, poi PDF (una tavola per piano) o DXF della pianta aperta con cornice e cartiglio. */
export default function SheetsDialog({ onPdf, onDxf, onClose, busy }) {
  const dialogRef = useRef(null);
  const [format, setFormat] = useState('A3');
  const [scale, setScale] = useState('auto');

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal?.();
    const onCancel = (e) => { e.preventDefault(); onClose(); };
    el?.addEventListener('cancel', onCancel);
    return () => el?.removeEventListener('cancel', onCancel);
  }, [onClose]);

  return (
    <dialog ref={dialogRef} className="pf-dialog" aria-labelledby="pf-sheets-title">
      <header className="pf-dialog-head">
        <h2 id="pf-sheets-title"><Ruler size={18} /> Tavole in scala</h2>
        <button type="button" className="pf-icon-btn" onClick={onClose} aria-label="Chiudi"><X size={18} /></button>
      </header>
      <div className="pf-dialog-body">
        <p className="pf-hint">Pianta quotata, legenda dei locali, serramenti e cartiglio (marchio, committente, progettista, pratica) a una scala vera.</p>
        <div className="pf-cloud-block">
          <h3>Formato del foglio</h3>
          <div className="pf-seg pf-seg-small" role="radiogroup" aria-label="Formato del foglio">
            {Object.keys(SHEET_FORMATS).map((id) => (
              <button key={id} type="button" role="radio" aria-checked={format === id} className={format === id ? 'is-on' : ''} onClick={() => setFormat(id)}>{id}</button>
            ))}
          </div>
        </div>
        <div className="pf-cloud-block">
          <h3>Scala</h3>
          <div className="pf-seg pf-seg-small" role="radiogroup" aria-label="Scala di stampa">
            {['auto', ...SHEET_SCALES.filter((n) => n !== 20 && n !== 500)].map((s) => (
              <button key={s} type="button" role="radio" aria-checked={scale === s} className={scale === s ? 'is-on' : ''} onClick={() => setScale(s)}>
                {s === 'auto' ? 'Migliore' : `1:${s}`}
              </button>
            ))}
          </div>
          <p className="pf-hint">Se la pianta non entra alla scala scelta si passa alla più piccola che basta, e il cartiglio la riporta.</p>
        </div>
        <div className="pf-security-actions">
          <button type="button" className="pf-mini is-accent" disabled={busy} onClick={() => onPdf({ format, scale })}><FileText size={13} /> {busy ? 'Preparo…' : 'Scarica PDF (tutti i piani)'}</button>
          <button type="button" className="pf-mini" disabled={busy} onClick={() => onDxf({ format, scale })} title="Il DXF del piano aperto, con cornice e cartiglio alla scala scelta">
            DXF con cornice e cartiglio (piano aperto)
          </button>
        </div>
      </div>
    </dialog>
  );
}
