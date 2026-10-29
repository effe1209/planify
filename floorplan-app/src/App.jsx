import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, Armchair, Box, Briefcase, Check, ChevronDown, Cookie, Copy, Download, FileJson, FileText, Image as ImageIcon,
  Info, LayoutGrid, Link2, Loader2, Lock, Moon, PencilLine, PencilRuler, PenTool, Ruler, Scan, ShieldCheck, Shuffle, Sparkles, Star, Sun, Tag,
  Droplets, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Redo2, Undo2, Unlock, Upload, Zap, ZoomIn, ZoomOut,
} from 'lucide-react';
import { Analytics } from '@vercel/analytics/react';
import './App.css';
import './apple.css';

import { FURNITURE, LOADING_STEPS, defaultBedrooms, PRESETS, SHAPES, SHAPE_NAME, STYLES, TYPES, TYPE_NAME } from './constants';
import PlanSvg from './components/PlanSvg';
import SketchBoard from './components/SketchBoard';
import RoomEditor from './components/RoomEditor';
import ItemPanel from './components/ItemPanel';
import Plan3D from './components/Plan3D';
import { rotateItem, snapItem } from './lib/furnitureEdit';
import LayoutOptions from './components/LayoutOptions';
import HouseOptions from './components/HouseOptions';
import HistoryPanel from './components/HistoryPanel';
import FilterCheck from './components/FilterCheck';
import DesignReport from './components/DesignReport';
import ErrorBoundary from './components/ErrorBoundary';
import FloorBar from './components/FloorBar';
import FloorsOverview from './components/FloorsOverview';
import SecurityPanel from './components/SecurityPanel';
import ElectricPanel from './components/ElectricPanel';
import PlumbingPanel from './components/PlumbingPanel';
import EstimatePanel from './components/EstimatePanel';
import SchedulePanel from './components/SchedulePanel';
import { buildEstimate } from './lib/estimate';
import { scheduleFor } from './lib/schedule';
import { readSharedProject, shareUrl } from './lib/share';
import { planPlumbing } from './lib/plumbing';
import { planElectric } from './lib/electric';
import { planSecurity } from './lib/ajax';
import { aimDevice, coverFloor, doorsFor, optimizeDevices, placeDevice, sensorCodes } from './lib/coverage';
import { useCoverage } from './hooks/useCoverage';
import CoveragePanel from './components/CoveragePanel';
import DevicePanel from './components/DevicePanel';
import { activeFloor, addFloor, houseFor, houseFront, houseRequest, makeFloor, moveFloor, removeFloor, updateFloor } from './lib/project';
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
import { engineStair, neighbourCore, neighbourWet, projectStairs, stairNote, stairsFit } from './lib/stairs';
import { HOUSE_PRESETS, floorName, houseFloorsRequest, houseShift, suggestProgram } from './lib/house';

const REQUEST_TIMEOUT_MS = 90000;
const STAIR_ROUNDS = 3;     // varianti in più per allineare le scale con i piani adiacenti: 3 giri…
const STAIR_TRIES = 4;      // …da 4 richieste in parallelo

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

