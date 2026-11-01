import { useMemo, useState } from 'react';
import { WALL, addOpening, moveOpening, movePartition, openingLine, partition, wallRuns } from '../lib/walls';

const BLUE = '#1f4fd8';
const PAD = 7;   // px attorno al muro per afferrarlo con il dito

/*
 * Livello di modifica della pianta (sopra muri e aperture): muri interni da trascinare, porte e finestre da selezionare,
 * trascinare lungo il muro, e nuove aperture da mettere con un clic sul muro. Durante il trascinamento la pianta mostrata è
 * un'anteprima (onPreview); al rilascio si dà il risultato a edit.onApply, che lo registra come un passo di annulla.
 * edit = { selected: { kind, index } | null, addMode: 'door' | 'window' | null, onSelect, onApply, onError }
 */
export default function WallEditor({ plan, s, toMeters, edit, onPreview }) {
  const [hover, setHover] = useState(null);
  const [drag, setDrag] = useState(null);   // { type: 'wall' | 'open', base, … }
  const wt = plan.wallThickness;
  const runs = useMemo(() => (drag ? drag.runs : wallRuns(plan)), [plan, drag]);
  // durante il trascinamento tutto resta quello di partenza: l'elemento che ha la presa non deve sparire
  const movable = useMemo(() => drag?.movable || runs.map((r) => (r.exterior ? null : partition(plan, r.orient, r.line, r.a, r.b))).map((p) => (p && !p.error ? p : null)),
    [plan, runs, drag?.movable]);

  const startWall = (e, run, part) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    edit.onSelect?.(null);
    setDrag({ type: 'wall', base: plan, runs, movable, part, start: toMeters(e), delta: 0, moved: false });
  };
  const moveWall = (e) => {
    if (drag?.type !== 'wall') return;
    const m = toMeters(e);
    const raw = drag.part.orient === 'v' ? m.x - drag.start.x : m.y - drag.start.y;
    const res = movePartition(drag.base, drag.part, raw);
    if (res.delta === drag.delta) return;
    setDrag({ ...drag, delta: res.delta, moved: res.delta !== 0 });
    onPreview(res.delta ? res.plan : null);
  };
  const endWall = () => {
    if (drag?.type !== 'wall') return;
    const { moved, delta, part, base: b } = drag;
    setDrag(null);
    onPreview(null);
    if (moved && delta) edit.onApply(movePartition(b, part, delta));
  };

  const startOpen = (e, kind, index) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    edit.onSelect?.({ kind, index });
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

  const wallRect = (r, pad) => (r.orient === 'v'
    ? { x: (r.line - WALL / 2) * s - pad, y: r.lo * s, width: WALL * s + 2 * pad, height: (r.hi - r.lo) * s }
    : { x: r.lo * s, y: (r.line - WALL / 2) * s - pad, width: (r.hi - r.lo) * s, height: WALL * s + 2 * pad });
  const sel = edit.selected;
  const label = drag?.type === 'wall' && drag.moved
    ? `${drag.delta > 0 ? '+' : '−'}${Math.abs(drag.delta * 100).toFixed(0)} cm` : null;

  return (
    <g>
      {!edit.addMode && runs.map((r, i) => {
        const part = movable[i];
        if (!part) return null;
        const here = drag?.type === 'wall' && drag.part.orient === r.orient && Math.abs(drag.part.line - r.line) < 0.02;
        const hot = hover === i || here;
        return (
          <rect key={`wh-${i}`} {...wallRect(here ? { ...r, line: r.line + drag.delta } : r, PAD)} fill={BLUE} fillOpacity={hot ? 0.3 : 0.07}
            stroke={hot ? BLUE : 'none'} strokeWidth="1" style={{ cursor: r.orient === 'v' ? 'col-resize' : 'row-resize', touchAction: 'none' }}
            onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}
            onPointerDown={(e) => startWall(e, r, part)} onPointerMove={moveWall} onPointerUp={endWall} onPointerCancel={endWall}
            onClick={(e) => e.stopPropagation()} />
        );
      })}

      {edit.addMode && runs.filter((r) => (edit.addMode === 'window' ? r.exterior : true)).map((r, i) => (
        <rect key={`add-${i}`} {...wallRect(r, PAD + 3)} fill="#16a34a" fillOpacity="0.16" stroke="#16a34a" strokeWidth="1" strokeDasharray="4 3"
          style={{ cursor: 'crosshair' }} onPointerDown={(e) => place(e, r)} onClick={(e) => e.stopPropagation()} />
      ))}

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

      {label && drag?.type === 'wall' && (() => {
        const r = runs.find((x) => x.orient === drag.part.orient && Math.abs(x.line - drag.part.line) < 0.02) || { orient: drag.part.orient, line: drag.part.line, lo: 0, hi: 1 };
        const [cx, cy] = r.orient === 'v' ? [(r.line + drag.delta) * s, ((r.lo + r.hi) / 2) * s] : [((r.lo + r.hi) / 2) * s, (r.line + drag.delta) * s];
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

