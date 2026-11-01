import { useMemo, useState } from 'react';
import { WALL, addOpening, moveOpening, movePartition, moveRoom, openingLine, partition, roomSlide, snap, stairRoom, wallRuns } from '../lib/walls';

const BLUE = '#1f4fd8';
const GREEN = '#16a34a';
const PAD = 7;   // px attorno al muro per afferrarlo con il dito

/*
 * Livello di modifica della pianta (sopra muri e aperture):
 *  - muri interni: si trascinano per cambiare la misura dei locali, un clic li seleziona (unire, aprire);
 *  - porte e finestre: si selezionano e si trascinano lungo il muro; con «Aggiungi» se ne mettono di nuove;
 *  - vano scala: si trascina lungo un asse (scambia spazio con i locali ai lati) e si seleziona per tipo e verso;
 *  - «Dividi»: un clic sul locale lo taglia con un muro nuovo (verticale o orizzontale, come scelto).
 * Durante il trascinamento la pianta mostrata è un'anteprima (onPreview); al rilascio il risultato va a edit.*.
 * edit = { selected, addMode: 'door' | 'window' | 'split' | null, splitDir: 'v' | 'h', selectedWall, selectedStair,
 *          onSelect, onSelectWall, onSelectStair, onApply, onError, onSplit, onStairMove }
 */
