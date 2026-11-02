import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, PenTool, MousePointer2, Undo2, Trash2, X, Sparkles, Link2, FileImage, Ruler, Wand2, Hand, ZoomIn, ZoomOut, ScanSearch } from 'lucide-react';
import { ROOM_KINDS, ROOM_KIND_NAME, roomColor } from '../constants';
import * as G from '../lib/geometry';
import { CORRECTIONS, boxToPolygon, findOverlap, snapMove, snapPoint, strokeToPolygon } from '../lib/sketchShapes';
import { fmt, newId, storage } from '../lib/utils';
import { wandRoom } from '../lib/wand';

const PX = 40; // pixel per metro a zoom 1: un quadretto grande = 1 m
const Z_MIN = 0.05;
const Z_MAX = 8;
const clampZ = (z) => Math.max(Z_MIN, Math.min(Z_MAX, z));
const SKETCH_KINDS = ROOM_KINDS.filter((k) => k.id !== 'hotel_room');

const TOOLS = [
  { id: 'box', label: 'Rettangolo', Icon: Maximize2, hint: 'Trascina per disegnare una stanza: i bordi si agganciano a griglia e alle stanze vicine.' },
  { id: 'pen', label: 'Mano libera', Icon: PenTool, hint: 'Disegna il contorno chiuso della stanza: tonda, a ferro di cavallo, obliqua… la forma viene rispettata.' },
  { id: 'select', label: 'Sposta', Icon: MousePointer2, hint: 'Clicca una stanza per modificarla, trascinala per spostarla (si aggancia alle altre). Canc per eliminarla.' },
];

const toPx = (poly) => G.polyPath(poly, PX);

/* Tratti di muro condivisi tra stanze abbastanza lunghi da ospitare una porta. */
function sharedWalls(shapes) {
  const out = [];
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      for (const [a, b] of G.edges(shapes[i].poly)) {
        for (const [c, d] of G.edges(shapes[j].poly)) {
          const iv = G.collinearOverlap(a, b, c, d);
          if (iv && (iv[1] - iv[0]) * G.dist(a, b) >= 0.95) out.push([G.lerp(a, b, iv[0]), G.lerp(a, b, iv[1])]);
        }
      }
    }
  }
  return out;
}

const WAND_TOOL = { id: 'wand', label: 'Bacchetta', Icon: Wand2, hint: 'Clicca dentro un locale della pianta: trova i muri da sola e disegna la stanza. Se una porta aperta lascia passare, riprova da un altro punto o usa il rettangolo.' };

const PAN_TOOL = { id: 'pan', label: 'Mano', Icon: Hand, hint: 'Trascina per spostare la vista; rotellina o pulsanti per ingrandire. Anche con il tasto centrale del mouse.' };

const BG_TOOLS = [
  { id: 'bg', label: 'Sposta sfondo', Icon: FileImage, hint: 'Trascina la pianta di sfondo per metterla sotto la griglia; poi ricalca le stanze.' },
  { id: 'cal', label: 'Misura nota', Icon: Ruler, hint: 'Traccia una linea su una misura che conosci (una quota, un muro) e scrivi quanto è lunga: lo sfondo va in scala e la vista si adatta.' },
];

/*
 * background = la pagina di un PDF scansionato da ricalcare ({ url, paper: [l, h] in metri sul foglio, scale }):
 * si disegna in scala reale sotto la griglia, si sposta con «Sposta sfondo», scala e trasparenza si regolano.
 */
