import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileDown, Library, Trash2, Upload, X } from 'lucide-react';
import { CATEGORIES, libraryTemplateCsv, libraryToCsv, parseLibraryCsv, quoteToCsv } from '../lib/materialLibrary';
import { saveBlob } from '../lib/utils';

const eur = (v) => `${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const csvBlob = (text) => new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });   // con il BOM, Excel legge gli accenti

/*
 * Libreria materiali: importa un CSV (marchio, codice, nome, categoria, colore, prezzo…), cerca e filtra, scarica il file d'esempio e
 * il preventivo di acquisto dei materiali scelti nei locali.
 */
export default function LibraryDialog({ library, quote, onLibrary, onClose, say }) {
  const dialogRef = useRef(null);
  const fileRef = useRef(null);
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');
  const [replace, setReplace] = useState(false);
  const [report, setReport] = useState(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal?.();
    const onCancel = (e) => { e.preventDefault(); onClose(); };
    el?.addEventListener('cancel', onCancel);
    return () => el?.removeEventListener('cancel', onCancel);
  }, [onClose]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return library.filter((it) => (cat === 'all' || it.category === cat)
      && (!q || `${it.brand} ${it.code} ${it.name} ${it.finish || ''}`.toLowerCase().includes(q)));
  }, [library, cat, query]);

  const importFile = async (file) => {
    if (!file) return;
    const { items, errors } = parseLibraryCsv(await file.text());
    setReport({ file: file.name, added: items.length, errors });
    if (!items.length) return;
    const byId = new Map(replace ? [] : library.map((it) => [it.id, it]));
    for (const it of items) byId.set(it.id, it);
    onLibrary([...byId.values()]);
    say?.(`Libreria: ${items.length} materiali importati`);
  };

  return (
    <dialog ref={dialogRef} className="pf-dialog pf-dialog-wide" aria-labelledby="pf-lib-title">
      <header className="pf-dialog-head">
        <h2 id="pf-lib-title"><Library size={18} /> Libreria materiali</h2>
        <button type="button" className="pf-icon-btn" onClick={onClose} aria-label="Chiudi"><X size={18} /></button>
      </header>
      <div className="pf-dialog-body">
        <p className="pf-hint">
          Carica un file CSV con i tuoi materiali (marchio, codice, nome, categoria, colore, unità, prezzo…). Poi scegli pavimento e pareti di ogni
          locale: il colore e la trama si vedono in pianta e in 3D, e il preventivo di acquisto e le schede tecniche escono nel PDF.
        </p>
        <div className="pf-security-actions">
          <input ref={fileRef} type="file" accept=".csv,text/csv,.txt" hidden onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ''; }} />
          <button type="button" className="pf-mini is-accent" onClick={() => fileRef.current?.click()}><Upload size={13} /> Importa CSV</button>
          <button type="button" className="pf-mini" onClick={() => saveBlob(csvBlob(libraryTemplateCsv()), 'libreria-materiali-esempio.csv')}
            title="Un file d'esempio con le colonne giuste, da compilare con i tuoi materiali"><FileDown size={13} /> File d'esempio</button>
          {library.length > 0 && (
            <>
              <button type="button" className="pf-mini" onClick={() => saveBlob(csvBlob(libraryToCsv(library)), 'libreria-materiali.csv')}><Download size={13} /> Esporta</button>
              <button type="button" className="pf-mini is-danger" onClick={() => { if (window.confirm('Svuotare la libreria? I materiali già scelti nei locali restano.')) onLibrary([]); }}><Trash2 size={13} /> Svuota</button>
            </>
          )}
        </div>
        <label className="pf-check"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /><span>L'importazione sostituisce tutta la libreria (altrimenti aggiunge e aggiorna)</span></label>
        {report && (
          <div role="status" className="pf-lib-report">
            <p className="pf-hint"><b>{report.file}</b>: {report.added} materiali importati{report.errors.length ? `, ${report.errors.length} righe da controllare` : ''}.</p>
            {report.errors.length > 0 && (
              <ul className="pf-notes">{report.errors.slice(0, 12).map((e) => <li key={`${e.line}${e.why}`}>Riga {e.line}: {e.why}</li>)}
                {report.errors.length > 12 && <li>…e altre {report.errors.length - 12}.</li>}</ul>
            )}
          </div>
        )}

        {library.length > 0 && (
          <section className="pf-cloud-block">
            <h3>Materiali ({library.length})</h3>
            <div className="pf-row">
              <select className="pf-input-sm" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria">
                <option value="all">Tutte le categorie</option>
                {CATEGORIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
              <input className="pf-input-sm" type="search" placeholder="Cerca marchio, codice, nome…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Cerca" />
            </div>
            <ul className="pf-lib-list">
              {shown.slice(0, 60).map((it) => (
                <li key={it.id}>
                  <i className="pf-lib-chip" style={{ background: it.color || 'transparent' }} aria-hidden="true" />
                  <span><strong>{it.name}</strong> <em>{[it.brand, it.code, it.format].filter(Boolean).join(' · ')}</em></span>
                  <span className="pf-lib-price">{eur(it.price)}/{it.unit === 'm2' ? 'm²' : it.unit}</span>
                  <button type="button" className="pf-mini is-danger" onClick={() => onLibrary(library.filter((x) => x.id !== it.id))} aria-label={`Elimina ${it.name}`}><Trash2 size={12} /></button>
                </li>
              ))}
            </ul>
            {shown.length > 60 && <p className="pf-hint">Primi 60 di {shown.length}: affina la ricerca.</p>}
            {shown.length === 0 && <p className="pf-hint">Nessun materiale trovato.</p>}
          </section>
        )}

        <section className="pf-cloud-block">
          <h3>Preventivo di acquisto</h3>
          {quote.rows.length === 0 ? (
            <p className="pf-hint">Scegli il pavimento o le pareti di un locale (selezionalo in pianta e apri «Modifica locale»): qui compaiono quantità e costi.</p>
          ) : (
            <>
              <table className="pf-est-table">
                <thead><tr><th>Materiale</th><th>Da ordinare</th><th>Totale</th></tr></thead>
                <tbody>
                  {quote.rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}<br /><em>{[r.brand, r.code].filter(Boolean).join(' · ')}</em></td>
                      <td>{r.qty.toLocaleString('it-IT')} {r.unit === 'm2' ? 'm²' : r.unit}{r.waste ? <><br /><em>+{r.waste}% sfrido</em></> : null}</td>
                      <td>{eur(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="pf-total"><b>{eur(quote.total)}</b> IVA {quote.vat}% compresa · imponibile {eur(quote.subtotal)}</p>
              <div className="pf-security-actions">
                <button type="button" className="pf-mini" onClick={() => saveBlob(csvBlob(quoteToCsv(quote)), 'preventivo-acquisto-materiali.csv')}><Download size={13} /> Scarica CSV</button>
              </div>
              <p className="pf-hint">Prezzi di fornitura del materiale, IVA esclusa nelle righe; la posa non è compresa. I pavimenti e i rivestimenti hanno il 10% di sfrido.</p>
            </>
          )}
        </section>
      </div>
    </dialog>
  );
}

/* Riquadro nel pannello di destra: quanti materiali, il totale di acquisto e il pulsante per aprire la libreria. */
export function LibraryPanel({ count, quote, onOpen }) {
  return (
    <section className="pf-sec pf-electric">
      <h2>Materiali e finiture</h2>
      <p className="pf-hint">
        {count ? `${count} materiali in libreria.` : 'Importa i tuoi materiali (pavimenti, rivestimenti, pitture, tessuti) da un file CSV.'}
        {quote.rows.length ? ` Acquisto dei materiali scelti: ${eur(quote.total)} IVA compresa.` : ''}
      </p>
      <div className="pf-security-actions">
        <button type="button" className="pf-btn-add" onClick={onOpen}><Library size={14} /> Libreria materiali</button>
      </div>
    </section>
  );
}
