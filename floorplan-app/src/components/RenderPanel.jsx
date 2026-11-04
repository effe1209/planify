import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Download, Loader2, X } from 'lucide-react';
import { BACKGROUNDS, BRIGHTNESS, SIZES, TIMES, cameraViews, shiftView } from '../lib/renderStudio';
import { GROUNDS } from '../lib/environment';
import { FLOOR_H } from '../lib/scene3d';
import { saveBlob } from '../lib/utils';
import { SAMPLE_PRESETS } from '../lib/pathTrace';
import { GButton, GCheck } from '../glass';

/*
 * Pannello Render sopra la vista 3D: inquadratura (automatica, per locale, o la telecamera com'è adesso),
 * risoluzione, ora del giorno e sfondo. «Vai alla vista» sposta la telecamera della vista 3D; «Salva render»
 * produce il PNG della casa intera fuori schermo, anche se in vista c'è un piano solo.
 */
export default function RenderPanel({ project, three, whole, level = 0, roofOn, onRoof, lowWalls, name, onClose, onDone }) {
  const [viewId, setViewId] = useState('three-quarter');
  useEffect(() => { onRoof?.(true); }, []);   // eslint-disable-line react-hooks/exhaustive-deps -- si apre sulla vista «tre quarti»: da fuori, con il tetto
  const [size, setSize] = useState('hd');
  const [time, setTime] = useState('afternoon');
  const [bg, setBg] = useState('white');
  const [ground, setGround] = useState('horizon');
  const [brightness, setBrightness] = useState('natural');
  const [quality, setQuality] = useState('fast');
  const [samples, setSamples] = useState('high');
  const [progress, setProgress] = useState(0);
  const abort = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // vista di un piano solo: la scena sta a quota 0, la telecamera si porta alla quota del piano
  const dy = whole ? 0 : -level * FLOOR_H;
  const views = useMemo(() => cameraViews(project), [project]);
  const listed = views.filter((v) => whole || v.kind === 'outside' || v.level === level);
  const find = (id) => views.find((v) => v.id === id);

  const toBlender = async () => {
    setBusy(true);
    setError(null);
    try {
      const { blenderPackage } = await import('../lib/blenderExport');
      const px = SIZES.find((s2) => s2.id === size) || SIZES[1];
      const res = await blenderPackage(project, { time, name, ground, brightness, size: [px.w, px.h], samples: SAMPLE_PRESETS.find((p) => p.id === samples)?.samples });
      saveBlob(new Blob([res.zip], { type: 'application/zip' }), `${name}-blender.zip`);
      onDone?.(`Blender: ${res.meshes.toLocaleString('it-IT')} oggetti, ${res.lights} luci, ${res.cameras} camere in un solo ZIP`);
    } catch (e) {
      setError(`Esportazione per Blender non riuscita: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };
  const go = (id) => {
    setViewId(id);
    const v = find(id);
    // vista da fuori: il tetto si accende da solo, tranne nella pianta dall'alto (stile planimetria); la scelta resta modificabile con l'interruttore
    if (v?.kind === 'outside') onRoof?.(id !== 'plan3d');
    // viste a quota d'occhi nel giardino: sullo sfondo bianco il bagliore velerebbe tutto, meglio il cielo dell'ora (si può rimettere a mano)
    if (id === 'garden-view' && bg === 'white') setBg('sky');
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
      abort.current = new AbortController();
      setProgress(0);
      const img = await houseImage(project, {
        width: px.w, height: px.h, view, time, background: bg, lowWalls, quality, roof: !!roofOn, ground, brightness,
        samples: SAMPLE_PRESETS.find((p) => p.id === samples)?.samples, onProgress: setProgress, signal: abort.current.signal,
      });
      if (!img) throw new Error('niente da disegnare');
      const blob = await fetch(img.data).then((r) => r.blob());
      saveBlob(blob, `${name}-render-${viewId === 'current' ? 'vista' : viewId}-${px.id}${quality === 'high' ? '-pt' : ''}.png`);
      const i = img.info;
      onDone?.(`Render ${img.w} × ${img.h} salvato${img.samples ? ` (${img.samples} campioni)` : ''}${i ? ` · ${i.mode}, esposizione ${i.exposure}, scheda: ${i.gpu}` : ''}${i?.notes?.length ? ` · ${i.notes.join('; ')}` : ''}`);
      if (i?.notes?.length) setError(`Attenzione: ${i.notes.join('; ')}.`);
    } catch (e) {
      setError(e.message === 'interrotto' ? 'Render interrotto.' : `Render non riuscito: ${e.message}`);
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
      <label className="pf-render-check">
        <GCheck checked={!!roofOn} onChange={(e) => onRoof?.(e.target.checked)} aria-label="Tetto nel render" />
        <span>Tetto <em>(si accende da solo nelle viste da fuori, si spegne nella pianta dall'alto)</em></span>
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
      <label>
        <span>Terreno</span>
        <select value={ground} onChange={(e) => setGround(e.target.value)} aria-label="Terreno del render">
          {GROUNDS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
      </label>
      <label>
        <span>Luminosità</span>
        <select value={brightness} onChange={(e) => setBrightness(e.target.value)} aria-label="Luminosità del render">
          {BRIGHTNESS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
      </label>
      <label>
        <span>Qualità</span>
        <select value={quality} onChange={(e) => setQuality(e.target.value)} aria-label="Qualità del render">
          <option value="fast">Tempo reale (secondi)</option>
          <option value="high">Alta, path tracing (minuti)</option>
        </select>
      </label>
      {quality === 'high' && size === '4k' && (
        <p className="pf-warn" role="note">Path tracing in 4K: molto pesante per la scheda grafica; se il browser perde WebGL, passa a Full HD.</p>
      )}
      {quality === 'high' && (
        <label>
          <span>Campioni (meno grana, più tempo)</span>
          <select value={samples} onChange={(e) => setSamples(e.target.value)} aria-label="Campioni del path tracing">
            {SAMPLE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
      )}
      <p className="pf-tip">Scegli un&apos;inquadratura e la telecamera della vista 3D ci va; poi spostala con il mouse e salva «Vista attuale».</p>
      {error && <p className="pf-warn" role="alert">{error}</p>}
      {busy && quality === 'high' && (
        <div className="pf-render-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <i style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      <GButton type="button" className="pf-tool pf-tool-accent" onClick={save} disabled={busy}>
        {busy ? <><Loader2 size={14} className="pf-spin" /> {quality === 'high' ? `Path tracing ${Math.round(progress * 100)}%` : 'Render in corso…'}</> : <><Camera size={14} /> Salva render PNG</>}
      </GButton>
      <GButton type="button" className="pf-tool" onClick={toBlender} disabled={busy}
        title="ZIP con il modello (tetto, luci, allarme, camere), lo script che prepara Cycles all'ora scelta e le istruzioni">
        <Download size={14} /> Esporta per Blender (ZIP)
      </GButton>
      {busy && quality === 'high' && <GButton type="button" className="pf-tool" onClick={() => abort.current?.abort()}>Interrompi</GButton>}
    </aside>
  );
}