export default function SketchBoard({ initialShapes = [], background = null, onGenerate, onClose, onPage }) {
  const [bg, setBg] = useState(() => background && { scale: background.scale || 100, opacity: 0.5, x: 0, y: 0, show: true });
  const [doc, setDoc] = useState({ shapes: initialShapes, past: [] });
  const { shapes } = doc;
  const [tool, setTool] = useState(background ? 'wand' : initialShapes.length ? 'select' : 'box');
  const [kind, setKind] = useState('living');
  const [correction, setCorrection] = useState(() => storage.get('planify.sketchCorrection', 'auto'));
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });   // zoom e scorrimento della vista (pixel dello schermo)
  const areaRef = useRef(null);
  const contentRef = useRef(null);   // dove sta il disegno sul foglio (frazioni 0..1 della pagina), se si è potuto misurare
  const [draft, setDraftState] = useState(null);
  const [msg, setMsg] = useState(null);
  const svgRef = useRef(null);
  // il tratto in corso vive anche in un ref: gli eventi pointer possono arrivare più veloci dei render
  const draftRef = useRef(null);
  const setDraft = (next) => {
    draftRef.current = typeof next === 'function' ? next(draftRef.current) : next;
    setDraftState(draftRef.current);
  };

  const selected = shapes.find((s) => s.id === selectedId) || null;
  const labels = useMemo(() => new Map(shapes.map((s) => [s.id, G.labelPoint(s.poly)])), [shapes]);
  const links = useMemo(() => sharedWalls(shapes), [shapes]);

  const commit = (fn) => setDoc((d) => ({ shapes: fn(d.shapes), past: [...d.past.slice(-49), d.shapes] }));
  const undo = () => {
    setDoc((d) => (d.past.length ? { shapes: d.past[d.past.length - 1], past: d.past.slice(0, -1) } : d));
    setSelectedId(null);
  };
  const say = (text, tone = 'info') => setMsg({ text, tone });

  const nameFor = (k) => {
    const n = shapes.filter((s) => s.kind === k).length;
    return n ? `${ROOM_KIND_NAME[k]} ${n + 1}` : ROOM_KIND_NAME[k];
  };

  const removeSelected = () => {
    if (!selected) return;
    commit((list) => list.filter((s) => s.id !== selected.id));
    say(`«${selected.name}» eliminata.`);
    setSelectedId(null);
  };

  // Scorciatoie: Ctrl/Cmd+Z annulla, Canc elimina, Esc interrompe
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        removeSelected();
      } else if (e.key === 'Escape') {
        setDraft(null);
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const tools = background ? [WAND_TOOL, ...TOOLS, PAN_TOOL, ...BG_TOOLS] : [...TOOLS, PAN_TOOL];

  /* Adatta la vista al disegno (la parte scura della pagina, se misurata; altrimenti tutto il foglio) o, senza sfondo, alle stanze. */
  const fitView = (b = bg, box = null) => {
    const el = areaRef.current;
    if (!el) return;
    const { width: W, height: H } = el.getBoundingClientRect();
    if (W < 50 || H < 50) return;
    let r = box;   // { x0, y0, x1, y1 } in metri
    if (!r && background && b) {
      const c = contentRef.current || { x0: 0, y0: 0, x1: 1, y1: 1 };
      const pw = background.paper[0] * b.scale;
      const ph = background.paper[1] * b.scale;
      r = { x0: b.x + c.x0 * pw, y0: b.y + c.y0 * ph, x1: b.x + c.x1 * pw, y1: b.y + c.y1 * ph };
    }
    if (!r && shapes.length) {
      const bb = G.bounds(shapes.flatMap((sh) => sh.poly));
      r = { x0: bb.x, y0: bb.y, x1: bb.x + bb.w, y1: bb.y + bb.h };
    }
    if (!r) { setView({ z: 1, x: 0, y: 0 }); return; }
    const mw = Math.max(1, r.x1 - r.x0);
    const mh = Math.max(1, r.y1 - r.y0);
    const z = clampZ(Math.min((W - 60) / (mw * PX), (H - 60) / (mh * PX)));
    setView({ z, x: W / 2 - z * PX * (r.x0 + mw / 2), y: H / 2 - z * PX * (r.y0 + mh / 2) });
  };
  const zoomBy = (f, cx, cy) => setView((v) => {
    const el = areaRef.current;
    const rect = el?.getBoundingClientRect();
    const px = cx ?? (rect ? rect.width / 2 : 0);
    const py = cy ?? (rect ? rect.height / 2 : 0);
    const z = clampZ(v.z * f);
    const k = z / v.z;
    return { z, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
  });
  // rotellina (o pizzico del trackpad): zoom attorno al puntatore; listener non passivo per fermare lo scorrimento della pagina
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps -- zoomBy usa solo lo stato funzionale
  // all'apertura (e al cambio di pagina) si misura dove sta il disegno sul foglio e si adatta la vista
  useEffect(() => {
    if (!background) { fitView(null); return undefined; }
    let alive = true;
    contentRef.current = null;
    fitView();
    loadGray().then((g) => {
      if (!alive) return;
      // parte «scura» della pagina tra il 1° e il 99° percentile delle righe e delle colonne: esclude margini e cornice
      const rows = new Float64Array(g.h);
      const cols = new Float64Array(g.w);
      for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) if (g.gray[j * g.w + i] < 150) { rows[j]++; cols[i]++; }
      const pct = (arr, q) => {
        const tot = arr.reduce((a, b) => a + b, 0);
        if (!tot) return null;
        let acc = 0;
        for (let i = 0; i < arr.length; i++) { acc += arr[i]; if (acc >= tot * q) return i / arr.length; }
        return 1;
      };
      const x0 = pct(cols, 0.01), x1 = pct(cols, 0.99), y0 = pct(rows, 0.01), y1 = pct(rows, 0.99);
      if (x0 != null && x1 - x0 > 0.15 && y1 - y0 > 0.15) {
        contentRef.current = { x0, y0, x1, y1 };
        fitView();
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [background?.url]);   // eslint-disable-line react-hooks/exhaustive-deps

  // la pagina del PDF come mappa di grigi, per la bacchetta magica (si carica al primo clic)
  const grayRef = useRef(null);
  async function loadGray() {
    if (grayRef.current?.key === background.url) return grayRef.current;
    const img = new Image();
    img.src = background.url;
    await img.decode();
    const k = Math.min(1, 2200 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < gray.length; i++) gray[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000;
    grayRef.current = { key: background.url, w, h, gray };
    return grayRef.current;
  }
  const wand = async (p) => {
    say('Cerco i muri del locale…');
    try {
      const g = await loadGray();
      const mx = (background.paper[0] * bg.scale) / g.w;   // metri per pixel dell'immagine
      const my = (background.paper[1] * bg.scale) / g.h;
      const res = wandRoom(g.gray, g.w, g.h, (p[0] - bg.x) / mx, (p[1] - bg.y) / my, mx);
      if (res.error) { say(res.error, 'error'); return; }
      const toM = ([x, y]) => [bg.x + x * mx, bg.y + y * my];
      const r5 = (v) => Math.round(v / 0.05) * 0.05;
      let poly;
      if (res.poly) {
        poly = res.poly.map((pt) => toM(pt).map(r5)).map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
      } else {
        const [ax, ay] = toM([res.rect.x0, res.rect.y0]);
        const [bx, by] = toM([res.rect.x1, res.rect.y1]);
        // i bordi si agganciano a quelli delle stanze già disegnate
        const sa = snapPoint([ax, ay], shapes);
        const sb = snapPoint([bx, by], shapes);
        const a = [sa.guides.x != null ? sa.pt[0] : r5(ax), sa.guides.y != null ? sa.pt[1] : r5(ay)];
        const b = [sb.guides.x != null ? sb.pt[0] : r5(bx), sb.guides.y != null ? sb.pt[1] : r5(by)];
        const box = boxToPolygon(a, b);
        if (box.error) { say(box.error, 'error'); return; }
        poly = box.poly;
      }
      addShape(poly);
    } catch (err) {
      say(`Non riesco a leggere la pagina: ${err.message}`, 'error');
    }
  };

  const toMeters = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [(e.clientX - r.left - view.x) / (view.z * PX), (e.clientY - r.top - view.y) / (view.z * PX)];
  };

  const addShape = (poly) => {
    const clash = findOverlap(poly, shapes);
    if (clash) {
      say(`La stanza si sovrappone a «${clash.name}». Disegnala accanto: il bordo si aggancia da solo.`, 'error');
      return;
    }
    const shape = { id: newId(), kind, name: nameFor(kind), poly };
    commit((list) => [...list, shape]);
    say(`${shape.name} aggiunta · ${fmt(G.polygonArea(poly))} m²`, 'ok');
  };

  const onPointerDown = (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* puntatore non catturabile (es. già rilasciato): si continua senza cattura */
    }
    if (e.button === 1 || tool === 'pan') {
      e.preventDefault();
      setDraft({ type: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y });
      return;
    }
    const p = toMeters(e);
    if (tool === 'wand') {
      wand(p);
    } else if (tool === 'bg') {
      setDraft({ type: 'bg', start: p, orig: [bg.x, bg.y] });
    } else if (tool === 'cal') {
      setDraft({ type: 'cal', a: p, b: p });
    } else if (tool === 'select') {
      const hit = [...shapes].reverse().find((s) => G.pointInPolygon(p, s.poly));
      setSelectedId(hit?.id ?? null);
      if (hit) setDraft({ type: 'move', id: hit.id, start: p, orig: hit.poly, poly: hit.poly, guides: null });
    } else if (tool === 'box') {
      const { pt, guides } = snapPoint(p, shapes);
      setDraft({ type: 'box', a: pt, b: pt, guides });
    } else {
      setDraft({ type: 'pen', pts: [p] });
    }
  };

  const onPointerMove = (e) => {
    if (!draftRef.current) return;
    if (draftRef.current.type === 'pan') {
      const d = draftRef.current;
      setView((v) => ({ ...v, x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy }));
      return;
    }
    const p = toMeters(e);
    if (draftRef.current.type === 'cal') {
      setDraft((d) => ({ ...d, b: p }));
      return;
    }
    if (draftRef.current.type === 'bg') {
      const d = draftRef.current;
      setBg((b) => ({ ...b, x: d.orig[0] + p[0] - d.start[0], y: d.orig[1] + p[1] - d.start[1] }));
      return;
    }
    setDraft((d) => {
      if (d.type === 'box') {
        const { pt, guides } = snapPoint(p, shapes);
        return { ...d, b: pt, guides };
      }
      if (d.type === 'pen') {
        return G.dist(d.pts[d.pts.length - 1], p) > 0.03 ? { ...d, pts: [...d.pts, p] } : d;
      }
      const { poly, guides } = snapMove(d.orig, G.sub(p, d.start), shapes.filter((s) => s.id !== d.id));
      return { ...d, poly, guides };
    });
  };

  const onPointerUp = () => {
    const d = draftRef.current;
    setDraft(null);
    if (!d || d.type === 'bg' || d.type === 'pan') return;
    if (d.type === 'cal') {
      // misura nota: lo sfondo si riscala attorno al punto di partenza della linea
      const drawn = G.dist(d.a, d.b);
      if (drawn < 0.2) return;
      const real = parseFloat(String(window.prompt(`Quanto è lunga davvero questa misura? (in metri; ora è ${fmt(drawn)} m)`, fmt(drawn)) || '').replace(',', '.'));
      if (!(real > 0)) return;
      const f = real / drawn;
      const next = { ...bg, scale: Math.round(bg.scale * f * 10) / 10, x: d.a[0] - (d.a[0] - bg.x) * f, y: d.a[1] - (d.a[1] - bg.y) * f };
      setBg(next);
      say(`Sfondo in scala: ${fmt(drawn)} m → ${fmt(real)} m`, 'ok');
      setTool('box');
      fitView(next);
      return;
    }
    if (d.type === 'box') {
      if (G.dist(d.a, d.b) < 0.3) return; // semplice clic
      const r = boxToPolygon(d.a, d.b);
      if (r.error) say(r.error, 'error');
      else addShape(r.poly);
    } else if (d.type === 'pen') {
      const r = strokeToPolygon(d.pts, shapes, correction);
      if (r.error) say(r.error, 'error');
      else addShape(r.poly);
    } else if (d.poly !== d.orig) {
      const clash = findOverlap(d.poly, shapes.filter((s) => s.id !== d.id));
      if (clash) {
        say(`Non posso spostarla lì: si sovrapporrebbe a «${clash.name}».`, 'error');
        return;
      }
      commit((list) => list.map((s) => (s.id === d.id ? { ...s, poly: d.poly } : s)));
    }
  };

  const updateSelected = (patch, withHistory = true) => {
    const apply = (list) => list.map((s) => (s.id === selectedId ? { ...s, ...patch } : s));
    if (withHistory) commit(apply);
    else setDoc((d) => ({ ...d, shapes: apply(d.shapes) }));
  };

  const boxPreview = draft?.type === 'box' ? boxToPolygon(draft.a, draft.b).poly : null;
  const boxClash = boxPreview ? findOverlap(boxPreview, shapes) : null;
  const shownPoly = (s) => (draft?.type === 'move' && draft.id === s.id ? draft.poly : s.poly);
  const guides = draft?.guides;
  const activeTool = tools.find((t) => t.id === tool);

  return (
    <div className="pf-sketch-wrap">
      <div className="pf-sketch-bar">
        <div className="pf-sketch-tools" role="radiogroup" aria-label="Strumento">
          {tools.map(({ id, label, Icon }) => (
            <button key={id} type="button" role="radio" aria-checked={tool === id}
              className={`pf-sketch-tool ${tool === id ? 'is-on' : ''}`}
              onClick={() => { setTool(id); setMsg(null); }}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        <button type="button" className="pf-tool" onClick={undo} disabled={!doc.past.length} title="Annulla (Ctrl/Cmd+Z)">
          <Undo2 size={14} /> Annulla
        </button>
        <button type="button" className="pf-tool" disabled={!shapes.length}
          onClick={() => { commit(() => []); setSelectedId(null); }}>
          <Trash2 size={14} /> Pulisci
        </button>

        <div className="pf-spacer" />

        <button type="button" className="pf-tool" onClick={onClose}>
          <X size={15} /> Chiudi
        </button>
        <button type="button" className="pf-sketch-action" disabled={!shapes.length} onClick={() => onGenerate(shapes)}>
          <Sparkles size={16} /> Genera planimetria arredata
        </button>
      </div>

      {tool === 'pen' && (
        <div className="pf-sketch-kinds" role="radiogroup" aria-label="Correzione del tratto">
          <span>Correzione tratto:</span>
          {CORRECTIONS.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={correction === c.id} title={c.hint}
              className={`pf-kind-chip ${correction === c.id ? 'is-on' : ''}`}
              onClick={() => { setCorrection(c.id); storage.set('planify.sketchCorrection', c.id); say(c.hint); }}>
              {c.label}
            </button>
          ))}
        </div>
      )}
      {background && bg && (
        <div className="pf-sketch-kinds pf-sketch-bg" aria-label="Sfondo PDF">
          <span>Sfondo PDF:</span>
          {background.pages > 1 && (
            <label className="pf-sketch-bg-field">pagina
              <select value={background.page || 1} aria-label="Pagina del PDF" onChange={(e) => onPage?.(Number(e.target.value), shapes)}>
                {Array.from({ length: background.pages }, (_, i) => <option key={i} value={i + 1}>{i + 1} di {background.pages}</option>)}
              </select>
            </label>
          )}
          <label className="pf-sketch-bg-field">scala 1:
            <input type="number" min="10" max="1000" step="5" value={bg.scale} aria-label="Scala del disegno"
              onChange={(e) => {
                const next = { ...bg, scale: Math.max(10, Number(e.target.value) || 100) };
                setBg(next);
                fitView(next);
              }} />
          </label>
          <label className="pf-sketch-bg-field">trasparenza
            <input type="range" min="0.1" max="1" step="0.05" value={bg.opacity} aria-label="Trasparenza dello sfondo"
              onChange={(e) => setBg((b) => ({ ...b, opacity: Number(e.target.value) }))} />
          </label>
          <button type="button" className={`pf-kind-chip ${bg.show ? 'is-on' : ''}`} aria-pressed={bg.show}
            onClick={() => setBg((b) => ({ ...b, show: !b.show }))}>{bg.show ? 'Visibile' : 'Nascosto'}</button>
        </div>
      )}
      {tool !== 'select' && tool !== 'bg' && tool !== 'cal' && (
        <div className="pf-sketch-kinds" role="radiogroup" aria-label="Tipo di stanza da disegnare">
          <span>Nuova stanza:</span>
          {SKETCH_KINDS.map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={kind === k.id}
              className={`pf-kind-chip ${kind === k.id ? 'is-on' : ''}`} onClick={() => setKind(k.id)}>
              <i style={{ background: roomColor(k.id) }} /> {k.label}
            </button>
          ))}
        </div>
      )}

      <div className="pf-sketch-canvas-area" ref={areaRef}>
        <div className="pf-sketch-zoom" role="group" aria-label="Zoom della vista" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => zoomBy(1.4)} aria-label="Ingrandisci lo schizzo" title="Ingrandisci"><ZoomIn size={15} /></button>
          <button type="button" onClick={() => zoomBy(1 / 1.4)} aria-label="Riduci lo schizzo" title="Riduci"><ZoomOut size={15} /></button>
          <button type="button" onClick={() => fitView()} aria-label="Adatta lo schizzo alla finestra" title="Adatta la vista al disegno"><ScanSearch size={15} /></button>
          <span aria-live="polite">{Math.round(view.z * 100)}%</span>
        </div>
        <svg
          ref={svgRef}
          className="pf-sketch-svg"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDraft(null)}
          style={{ cursor: tool === 'select' ? 'default' : tool === 'bg' ? 'move' : tool === 'pan' ? (draft?.type === 'pan' ? 'grabbing' : 'grab') : 'crosshair' }}
        >
          <defs>
            <pattern id="sketch-grid-minor" width={PX / 4} height={PX / 4} patternUnits="userSpaceOnUse">
              <path d={`M ${PX / 4} 0 L 0 0 0 ${PX / 4}`} fill="none" stroke="currentColor" strokeOpacity="0.05" />
            </pattern>
            <pattern id="sketch-grid" width={PX} height={PX} patternUnits="userSpaceOnUse"
              patternTransform={`translate(${view.x} ${view.y}) scale(${view.z})`}>
              <rect width={PX} height={PX} fill="url(#sketch-grid-minor)" />
              <path d={`M ${PX} 0 L 0 0 0 ${PX}`} fill="none" stroke="currentColor" strokeOpacity="0.14" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#sketch-grid)" />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.z})`}>
          {background && bg?.show && (
            <image href={background.url} x={bg.x * PX} y={bg.y * PX} opacity={bg.opacity} preserveAspectRatio="none"
              width={background.paper[0] * bg.scale * PX} height={background.paper[1] * bg.scale * PX} />
          )}

          {shapes.map((s) => {
            const poly = shownPoly(s);
            const on = s.id === selectedId;
            const moving = draft?.type === 'move' && draft.id === s.id;
            const [lx, ly] = moving ? G.labelPoint(poly) : labels.get(s.id);
            return (
              <g key={s.id} opacity={moving ? 0.85 : 1}>
                <path d={toPx(poly)} fill={roomColor(s.kind)} stroke={on ? '#344a00' : '#58760a'}
                  strokeWidth={on ? 3 : 2} strokeLinejoin="round" />
                <text x={lx * PX} y={ly * PX - 2} className="pf-sketch-label">{s.name}</text>
                <text x={lx * PX} y={ly * PX + 13} className="pf-sketch-area">{fmt(G.polygonArea(poly))} m²</text>
              </g>
            );
          })}

          {!draft && links.map(([a, b], i) => (
            <line key={i} x1={a[0] * PX} y1={a[1] * PX} x2={b[0] * PX} y2={b[1] * PX}
              className="pf-sketch-link" />
          ))}

          {guides?.x != null && <line x1={guides.x * PX} y1={-1e5} x2={guides.x * PX} y2={1e5} className="pf-sketch-guide" />}
          {guides?.y != null && <line x1={-1e5} y1={guides.y * PX} x2={1e5} y2={guides.y * PX} className="pf-sketch-guide" />}

          {boxPreview && (
            <g>
              <path d={toPx(boxPreview)} className={`pf-sketch-draft ${boxClash ? 'is-bad' : ''}`} />
              <text x={(Math.min(draft.a[0], draft.b[0]) + Math.abs(draft.a[0] - draft.b[0]) / 2) * PX}
                y={(Math.min(draft.a[1], draft.b[1]) + Math.abs(draft.a[1] - draft.b[1]) / 2) * PX + 4}
                className="pf-sketch-label">
                {fmt(Math.abs(draft.a[0] - draft.b[0]))} × {fmt(Math.abs(draft.a[1] - draft.b[1]))} m
              </text>
            </g>
          )}
          {draft?.type === 'cal' && (
            <g className="pf-sketch-cal">
              <line x1={draft.a[0] * PX} y1={draft.a[1] * PX} x2={draft.b[0] * PX} y2={draft.b[1] * PX} stroke="#d92d20" strokeWidth="2" />
              <text x={draft.b[0] * PX + 8} y={draft.b[1] * PX - 6} className="pf-sketch-label">{fmt(G.dist(draft.a, draft.b))} m</text>
            </g>
          )}
          {draft?.type === 'pen' && (
            <polyline points={draft.pts.map(([x, y]) => `${x * PX},${y * PX}`).join(' ')} className="pf-sketch-stroke" />
          )}
          </g>
        </svg>

        {selected && tool === 'select' && (
          <div className="pf-sketch-panel" onPointerDown={(e) => e.stopPropagation()}>
            <label className="pf-field-sm">
              <span>Nome</span>
              <input className="pf-input-sm" value={selected.name}
                onChange={(e) => updateSelected({ name: e.target.value }, false)} />
            </label>
            <label className="pf-field-sm">
              <span>Destinazione d'uso</span>
              <select className="pf-input-sm" value={selected.kind}
                onChange={(e) => updateSelected({ kind: e.target.value })}>
                {SKETCH_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </label>
            <p className="pf-hint">{fmt(G.polygonArea(selected.poly))} m² · {selected.poly.length} vertici</p>
            <button type="button" className="pf-tool is-danger" onClick={removeSelected}>
              <Trash2 size={13} /> Elimina stanza
            </button>
          </div>
        )}

        {shapes.length === 0 && !draft && !background && (
          <div className="pf-empty pf-sketch-empty">
            <PenTool size={36} color="var(--accent)" />
            <h3>Traccia il tuo spazio</h3>
            <p>Disegna le stanze a rettangolo o a mano libera, una accanto all’altra. Dove due stanze condividono un muro
              comparirà una linea verde: lì il motore metterà la porta.</p>
          </div>
        )}

        <div className="pf-sketch-foot">
          <span className="pf-sketch-scale"><i style={{ width: PX * view.z }} /> 1 m</span>
          <span className={`pf-sketch-msg ${msg ? `is-${msg.tone}` : ''}`}>
            {msg?.text || activeTool.hint}
          </span>
          {links.length > 0 && (
            <span className="pf-sketch-links"><Link2 size={13} /> {links.length} {links.length === 1 ? 'collegamento' : 'collegamenti'}</span>
          )}
        </div>
      </div>
    </div>
  );
}
