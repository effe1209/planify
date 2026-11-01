import { useMemo, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { BACKGROUNDS, SIZES, TIMES, cameraViews, shiftView } from '../lib/renderStudio';
import { FLOOR_H } from '../lib/scene3d';
import { saveBlob } from '../lib/utils';

/*
 * Pannello Render sopra la vista 3D: inquadratura (automatica, per locale, o la telecamera com'è adesso),
 * risoluzione, ora del giorno e sfondo. «Vai alla vista» sposta la telecamera della vista 3D; «Salva render»
 * produce il PNG della casa intera fuori schermo, anche se in vista c'è un piano solo.
 */
export default function RenderPanel({ project, three, whole, level = 0, roof, lowWalls, name, onClose, onDone }) {
  const [viewId, setViewId] = useState('three-quarter');
  const [size, setSize] = useState('hd');
  const [time, setTime] = useState('afternoon');
  const [bg, setBg] = useState('white');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // vista di un piano solo: la scena sta a quota 0, la telecamera si porta alla quota del piano
  const dy = whole ? 0 : -level * FLOOR_H;
  const views = useMemo(() => cameraViews(project), [project]);
  const listed = views.filter((v) => whole || v.kind === 'outside' || v.level === level);
  const find = (id) => views.find((v) => v.id === id);

  const go = (id) => {
    setViewId(id);
    const v = find(id);
    if (v && three.current?.setCamera) three.current.setCamera(shiftView(v, dy));
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { houseImage } = await import('../lib/render3d');
      const px = SIZES.find((s) => s.id === size) || SIZES[0];
      let view = find(viewId);
      if (viewId === 'current') {
        const c = three.current?.camera?.();
        view = c ? shiftView(c, -dy) : null;   // la telecamera attuale, riportata alle quote della casa intera
      }
      const img = await houseImage(project, { width: px.w, height: px.h, view, time, background: bg, lowWalls });
      if (!img) throw new Error('niente da disegnare');
      const blob = await fetch(img.data).then((r) => r.blob());
      saveBlob(blob, `${name}-render-${viewId === 'current' ? 'vista' : viewId}-${px.id}.png`);
      onDone?.(`Render ${px.w} × ${px.h} salvato`);
    } catch (e) {
      setError(`Render non riuscito: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="pf-render" aria-label="Render">
      <header>
        <strong><Camera size={14} /> Render</strong>
        <button type="button" className="pf-x" onClick={onClose} aria-label="Chiudi il pannello Render"><X size={14} /></button>
      </header>
      <label>
        <span>Inquadratura</span>
        <select value={viewId} onChange={(e) => go(e.target.value)} aria-label="Inquadratura del render">
          <optgroup label="Esterno">
            {listed.filter((v) => v.kind === 'outside').map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </optgroup>
          {listed.some((v) => v.kind === 'inside') && (
            <optgroup label="Dentro i locali (1,6 m)">
              {listed.filter((v) => v.kind === 'inside').map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </optgroup>
          )}
          <option value="current">Vista attuale (telecamera libera)</option>
        </select>
      </label>
      <label>
        <span>Risoluzione</span>
        <select value={size} onChange={(e) => setSize(e.target.value)} aria-label="Risoluzione del render">
          {SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>
      <label>
        <span>Ora del giorno</span>
        <select value={time} onChange={(e) => setTime(e.target.value)} aria-label="Ora del giorno">
          {TIMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
      <label>
        <span>Sfondo</span>
        <select value={bg} onChange={(e) => setBg(e.target.value)} aria-label="Sfondo del render">
          {BACKGROUNDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
      </label>
      <p className="pf-tip">Scegli un&apos;inquadratura e la telecamera della vista 3D ci va; poi spostala con il mouse e salva «Vista attuale».</p>
      {error && <p className="pf-warn" role="alert">{error}</p>}
      <button type="button" className="pf-tool pf-tool-accent" onClick={save} disabled={busy}>
        {busy ? <><Loader2 size={14} className="pf-spin" /> Render in corso…</> : <><Camera size={14} /> Salva render PNG</>}
      </button>
    </aside>
  );
}
