import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, Armchair, Briefcase, Check, ChevronDown, Cookie, Copy, Download, FileJson, FileText, Image as ImageIcon,
  Info, LayoutGrid, Loader2, Lock, Moon, PencilLine, PenTool, Ruler, Scan, ShieldCheck, Shuffle, Sparkles, Star, Sun, Tag,
  Unlock, Upload, ZoomIn, ZoomOut,
} from 'lucide-react';
import { Analytics } from '@vercel/analytics/react';
import './App.css';
import './apple.css';

import { FURNITURE, LOADING_STEPS, defaultBedrooms, PRESETS, SHAPES, SHAPE_NAME, STYLES, TYPES, TYPE_NAME } from './constants';
import PlanSvg from './components/PlanSvg';
import SketchBoard from './components/SketchBoard';
import RoomEditor from './components/RoomEditor';
import LayoutOptions from './components/LayoutOptions';
import HistoryPanel from './components/HistoryPanel';
import FilterCheck from './components/FilterCheck';
import DesignReport from './components/DesignReport';
import ErrorBoundary from './components/ErrorBoundary';
import FloorBar from './components/FloorBar';
import FloorsOverview from './components/FloorsOverview';
import SecurityPanel from './components/SecurityPanel';
import { planSecurity } from './lib/ajax';
import { activeFloor, addFloor, makeFloor, moveFloor, removeFloor, updateFloor } from './lib/project';
import { CookieBanner, CookieDialog } from './components/CookieConsent';
import { Logo, ShapeGlyph } from './components/Icons';
import { useConsent } from './hooks/useConsent';
import { usePlanHistory } from './hooks/usePlanHistory';
import { useEngine } from './hooks/useEngine';
import { sketchToPlan } from './lib/sketchToPlan';
import { buildDxf, parseDxfClientSide } from './lib/dxf';
import { serializeSvg, sheetBox } from './lib/sheet';
import { clamp, fmt, normalizeBaseUrl, randomSeed, saveBlob, snap, storage } from './lib/utils';
import { requestBase, waitForEngine } from './lib/engine';

const REQUEST_TIMEOUT_MS = 90000;
const NEXT_FACING = { S: 'W', W: 'N', N: 'E', E: 'S' };

async function postJson(base, path, body, signal) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* risposta non JSON */
    }
    throw new Error(`HTTP ${res.status}${detail ? ` - ${detail}` : ''}`);
  }
  return res;
}

/* JSON della risposta; una pagina HTML (es. «Application loading» di Render) dà un errore comprensibile. */
async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('il server ha risposto con una pagina invece che con la planimetria: è probabilmente ancora in avvio, riprova tra qualche secondo');
  }
}

