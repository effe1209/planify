import { useRef, useState } from 'react';
import * as G from '../lib/geometry';
import { addBalcony, addOpening, chordOf, moveEdge, moveOpening, moveRoom, moveVertex, snapGrid } from '../lib/sketchEdit';

const BLUE = '#58760a';   // il verde del marchio, scuro per leggersi sul foglio bianco
const MAX_VERTEX_HANDLES = 14;   // sulle curve (decine di vertici) restano solo i lati e la stanza intera

/*
 * Livello di modifica per le piante disegnate a mano (sopra muri e aperture):
 *  - vertici (cerchietti) e lati (si prendono dal muro): si trascinano e il locale cambia forma, i vicini seguono il muro in comune;
 *  - corpo della stanza: si trascina per spostarla con i suoi arredi, un clic la seleziona (nome, finiture, arredi);
 *  - porte e finestre: un clic le seleziona, si trascinano lungo i muri; «Porta» e «Finestra» ne aggiungono di nuove.
 * Durante il trascinamento la pianta mostrata è un'anteprima (onPreview); al rilascio il risultato va a edit.onApply.
 * edit = { selected, selectedRoom, addMode, onSelect, onSelectRoom, onApply, onError }
 */
export default function SketchEditor({ plan, s, toMeters, edit, onPreview }) {
  const [drag, setDrag] = useState(null);
  const result = useRef(null);
  const picking = ['door', 'window', 'panoramic', 'sliding', 'balcony'].includes(edit.addMode);

  const start = (e, info) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    result.current = null;
    setDrag({ ...info, base: plan, at: toMeters(e), moved: false, warned: false });
  };
  const delta = (e) => {
    const m = toMeters(e);
    return [m.x - drag.at.x, m.y - drag.at.y];
  };
  const snapVertex = (p) => {
    // si aggancia ai vertici degli altri locali (entro 12 cm), altrimenti alla griglia
    for (const r of drag.base.rooms) for (const q of r.poly || []) if (G.dist(p, q) < 0.12 && G.dist(q, drag.origin) > 0.01) return q;
    return [snapGrid(p[0]), snapGrid(p[1])];
  };
  const move = (e) => {
    if (!drag) return;
    const d = delta(e);
    if (!drag.moved && Math.hypot(d[0], d[1]) * s < 4) return;
    let res = null;
    if (drag.type === 'vertex') res = moveVertex(drag.base, drag.room, drag.index, snapVertex([drag.origin[0] + d[0], drag.origin[1] + d[1]]));
    else if (drag.type === 'edge') res = moveEdge(drag.base, drag.room, drag.index, [snapGrid(d[0]), snapGrid(d[1])]);
    else if (drag.type === 'room') res = moveRoom(drag.base, drag.room, [snapGrid(d[0]), snapGrid(d[1])]);
    else if (drag.type === 'opening') { const m = toMeters(e); res = moveOpening(drag.base, drag.kind, drag.index, [m.x, m.y]); }
    if (!res) return;
    if (res.error) {
      if (!drag.warned) { edit.onError?.(res.error); setDrag({ ...drag, warned: true, moved: true }); }
      return;
    }
    result.current = res.plan;
    if (!drag.moved) setDrag({ ...drag, moved: true });
    onPreview(res.plan);
  };
  const end = () => {
    if (!drag) return;
    const d = drag;
    const res = result.current;
    result.current = null;
    setDrag(null);
    onPreview(null);
    if (res && d.moved) { edit.onApply?.(res); return; }
    if (!d.moved) {
      if (d.type === 'opening') edit.onSelect?.({ kind: d.kind, index: d.index });
      else if (d.type === 'room') { edit.onSelect?.(null); edit.onSelectRoom?.(d.room); }
    }
  };

  const handlers = { onPointerMove: move, onPointerUp: end, onPointerCancel: () => { setDrag(null); onPreview(null); result.current = null; } };
  const px = (p) => [p[0] * s, p[1] * s];
  const pick = (e) => {
    e.stopPropagation();
    const m = toMeters(e);
    const res = edit.addMode === 'balcony' ? addBalcony(plan, [m.x, m.y]) : addOpening(plan, edit.addMode, [m.x, m.y]);
    if (res.error) { edit.onError?.(res.error); return; }
    edit.onError?.(null);
    edit.onApply?.(res.plan);
    if (res.room != null) edit.onSelectRoom?.(res.room);
    else edit.onSelect?.({ kind: res.kind, index: res.index });
  };
  const openings = [...plan.doors.map((o, index) => ({ o, kind: 'door', index })), ...plan.windows.map((o, index) => ({ o, kind: 'window', index }))];

  return (
    <g className="pf-sketch-editor" style={{ touchAction: 'none' }}>
      {!picking && plan.rooms.filter((r) => r.poly).map((r) => (
        <polygon key={`b-${r.id}`} points={r.poly.map((p) => px(p).join(',')).join(' ')} fill={edit.selectedRoom === r.id ? BLUE : 'transparent'} fillOpacity={0.1}
          style={{ cursor: drag?.type === 'room' ? 'grabbing' : 'grab' }} {...handlers}
          onPointerDown={(e) => start(e, { type: 'room', room: r.id })} />
      ))}
      {!picking && plan.rooms.filter((r) => r.poly).map((r) => G.edges(r.poly).map(([a, b], i) => {
        if (G.dist(a, b) < 0.4) return null;
        const [x1, y1] = px(a);
        const [x2, y2] = px(b);
        const vertical = Math.abs(a[0] - b[0]) < Math.abs(a[1] - b[1]);
        const axis = Math.abs(a[0] - b[0]) < 1e-3 || Math.abs(a[1] - b[1]) < 1e-3;
        return (
          <g key={`e-${r.id}-${i}`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={BLUE} strokeOpacity={0.35} strokeWidth={2} strokeDasharray="5 4" pointerEvents="none" />
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={14} strokeLinecap="round"
              style={{ cursor: axis ? (vertical ? 'ew-resize' : 'ns-resize') : 'move' }} {...handlers}
              onPointerDown={(e) => start(e, { type: 'edge', room: r.id, index: i })} />
          </g>
        );
      }))}
      {!picking && plan.rooms.filter((r) => r.poly && r.poly.length <= MAX_VERTEX_HANDLES).map((r) => r.poly.map((p, i) => {
        const [cx, cy] = px(p);
        return (
          <circle key={`v-${r.id}-${i}`} cx={cx} cy={cy} r={5} fill="#fff" stroke={BLUE} strokeWidth={2} style={{ cursor: 'crosshair' }} {...handlers}
            onPointerDown={(e) => start(e, { type: 'vertex', room: r.id, index: i, origin: p })} />
        );
      }))}
      {!picking && openings.map(({ o, kind, index }) => {
        const c = chordOf(plan, o);
        const mid = G.add(c.start, G.mul(c.u, o.w / 2));
        const [cx, cy] = px(mid);
        const on = edit.selected?.kind === kind && edit.selected.index === index;
        return (
          <g key={`o-${kind}-${index}`} transform={`translate(${cx} ${cy}) rotate(${o.rot})`}>
            <rect x={(-o.w / 2) * s} y={-9} width={o.w * s} height={18} rx={3} fill={on ? BLUE : '#16a34a'} fillOpacity={on ? 0.35 : 0.18}
              stroke={on ? BLUE : '#16a34a'} strokeWidth={on ? 2 : 1} style={{ cursor: 'grab' }} {...handlers}
              onPointerDown={(e) => start(e, { type: 'opening', kind, index })} />
          </g>
        );
      })}
      {picking && (
        <rect x={-5000} y={-5000} width={10000} height={10000} fill="transparent" style={{ cursor: 'crosshair' }} onClick={pick} />
      )}
    </g>
  );
}