export default function WallEditor({ plan, s, toMeters, edit, onPreview }) {
  const [hover, setHover] = useState(null);
  const [drag, setDrag] = useState(null);   // { type: 'wall' | 'open' | 'stair', base, … }
  const [cut, setCut] = useState(null);     // { room, at } anteprima del taglio
  const wt = plan.wallThickness;
  const runs = useMemo(() => (drag ? drag.runs : wallRuns(plan)), [plan, drag]);
  // durante il trascinamento tutto resta quello di partenza: l'elemento che ha la presa non deve sparire
  const movable = useMemo(() => drag?.movable || runs.map((r) => partition(plan, r.orient, r.line, r.a, r.b, [r.lo, r.hi])).map((p) => (p && !p.error ? p : null)),
    [plan, runs, drag?.movable]);
  const stair = useMemo(() => stairRoom(plan), [plan]);
  const key = (r) => `${r.orient}${r.line}:${Math.min(r.a ?? -1, r.b ?? -1)}-${Math.max(r.a ?? -1, r.b ?? -1)}`;
  const picking = edit.addMode === 'door' || edit.addMode === 'window';
  const idle = !edit.addMode;

  /* ── muri ── */
  const startWall = (e, run, part) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    edit.onSelect?.(null);
    edit.onSelectStair?.(false);
    setDrag({ type: 'wall', base: plan, runs, movable, part, run, start: toMeters(e), delta: 0, moved: false });
  };
  const moveWall = (e) => {
    if (drag?.type !== 'wall') return;
    const m = toMeters(e);
    const raw = drag.part.orient === 'v' ? m.x - drag.start.x : m.y - drag.start.y;
    const res = movePartition(drag.base, drag.part, raw);
    if (res.error) {
      if (!drag.warned) { edit.onError?.(res.error); setDrag({ ...drag, warned: true }); }
      return;
    }
    if (res.delta === drag.delta) return;
    setDrag({ ...drag, delta: res.delta, moved: res.delta !== 0 });
    onPreview(res.delta ? res.plan : null);
  };
  const endWall = () => {
    if (drag?.type !== 'wall') return;
    const { moved, delta, part, base: b, run } = drag;
    setDrag(null);
    onPreview(null);
    if (moved && delta) edit.onMoveWall?.(run, part, delta, b);
    else edit.onSelectWall?.(edit.selectedWall && key(edit.selectedWall) === key(run) ? null : run);   // un clic: seleziona il muro
  };

  /* ── porte e finestre ── */
  const startOpen = (e, kind, index) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    edit.onSelect?.({ kind, index });
    edit.onSelectWall?.(null);
    edit.onSelectStair?.(false);
    const o = (kind === 'door' ? plan.doors : plan.windows)[index];
    setDrag({ type: 'open', base: plan, runs, kind, index, start: toMeters(e), from: openingLine(o, plan.dimensions.width, plan.dimensions.length), moved: false });
  };
  const moveOpen = (e) => {
    if (drag?.type !== 'open') return;
    const m = toMeters(e);
    const horiz = drag.from.orient === 'h';
    const next = moveOpening(drag.base, drag.kind, drag.index, drag.from.start + (horiz ? m.x - drag.start.x : m.y - drag.start.y));
    const got = openingLine((drag.kind === 'door' ? next.doors : next.windows)[drag.index], next.dimensions.width, next.dimensions.length).start;
    if (got === drag.from.start && !drag.moved) return;
    setDrag({ ...drag, moved: drag.moved || got !== drag.from.start });
    onPreview(got === drag.from.start ? null : next);
  };
  const endOpen = () => {
    if (drag?.type !== 'open') return;
    const { moved, base: b, kind, index, from } = drag;
    const cur = plan;
    setDrag(null);
    onPreview(null);
    if (moved && cur !== b) edit.onApply({ plan: cur, moved: [], dropped: [], opening: { kind, index }, from });
  };

  const place = (e, run) => {
    e.stopPropagation();
    const m = toMeters(e);
    const res = addOpening(plan, edit.addMode, run, run.orient === 'h' ? m.x : m.y);
    if (res.error) { edit.onError?.(res.error); return; }
    edit.onApply({ plan: res.plan, moved: [], dropped: [], opening: { kind: edit.addMode, index: res.index } });
  };

  /* ── vano scala ── */
  const startStair = (e) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    edit.onSelect?.(null);
    edit.onSelectWall?.(null);
    const id = stair.room.id;
    setDrag({ type: 'stair', base: plan, runs, id, slides: { x: roomSlide(plan, id, 'x'), y: roomSlide(plan, id, 'y') }, start: toMeters(e), axis: null, delta: 0, moved: false });
  };
  const moveStair = (e) => {
    if (drag?.type !== 'stair') return;
    const m = toMeters(e);
    const dx = m.x - drag.start.x;
    const dy = m.y - drag.start.y;
    let { axis } = drag;
    if (!axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 0.12) return;
      axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      if (drag.slides[axis].error) axis = axis === 'x' ? 'y' : 'x';
    }
    const slide = drag.slides[axis];
    if (slide.error) {
      if (!drag.warned) edit.onError?.(slide.error);
      setDrag({ ...drag, warned: true });
      return;
    }
    const res = moveRoom(drag.base, drag.id, axis, axis === 'x' ? dx : dy, slide);
    if (res.delta === drag.delta && axis === drag.axis) return;
    setDrag({ ...drag, axis, delta: res.delta, moved: res.delta !== 0 });
    onPreview(res.delta ? res.plan : null);
  };
  const endStair = () => {
    if (drag?.type !== 'stair') return;
    const { moved, axis, delta } = drag;
    setDrag(null);
    onPreview(null);
    if (moved && delta) edit.onStairMove?.({ axis, delta });
    else edit.onSelectStair?.(true);
  };

  /* ── divisione dei locali ── */
  const cutAt = (e, r) => {
    const m = toMeters(e);
    const v = edit.splitDir === 'v';
    return { room: r, at: Math.max((v ? r.x : r.y) + 0.3, Math.min((v ? r.x + r.w : r.y + r.h) - 0.3, snap(v ? m.x : m.y))) };   // il limite vero lo dà splitRoom
  };

  const wallRect = (r, pad) => (r.orient === 'v'
    ? { x: (r.line - WALL / 2) * s - pad, y: r.lo * s, width: WALL * s + 2 * pad, height: (r.hi - r.lo) * s }
    : { x: r.lo * s, y: (r.line - WALL / 2) * s - pad, width: (r.hi - r.lo) * s, height: WALL * s + 2 * pad });
  const sel = edit.selected;
  const label = drag?.type === 'wall' && drag.moved
    ? `${drag.delta > 0 ? '+' : '−'}${Math.abs(drag.delta * 100).toFixed(0)} cm`
    : drag?.type === 'stair' && drag.moved ? `${drag.delta > 0 ? '+' : '−'}${Math.abs(drag.delta * 100).toFixed(0)} cm` : null;
  const stairBox = stair && (stair.room);
  const selWall = edit.selectedWall;

  return (
    <g>
      {idle && runs.map((r, i) => {
        const part = movable[i];
        if (!part) return null;
        const here = drag?.type === 'wall' && drag.part.orient === r.orient && Math.abs(drag.part.line - r.line) < 0.02;
        const chosen = selWall && key(selWall) === key(r);
        const hot = hover === i || here;
        return (
          <rect key={`wh-${i}`} {...wallRect(here ? { ...r, line: r.line + drag.delta } : r, PAD)} fill={BLUE} fillOpacity={hot || chosen ? 0.32 : 0.07}
            stroke={hot || chosen ? BLUE : 'none'} strokeWidth={chosen ? 2 : 1} style={{ cursor: r.orient === 'v' ? 'col-resize' : 'row-resize', touchAction: 'none' }}
            onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}
            onPointerDown={(e) => startWall(e, r, part)} onPointerMove={moveWall} onPointerUp={endWall} onPointerCancel={endWall}
            onClick={(e) => e.stopPropagation()} />
        );
      })}

      {picking && runs.filter((r) => (edit.addMode === 'window' ? r.exterior : true)).map((r, i) => (
        <rect key={`add-${i}`} {...wallRect(r, PAD + 3)} fill={GREEN} fillOpacity="0.16" stroke={GREEN} strokeWidth="1" strokeDasharray="4 3"
          style={{ cursor: 'crosshair' }} onPointerDown={(e) => place(e, r)} onClick={(e) => e.stopPropagation()} />
      ))}

      {edit.addMode === 'split' && plan.rooms.filter((r) => r.kind !== 'garden' && r.kind !== 'stairs' && !r.poly).map((r) => (
        <rect key={`cut-${r.id}`} x={r.x * s} y={r.y * s} width={r.w * s} height={r.h * s} fill={GREEN}
          fillOpacity={cut?.room.id === r.id ? 0.1 : 0.03} style={{ cursor: 'crosshair', touchAction: 'none' }}
          onPointerMove={(e) => setCut(cutAt(e, r))} onPointerLeave={() => setCut(null)}
          onPointerDown={(e) => { e.stopPropagation(); const c = cutAt(e, r); setCut(null); edit.onSplit?.(r.id, edit.splitDir, c.at); }}
          onClick={(e) => e.stopPropagation()} />
      ))}
      {edit.addMode === 'split' && cut && (
        <line pointerEvents="none" stroke={GREEN} strokeWidth="2.4" strokeDasharray="7 4"
          {...(edit.splitDir === 'v'
            ? { x1: cut.at * s, x2: cut.at * s, y1: cut.room.y * s, y2: (cut.room.y + cut.room.h) * s }
            : { y1: cut.at * s, y2: cut.at * s, x1: cut.room.x * s, x2: (cut.room.x + cut.room.w) * s })} />
      )}

      {!edit.addMode && stairBox && (
        <rect x={stairBox.x * s} y={stairBox.y * s} width={stairBox.w * s} height={stairBox.h * s} rx="2"
          fill={BLUE} fillOpacity={edit.selectedStair || drag?.type === 'stair' ? 0.16 : 0.04}
          stroke={edit.selectedStair || drag?.type === 'stair' ? BLUE : 'none'} strokeWidth="1.6" strokeDasharray="5 3"
          style={{ cursor: 'move', touchAction: 'none' }}
          onPointerDown={startStair} onPointerMove={moveStair} onPointerUp={endStair} onPointerCancel={endStair}
          onClick={(e) => e.stopPropagation()} />
      )}

      {[['door', plan.doors], ['window', plan.windows]].flatMap(([kind, list]) => list.map((o, i) => {
        if (o.kind === 'gate') return null;
        const on = sel && sel.kind === kind && sel.index === i;
        return (
          <g key={`op-${kind}-${i}`} transform={`translate(${o.x * s},${o.y * s}) rotate(${o.rot})`}
            style={{ cursor: edit.addMode ? 'default' : 'grab', touchAction: 'none' }} pointerEvents={edit.addMode ? 'none' : undefined}
            onPointerDown={(e) => startOpen(e, kind, i)} onPointerMove={moveOpen} onPointerUp={endOpen} onPointerCancel={endOpen}
            onClick={(e) => e.stopPropagation()}>
            <rect x={-3} y={-7} width={o.w * s + 6} height={wt + 14} fill={on ? BLUE : 'transparent'} fillOpacity={on ? 0.14 : 0}
              stroke={on ? BLUE : 'none'} strokeWidth="1.4" strokeDasharray={on ? '4 3' : undefined} rx="2" />
          </g>
        );
      }))}

      {label && (() => {
        let cx = 0;
        let cy = 0;
        if (drag.type === 'wall') {
          const r = runs.find((x) => x.orient === drag.part.orient && Math.abs(x.line - drag.part.line) < 0.02) || { orient: drag.part.orient, line: drag.part.line, lo: 0, hi: 1 };
          [cx, cy] = r.orient === 'v' ? [(r.line + drag.delta) * s, ((r.lo + r.hi) / 2) * s] : [((r.lo + r.hi) / 2) * s, (r.line + drag.delta) * s];
        } else if (stairBox) {
          cx = (stairBox.x + stairBox.w / 2) * s;
          cy = (stairBox.y + stairBox.h / 2) * s;
        }
        return (
          <g pointerEvents="none" transform={`translate(${cx + 10},${cy - 10})`}>
            <rect x="-4" y="-12" width="52" height="17" rx="4" fill={BLUE} />
            <text x="22" y="0" fontSize="11" fontWeight="700" fill="#fff" textAnchor="middle">{label}</text>
          </g>
        );
      })()}
    </g>
  );
}