export default function App() {
  const [theme, setTheme] = useState(() =>
    storage.get('planify.theme', window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [backendUrl, setBackendUrl] = useState(() => storage.get('planify.backend', import.meta.env.VITE_BACKEND_URL || ''));
  const [connOpen, setConnOpen] = useState(false);
  const engine = useEngine(backendUrl);

  const [form, setForm] = useState({
    width: 10, length: 8, roomType: 'apartment', rooms: 3, style: 'modern', shape: 'auto', seed: '',
    doubles: 1, singles: 1, baths: 'auto', kitchen: 'auto', peninsula: false,
    entry: 'auto', suite: false, study: false, storage: false, laundry: false,
    garageLaundry: true, garageStorage: true,
  });
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const [autoSeed, setAutoSeed] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(null);

  const consent = useConsent();
  const [cookieDialog, setCookieDialog] = useState(false);
  const history = usePlanHistory(consent.decided ? (consent.allowHistory ? 'on' : 'off') : 'pending');
  const current = history.current;              // progetto aperto
  const floor = activeFloor(current);            // piano su cui si lavora
  const plan = floor?.plan || null;
  const [globalView, setGlobalView] = useState(false);
  const [pendingFloor, setPendingFloor] = useState(null); // { name, level }: la prossima pianta diventa un nuovo piano

  const [layers, setLayers] = useState({ furniture: true, labels: true, dims: true, grid: false, alarm: true });
  const [zoom, setZoom] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [flash, setFlash] = useState('');
  const flashTimer = useRef(null);
  const [sketch, setSketch] = useState(null); // { shapes } quando l'editor di schizzi è aperto

  const svgRef = useRef(null);
  const stageRef = useRef(null);
  const dxfInputRef = useRef(null);
  const fitRef = useRef(1);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  useEffect(() => { storage.set('planify.theme', theme); }, [theme]);
  useEffect(() => { storage.set('planify.backend', backendUrl); }, [backendUrl]);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setStage({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom((z) => clamp((z ?? fitRef.current) * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.2, 3));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const box = useMemo(() => (plan ? sheetBox(plan, false) : null), [plan]);
  const fit = box && stage.w ? clamp(Math.min((stage.w - 40) / box.w, (stage.h - 40) / box.h), 0.2, 1.6) : 1;
  useEffect(() => { fitRef.current = fit; }, [fit]);
  const z = zoom ?? fit;

  const stats = useMemo(() => {
    if (!plan) return null;
    const st = plan.stats || {};
    const kinds = plan.rooms.map((r) => r.kind);
    return {
      gross: st.grossArea ?? plan.rooms.reduce((a, r) => a + r.w * r.h, 0),
      bedrooms: st.bedrooms ?? kinds.filter((k) => k === 'bed' || k === 'bed_single').length,
      baths: st.bathrooms ?? kinds.filter((k) => k === 'bath' || k === 'wc').length,
      doors: plan.doors.length,
      windows: plan.windows.length,
    };
  }, [plan]);

  const selectedRoom = plan?.rooms.find((r) => r.id === selectedId) || null;
  const roomFurniture = selectedRoom
    ? plan.furniture.map((item, index) => ({ item, index })).filter(({ item }) => item.room === selectedRoom.id)
    : [];
  const totalArea = plan ? plan.rooms.reduce((a, r) => a + (r.area ?? r.w * r.h), 0) : 0;
  const base = requestBase(normalizeBaseUrl(backendUrl));

  const say = (msg) => {
    clearTimeout(flashTimer.current);
    setFlash(msg);
    flashTimer.current = setTimeout(() => setFlash(''), 1800);
  };

  /*
   * Ogni nuova pianta (generata, disegnata o importata) diventa un progetto nuovo in cronologia,
   * oppure un piano in più del progetto aperto se l'utente ha chiesto «+ Piano».
   */
  const openNewPlan = (newPlan, meta, extra = {}) => {
    const { name, sketch: shapes, params } = extra;
    const data = {
      plan: newPlan,
      meta: { style: form.style, ...meta },
      params: params || {
        roomType: form.roomType, rooms: Number(form.rooms), style: form.style, shape: form.shape,
        doubles: form.doubles, singles: form.singles, baths: form.baths, kitchen: form.kitchen, peninsula: form.peninsula,
        entry: form.entry, suite: form.suite, study: form.study, storage: form.storage, laundry: form.laundry,
      },
      sketch: shapes,
    };
    if (pendingFloor && current) {
      history.update(current.id, (p) => addFloor(p, makeFloor({ ...data, name: pendingFloor.name, level: pendingFloor.level })));
      say(`Piano «${pendingFloor.name}» aggiunto al progetto`);
      setPendingFloor(null);
    } else {
      const first = makeFloor(data);
      history.add({ name: name || '', floors: [first], activeFloor: first.id });
    }
    setGlobalView(false);
    setSelectedId(null);
    setHoverId(null);
    setZoom(null);
  };

  /* ── Piani del progetto ── */
  const editProject = (fn) => current && history.update(current.id, fn);
  const selectFloor = (id) => {
    editProject((p) => ({ ...p, activeFloor: id }));
    setGlobalView(false);
    setSelectedId(null);
    setZoom(null);
  };
  const startNewFloor = ({ name, level, type, mode }) => {
    if (!current) return;
    if (mode === 'duplicate') {
      editProject((p) => addFloor(p, makeFloor({ ...floor, name, level, plan: structuredClone(floor.plan) })));
      say(`Piano «${name}» creato come copia`);
      return;
    }
    setPendingFloor({ name, level });
    if (mode === 'sketch') {
      setSketch({ shapes: [] });
    } else {
      if (type) setForm((f) => ({ ...f, roomType: type }));
      say('Imposta i parametri a sinistra e premi «Genera»');
    }
  };
  const deleteFloor = (id) => {
    const f = current.floors.find((x) => x.id === id);
    // eslint-disable-next-line no-alert
    if (f && window.confirm(`Eliminare il piano «${f.name}»?`)) editProject((p) => removeFloor(p, id));
  };

  /* ── Allarme Ajax: dispositivi di tutto il progetto, ognuno legato al suo piano ── */
  const devices = current?.security?.devices;
  const floorDevices = devices?.filter((d) => d.floor === floor?.id);
  const planAlarm = () => {
    const security = planSecurity(current);
    editProject((p) => ({ ...p, security }));
    setLayers((l) => ({ ...l, alarm: true }));
    say(`${security.devices.length} dispositivi Ajax posizionati`);
  };
  const clearAlarm = () => editProject((p) => {
    const next = { ...p };
    delete next.security;
    return next;
  });

  /* ── Personalizzazione: le modifiche finiscono nella voce di cronologia (e quindi vengono salvate) ── */
  const editPlan = (fn) => current && history.updatePlan(current.id, fn);   // agisce sul piano attivo
  const updateRoom = (roomId, patch) =>
    editPlan((p) => ({ ...p, rooms: p.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)) }));
  const editFurniture = (fn) => editPlan((p) => ({ ...p, furniture: fn(p.furniture) }));
  const removeFurniture = (index) => {
    editFurniture((list) => list.filter((_, i) => i !== index));
    say('Arredo rimosso');
  };
  const rotateFurniture = (index) =>
    editFurniture((list) => list.map((f, i) => (i === index ? { ...f, facing: NEXT_FACING[f.facing || 'S'] || 'S' } : f)));
  const flipFurniture = (index) =>
    editFurniture((list) => list.map((f, i) => (i === index ? { ...f, flip: !f.flip } : f)));
  const addFurniture = (roomId, catalogId) => {
    const room = plan.rooms.find((r) => r.id === roomId);
    const entry = FURNITURE.find((f) => f.id === catalogId);
    if (!room || !entry) return;
    const offset = (roomFurniture.length * 0.3) % Math.max(0.2, room.w - entry.w);
    const item = {
      type: entry.type,
      x: clamp(snap(room.x + 0.3 + offset), room.x, room.x + Math.max(0, room.w - entry.w)),
      y: clamp(snap(room.y + 0.3 + offset), room.y, room.y + Math.max(0, room.h - entry.h)),
      w: entry.w,
      h: entry.h,
      rot: 0,
      facing: 'S',
      room: roomId,
    };
    editFurniture((list) => [...list, item]);
    say(`${entry.label} aggiunto`);
  };

  /* ── Generazione dal motore ── */
  const run = async ({ variant = false } = {}) => {
    setError(null);
    if (!base) {
      setError("Inserisci l'URL del backend in «Connessione» (oppure imposta VITE_BACKEND_URL), oppure usa «Disegna schizzo», che funziona anche offline.");
      setConnOpen(true);
      return;
    }
    const w = parseFloat(String(form.width).replace(',', '.'));
    const l = parseFloat(String(form.length).replace(',', '.'));
    if (!Number.isFinite(w) || !Number.isFinite(l) || w <= 0 || l <= 0) {
      setError('Inserisci larghezza e lunghezza valide.');
      return;
    }
    const apartment = form.roomType === 'apartment';
    const seedTxt = String(form.seed).trim();
    const fixedSeed = !autoSeed && !variant && /^\d+$/.test(seedTxt);
    const requestSeed = fixedSeed ? Number(seedTxt) : randomSeed();

    setIsLoading(true);
    setLoadingStep(0);
    setSlow(false);
    const interval = setInterval(() => setLoadingStep((st) => Math.min(st + 1, LOADING_STEPS.length - 1)), 800);
    const slowTimer = setTimeout(() => setSlow(true), 7000);
    const controller = new AbortController();
    let timeout = null;

    try {
      // motore spento (avvio a freddo su Render): si aspetta che riparta invece di fallire subito
      if (engine.status !== 'ok' && engine.status !== 'old') {
        await waitForEngine(base, { signal: controller.signal, onWaiting: () => setSlow(true) });
        if (engine.status === 'error' || engine.status === 'waking') engine.retry();
      }
      timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const body = {
        width: clamp(w, 3.5, 60),
        length: clamp(l, 3.5, 60),
        room_type: form.roomType,
        num_rooms: apartment ? 1 + form.doubles + form.singles : Number(form.rooms),
        style: form.style,
        shape: form.shape,
        seed: requestSeed,
        ...(apartment && {
          double_bedrooms: form.doubles,
          single_bedrooms: form.singles,
          bathrooms: form.baths === 'auto' ? null : form.baths,
          kitchen: form.kitchen,
          peninsula: form.peninsula,
          needs: { entry: form.entry, suite: form.suite, study: form.study, storage: form.storage, laundry: form.laundry },
        }),
        ...(form.roomType === 'garage' && { needs: { laundry: form.garageLaundry, storage: form.garageStorage } }),
      };
      const request = async () => readJson(await postJson(base, '/generate-plan', body, controller.signal));
      let data;
      try {
        data = await request();
      } catch (err) {
        if (err.name === 'AbortError' || /^HTTP \d/.test(err.message)) throw err;
        // il motore si è rimesso in pausa mentre la pagina era aperta: si aspetta che riparta e si riprova
        setSlow(true);
        await waitForEngine(base, { signal: controller.signal });
        data = await request();
      }
      clearTimeout(timeout);
      openNewPlan(data, { type: form.roomType });
      setForm((f) => ({
        ...f,
        width: data.dimensions?.width ?? f.width,
        length: data.dimensions?.length ?? f.length,
        seed: data.seed ?? requestSeed,
      }));
    } catch (err) {
      setError(err.name === 'AbortError'
        ? 'Il motore non ha completato la pianta entro 90 secondi. Riprova.'
        : `Impossibile generare la pianta: ${err.message}.`);
    } finally {
      clearInterval(interval);
      clearTimeout(slowTimer);
      clearTimeout(timeout);
      setIsLoading(false);
    }
  };

  /* ── Schizzo ── */
  const generateFromSketch = (shapes) => {
    try {
      const newPlan = sketchToPlan(shapes, { style: form.style, peninsula: form.peninsula });
      if (sketch?.floorId && current) {
        // «Modifica schizzo»: si aggiorna lo stesso piano invece di crearne uno nuovo
        editProject((p) => updateFloor(p, sketch.floorId, (f) => ({ ...f, plan: newPlan, sketch: shapes })));
      } else {
        openNewPlan(newPlan, { type: 'sketch' }, { sketch: shapes, params: { roomType: 'apartment', rooms: shapes.length, style: form.style, shape: 'auto' } });
      }
      setSketch(null);
      say('Planimetria creata dallo schizzo');
    } catch (err) {
      setError(`Non riesco a convertire lo schizzo: ${err.message}`);
    }
  };

  /* ── Import DXF: prima il motore, poi il parser locale ── */
  const handleDxfFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    say('Importazione DXF in corso…');
    try {
      const text = await file.text();
      let data = null;
      if (base) {
        try {
          data = await readJson(await postJson(base, '/import-dxf', { dxf_content: text, style: form.style }));
        } catch {
          /* motore non raggiungibile: si prosegue in locale */
        }
      }
      data ??= parseDxfClientSide(text, form.style);
      openNewPlan(data, { type: 'dxf' }, { name: file.name.replace(/\.dxf$/i, '') });
      say('Planimetria DXF importata e arredata');
    } catch (err) {
      setError(`Errore durante l'importazione del file DXF: ${err.message}`);
    }
  };

  const restore = (entry) => {
    const f0 = activeFloor(entry);
    history.setCurrentId(entry.id);
    setGlobalView(false);
    setPendingFloor(null);
    setSelectedId(null);
    setZoom(null);
    setForm((f) => ({
      ...f,
      ...f0.params,
      width: f0.plan.dimensions.width,
      length: f0.plan.dimensions.length,
      seed: f0.plan.seed || '',
    }));
  };

  /* ── Export ── */
  const exportSvg = () => {
    if (!svgRef.current) return;
    saveBlob(new Blob([serializeSvg(svgRef.current).xml], { type: 'image/svg+xml' }), 'planimetria.svg');
  };

  const exportPng = () => {
    if (!svgRef.current) return;
    const { xml, w, h } = serializeSvg(svgRef.current);
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const k = 2;
      const canvas = document.createElement('canvas');
      canvas.width = w * k;
      canvas.height = h * k;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => b && saveBlob(b, 'planimetria.png'), 'image/png');
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError('Esportazione PNG non riuscita: usa SVG.');
    };
    img.src = url;
  };

  /* JSON dell'intero progetto: tutti i piani con le loro piante. */
  const exportJson = () => {
    if (!current) return;
    const data = {
      name: current.name || 'Progetto Planify',
      floors: current.floors.map((f) => ({ name: f.name, level: f.level, plan: f.plan })),
      ...(current.security && { security: current.security }),
    };
    saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'progetto-planify.json');
  };

  const exportPdf = async () => {
    if (!current) return;
    say('Preparazione del PDF del progetto…');
    try {
      const { exportProjectPdf } = await import('./lib/pdfExport');
      await exportProjectPdf(current);
    } catch (e) {
      setError(`Esportazione PDF non riuscita: ${e.message}`);
    }
  };

  const exportDxf = async () => {
    if (!plan) return;
    say('Generazione file CAD in corso…');
    let blob = null;
    if (base) {
      try {
        blob = await (await postJson(base, '/export-dxf', plan)).blob();
      } catch {
        /* si usa l'esportatore locale */
      }
    }
    saveBlob(blob ?? new Blob([buildDxf(plan)], { type: 'application/dxf' }), 'planimetria.dxf');
    say('File CAD esportato');
  };

  const copy = async (text, msg) => {
    try {
      await navigator.clipboard.writeText(String(text));
      say(msg);
    } catch {
      say('Copia non riuscita');
    }
  };

  const saveConsent = (choice) => {
    consent.save(choice);
    setCookieDialog(false);
    say(choice.history ? 'Preferenze salvate: la cronologia resta sul dispositivo' : 'Preferenze salvate');
  };

  const area = (parseFloat(form.width) || 0) * (parseFloat(form.length) || 0);
  const toggle = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  return (
    <div className="pf-app" data-theme={theme}>
      <input type="file" accept=".dxf" ref={dxfInputRef} onChange={handleDxfFile} hidden />

      <header className="pf-top">
        <div className="pf-brand">
          <Logo />
          <span className="pf-name">Planify</span>
        </div>
        <div className="pf-top-right">
          <span className={`pf-status is-${engine.status}`}
            title={engine.status === 'error' ? engine.reason : engine.version ? `Versione del motore: ${engine.version}` : undefined}>
            <i aria-hidden="true" />
            {{
              off: 'Motore offline (schizzi e DXF funzionano in locale)',
              checking: 'Verifico il motore…',
              waking: `Motore in avvio… ${engine.seconds || 0} s`,
              ok: `Motore collegato · v${engine.version}`,
              old: `Motore da aggiornare · v${engine.version || '?'}`,
              error: 'Motore non raggiungibile',
            }[engine.status]}
          </span>
          {engine.status === 'error' && (
            <button type="button" className="pf-mini is-accent" onClick={engine.retry} title={engine.reason}>Riprova</button>
          )}
          <button type="button" className="pf-mini" onClick={() => setCookieDialog(true)} title="Cookie e privacy">
            <Cookie size={14} /> Cookie
          </button>
          <button type="button" className="pf-icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'} title={theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'}>
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>

      <div className="pf-body">
        {/* ───────── Pannello comandi sinistro ───────── */}
        <aside className="pf-rail">
          <form className="pf-form" onSubmit={(e) => { e.preventDefault(); run(); }}>
            <section className="pf-sec">
              <h2>Misure riquadro</h2>
              <div className="pf-row2">
                {[['width', 'Larghezza'], ['length', 'Lunghezza']].map(([k, label]) => (
                  <label key={k} className="pf-field">
                    <span>{label}</span>
                    <div className="pf-input">
                      <input type="number" min="3.5" max="60" step="0.5" required value={form[k]}
                        onChange={(e) => setF(k, e.target.value)} />
                      <em>m</em>
                    </div>
                  </label>
                ))}
              </div>
              <p className="pf-hint">{fmt(area)} m² nel riquadro · da 3,5 a 60 m per lato</p>
              <div className="pf-chips">
                {PRESETS.map((p) => (
                  <button key={p.label} type="button" className="pf-chip"
                    onClick={() => setForm((f) => ({ ...f, width: p.w, length: p.l, roomType: p.type, rooms: p.rooms, ...defaultBedrooms(p.rooms) }))}>
                    {p.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="pf-sec">
              <h2>Tipologia</h2>
              <div className="pf-type-grid" role="radiogroup" aria-label="Tipologia">
                {TYPES.map(({ id, label, Icon }) => (
                  <button key={id} type="button" role="radio" aria-checked={form.roomType === id}
                    className={`pf-type-card ${form.roomType === id ? 'is-on' : ''}`}
                    onClick={() => setForm((f) => (id === 'hotel-room' && (parseFloat(f.width) > 6 || parseFloat(f.length) > 8)
                      ? { ...f, roomType: id, width: 4.2, length: 6.0, rooms: 1 }
                      : { ...f, roomType: id }))}>
                    <Icon size={16} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              {form.roomType === 'apartment' && engine.status === 'old' && (
                <div className="pf-alert pf-alert-warn" role="alert">
                  <AlertCircle size={16} />
                  <span>
                    Il motore collegato (v{engine.version || '?'}) è una versione vecchia: camere, bagni, cucina e penisola
                    verrebbero ignorati. Aggiorna il backend all'ultima versione del branch <b>new_features</b>.
                  </span>
                </div>
              )}
              {form.roomType === 'garage' && (
                <div className="pf-program">
                  {[['garageLaundry', 'Lavanderia sul fondo'], ['garageStorage', 'Ripostiglio / cantina']].map(([k, label]) => (
                    <label key={k} className="pf-check">
                      <input type="checkbox" checked={form[k]} onChange={(e) => setF(k, e.target.checked)} />
                      <span>{label}</span>
                    </label>
                  ))}
                  <p className="pf-hint">Basculante sul lato sud (la larghezza). Posti auto in base alla larghezza: circa 2,8 m l'uno.</p>
                </div>
              )}
              {form.roomType === 'garden' && (
                <p className="pf-hint">Giardino con la casa sul lato nord e la strada a sud: recinzione, cancello pedonale e carrabile, siepi, camminamento, gazebo e alberi.</p>
              )}
              {form.roomType === 'apartment' ? (
                <LayoutOptions form={form} setF={setF} />
              ) : !['hotel-room', 'garage', 'garden'].includes(form.roomType) && (
                <div className="pf-range">
                  <div>
                    <span>{form.roomType === 'office' ? 'Locali (open space incluso)' : 'Locali principali'}</span>
                    <strong>{form.rooms}</strong>
                  </div>
                  <input type="range" min="1" max="8" value={form.rooms} aria-label="Locali principali"
                    onChange={(e) => setF('rooms', Number(e.target.value))} />
                </div>
              )}
            </section>

            <section className="pf-sec">
              <h2>Sagoma</h2>
              <div className="pf-shapes" role="radiogroup" aria-label="Sagoma della pianta">
                {SHAPES.map((sh) => (
                  <button key={sh.id} type="button" role="radio" aria-checked={form.shape === sh.id}
                    className={`pf-shape ${form.shape === sh.id ? 'is-on' : ''}`} onClick={() => setF('shape', sh.id)}>
                    <ShapeGlyph d={sh.d} />
                    <span>{sh.label}</span>
                  </button>
                ))}
              </div>
              <p className="pf-hint">
                {form.shape === 'auto'
                  ? 'Ogni generazione sceglie una sagoma diversa. Per forme libere (tonde, curve) usa «Disegna schizzo».'
                  : form.roomType === 'hotel-room'
                    ? 'La camera hotel ha sagoma rettangolare ad alta efficienza.'
                    : 'La sagoma viene applicata proporzionalmente alle misure.'}
              </p>
            </section>

            <section className="pf-sec">
              <h2>Stile d'interni</h2>
              <div className="pf-styles-grid" role="radiogroup" aria-label="Stile d'interni">
                {STYLES.map((st) => (
                  <button key={st.id} type="button" role="radio" aria-checked={form.style === st.id}
                    className={`pf-style-card ${form.style === st.id ? 'is-on' : ''}`}
                    onClick={() => setF('style', st.id)} title={st.desc}>
                    <i className="pf-swatch" style={{ background: st.bg }} />
                    <span>{st.label}</span>
                  </button>
                ))}
              </div>
            </section>

            <details className="pf-details" open={connOpen} onToggle={(e) => setConnOpen(e.currentTarget.open)}>
              <summary>
                <span>Connessione e varianti</span>
                <ChevronDown size={16} />
              </summary>
              <label className="pf-field">
                <span>URL del backend</span>
                <input type="text" className="pf-plain" value={backendUrl} spellCheck="false"
                  placeholder="https://tuo-servizio.onrender.com" onChange={(e) => setBackendUrl(e.target.value)} />
              </label>
              <div className="pf-seed-toggle">
                <span>Nuovo seed ad ogni clic</span>
                <button type="button" className={`pf-mini ${autoSeed ? 'is-accent' : ''}`} onClick={() => setAutoSeed(!autoSeed)}>
                  {autoSeed ? <Sparkles size={12} /> : <Lock size={12} />}
                  {autoSeed ? 'Attivo (casuale)' : 'Bloccato'}
                </button>
              </div>
              {!autoSeed && (
                <label className="pf-field">
                  <span>Seed fisso</span>
                  <input type="number" min="0" className="pf-plain" value={form.seed} placeholder="Inserisci seed fisso"
                    onChange={(e) => setF('seed', e.target.value)} />
                </label>
              )}
            </details>
          </form>

          <div className="pf-actions">
            {error && (
              <div className="pf-alert" role="alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
            <div className="pf-action-row">
              <button type="button" className="pf-primary" disabled={isLoading} onClick={() => run()}>
                {isLoading ? <Loader2 size={17} className="pf-spin" /> : <Sparkles size={17} />}
                {isLoading ? 'Sto disegnando…' : pendingFloor ? `Genera «${pendingFloor.name}»` : 'Genera planimetria'}
              </button>
              <button type="button" className="pf-secondary" disabled={isLoading} onClick={() => run({ variant: true })}
                title="Nuovo seed e nuova disposizione" aria-label="Nuova variante">
                <Shuffle size={17} />
              </button>
            </div>
          </div>
        </aside>

        {/* ───────── Area di lavoro centrale ───────── */}
        <main className="pf-stage">
          <div className="pf-toolbar">
            <div className="pf-group" role="group" aria-label="Livelli">
              {[['furniture', Armchair, 'Arredi'], ['labels', Tag, 'Nomi'], ['dims', Ruler, 'Quote'], ['grid', LayoutGrid, 'Griglia']]
                .map(([k, Icon, label]) => (
                  <button key={k} type="button" className={`pf-tool ${layers[k] ? 'is-on' : ''}`} aria-pressed={layers[k]}
                    onClick={() => toggle(k)}><Icon size={15} /> {label}</button>
                ))}
              {devices?.length > 0 && (
                <button type="button" className={`pf-tool ${layers.alarm ? 'is-on' : ''}`} aria-pressed={layers.alarm}
                  onClick={() => toggle('alarm')}><ShieldCheck size={15} /> Allarme</button>
              )}
            </div>

            <div className="pf-group" role="group" aria-label="Disegno e import">
              <button type="button" className={`pf-tool pf-tool-accent ${sketch ? 'is-on' : ''}`}
                onClick={() => setSketch(sketch ? null : { shapes: [] })}>
                <PenTool size={15} /> Disegna schizzo
              </button>
              <button type="button" className="pf-tool" onClick={() => dxfInputRef.current?.click()}
                title="Carica una planimetria da file CAD DXF">
                <Upload size={15} /> Importa DXF
              </button>
            </div>

            <div className="pf-spacer" />

            <div className="pf-group" role="group" aria-label="Zoom">
              <button type="button" className="pf-tool pf-sq" disabled={!plan} onClick={() => setZoom(clamp(z / 1.2, 0.2, 3))}
                aria-label="Riduci" title="Riduci"><ZoomOut size={15} /></button>
              <button type="button" className="pf-tool pf-pct" disabled={!plan} onClick={() => setZoom(null)}
                title="Adatta alla finestra"><Scan size={14} /> {Math.round(z * 100)}%</button>
              <button type="button" className="pf-tool pf-sq" disabled={!plan} onClick={() => setZoom(clamp(z * 1.2, 0.2, 3))}
                aria-label="Ingrandisci" title="Ingrandisci"><ZoomIn size={15} /></button>
            </div>

            <div className="pf-group" role="group" aria-label="Esporta">
              <button type="button" className="pf-tool" disabled={!plan} onClick={exportSvg}><Download size={15} /> SVG</button>
              <button type="button" className="pf-tool" disabled={!plan} onClick={exportPng}><ImageIcon size={15} /> PNG</button>
              <button type="button" className="pf-tool pf-tool-accent" disabled={!plan} onClick={exportDxf}>
                <Briefcase size={15} /> DXF (CAD)
              </button>
              <button type="button" className="pf-tool" disabled={!plan} onClick={exportJson}><FileJson size={15} /> JSON</button>
              <button type="button" className="pf-tool pf-tool-accent" disabled={!plan} onClick={exportPdf}
                title="Esporta progetto PDF: copertina, tutti i piani con i sensori e distinta materiali">
                <FileText size={15} /> PDF progetto
              </button>
            </div>
          </div>

          {current && !sketch && (
            <FloorBar
              project={current}
              activeId={floor?.id}
              globalView={globalView}
              pending={pendingFloor}
              onSelect={selectFloor}
              onRename={(id, name) => editProject((p) => updateFloor(p, id, (f) => ({ ...f, name })))}
              onMove={(id, d) => editProject((p) => moveFloor(p, id, d))}
              onRemove={deleteFloor}
              onAdd={startNewFloor}
              onCancelAdd={() => setPendingFloor(null)}
              onToggleGlobal={() => setGlobalView(!globalView)}
            />
          )}

          <div className="pf-canvas" ref={stageRef}>
            {sketch ? (
              <SketchBoard initialShapes={sketch.shapes}
                onClose={() => { setSketch(null); if (!sketch.floorId) setPendingFloor(null); }}
                onGenerate={generateFromSketch} />
            ) : globalView && current?.floors.length > 1 ? (
              <ErrorBoundary key={`all-${current.id}`}>
                <FloorsOverview project={current} stage={stage} onOpen={selectFloor} devices={layers.alarm ? devices : null} />
              </ErrorBoundary>
            ) : plan ? (
              <ErrorBoundary key={`${current.id}-${floor.id}`}>
              <div className="pf-sheet" key={`${current.id}-${floor.id}`}>
                <PlanSvg
                  plan={plan} layers={layers} hoverId={hoverId} selectedId={selectedId}
                  onHover={setHoverId} onSelect={setSelectedId} svgRef={svgRef} zoom={z}
                  typeLabel={`${TYPE_NAME[floor.meta?.type] || 'Planimetria'} · ${floor.name}`}
                  style={floor.meta?.style} devices={floorDevices}
                />
              </div>
              </ErrorBoundary>
            ) : (
              !isLoading && (
                <div className="pf-empty">
                  <svg viewBox="0 0 240 150" width="240" height="150" aria-hidden="true">
                    <path d="M20 20h120v50h80v60H20z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
                    <path d="M20 70h60M80 70v60M140 70v60" fill="none" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.5" />
                    <path d="M92 130a14 14 0 0 1 14-14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 3" />
                  </svg>
                  <h3>Inizia a progettare</h3>
                  <p>Scegli le misure e clicca <b>«Genera planimetria»</b>, oppure usa <b>«Disegna schizzo»</b> o <b>«Importa DXF»</b>.</p>
                  {!backendUrl && (
                    <button type="button" className="pf-link" onClick={() => setConnOpen(true)}>Configura backend</button>
                  )}
                </div>
              )
            )}

            {isLoading && (
              <div className="pf-loading" role="status" aria-live="polite">
                <div className="pf-loader">
                  <div className="pf-loader-bar"><i /></div>
                  <strong>{LOADING_STEPS[loadingStep]}</strong>
                  <span>{slow ? 'Il motore si sta avviando (servizio gratuito in pausa): di solito serve meno di un minuto.' : 'Generazione in corso…'}</span>
                </div>
              </div>
            )}
            {flash && <div className="pf-flash" role="status"><Check size={14} /> {flash}</div>}
          </div>
        </main>

        {/* ───────── Dettagli, personalizzazione e cronologia ───────── */}
        <aside className="pf-inspector">
          {plan && stats ? (
            <>
              {selectedRoom && (
                <RoomEditor
                  key={selectedRoom.id}
                  room={selectedRoom}
                  furniture={roomFurniture}
                  onChange={(patch) => updateRoom(selectedRoom.id, patch)}
                  onRotate={rotateFurniture}
                  onFlip={flipFurniture}
                  onRemoveItem={removeFurniture}
                  onAddItem={(type) => addFurniture(selectedRoom.id, type)}
                  onClose={() => setSelectedId(null)}
                />
              )}

              <section className="pf-sec">
                <h2>Pianta {SHAPE_NAME[plan.shape] || 'rettangolare'}</h2>
                <label className="pf-field-sm pf-project-name">
                  <span>Nome progetto</span>
                  <input className="pf-input-sm" value={current.name || ''} placeholder="Es. Casa al mare"
                    onChange={(e) => history.rename(current.id, e.target.value)} />
                </label>
                <dl className="pf-facts">
                  <div><dt>Superficie lorda</dt><dd>{fmt(stats.gross)} m²</dd></div>
                  <div><dt>Camere da letto</dt><dd>{stats.bedrooms}</dd></div>
                  <div><dt>Bagni</dt><dd>{stats.baths}</dd></div>
                  <div><dt>Porte / finestre</dt><dd>{stats.doors} / {stats.windows}</dd></div>
                </dl>
                <div className="pf-seedrow">
                  <button type="button" className={`pf-mini ${current.saved ? 'is-accent' : ''}`}
                    onClick={() => { history.toggleSaved(current.id); say(current.saved ? 'Tolta dalle salvate' : 'Planimetria salvata'); }}
                    title="Le planimetrie salvate non vengono mai cancellate dalla cronologia">
                    <Star size={13} fill={current.saved ? 'currentColor' : 'none'} /> {current.saved ? 'Salvata' : 'Salva'}
                  </button>
                  {floor.sketch ? (
                    <button type="button" className="pf-mini" onClick={() => setSketch({ shapes: floor.sketch, floorId: floor.id })}
                      title="Riapri lo schizzo per modificarlo">
                      <PencilLine size={13} /> Modifica schizzo
                    </button>
                  ) : (
                    <div>
                      <span>#{plan.seed}</span>
                      <button type="button" className="pf-mini" onClick={() => copy(plan.seed, 'Seed copiato')} title="Copia il seed">
                        <Copy size={13} />
                      </button>
                      <button type="button" className="pf-mini"
                        onClick={() => {
                          setAutoSeed(!autoSeed);
                          if (autoSeed) setF('seed', plan.seed);
                          say(autoSeed ? 'Variante bloccata' : 'Nuovo seed casuale attivo');
                        }}
                        title={autoSeed ? 'Blocca questa variante' : 'Sblocca per generare seed casuali'}>
                        {autoSeed ? <Unlock size={13} /> : <Lock size={13} />}
                      </button>
                    </div>
                  )}
                </div>
                {!consent.allowHistory && current.saved && (
                  <p className="pf-hint">
                    Per ritrovarla alla prossima visita{' '}
                    <button type="button" className="pf-link" onClick={() => setCookieDialog(true)}>attiva la cronologia</button>.
                  </p>
                )}
              </section>

              <SecurityPanel project={current} floorId={floor.id} onPlan={planAlarm} onClear={clearAlarm} />

              <DesignReport design={plan.design} />

              {floor.meta?.type === 'apartment' && floor.params?.doubles != null && (
                <FilterCheck plan={plan} params={floor.params} />
              )}

              <section className="pf-sec">
                <h2>Locali (clicca per personalizzare)</h2>
                <ul className="pf-rooms">
                  {plan.rooms.map((r) => {
                    const a = r.area ?? r.w * r.h;
                    const on = r.id === selectedId;
                    return (
                      <li key={r.id}>
                        <button type="button" className={`pf-room ${on ? 'is-on' : ''} ${r.id === hoverId ? 'is-hover' : ''}`}
                          onMouseEnter={() => setHoverId(r.id)} onMouseLeave={() => setHoverId(null)}
                          onClick={() => setSelectedId(on ? null : r.id)}>
                          <i className="pf-dot" style={{ background: r.color }} />
                          <span className="pf-room-name">{r.name}</span>
                          <span className="pf-room-area">{fmt(a)} m²</span>
                          <span className="pf-room-bar"><b style={{ width: `${Math.max(4, (a / totalArea) * 100)}%` }} /></span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {plan.notes?.length > 0 && (
                <section className="pf-sec">
                  <h2>Note e conformità</h2>
                  <ul className="pf-notes">
                    {plan.notes.map((n, i) => (
                      <li key={i}><Info size={14} /> <span>{n}</span></li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="pf-sec">
                <h2>Legenda</h2>
                <ul className="pf-legend">
                  <li><i className="lg-wall" /> Muro</li>
                  <li><i className="lg-entry" /> Ingresso</li>
                  <li><i className="lg-door" /> Porta</li>
                  <li><i className="lg-window" /> Finestra</li>
                  <li><i className="lg-out" /> Esterno</li>
                </ul>
              </section>
            </>
          ) : (
            <section className="pf-sec">
              <h2>Dettagli e modifiche</h2>
              <p className="pf-hint">
                Genera, disegna o carica una planimetria. Potrai personalizzare ogni ambiente e salvarla con la stella:
                la ritrovi nella cronologia qui sotto.
              </p>
            </section>
          )}

          <HistoryPanel
            entries={history.entries}
            currentId={history.currentId}
            persistent={consent.allowHistory}
            onOpen={restore}
            onToggleSaved={history.toggleSaved}
            onRemove={history.remove}
            onClear={history.clear}
            onManageConsent={() => setCookieDialog(true)}
          />
        </aside>
      </div>

      {!consent.decided && !cookieDialog && (
        <CookieBanner
          onAcceptAll={() => saveConsent({ history: true, analytics: true })}
          onNecessaryOnly={() => saveConsent({ history: false, analytics: false })}
          onCustomize={() => setCookieDialog(true)}
        />
      )}
      {cookieDialog && (
        <CookieDialog consent={consent.consent} onSave={saveConsent} onClose={() => setCookieDialog(false)} />
      )}
      {consent.allowAnalytics && <Analytics />}
    </div>
  );
}