/* Richiesta a /generate-plan dai parametri del modulo (o da quelli salvati con un piano). */
function planBody(f, width, length, seed) {
  const apartment = f.roomType === 'apartment';
  return {
    width: clamp(width, 3.5, 60),
    length: clamp(length, 3.5, 60),
    room_type: f.roomType,
    num_rooms: apartment ? 1 + f.doubles + f.singles : Number(f.rooms),
    style: f.style,
    shape: f.shape,
    seed,
    ...(apartment && {
      double_bedrooms: f.doubles,
      single_bedrooms: f.singles,
      bathrooms: f.baths === 'auto' ? null : f.baths,
      kitchen: f.kitchen,
      peninsula: f.peninsula,
      needs: { entry: f.entry, suite: f.suite, study: f.study, storage: f.storage, laundry: f.laundry },
    }),
    ...(f.roomType === 'garage' && { needs: { laundry: f.garageLaundry, storage: f.garageStorage } }),
  };
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
    // casa su più piani (vedi lib/house.js)
    house: false, housePreset: HOUSE_PRESETS[0].id, houseFloors: HOUSE_PRESETS[0].floors, stairType: 'auto',
    houseGarage: false, garageMode: 'basement',
    floorProgram: 'full',
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
  // progetto condiviso aperto da un link (#progetto=…): si guarda in sola lettura, finché non se ne salva una copia
  const [shared, setShared] = useState(null);
  useEffect(() => {
    const load = () => readSharedProject().then((p) => setShared(p));
    load();
    window.addEventListener('hashchange', load);
    return () => window.removeEventListener('hashchange', load);
  }, []);
  const readOnly = !!shared;
  const current = shared || history.current;     // progetto aperto
  const floor = activeFloor(current);            // piano su cui si lavora
  const plan = floor?.plan || null;
  // scale tra piani consecutivi: stessa posizione su entrambe le piante (vedi lib/stairs.js)
  const stairs = projectStairs(current);
  const floorStairs = floor ? stairs.byFloor[floor.id] : undefined;
  const notes = [
    ...(plan?.notes || []),
    ...(floorStairs || []).filter((st) => !st.engine || st.upTo || st.downTo
      || !stairs.missing.some((m) => m.withStair === floor?.name)).map(stairNote),
    ...stairs.missing.filter((m) => m.lower === floor?.name || m.upper === floor?.name)
      .map((m) => {
        if (!m.engine) return `Scale tra «${m.lower}» e «${m.upper}»: nessuno spazio libero nella stessa posizione sui due piani. Rigenera uno dei due piani o disegnalo a mano.`;
        return m.without === floor?.name
          ? `Questo piano non ha il vano scala di «${m.withStair}» nella stessa posizione: rigeneralo con la scala allineata.`
          : `Il vano scala non c'è ancora su «${m.without}»: apri quel piano e rigeneralo con la scala allineata.`;
      }),
  ];
  const [globalView, setGlobalView] = useState(false);
  const [pendingFloor, setPendingFloor] = useState(null); // { name, level }: la prossima pianta diventa un nuovo piano

  const [layers, setLayers] = useState({ furniture: true, labels: true, dims: true, grid: false, alarm: true, technical: false });
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
  // pannelli laterali compattabili (la pianta prende tutto lo spazio); la scelta resta tra una visita e l'altra
  const [panels, setPanels] = useState(() => ({
    left: storage.get('planify.panel.left', '1') !== '0', right: storage.get('planify.panel.right', '1') !== '0',
  }));
  useEffect(() => {
    storage.set('planify.panel.left', panels.left ? '1' : '0');
    storage.set('planify.panel.right', panels.right ? '1' : '0');
  }, [panels]);
  const togglePanel = (side) => setPanels((p) => ({ ...p, [side]: !p[side] }));
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
        program: meta?.program || 'full', stairType: form.stairType,
      },
      sketch: shapes,
    };
    if (shared) closeShared();
    if (pendingFloor && current && !readOnly) {
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
  const editProject = (fn) => current && !readOnly && history.update(current.id, fn);
  const closeShared = () => {
    setShared(null);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };
  const copyShared = () => {
    const { id: _id, ...copy } = shared;
    closeShared();
    history.add({ ...copy, name: copy.name || 'Progetto condiviso' });
    say('Copia salvata nei tuoi progetti: ora puoi modificarla');
  };
  const shareProject = async () => {
    try {
      const url = await shareUrl(current);
      await navigator.clipboard.writeText(url);
      say(`Link copiato (${Math.round(url.length / 1024)} kB): chi lo apre vede il progetto in sola lettura`);
    } catch (err) {
      setError(`Impossibile creare il link: ${err.message}.`);
    }
  };
  const selectFloor = (id) => {
    if (readOnly) setShared((p) => ({ ...p, activeFloor: id }));
    else editProject((p) => ({ ...p, activeFloor: id }));
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
      // stesse misure del piano accanto, così muri perimetrali e scala si sovrappongono
      const near = typeof level === 'number' && current.floors.find((f) =>
        typeof f.level === 'number' && Math.abs(f.level - level) === 1 && f.plan?.dimensions);
      setForm((f) => ({
        ...f,
        ...(type && { roomType: type }),
        floorProgram: suggestProgram(current, level),
        ...(near && { width: near.plan.dimensions.width, length: near.plan.dimensions.length }),
      }));
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
  const doorState = current?.security?.doors || 'closed';
  const planAlarm = () => {
    // regole per locale, poi ogni volumetrico nel montaggio che copre di più (lib/coverage.js)
    const rules = planSecurity(current);
    const security = { ...rules, doors: doorState, devices: optimizeDevices(current, rules.devices, { doors: doorState }) };
    editProject((p) => ({ ...p, security }));
    setLayers((l) => ({ ...l, alarm: true, coverage: true }));
    say(`${security.devices.length} dispositivi Ajax posizionati`);
  };
  const clearAlarm = () => editProject((p) => {
    const next = { ...p };
    delete next.security;
    return next;
  });

  /* ── Impianto elettrico: impostazioni nel progetto, punti ricalcolati dalle piante (lib/electric.js) ── */
  const electricCfg = current?.electric || null;
  const [sheet, setSheet] = useState('arch');   // tavola mostrata: 'arch' (pianta) | 'electric' | 'plumbing'
  const electricPlan = useMemo(
    () => (current && electricCfg ? planElectric(current, { level: electricCfg.level }) : null),
    [current, electricCfg],
  );
  const showElectric = sheet === 'electric' && !!electricPlan;
  const startElectric = () => {
    editProject((p) => ({ ...p, electric: { level: 2, links: true } }));
    setSheet('electric');
    say('Impianto elettrico di livello 2 su tutti i piani');
  };
  const changeElectric = (patch) => editProject((p) => ({ ...p, electric: { ...p.electric, ...patch } }));
  const clearElectric = () => {
    setSheet('arch');
    editProject((p) => {
      const next = { ...p };
      delete next.electric;
      return next;
    });
  };

  /* ── Impianto idraulico: stesso schema (lib/plumbing.js), colonne di scarico comuni a tutti i piani ── */
  const plumbingCfg = current?.plumbing || null;
  const plumbingPlan = useMemo(
    () => (current && plumbingCfg ? planPlumbing(current, { generator: plumbingCfg.generator }) : null),
    [current, plumbingCfg],
  );
  const showPlumbing = sheet === 'plumbing' && !!plumbingPlan;
  const startPlumbing = () => {
    editProject((p) => ({ ...p, plumbing: { generator: 'heatpump', lines: true } }));
    setSheet('plumbing');
    say('Impianto idraulico su tutti i piani');
  };
  const changePlumbing = (patch) => editProject((p) => ({ ...p, plumbing: { ...p.plumbing, ...patch } }));
  const clearPlumbing = () => {
    setSheet('arch');
    editProject((p) => {
      const next = { ...p };
      delete next.plumbing;
      return next;
    });
  };

  /* ── Preventivo indicativo: impostazioni (prezzi, IVA, imprevisti) nel progetto, quantità ricalcolate ── */
  const estimateCfg = current?.estimate || null;
  const schedule = useMemo(() => (current ? scheduleFor(current) : null), [current]);
  const estimate = useMemo(() => (current && estimateCfg ? buildEstimate(current, estimateCfg) : null), [current, estimateCfg]);
  const startEstimate = () => {
    editProject((p) => ({ ...p, estimate: { prices: {}, vat: 10, contingency: 10 } }));
    say('Preventivo calcolato su tutto il progetto');
  };
  const changeEstimate = (patch) => editProject((p) => ({ ...p, estimate: { ...p.estimate, ...patch } }));
  const clearEstimate = () => editProject((p) => {
    const next = { ...p };
    delete next.estimate;
    return next;
  });

  /* ── Personalizzazione: le modifiche finiscono nella voce di cronologia (e quindi vengono salvate) ── */
  // annulla / ripeti: le piante precedenti del piano aperto (si azzera cambiando progetto o piano)
  const undoKey = current && floor ? `${current.id}:${floor.id}` : null;
  const [undoState, setUndoState] = useState({ key: null, undo: [], redo: [] });
  const stacks = undoState.key === undoKey ? undoState : { key: undoKey, undo: [], redo: [] };
  // ogni passo salva la pianta del piano e i dispositivi d'allarme (che stanno nel progetto)
  const snapshot = () => ({ plan, security: current.security });
  const restoreSnap = (snap) => history.update(current.id, (p) => {
    const next = updateFloor(p, floor.id, (f) => ({ ...f, plan: snap.plan }));
    if (snap.security) next.security = snap.security;
    else delete next.security;
    return next;
  });
  const pushUndo = () => setUndoState({ key: undoKey, undo: [...stacks.undo.slice(-59), snapshot()], redo: [] });
  const editPlan = (fn) => {   // agisce sul piano attivo
    if (!current || !plan || readOnly) return;
    pushUndo();
    history.updatePlan(current.id, fn);
  };
  const editSecurity = (fn) => {   // dispositivi d'allarme, con annulla
    if (!current || !plan || readOnly || !current.security) return;
    pushUndo();
    editProject((p) => ({ ...p, security: fn(p.security) }));
  };
  const undo = () => {
    if (!current || !stacks.undo.length) return;
    const prev = stacks.undo[stacks.undo.length - 1];
    setUndoState({ key: undoKey, undo: stacks.undo.slice(0, -1), redo: [...stacks.redo, snapshot()] });
    restoreSnap(prev);
  };
  const redo = () => {
    if (!current || !stacks.redo.length) return;
    const next = stacks.redo[stacks.redo.length - 1];
    setUndoState({ key: undoKey, undo: [...stacks.undo, snapshot()], redo: stacks.redo.slice(0, -1) });
    restoreSnap(next);
  };
  // arredo selezionato sulla pianta: indice, valido solo per il piano su cui è stato scelto
  const [selection, setSelection] = useState(null);
  const [view3d, setView3d] = useState(null);   // null = pianta; { low, whole, spread } = vista 3D
  const three = useRef(null);                    // esportazioni della vista 3D aperta (Plan3D onReady)
  const builtFloors = current?.floors.filter((f) => typeof f.level === 'number' && f.plan?.rooms?.length).length || 0;
  const selectedItem = selection?.key === undoKey && plan?.furniture[selection.index] ? selection.index : null;
  const setSelectedItem = (index) => setSelection(index == null ? null : { key: undoKey, index });
  // dispositivo d'allarme selezionato (per id, sul piano aperto); esclude l'arredo selezionato e viceversa
  const selectedDevice = selection?.key === undoKey && selection.device
    ? floorDevices?.find((d) => d.id === selection.device) || null : null;
  const setSelectedDevice = (id) => setSelection(id == null ? null : { key: undoKey, device: id });
  const editDevice = (id, fn) => editSecurity((sec) => ({ ...sec, devices: sec.devices.map((d) => (d.id === id ? fn(d) : d)) }));
  const moveDevice = (id, x, y) => editDevice(id, (d) => placeDevice(plan, d, x, y));
  const changeDevice = (id, patch) => editDevice(id, (d) => ({ ...d, ...patch }));
  const removeDevice = (id) => {
    editSecurity((sec) => ({ ...sec, devices: sec.devices.filter((d) => d.id !== id) }));
    setSelectedDevice(null);
    say('Dispositivo rimosso');
  };
  // stato generale delle porte (azzera quelle cambiate una per una) e porta singola con un clic in pianta
  const setDoors = (doors) => editSecurity((sec) => ({ ...sec, doors, doorStates: {} }));
  const toggleDoor = (i) => editSecurity((sec) => {
    const cur = doorsFor(sec, floor.id);
    const next = (cur[i] || cur.default) === 'open' ? 'closed' : 'open';
    return { ...sec, doorStates: { ...sec.doorStates, [floor.id]: { ...(sec.doorStates?.[floor.id] || {}), [i]: next } } };
  });
  /* ── Copertura dei sensori: calcolata nel Web Worker, anche durante il trascinamento di un sensore ── */
  const [devicePreview, setDevicePreview] = useState(null);
  const floorDoors = useMemo(() => doorsFor(current?.security, floor?.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current?.security?.doors, current?.security?.doorStates, floor?.id]);
  const coverageDevices = useMemo(
    () => (devicePreview ? floorDevices?.map((d) => (d.id === devicePreview.id ? devicePreview : d)) : floorDevices),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current?.security?.devices, floor?.id, devicePreview],
  );
  const coverageOn = !!layers.coverage && layers.alarm !== false && !!floorDevices?.length && !showElectric && !showPlumbing;
  const coverage = useCoverage(plan, coverageDevices, floorDoors, coverageOn);
  const [coverHighlight, setCoverHighlight] = useState(null);
  /* Nuovo volumetrico nel locale selezionato (o nel più grande), già nel montaggio migliore. */
  const addSensor = () => {
    const room = plan.rooms.find((r) => r.id === selectedId)
      || [...plan.rooms].filter((r) => r.kind !== 'garden').sort((a, b) => b.w * b.h - a.w * a.h)[0];
    if (!room) return;
    const id = `dev-${Date.now().toString(36)}`;
    const dev = { id, model: 'motionprotect', floor: floor.id, room: room.id, roomName: room.name,
      x: room.x + room.w / 2, y: room.y + room.h / 2, purpose: 'Volumetrico aggiunto' };
    const [placed] = optimizeDevices(current, [dev], { doors: doorState, all: devices || [] });
    editSecurity((sec) => ({ ...sec, devices: [...sec.devices, placed] }));
    setSelectedDevice(id);
    say(`MotionProtect aggiunto in «${room.name}»`);
  };
  const moveFurniture = (index, x, y) => editFurniture((list) => list.map((f, i) => {
    if (i !== index) return f;
    const p = snapItem(plan, f, x, y);
    return { ...f, x: p.x, y: p.y, room: p.room };
  }));
  const updateRoom = (roomId, patch) =>
    editPlan((p) => ({ ...p, rooms: p.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)) }));
  const editFurniture = (fn) => editPlan((p) => ({ ...p, furniture: fn(p.furniture) }));
  const removeFurniture = (index) => {
    editFurniture((list) => list.filter((_, i) => i !== index));
    setSelectedItem(null);
    say('Arredo rimosso');
  };
  // ruotare scambia larghezza e profondità attorno al centro (prima cambiava solo il verso)
  const rotateFurniture = (index) => editFurniture((list) => list.map((f, i) => (i === index ? rotateItem(f) : f)));
  const flipFurniture = (index) =>
    editFurniture((list) => list.map((f, i) => (i === index ? { ...f, flip: !f.flip } : f)));
  // tastiera: annulla/ripeti ovunque; con un arredo selezionato frecce, R, F, Canc, Esc
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.altKey && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
        e.preventDefault();
        togglePanel(e.code === 'BracketLeft' ? 'left' : 'right');
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (selectedDevice && !mod) {
        const step = e.shiftKey ? 0.25 : 0.05;
        const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (arrows[e.key]) {
          e.preventDefault();
          moveDevice(selectedDevice.id, selectedDevice.x + arrows[e.key][0], selectedDevice.y + arrows[e.key][1]);
        } else if (e.key === 'r' || e.key === 'R') {
          const a = aimDevice(plan, selectedDevice).dir + (e.shiftKey ? -15 : 15);
          changeDevice(selectedDevice.id, { dir: ((Math.round(a) % 360) + 360) % 360 });
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          removeDevice(selectedDevice.id);
        } else if (e.key === 'Escape') setSelectedDevice(null);
        return;
      }
      if (selectedItem == null || mod) return;
      const it = plan?.furniture[selectedItem];
      if (!it) return;
      const step = e.shiftKey ? 0.25 : 0.05;
      const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (arrows[e.key]) {
        e.preventDefault();
        moveFurniture(selectedItem, it.x + arrows[e.key][0], it.y + arrows[e.key][1]);
      } else if (e.key === 'r' || e.key === 'R') rotateFurniture(selectedItem);
      else if (e.key === 'f' || e.key === 'F') flipFurniture(selectedItem);
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeFurniture(selectedItem);
      } else if (e.key === 'Escape') setSelectedItem(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
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
      ...(entry.parts && { parts: entry.parts }),
    };
    editFurniture((list) => [...list, item]);
    say(`${entry.label} aggiunto`);
  };

  /* ── Generazione dal motore ── */
  const engineHas = (feature) => engine.features?.includes(feature) ?? false;
  const hasNeighbour = (level) => typeof level === 'number' && !!current?.floors.some((f) =>
    typeof f.level === 'number' && Math.abs(f.level - level) === 1 && f.plan);

  /* Progetto nuovo con tutti i piani della casa (risposta di /generate-house). */
  const openHouse = (res) => {
    const floors = res.floors.map(({ level, program, plan: p }) => {
      const shift = engineHas('street_garage') ? houseShift(form) : 0;
      const spec = { ...(form.houseFloors.find((f) => f.level + shift === level) || { program }), level };
      const type = program === 'garage' ? 'garage' : 'apartment';
      return makeFloor({
        name: floorName(spec), level, plan: p,
        meta: { style: form.style, type, program },
        params: {
          roomType: type, rooms: Number(form.rooms), style: form.style, shape: 'rect',
          garageLaundry: form.garageLaundry, garageStorage: form.garageStorage,
          doubles: p.stats?.bedrooms ?? form.doubles, singles: 0, baths: form.baths, kitchen: form.kitchen,
          peninsula: form.peninsula, entry: form.entry, suite: form.suite, study: form.study, storage: form.storage,
          laundry: form.laundry, program, stairType: form.stairType,
        },
      });
    });
    const ground = floors.find((f) => f.level === 0) || floors[0];
    if (shared) closeShared();
    history.add({ name: '', floors, activeFloor: ground.id });
    say(res.notes?.[0] || `Casa su ${floors.length} piani: zona giorno e notte collegate dalla scala`);
    setGlobalView(false);
    setSelectedId(null);
    setHoverId(null);
    setZoom(null);
    const d = res.floors[0]?.plan?.dimensions;
    if (d) setForm((f) => ({ ...f, width: d.width, length: d.length, seed: res.seed }));
  };

  /*
   * Rigenera il piano aperto con la scala nello stesso punto del piano accanto (stessi parametri e misure):
   * serve per i piani creati prima che il piano accanto avesse il vano scala.
   */
  const alignType = floor?.params?.roomType || floor?.meta?.type || 'apartment';
  const alignCore = floor && plan && !engineStair(plan)
    && (alignType === 'apartment' ? engineHas('stairs') : alignType === 'garage' && engineHas('garage_stairs'))
    ? neighbourCore(current, floor.level) : null;
  const realignFloor = async () => {
    if (!alignCore || !base) return;
    const params = { ...form, ...floor.params };
    const program = params.program || (floor.level > 0 ? 'night' : 'full');
    const body = {
      ...planBody(params, plan.dimensions.width, plan.dimensions.length, randomSeed()),
      program, access: floor.level === 0 ? 'both' : 'stairs', shape: 'rect', core: alignCore,
      ...(engineHas('wet_align') && neighbourWet(current, floor.level) && { wet: neighbourWet(current, floor.level) }),
    };
    setError(null);
    setIsLoading(true);
    try {
      const data = await readJson(await postJson(base, '/generate-plan', body));
      editProject((p) => updateFloor(p, floor.id, (f) => ({ ...f, plan: data, params: { ...f.params, program } })));
      setSelectedId(null);
      say(`«${floor.name}» rigenerato con la scala allineata`);
    } catch (err) {
      setError(`Impossibile rigenerare il piano: ${err.message}.`);
    } finally {
      setIsLoading(false);
    }
  };

  /* Giardino: rigenerato davanti alla casa del progetto (portoncino, garage), con le stesse misure. */
  const gardenFront = floor?.meta?.type === 'garden' && plan && engineHas('garden_house') ? houseFront(current) : null;
  const gardenAligned = gardenFront && plan.house && Math.abs(plan.house.w - gardenFront.w) < 0.01;
  const realignGarden = async () => {
    if (!gardenFront || !base) return;
    const params = { ...form, ...floor.params, roomType: 'garden' };
    const body = { ...planBody(params, plan.dimensions.width, plan.dimensions.length, randomSeed()), house: houseRequest(gardenFront) };
    setError(null);
    setIsLoading(true);
    try {
      const data = await readJson(await postJson(base, '/generate-plan', body));
      editProject((p) => updateFloor(p, floor.id, (f) => ({ ...f, plan: data })));
      setSelectedId(null);
      say(`«${floor.name}» allineato alla casa`);
    } catch (err) {
      setError(`Impossibile rigenerare il giardino: ${err.message}.`);
    } finally {
      setIsLoading(false);
    }
  };

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
    const houseMode = apartment && form.house && !pendingFloor && engineHas('house');
    const stairsHere = apartment && !!pendingFloor && hasNeighbour(pendingFloor.level) && engineHas('stairs');
    // garage sotto un piano con il vano scala: la scala scende nello stesso punto
    const garageCore = form.roomType === 'garage' && pendingFloor && engineHas('garage_stairs')
      ? neighbourCore(current, pendingFloor.level) : null;
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
      // casa su più piani: tutti i piani in una richiesta, con la scala allineata dal motore
      if (houseMode) {
        const req = {
          width: clamp(w, 3.5, 60), length: clamp(l, 3.5, 60), style: form.style, seed: requestSeed,
          stair_type: form.stairType, floors: houseFloorsRequest(form, { street: engineHas('street_garage') }),
        };
        const house = async () => readJson(await postJson(base, '/generate-house', req, controller.signal));
        let res;
        try {
          res = await house();
        } catch (err) {
          if (err.name === 'AbortError' || /^HTTP \d/.test(err.message)) throw err;
          setSlow(true);
          await waitForEngine(base, { signal: controller.signal });
          res = await house();
        }
        clearTimeout(timeout);
        openHouse(res);
        return;
      }
      const body = planBody(form, w, l, requestSeed);
      // nuovo piano sopra o sotto uno esistente: il motore mette la scala, nello stesso punto del piano accanto
      const level = pendingFloor && current ? pendingFloor.level : null;
      const core = stairsHere ? neighbourCore(current, level) : null;
      if (stairsHere) {
        Object.assign(body, {
          program: form.floorProgram,
          access: level === 0 ? 'both' : 'stairs',
          stair_type: form.stairType,
          shape: 'rect',
          ...(core && { core }),
          ...(engineHas('wet_align') && neighbourWet(current, level) && { wet: neighbourWet(current, level) }),
        });
      }
      if (garageCore) body.core = garageCore;
      // giardino di una casa già disegnata: cancelli e vialetti davanti al portoncino e al garage
      const front = form.roomType === 'garden' && pendingFloor && engineHas('garden_house') ? houseFront(current) : null;
      if (front) body.house = houseRequest(front);
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
      // piante senza vano scala (motore vecchio, altri tipi di pianta): si sceglie una variante in cui
      // c'è posto per la scala nella stessa posizione del piano accanto
      if (typeof level === 'number' && !fixedSeed && !engineStair(data) && !stairsFit(current, level, data)) {
        for (let round = 0; round < STAIR_ROUNDS; round++) {
          const tries = await Promise.all(Array.from({ length: STAIR_TRIES }, () =>
            postJson(base, '/generate-plan', { ...body, seed: randomSeed() }, controller.signal).then(readJson).catch(() => null)));
          const good = tries.find((d) => d && stairsFit(current, level, d));
          if (good) {
            data = good;
            break;
          }
        }
      }
      clearTimeout(timeout);
      openNewPlan(data, { type: form.roomType, ...(stairsHere && { program: form.floorProgram }) });
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
      ...(current.electric && { electric: current.electric }),
      ...(current.plumbing && { plumbing: current.plumbing }),
      ...(current.estimate && { estimate: current.estimate }),
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

  const exportCoverage = async () => {
    if (!current?.security?.devices?.length) return;
    say('Preparazione della relazione di copertura…');
    try {
      const { exportCoverageReport } = await import('./lib/coverageReport');
      await exportCoverageReport(current);
      say('Relazione di copertura esportata');
    } catch (e) {
      setError(`Relazione di copertura non riuscita: ${e.message}`);
    }
  };

  /* Vista 3D: immagine così come la si vede e modello per il CAD (piano aperto o tutta la casa). */
  const threeName = () => {
    const slug = (v) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `${slug(current?.name) || 'planimetria'}-3d${view3d?.whole ? '-casa' : current?.floors.length > 1 ? `-${slug(floor?.name)}` : ''}`;
  };
  const export3dPng = () => {
    const url = three.current?.png();
    if (!url) return;
    fetch(url).then((r) => r.blob()).then((b) => saveBlob(b, `${threeName()}.png`));
    say('Immagine 3D esportata');
  };
  const export3dDxf = () => {
    const res = three.current?.dxf();
    if (!res) return;
    saveBlob(new Blob([res.text], { type: 'application/dxf' }), `${threeName()}.dxf`);
    say(`Modello 3D esportato: ${res.faces.toLocaleString('it-IT')} facce su ${res.layers.length} layer`);
  };

  /* DXF R12 a layer del piano aperto, con i dispositivi Ajax come blocchi e la copertura calcolata (lib/dxf.js). */
  const exportDxf = () => {
    if (!plan) return;
    const devs = floorDevices || [];
    const opts = devs.length
      ? { devices: devs, codes: sensorCodes(current, devices), coverage: coverFloor(plan, devs, { doors: floorDoors }) }
      : {};
    const slug = (v) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const name = [slug(current.name) || 'planimetria', current.floors.length > 1 ? slug(floor.name) : ''].filter(Boolean).join('-');
    saveBlob(new Blob([buildDxf(plan, opts)], { type: 'application/dxf' }), `${name}.dxf`);
    say(devs.length ? 'File CAD esportato con sensori e copertura' : 'File CAD esportato');
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
          <button type="button" className="pf-icon-btn pf-panel-toggle" onClick={() => togglePanel('left')}
            aria-label={panels.left ? 'Nascondi il pannello dei comandi' : 'Mostra il pannello dei comandi'} aria-pressed={panels.left}
            title={panels.left ? 'Nascondi il pannello dei comandi (⌥⌘[)' : 'Mostra il pannello dei comandi (⌥⌘[)'}>
            {panels.left ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
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
          <button type="button" className="pf-icon-btn pf-panel-toggle" onClick={() => togglePanel('right')}
            aria-label={panels.right ? 'Nascondi il pannello dei dettagli' : 'Mostra il pannello dei dettagli'} aria-pressed={panels.right}
            title={panels.right ? 'Nascondi il pannello dei dettagli (⌥⌘])' : 'Mostra il pannello dei dettagli (⌥⌘])'}>
            {panels.right ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
          <button type="button" className="pf-icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'} title={theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'}>
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>

      <div className={`pf-body${panels.left ? '' : ' is-left-closed'}${panels.right ? '' : ' is-right-closed'}`}>
        {/* ───────── Pannello comandi sinistro ───────── */}
        <aside className="pf-rail" aria-hidden={!panels.left} inert={!panels.left}>
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
                <p className="pf-hint">
                  Giardino davanti alla facciata d'ingresso, con la strada a sud: recinzione, cancello pedonale e carrabile, siepi, camminamento, gazebo e alberi.
                  {pendingFloor && houseFront(current) ? ' Il cancello va davanti al portoncino e il vialetto davanti al garage (con la rampa, se è interrato).' : ' Aggiunto a un progetto con la casa, si allinea al portoncino e al garage.'}
                </p>
              )}
              {form.roomType === 'apartment' && engineHas('stairs') && (pendingFloor ? hasNeighbour(pendingFloor.level) : engineHas('house')) && (
                <HouseOptions form={form} setF={setF} pending={pendingFloor} garage={engineHas('garage_stairs')} streetGarage={engineHas('street_garage')}
                  stairFixed={!!pendingFloor && !!neighbourCore(current, pendingFloor.level)} />
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
                {isLoading ? 'Sto disegnando…' : pendingFloor ? `Genera «${pendingFloor.name}»`
                  : form.house && form.roomType === 'apartment' && engineHas('house') ? `Genera casa su ${form.houseFloors.length + (form.houseGarage && engineHas('garage_stairs') ? 1 : 0)} piani` : 'Genera planimetria'}
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
          {readOnly && (
            <div className="pf-shared-bar" role="status">
              <Link2 size={15} />
              <span>Progetto condiviso in <b>sola lettura</b>{shared.name ? ` · ${shared.name}` : ''}</span>
              <button type="button" className="pf-mini is-accent" onClick={copyShared}>Salva una copia</button>
              <button type="button" className="pf-mini" onClick={closeShared}>Chiudi</button>
            </div>
          )}
          <div className="pf-toolbar">
            <div className="pf-group" role="group" aria-label="Livelli">
              {[['furniture', Armchair, 'Arredi'], ['labels', Tag, 'Nomi'], ['dims', Ruler, 'Quote'], ['grid', LayoutGrid, 'Griglia'],
                ['technical', PencilRuler, 'Tecnico']]
                .map(([k, Icon, label]) => (
                  <button key={k} type="button" className={`pf-tool ${layers[k] ? 'is-on' : ''}`} aria-pressed={layers[k]}
                    onClick={() => toggle(k)}><Icon size={15} /> {label}</button>
                ))}
              {devices?.length > 0 && (
                <button type="button" className={`pf-tool ${layers.alarm ? 'is-on' : ''}`} aria-pressed={layers.alarm}
                  onClick={() => toggle('alarm')}><ShieldCheck size={15} /> Allarme</button>
              )}
              {electricCfg && (
                <button type="button" className={`pf-tool ${showElectric ? 'is-on' : ''}`} aria-pressed={showElectric}
                  onClick={() => setSheet(showElectric ? 'arch' : 'electric')} title="Tavola dell'impianto elettrico">
                  <Zap size={15} /> Elettrico
                </button>
              )}
              {plumbingCfg && (
                <button type="button" className={`pf-tool ${showPlumbing ? 'is-on' : ''}`} aria-pressed={showPlumbing}
                  onClick={() => setSheet(showPlumbing ? 'arch' : 'plumbing')} title="Tavola dell'impianto idraulico">
                  <Droplets size={15} /> Idraulico
                </button>
              )}
            </div>

            <div className="pf-group" role="group" aria-label="Vista 3D">
              <button type="button" className={`pf-tool ${view3d ? 'is-on' : ''}`} aria-pressed={!!view3d} disabled={!plan}
                onClick={() => setView3d(view3d ? null : { low: false, whole: globalView && builtFloors > 1, spread: false })}
                title="Vista 3D navigabile"><Box size={15} /> 3D</button>
              {view3d && builtFloors > 1 && (
                <button type="button" className={`pf-tool ${view3d.whole ? 'is-on' : ''}`} aria-pressed={!!view3d.whole}
                  onClick={() => setView3d({ ...view3d, whole: !view3d.whole })} title="Tutti i piani impilati con i solai">
                  Tutta la casa
                </button>
              )}
              {view3d?.whole && (
                <button type="button" className={`pf-tool ${view3d.spread ? 'is-on' : ''}`} aria-pressed={!!view3d.spread}
                  onClick={() => setView3d({ ...view3d, spread: !view3d.spread })} title="Piani staccati per vedere dentro">Esploso</button>
              )}
              {view3d && (
                <button type="button" className={`pf-tool ${view3d.low ? 'is-on' : ''}`} aria-pressed={view3d.low}
                  onClick={() => setView3d({ ...view3d, low: !view3d.low })} title="Muri tagliati a 1,20 m per vedere dentro">Muri bassi</button>
              )}
              {view3d && (
                <>
                  <button type="button" className="pf-tool" onClick={export3dPng} title="Immagine della vista 3D così come la vedi">
                    <ImageIcon size={15} /> PNG 3D
                  </button>
                  <button type="button" className="pf-tool" onClick={export3dDxf}
                    title="Modello 3D per il CAD (facce 3D, layer per piano e tipo: muri, vetri, pavimenti, arredi, solai)">
                    <Download size={15} /> DXF 3D
                  </button>
                </>
              )}
            </div>

            <div className="pf-group" role="group" aria-label="Annulla e ripeti">
              <button type="button" className="pf-tool" disabled={!stacks.undo.length} onClick={undo}
                title="Annulla (⌘Z)" aria-label="Annulla"><Undo2 size={15} /></button>
              <button type="button" className="pf-tool" disabled={!stacks.redo.length} onClick={redo}
                title="Ripeti (⇧⌘Z)" aria-label="Ripeti"><Redo2 size={15} /></button>
            </div>

            <div className="pf-group" role="group" aria-label="Disegno e import">
              <button type="button" className="pf-tool pf-tool-accent" onClick={() => dxfInputRef.current?.click()}
                title="Carica una pianta dal CAD: muri, porte, finestre e locali vengono ricostruiti dal disegno">
                <Upload size={15} /> Importa DXF
              </button>
              <button type="button" className={`pf-tool ${sketch ? 'is-on' : ''}`}
                onClick={() => setSketch(sketch ? null : { shapes: [] })}>
                <PenTool size={15} /> Disegna schizzo
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
              <button type="button" className="pf-tool" disabled={!plan} onClick={shareProject}
                title="Copia un link per vedere il progetto in sola lettura (nessun server: il progetto è nel link)">
                <Link2 size={15} /> Condividi
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
            ) : plan && view3d ? (
              <ErrorBoundary key={`3d-${current.id}-${view3d.whole ? 'casa' : floor.id}`}>
                <Plan3D plan={plan} project={view3d.whole ? current : null} style={floor.meta?.style} lowWalls={view3d.low}
                  spread={view3d.spread ? 3.5 : 0} onReady={(api) => { three.current = api; }} />
              </ErrorBoundary>
            ) : globalView && current?.floors.length > 1 ? (
              <ErrorBoundary key={`all-${current.id}`}>
                <FloorsOverview project={current} stage={stage} onOpen={selectFloor} devices={layers.alarm ? devices : null}
                  stairs={stairs.byFloor} electric={showElectric ? electricPlan.floors : null}
                  plumbing={showPlumbing ? plumbingPlan.floors : null} generator={plumbingCfg?.generator} />
              </ErrorBoundary>
            ) : plan ? (
              <ErrorBoundary key={`${current.id}-${floor.id}`}>
              <div className="pf-sheet" key={`${current.id}-${floor.id}`}>
                <PlanSvg
                  plan={plan} layers={layers} hoverId={hoverId} selectedId={selectedId}
                  onHover={setHoverId} onSelect={setSelectedId} svgRef={svgRef} zoom={z}
                  typeLabel={`${TYPE_NAME[floor.meta?.type] || 'Planimetria'} · ${floor.name}`}
                  style={floor.meta?.style} devices={floorDevices} stairs={floorStairs} house={houseFor(current)}
                  editable={!readOnly && !showElectric && !showPlumbing} selectedItem={selectedItem} codes={schedule?.codes[floor.id]}
                  onItemSelect={(i) => { setSelectedItem(i); setSelectedId(null); }} onItemMove={moveFurniture}
                  selectedDevice={selectedDevice?.id} onDeviceSelect={setSelectedDevice} onDeviceMove={moveDevice}
                  onDeviceRotate={(id, dir) => changeDevice(id, { dir: ((dir % 360) + 360) % 360 })}
                  onDeviceDrag={setDevicePreview} coverage={coverage} coverageHighlight={coverHighlight}
                  doorStates={coverage && !readOnly ? (i) => floorDoors[i] || floorDoors.default : null} onDoorToggle={toggleDoor}
                  electric={showElectric ? electricPlan.floors[floor.id] : null} electricLinks={electricCfg?.links !== false}
                  plumbing={showPlumbing ? plumbingPlan.floors[floor.id] || null : null}
                  plumbingLines={plumbingCfg?.lines !== false} generator={plumbingCfg?.generator}
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
                  <p>Scegli le misure e clicca <b>«Genera planimetria»</b>, oppure <b>«Importa DXF»</b> da un disegno CAD o <b>«Disegna schizzo»</b>.</p>
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
        <aside className="pf-inspector" aria-hidden={!panels.right} inert={!panels.right}>
          {plan && stats ? (
            <>
              {selectedItem != null && (
                <ItemPanel plan={plan} index={selectedItem} onRotate={() => rotateFurniture(selectedItem)}
                  onFlip={() => flipFurniture(selectedItem)} onRemove={() => removeFurniture(selectedItem)}
                  onHeight={(z) => editFurniture((list) => list.map((f, i) => {
                    if (i !== selectedItem) return f;
                    const next = { ...f, z };
                    if (!z) delete next.z;
                    return next;
                  }))}
                  onClose={() => setSelectedItem(null)} />
              )}
              {selectedDevice && (
                <DevicePanel plan={plan} device={selectedDevice} devices={devices} doors={floorDoors}
                  onChange={(patch) => changeDevice(selectedDevice.id, patch)} onRemove={() => removeDevice(selectedDevice.id)}
                  onClose={() => setSelectedDevice(null)} />
              )}
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
                  <button type="button" className={`pf-save-btn ${current.saved ? 'is-on' : ''}`} aria-pressed={!!current.saved}
                    onClick={() => { history.toggleSaved(current.id); say(current.saved ? 'Tolta dalle salvate' : 'Planimetria salvata'); }}
                    title="Le planimetrie salvate non vengono mai cancellate dalla cronologia">
                    <Star size={13} strokeWidth={2.2} fill={current.saved ? 'currentColor' : 'none'} /> {current.saved ? 'Salvata' : 'Salva'}
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

              <ElectricPanel config={electricCfg} data={electricPlan} floorId={floor.id} sheet={showElectric ? 'electric' : 'arch'}
                onStart={startElectric} onSheet={setSheet} onChange={changeElectric} onClear={clearElectric} />

              <PlumbingPanel config={plumbingCfg} data={plumbingPlan} floorId={floor.id} sheet={showPlumbing ? 'plumbing' : 'arch'}
                onStart={startPlumbing} onSheet={setSheet} onChange={changePlumbing} onClear={clearPlumbing} />

              <SchedulePanel schedule={schedule} />

              <EstimatePanel config={estimateCfg} data={estimate} onStart={startEstimate} onChange={changeEstimate}
                onClear={clearEstimate} />

              <SecurityPanel project={current} floorId={floor.id} onPlan={planAlarm} onClear={clearAlarm}
                doors={doorState} onDoors={setDoors} onAddSensor={readOnly ? null : addSensor}
                roomName={plan.rooms.find((r) => r.id === selectedId)?.name} />
              {floorDevices?.length > 0 && !showElectric && !showPlumbing && (
                <CoveragePanel coverage={coverage} shown={!!layers.coverage}
                  onToggle={() => { setLayers((l) => ({ ...l, coverage: !l.coverage, alarm: true })); setCoverHighlight(null); }}
                  highlight={coverHighlight} onHighlight={setCoverHighlight} onReport={exportCoverage} />
              )}

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

              {notes.length > 0 && (
                <section className="pf-sec">
                  <h2>Note e conformità</h2>
                  <ul className="pf-notes">
                    {notes.map((n, i) => (
                      <li key={i}><Info size={14} /> <span>{n}</span></li>
                    ))}
                  </ul>
                  {alignCore && (
                    <button type="button" className="pf-secondary pf-realign" disabled={isLoading} onClick={realignFloor}>
                      <Shuffle size={15} /> Rigenera questo piano con la scala allineata
                    </button>
                  )}
                  {gardenFront && (
                    <button type="button" className="pf-secondary pf-realign" disabled={isLoading} onClick={realignGarden}>
                      <Shuffle size={15} /> {gardenAligned ? 'Rigenera il giardino davanti alla casa' : 'Allinea il giardino alla casa'}
                    </button>
                  )}
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
