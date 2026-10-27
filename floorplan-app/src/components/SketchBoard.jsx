import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, PenTool, MousePointer2, Undo2, Trash2, X, Sparkles, Link2 } from 'lucide-react';
import { ROOM_KINDS, ROOM_KIND_NAME, roomColor } from '../constants';
import * as G from '../lib/geometry';
import { boxToPolygon, findOverlap, snapMove, snapPoint, strokeToPolygon } from '../lib/sketchShapes';
import { fmt, newId } from '../lib/utils';

const PX = 40; // pixel per metro: un quadretto grande = 1 m
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

export default function SketchBoard({ initialShapes = [], onGenerate, onClose }) {
  const [doc, setDoc] = useState({ shapes: initialShapes, past: [] });
  const { shapes } = doc;
  const [tool, setTool] = useState(initialShapes.length ? 'select' : 'box');
  const [kind, setKind] = useState('living');
  const [selectedId, setSelectedId] = useState(null);
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

  const toMeters = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [(e.clientX - r.left) / PX, (e.clientY - r.top) / PX];
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
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* puntatore non catturabile (es. già rilasciato): si continua senza cattura */
    }
    const p = toMeters(e);
    if (tool === 'select') {
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
    const p = toMeters(e);
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
    if (!d) return;
    if (d.type === 'box') {
      if (G.dist(d.a, d.b) < 0.3) return; // semplice clic
      const r = boxToPolygon(d.a, d.b);
      if (r.error) say(r.error, 'error');
      else addShape(r.poly);
    } else if (d.type === 'pen') {
      const r = strokeToPolygon(d.pts, shapes);
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
  const activeTool = TOOLS.find((t) => t.id === tool);

  return (
    <div className="pf-sketch-wrap">
      <div className="pf-sketch-bar">
        <div className="pf-sketch-tools" role="radiogroup" aria-label="Strumento">
          {TOOLS.map(({ id, label, Icon }) => (
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

      {tool !== 'select' && (
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

      <div className="pf-sketch-canvas-area">
        <svg
          ref={svgRef}
          className="pf-sketch-svg"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDraft(null)}
          style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
        >
          <defs>
            <pattern id="sketch-grid-minor" width={PX / 4} height={PX / 4} patternUnits="userSpaceOnUse">
              <path d={`M ${PX / 4} 0 L 0 0 0 ${PX / 4}`} fill="none" stroke="currentColor" strokeOpacity="0.05" />
            </pattern>
            <pattern id="sketch-grid" width={PX} height={PX} patternUnits="userSpaceOnUse">
              <rect width={PX} height={PX} fill="url(#sketch-grid-minor)" />
              <path d={`M ${PX} 0 L 0 0 0 ${PX}`} fill="none" stroke="currentColor" strokeOpacity="0.14" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#sketch-grid)" />

          {shapes.map((s) => {
            const poly = shownPoly(s);
            const on = s.id === selectedId;
            const moving = draft?.type === 'move' && draft.id === s.id;
            const [lx, ly] = moving ? G.labelPoint(poly) : labels.get(s.id);
            return (
              <g key={s.id} opacity={moving ? 0.85 : 1}>
                <path d={toPx(poly)} fill={roomColor(s.kind)} stroke={on ? '#0b3bb8' : '#1f4fd8'}
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

          {guides?.x != null && <line x1={guides.x * PX} y1="0" x2={guides.x * PX} y2="100%" className="pf-sketch-guide" />}
          {guides?.y != null && <line x1="0" y1={guides.y * PX} x2="100%" y2={guides.y * PX} className="pf-sketch-guide" />}

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
          {draft?.type === 'pen' && (
            <polyline points={draft.pts.map(([x, y]) => `${x * PX},${y * PX}`).join(' ')} className="pf-sketch-stroke" />
          )}
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

        {shapes.length === 0 && !draft && (
          <div className="pf-empty pf-sketch-empty">
            <PenTool size={36} color="var(--accent)" />
            <h3>Traccia il tuo spazio</h3>
            <p>Disegna le stanze a rettangolo o a mano libera, una accanto all’altra. Dove due stanze condividono un muro
              comparirà una linea verde: lì il motore metterà la porta.</p>
          </div>
        )}

        <div className="pf-sketch-foot">
          <span className="pf-sketch-scale"><i /> 1 m</span>
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
