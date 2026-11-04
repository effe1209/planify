import { useEffect, useRef, useState } from 'react';
import { FileText, Ruler, Save, Trash2, X } from 'lucide-react';
import { SHEET_FORMATS, SHEET_SCALES } from '../lib/techSheet';
import { DEFAULT_TEMPLATE, FONTS, LINE_WEIGHTS, cleanTemplate, templateOptions } from '../lib/sheetTemplates';
import { GButton, GCheck, GRange, GText, SegmentedControl } from '../glass';

/* Anteprima schematica dell'impaginazione: foglio, disegno, colonna e cartiglio come li ha scelti l'utente. */
function LayoutPreview({ d }) {
  const portrait = d.orientation === 'portrait';
  const W = portrait ? 90 : 126;
  const H = portrait ? 126 : 90;
  const m = 4 + d.margin * 0.25;
  const colW = W * 0.25;
  const left = d.side === 'left';
  const cx = left ? m : W - m - colW;
  const dx = left ? m + colW + 3 : m;
  const dw = W - 2 * m - colW - 3;
  const ch = H * 0.2;
  const top = d.cartouche === 'top';
  const accent = d.accent || '#14181f';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Anteprima dell'impaginazione" className="pf-sheet-preview">
      <rect width={W} height={H} fill="#fff" stroke="#9aa" />
      {d.frame && <rect x={m} y={m} width={W - 2 * m} height={H - 2 * m} fill="none" stroke={accent} strokeWidth="0.8" />}
      <rect x={dx + 2} y={d.align === 'start' ? m + 2 : H / 2 - (H - 2 * m) * 0.3} width={dw - 4} height={(H - 2 * m) * 0.6} fill="#e8edd8" stroke={accent} strokeWidth="0.5" />
      <line x1={left ? cx + colW : cx} y1={m} x2={left ? cx + colW : cx} y2={H - m} stroke={accent} strokeWidth="0.5" />
      <rect x={cx + 1} y={top ? m + 1 : H - m - ch} width={colW - 2} height={ch - 1} fill="#d6dccb" />
      {d.northBlock && <circle cx={cx + colW * 0.3} cy={(top ? m + ch : m) + 7} r="3.5" fill="none" stroke={accent} strokeWidth="0.5" />}
      {d.rooms && <rect x={cx + 3} y={(top ? m + ch : m) + 15} width={colW - 6} height="14" fill="#eef" />}
      {d.schedule && <rect x={cx + 3} y={(top ? m + ch : m) + 32} width={colW - 6} height="8" fill="#efe" />}
    </svg>
  );
}

/* Scelta tra poche opzioni: SegmentedControl di glisse (i valori non testuali si confrontano come stringhe). */
const Seg = ({ label, value, options, onChange }) => {
  // le schede di glisse hanno larghezza fissa: si prende quella dell'etichetta più lunga
  const w = Math.max(52, Math.max(...options.map(([, t]) => String(t).length)) * 7 + 22);
  return (
    <SegmentedControl className="pf-gseg" aria-label={label} value={String(value)} style={{ '--lg-tab-width': `${w}px`, '--lg-tab-height': '28px' }}
      items={options.map(([id, text]) => ({ value: String(id), label: text }))} onValueChange={(v) => onChange(options.find(([id]) => String(id) === v)[0])} />
  );
};

/*
 * Tavole in scala: formato, orientamento, scala, cornice, linee, bianco e nero, carattere e cartiglio, poi PDF (una tavola per piano)
 * o DXF della pianta aperta. Le impostazioni si salvano come modelli (nel progetto e nel browser) e si riprendono con un clic.
 */
