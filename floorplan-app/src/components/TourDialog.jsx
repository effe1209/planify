import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Film, Loader2, Orbit, Square, X } from 'lucide-react';
import { TIMES } from '../lib/renderStudio';
import { createTourStage, extensionOf, planTour, recordTour, renderPanorama, tourFileName, tourViews } from '../lib/tour';
import PanoViewer from './PanoViewer';
import { GButton } from '../glass';

const SIZES = [['2048', 'Anteprima 2048 px'], ['4096', 'Alta 4096 px']];

/*
 * Tour 3D: un panorama a 360° per ogni locale (si guarda qui, si scarica come immagine equirettangolare) e il video del giro
 * della casa. La scena si crea alla prima richiesta e si libera alla chiusura. Vedi lib/tour.js.
 */
export default function TourDialog({ project, onClose }) {
  const dialogRef = useRef(null);
  const stageRef = useRef(null);
  const stageTime = useRef(null);
  const abortRef = useRef(null);
  const urls = useRef(new Set());
  const [time, setTime] = useState('afternoon');
  const [size, setSize] = useState('2048');
  const [panos, setPanos] = useState({});       // id vista → { url, width }
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(null);       // id della vista in lavorazione, 'video' o 'tutti'
  const [error, setError] = useState(null);
  const [video, setVideo] = useState(null);     // { url, ext, seconds }
  const [progress, setProgress] = useState({ k: 0, label: '' });
  const views = useMemo(() => tourViews(project), [project]);

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) el.showModal?.();
    const onCancel = (e) => { e.preventDefault(); onClose(); };
    el?.addEventListener('cancel', onCancel);
    return () => el?.removeEventListener('cancel', onCancel);
  }, [onClose]);

  useEffect(() => () => {   // chiusura: si ferma ciò che gira e si libera la scheda grafica
    abortRef.current?.abort();
    stageRef.current?.dispose();
    for (const u of urls.current) URL.revokeObjectURL(u);
  }, []);

  const stage = useCallback(async () => {
    if (stageRef.current && stageTime.current === time) return stageRef.current;
    stageRef.current?.dispose();
    stageRef.current = null;
    stageRef.current = await createTourStage(project, { time });
    stageTime.current = time;
    return stageRef.current;
  }, [project, time]);

  const guard = async (what, fn) => {
    if (busy) return;
    setBusy(what);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (e.message !== 'interrotto') setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const makeOne = async (st, v) => {
    const r = await renderPanorama(st, v, { width: Number(size) });
    urls.current.add(r.url);
    setPanos((p) => ({ ...p, [v.id]: { url: r.url, width: r.width } }));
    return r;
  };
  const panorama = (v) => guard(v.id, async () => {
    const r = await makeOne(await stage(), v);
    setOpenId(v.id);
    return r;
  });
  const all = () => guard('tutti', async () => {
    const st = await stage();
    for (const v of views) {
      setProgress({ k: 0, label: v.label.replace(/^Interno:\s*/, '') });
      await makeOne(st, v);
    }
    if (views[0]) setOpenId(views[0].id);
  });
  const makeVideo = () => guard('video', async () => {
    const st = await stage();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setProgress({ k: 0, label: 'Preparazione' });
    const r = await recordTour(st, project, { signal: ctl.signal, onProgress: (k, label) => setProgress({ k, label }), plan: planTour(project) });
    const url = URL.createObjectURL(r.blob);
    urls.current.add(url);
    setVideo({ url, ext: extensionOf(r.mime), seconds: Math.round(r.seconds) });
  });

  const current = views.find((v) => v.id === openId);
  const label = (v) => v.label.replace(/^Interno:\s*/, '');

  return (
    <dialog ref={dialogRef} className="pf-dialog pf-dialog-wide pf-tour" aria-labelledby="pf-tour-title">
      <header className="pf-dialog-head">
        <h2 id="pf-tour-title"><Orbit size={18} /> Tour 3D</h2>
        <GButton type="button" className="pf-icon-btn" onClick={onClose} aria-label="Chiudi"><X size={18} /></GButton>
      </header>
      <div className="pf-dialog-body">
        <p className="pf-hint">Un panorama a 360° per ogni locale (da guardare qui o da usare in un sito o in un visore) e il video del giro della casa.</p>
        {views.length === 0 ? <p className="pf-hint">Non ci sono locali abbastanza grandi per un panorama.</p> : (
          <>
            <div className="pf-row2">
              <label className="pf-field-sm">
                <span>Ora del giorno</span>
                <select className="pf-input-sm" value={time} onChange={(e) => setTime(e.target.value)} disabled={!!busy}>
                  {TIMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>
              <label className="pf-field-sm">
                <span>Qualità dei panorami</span>
                <select className="pf-input-sm" value={size} onChange={(e) => setSize(e.target.value)} disabled={!!busy}>
                  {SIZES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
            <ul className="pf-tour-list">
              {views.map((v) => (
                <li key={v.id} className={openId === v.id ? 'is-on' : ''}>
                  {panos[v.id] ? <img src={panos[v.id].url} alt="" className="pf-tour-thumb" /> : <i className="pf-tour-thumb is-empty" aria-hidden="true" />}
                  <span><strong>{label(v)}</strong>{panos[v.id] ? <em>{panos[v.id].width} × {panos[v.id].width / 2} px</em> : null}</span>
                  {panos[v.id] && <GButton type="button" className="pf-mini" onClick={() => setOpenId(v.id)}>Guarda</GButton>}
                  <GButton type="button" className="pf-mini" disabled={!!busy} onClick={() => panorama(v)}>
                    {busy === v.id ? <><Loader2 size={13} className="pf-spin" /> Creo…</> : panos[v.id] ? 'Rifai' : 'Crea panorama'}
                  </GButton>
                  {panos[v.id] && (
                    <a className="pf-mini" href={panos[v.id].url} download={tourFileName(project, `panorama-${label(v).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, 'jpg')}><Download size={13} /> JPG</a>
                  )}
                </li>
              ))}
            </ul>
            <div className="pf-security-actions">
              <GButton type="button" className="pf-mini" disabled={!!busy} onClick={all}>
                {busy === 'tutti' ? <><Loader2 size={13} className="pf-spin" /> {progress.label}…</> : 'Crea tutti i panorami'}
              </GButton>
            </div>
            {current && panos[current.id] && (
              <section className="pf-cloud-block">
                <h3>{label(current)}</h3>
                <PanoViewer url={panos[current.id].url} label={`Panorama a 360°: ${label(current)}`} />
              </section>
            )}
            <section className="pf-cloud-block">
              <h3>Video del giro della casa</h3>
              <p className="pf-hint">Parte da fuori e gira in ogni locale (circa {planTour(project).reduce((s, g) => s + g.seconds, 0)} secondi), 1280 × 720. Si registra in tempo reale: tieni aperta la finestra.</p>
              <div className="pf-security-actions">
                {busy === 'video' ? (
                  <GButton type="button" className="pf-mini is-danger" onClick={() => abortRef.current?.abort()}><Square size={12} /> Interrompi</GButton>
                ) : (
                  <GButton type="button" className="pf-mini is-accent" disabled={!!busy} onClick={makeVideo}><Film size={13} /> Registra il video</GButton>
                )}
                {video && busy !== 'video' && (
                  <a className="pf-mini" href={video.url} download={tourFileName(project, 'tour', video.ext)}><Download size={13} /> Scarica {video.ext.toUpperCase()} ({video.seconds} s)</a>
                )}
              </div>
              {busy === 'video' && (
                <div role="progressbar" aria-valuenow={Math.round(progress.k * 100)} aria-valuemin="0" aria-valuemax="100" className="pf-tour-bar" aria-label="Avanzamento del video">
                  <i style={{ width: `${Math.round(progress.k * 100)}%` }} /><span>{progress.label}</span>
                </div>
              )}
              {video && video.ext === 'webm' && <p className="pf-hint">Questo browser registra in WebM: si apre in tutti i lettori moderni e si converte in MP4 con un qualsiasi convertitore.</p>}
              {video && <video className="pf-tour-video" src={video.url} controls playsInline />}
            </section>
          </>
        )}
        {error && <p className="pf-warn" role="alert">{error}</p>}
      </div>
    </dialog>
  );
}