export default function SheetsDialog({ onPdf, onDxf, onClose, busy, templates = [], onSaveTemplate, onDeleteTemplate }) {
  const dialogRef = useRef(null);
  const [draft, setDraft] = useState(() => cleanTemplate(templates[0] || DEFAULT_TEMPLATE));
  const [pickedId, setPickedId] = useState(templates[0]?.id || '');
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal?.();
    const onCancel = (e) => { e.preventDefault(); onClose(); };
    el?.addEventListener('cancel', onCancel);
    return () => el?.removeEventListener('cancel', onCancel);
  }, [onClose]);

  const pick = (id) => {
    setPickedId(id);
    const t = templates.find((x) => x.id === id);
    setDraft(cleanTemplate(t || DEFAULT_TEMPLATE));
  };
  const save = () => {
    const t = cleanTemplate({ ...draft, id: pickedId && templates.some((x) => x.id === pickedId) && draft.name === templates.find((x) => x.id === pickedId)?.name ? pickedId : undefined });
    onSaveTemplate?.(t);
    setPickedId(t.id);
    setDraft(t);
  };
  const text = (key, label, max, ph = '') => (
    <label className="pf-field-sm">
      <span>{label}</span>
      <GText className="pf-input-sm" maxLength={max} value={draft[key]} placeholder={ph} onChange={(e) => set({ [key]: e.target.value })} />
    </label>
  );
  const opts = templateOptions(draft);

  return (
    <dialog ref={dialogRef} className="pf-dialog" aria-labelledby="pf-sheets-title">
      <header className="pf-dialog-head">
        <h2 id="pf-sheets-title"><Ruler size={18} /> Tavole in scala</h2>
        <GButton type="button" className="pf-icon-btn" onClick={onClose} aria-label="Chiudi"><X size={18} /></GButton>
      </header>
      <div className="pf-dialog-body">
        <p className="pf-hint">Pianta quotata, legenda dei locali, serramenti e cartiglio a una scala vera. Imposta la grafica della tavola e salvala come modello.</p>

        <div className="pf-cloud-block">
          <h3>Modello</h3>
          <div className="pf-finish-row">
            <label>
              <em>Modelli salvati</em>
              <select className="pf-input-sm" value={pickedId} aria-label="Modelli di tavola salvati" onChange={(e) => pick(e.target.value)}>
                <option value="">Nuovo (impostazioni di serie)</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <GButton type="button" className="pf-btn-icon is-danger" disabled={!pickedId} title="Elimina il modello" aria-label="Elimina il modello"
              onClick={() => { onDeleteTemplate?.(pickedId); pick(''); }}><Trash2 size={13} /></GButton>
          </div>
          {text('name', 'Nome del modello', 40, 'Es. Studio – esecutivo A3')}
          <GButton type="button" className="pf-mini" onClick={save} title="Salva queste impostazioni nel progetto e nel browser"><Save size={13} /> Salva modello</GButton>
        </div>

        <div className="pf-cloud-block">
          <h3>Foglio</h3>
          <Seg label="Formato del foglio" value={draft.format} options={Object.keys(SHEET_FORMATS).map((id) => [id, id])} onChange={(format) => set({ format })} />
          <Seg label="Orientamento" value={draft.orientation} options={[['landscape', 'Orizzontale'], ['portrait', 'Verticale']]} onChange={(orientation) => set({ orientation })} />
          <Seg label="Scala di stampa" value={draft.scale} options={[['auto', 'Migliore'], ...SHEET_SCALES.filter((n) => n !== 20 && n !== 500).map((n) => [n, `1:${n}`])]} onChange={(scale) => set({ scale })} />
          <p className="pf-hint">Se la pianta non entra alla scala scelta si passa alla più piccola che basta, e il cartiglio la riporta.</p>
          <label className="pf-check"><GCheck checked={draft.frame} onChange={(e) => set({ frame: e.target.checked })} /><span>Cornice attorno al foglio</span></label>
          <label className="pf-field-sm">
            <span>Margine: {draft.margin} mm</span>
            <GRange min={5} max={20} step={1} value={draft.margin} aria-label="Margine del foglio" onChange={(e) => set({ margin: Number(e.target.value) })} />
          </label>
        </div>

        <div className="pf-cloud-block">
          <h3>Impaginazione</h3>
          <LayoutPreview d={draft} />
          <Seg label="Colonna di legenda" value={draft.side} options={[['right', 'A destra'], ['left', 'A sinistra']]} onChange={(side) => set({ side })} />
          <Seg label="Cartiglio" value={draft.cartouche} options={[['bottom', 'In basso'], ['top', 'In alto']]} onChange={(cartouche) => set({ cartouche })} />
          <Seg label="Posizione del disegno" value={draft.align} options={[['center', 'Al centro'], ['start', 'In alto a sinistra']]} onChange={(align) => set({ align })} />
          <label className="pf-check"><GCheck checked={draft.northBlock} onChange={(e) => set({ northBlock: e.target.checked })} /><span>Nord e scala grafica</span></label>
          <label className="pf-check"><GCheck checked={draft.rooms} onChange={(e) => set({ rooms: e.target.checked })} /><span>Elenco dei locali con le superfici</span></label>
          <label className="pf-check"><GCheck checked={draft.schedule} onChange={(e) => set({ schedule: e.target.checked })} /><span>Abaco dei serramenti</span></label>
          <label className="pf-field-sm">
            <span>Colore di cornice, linee e titoli</span>
            <span className="pf-finish-row">
              <input type="color" value={draft.accent || '#14181f'} aria-label="Colore di cornice e titoli" onChange={(e) => set({ accent: e.target.value })} />
              <GButton type="button" className="pf-minibtn" disabled={!draft.accent} onClick={() => set({ accent: '' })}>Nero di serie</GButton>
            </span>
          </label>
        </div>

        <div className="pf-cloud-block">
          <h3>Disegno</h3>
          <Seg label="Spessore delle linee" value={draft.lines} options={LINE_WEIGHTS.map(([id, label]) => [id, label])} onChange={(lines) => set({ lines })} />
          <Seg label="Colori" value={draft.mono} options={[[false, 'A colori'], [true, 'Bianco e nero']]} onChange={(mono) => set({ mono })} />
          <Seg label="Carattere" value={draft.font} options={FONTS} onChange={(font) => set({ font })} />
        </div>

        <div className="pf-cloud-block">
          <h3>Cartiglio e testi</h3>
          {text('studio', 'Studio o marchio', 60, 'Vuoto = quello del progetto')}
          {text('client', 'Committente', 120)}
          {text('designer', 'Progettista', 120)}
          {text('ref', 'N. pratica', 40)}
          {text('title', 'Titolo della tavola', 60, 'Vuoto = «Piano – pianta quotata»')}
          {text('note', 'Nota a piè di colonna', 200)}
        </div>

        <div className="pf-security-actions">
          <GButton type="button" className="pf-mini is-accent" disabled={busy} onClick={() => onPdf(opts)}><FileText size={13} /> {busy ? 'Preparo…' : 'Scarica PDF (tutti i piani)'}</GButton>
          <GButton type="button" className="pf-mini" disabled={busy} onClick={() => onDxf(opts)} title="Il DXF del piano aperto, con cornice e cartiglio alla scala scelta">
            DXF con cornice e cartiglio (piano aperto)
          </GButton>
        </div>
      </div>
    </dialog>
  );
}
