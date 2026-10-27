import React, { useState, useRef, useEffect, useMemo, useId } from 'react';
import {
  Home,
  Briefcase,
  Maximize2,
  Sparkles,
  Shuffle,
  Download,
  Loader2,
  Info,
  AlertCircle,
  Sun,
  Moon,
  ZoomIn,
  ZoomOut,
  Scan,
  Armchair,
  Tag,
  Ruler,
  LayoutGrid,
  Trash2,
  Copy,
  Lock,
  Check,
  ChevronDown,
  Image as ImageIcon,
  FileJson,
} from 'lucide-react';
import './App.css';

/* ────────────────────────────────────────────────────────────────────────────
   Costanti
   ──────────────────────────────────────────────────────────────────────────── */
const SHAPES = [
  { id: 'auto', label: 'Varia', d: null },
  { id: 'rect', label: 'Rettangolo', d: 'M3 6h18v12H3z' },
  { id: 'l', label: 'A L', d: 'M3 5h11v6h7v8H3z' },
  { id: 'u', label: 'A U', d: 'M3 5h5v7h8V5h5v14H3z' },
  { id: 't', label: 'A T', d: 'M3 5h18v6h-6v8H9v-8H3z' },
  { id: 'step', label: 'Scalare', d: 'M3 5h9v5h5v5h4v4H3z' },
];
const SHAPE_NAME = { rect: 'rettangolare', l: 'a L', u: 'a U', t: 'a T', step: 'scalare' };

const TYPES = [
  { id: 'apartment', label: 'Appartamento', Icon: Home },
  { id: 'open-space', label: 'Open space', Icon: Maximize2 },
  { id: 'office', label: 'Ufficio', Icon: Briefcase },
];
const TYPE_NAME = { apartment: 'Appartamento', 'open-space': 'Open space', office: 'Ufficio' };

const PRESETS = [
  { label: 'Monolocale', w: 7, l: 6, type: 'open-space', rooms: 1 },
  { label: 'Bilocale', w: 9, l: 7, type: 'apartment', rooms: 2 },
  { label: 'Trilocale', w: 11, l: 9, type: 'apartment', rooms: 3 },
  { label: 'Quadrilocale', w: 14, l: 10, type: 'apartment', rooms: 4 },
  { label: 'Ufficio', w: 18, l: 12, type: 'office', rooms: 4 },
];

const LOADING_STEPS = [
  'Calcolo la sagoma dell’edificio…',
  'Divido gli spazi e traccio i muri…',
  'Metto porte, finestre e arredi…',
  'Controllo che ogni stanza sia raggiungibile…',
];

const INK = '#14181f';
const FONT = "'Figtree', system-ui, -apple-system, 'Segoe UI', sans-serif";
const MARGIN = 78;   
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmt = (n, d = 1) => Number(n).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtM = (n) => Number(n).toLocaleString('it-IT', { maximumFractionDigits: 2 });

function sheetBox(plan, thumb) {
  if (thumb) return { w: plan.svgWidth + 12, h: plan.svgHeight + 12, ox: 6, oy: 6 };
  const w = Math.max(plan.svgWidth + MARGIN * 2, 500);
  return { w, h: MARGIN + plan.svgHeight + 100, ox: (w - plan.svgWidth) / 2, oy: MARGIN };
}

/* ────────────────────────────────────────────────────────────────────────────
   Arredi
   ──────────────────────────────────────────────────────────────────────────── */
const ROT_BY_FACING = { S: 0, N: 180, E: -90, W: 90 };

function Oriented({ item, scale, children }) {
  const sw = item.w * scale;
  const sh = item.h * scale;
  const facing = item.facing || 'S';
  const sideways = facing === 'E' || facing === 'W';
  const cw = sideways ? sh : sw;
  const ch = sideways ? sw : sh;
  const cx = item.x * scale + sw / 2;
  const cy = item.y * scale + sh / 2;
  return (
    <g transform={`translate(${cx},${cy}) rotate(${ROT_BY_FACING[facing] ?? 0}) translate(${-cw / 2},${-ch / 2})`}>
      {children(cw, ch)}
    </g>
  );
}

const F_STROKE = '#5b6472';
const F_SOFT = '#bcc3ce';
const WOOD = '#f5ead6';
const WOOD_LINE = '#b89d6e';

const FURNITURE = {
  bed: (w, h, s) => {
    const n = w > 1.3 * s ? 2 : 1;
    const gap = 3;
    const pw = (w - gap * (n + 1)) / n;
    return (
      <>
        <rect width={w} height={h} rx={3} fill="#fff" stroke={F_STROKE} strokeWidth="1.2" />
        <rect x={1.5} y={h * 0.3} width={w - 3} height={h * 0.7 - 1.5} rx={2} fill="#dde7f6" stroke={F_SOFT} />
        <line x1={1.5} y1={h * 0.3} x2={w - 1.5} y2={h * 0.3} stroke={F_SOFT} />
        {Array.from({ length: n }, (_, i) => (
          <rect key={i} x={gap + i * (pw + gap)} y={h * 0.05} width={pw} height={h * 0.18} rx={3} fill="#fff" stroke={F_SOFT} />
        ))}
      </>
    );
  },
  sofa: (w, h, s) => {
    const back = Math.min(h * 0.3, 0.3 * s);
    const arm = Math.min(w * 0.1, 0.14 * s);
    const n = w > 1.9 * s ? 3 : 2;
    const seat = (w - 2 * arm) / n;
    return (
      <>
        <rect width={w} height={h} rx={4} fill="#e4e9f1" stroke={F_STROKE} strokeWidth="1.2" />
        <rect x={arm} y={back} width={w - 2 * arm} height={h - back - 1.5} rx={2} fill="#f3f5f9" stroke={F_SOFT} />
        {Array.from({ length: n - 1 }, (_, i) => (
          <line key={i} x1={arm + seat * (i + 1)} y1={back} x2={arm + seat * (i + 1)} y2={h - 1.5} stroke={F_SOFT} />
        ))}
        <rect x={0} y={back * 0.5} width={arm} height={h - back * 0.5} rx={2} fill="#d6dde8" stroke={F_SOFT} />
        <rect x={w - arm} y={back * 0.5} width={arm} height={h - back * 0.5} rx={2} fill="#d6dde8" stroke={F_SOFT} />
      </>
    );
  },
  table: (w, h, s) => {
    const horiz = w >= h;
    const long = Math.max(w, h);
    const n = clamp(Math.floor(long / (0.55 * s)), 1, 8);
    const cl = 0.4 * s;
    const cd = 0.3 * s;
    const off = 0.05 * s;
    const chairs = [];
    for (let i = 0; i < n; i++) {
      const p = (long * (i + 0.5)) / n - cl / 2;
      if (horiz) {
        chairs.push([p, -cd - off, cl, cd], [p, h + off, cl, cd]);
      } else {
        chairs.push([-cd - off, p, cd, cl], [w + off, p, cd, cl]);
      }
    }
    if (long > 2.4 * s) {
      if (horiz) chairs.push([-cd - off, h / 2 - cl / 2, cd, cl], [w + off, h / 2 - cl / 2, cd, cl]);
      else chairs.push([w / 2 - cl / 2, -cd - off, cl, cd], [w / 2 - cl / 2, h + off, cl, cd]);
    }
    return (
      <>
        {chairs.map(([x, y, cw, ch], i) => (
          <rect key={i} x={x} y={y} width={cw} height={ch} rx={3} fill="#eadfca" stroke={WOOD_LINE} strokeWidth="0.8" />
        ))}
        <rect width={w} height={h} rx={3} fill={WOOD} stroke={WOOD_LINE} strokeWidth="1.2" />
      </>
    );
  },
  desk: (w, h, s) => (
    <>
      <rect x={w / 2 - 0.21 * s} y={h - 0.1 * s} width={0.42 * s} height={0.4 * s} rx={5} fill="#e3e7ee" stroke={F_STROKE} strokeWidth="0.9" />
      <rect width={w} height={h} rx={2} fill={WOOD} stroke={WOOD_LINE} strokeWidth="1.2" />
      <rect x={w / 2 - 0.2 * s} y={h * 0.12} width={0.4 * s} height={Math.max(2, h * 0.09)} rx={1} fill="#2b3340" />
      <rect x={w / 2 - 0.17 * s} y={h * 0.5} width={0.34 * s} height={Math.max(2, h * 0.12)} rx={1} fill="#fff" stroke={F_SOFT} strokeWidth="0.7" />
    </>
  ),
  tv: (w, h) => (
    <>
      <rect width={w} height={Math.max(h, 4)} rx={1.5} fill="#1f2937" />
      <rect x={w * 0.35} y={Math.max(h, 4)} width={w * 0.3} height={2} fill="#1f2937" opacity="0.5" />
    </>
  ),
  toilet: (w, h) => (
    <>
      <rect width={w} height={h * 0.32} rx={2} fill="#fff" stroke={F_STROKE} strokeWidth="1.1" />
      <ellipse cx={w / 2} cy={h * 0.66} rx={w * 0.42} ry={h * 0.32} fill="#fff" stroke={F_STROKE} strokeWidth="1.1" />
    </>
  ),
  sink: (w, h) => (
    <>
      <rect width={w} height={h} rx={3} fill="#fff" stroke={F_STROKE} strokeWidth="1.1" />
      <ellipse cx={w / 2} cy={h * 0.58} rx={w * 0.32} ry={h * 0.28} fill="#e3eefb" stroke={F_SOFT} />
      <circle cx={w / 2} cy={h * 0.15} r={1.8} fill={F_STROKE} />
    </>
  ),
  shower: (w, h) => (
    <>
      <rect width={w} height={h} fill="#e3eefb" stroke={F_STROKE} strokeWidth="1.1" />
      <rect x={3} y={3} width={w - 6} height={h - 6} fill="none" stroke="#fff" strokeWidth="1.5" />
      <line x1={3} y1={3} x2={w - 3} y2={h - 3} stroke={F_SOFT} />
      <line x1={w - 3} y1={3} x2={3} y2={h - 3} stroke={F_SOFT} />
      <circle cx={w / 2} cy={h / 2} r={3} fill="#fff" stroke={F_STROKE} />
    </>
  ),
  kitchen_counter: (w, h, s) => {
    const fridge = w >= 3 * s;
    const f0 = fridge ? 0.62 * s : 0;
    const usable = w - f0;
    const hobX = f0 + usable * (fridge ? 0.3 : 0.18);
    const sinkX = f0 + usable * 0.58;
    const r = Math.min(5, h * 0.15);
    return (
      <>
        <rect width={w} height={h} fill="#f1f2f5" stroke={F_STROKE} strokeWidth="1.1" />
        {fridge && (
          <>
            <rect x={0} y={0} width={f0} height={h} fill="#e3e6eb" stroke={F_STROKE} strokeWidth="1.1" />
            <line x1={f0 * 0.2} y1={h * 0.3} x2={f0 * 0.2} y2={h * 0.7} stroke={F_STROKE} strokeWidth="1.4" />
          </>
        )}
        {[0.28, 0.72].flatMap((cy) => [0, 1].map((k) => (
          <circle key={`${cy}-${k}`} cx={hobX + k * r * 2.6 + r} cy={h * cy} r={r} fill="none" stroke={F_STROKE} />
        )))}
        <rect x={sinkX} y={h * 0.18} width={Math.min(usable * 0.3, 0.8 * s)} height={h * 0.64} rx={2} fill="#e3eefb" stroke={F_SOFT} />
      </>
    );
  },
  wardrobe: (w, h) => {
    const n = Math.max(2, Math.round(w / 38));
    return (
      <>
        <rect width={w} height={h} fill="#ece7df" stroke={F_STROKE} strokeWidth="1.1" />
        {Array.from({ length: n - 1 }, (_, i) => (
          <line key={i} x1={(w / n) * (i + 1)} y1={0} x2={(w / n) * (i + 1)} y2={h} stroke={F_SOFT} />
        ))}
        <line x1={0} y1={h} x2={w} y2={0} stroke={F_SOFT} opacity="0.7" />
      </>
    );
  },
};

function Furn({ item, scale }) {
  const draw = FURNITURE[item.type];
  if (!draw) {
    return (
      <rect x={item.x * scale} y={item.y * scale} width={item.w * scale} height={item.h * scale}
        fill="#f1f3f6" stroke={F_STROKE} strokeWidth="1" />
    );
  }
  return <Oriented item={item} scale={scale}>{(w, h) => draw(w, h, scale)}</Oriented>;
}

/* ────────────────────────────────────────────────────────────────────────────
   Pavimenti, quote, etichette
   ──────────────────────────────────────────────────────────────────────────── */
const FLOOR_BY_KIND = {
  living: 'wood', living_kitchen: 'wood', zone_day: 'wood', zone_night: 'wood', bed: 'wood', study: 'wood',
  kitchen: 'tile', bath: 'tile', wc: 'tile',
  office_open: 'carpet', meeting: 'carpet', director: 'carpet',
};

function Dim({ len, label }) {
  const tw = label.length * 6.4 + 12;
  return (
    <g stroke={INK} strokeWidth="1" fill="none">
      <line x1={0} y1={0} x2={len} y2={0} />
      <line x1={-4} y1={4} x2={4} y2={-4} />
      <line x1={len - 4} y1={4} x2={len + 4} y2={-4} />
      <rect x={len / 2 - tw / 2} y={-8} width={tw} height={16} fill="#fff" stroke="none" />
      <text x={len / 2} y={4} textAnchor="middle" fontSize="11" fontWeight="600" fill={INK} stroke="none" fontFamily={FONT}>
        {label}
      </text>
    </g>
  );
}

function roomLabel(room, s) {
  const sw = room.w * s;
  const sh = room.h * s;
  if (sw < 52 || sh < 34) return null;
  const fit = (name) => Math.min(13, (sw - 12) / (name.length * 0.56));
  let name = room.name;
  let fs = fit(name);
  if (fs < 8.5) {
    name = room.name.split(' ')[0];
    fs = fit(name);
  }
  if (fs < 8.5) return { name: '', fs: 10 };
  return { name, fs };
}

/* ────────────────────────────────────────────────────────────────────────────
   Il foglio: planimetria + quote + cartiglio
   ──────────────────────────────────────────────────────────────────────────── */
function PlanSvg({
  plan, layers, hoverId = null, selectedId = null, onHover, onSelect,
  thumb = false, svgRef, zoom = 1, typeLabel = '',
}) {
  const uid = useId().replace(/:/g, '');
  const s = plan.scale;
  const W = plan.svgWidth;
  const H = plan.svgHeight;
  const wt = plan.wallThickness;
  const box = sheetBox(plan, thumb);
  const notches = plan.notches || [];
  const ref = (n) => `url(#${n}-${uid})`;
  const showFurn = layers.furniture && !thumb;
  const gross = plan.stats?.grossArea ?? plan.rooms.reduce((a, r) => a + r.w * r.h, 0);
  const shapeName = SHAPE_NAME[plan.shape] || 'rettangolare';

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      width={box.w * zoom}
      height={box.h * zoom}
      viewBox={`0 0 ${box.w} ${box.h}`}
      role="img"
      aria-label={`Planimetria ${shapeName}, ${fmt(plan.dimensions.width)} per ${fmt(plan.dimensions.length)} metri`}
    >
      <defs>
        <pattern id={`wood-${uid}`} width="44" height="9" patternUnits="userSpaceOnUse">
          <line x1="0" y1="8.5" x2="44" y2="8.5" stroke="#8a6f3e" strokeOpacity="0.10" />
          <line x1="22" y1="0" x2="22" y2="8.5" stroke="#8a6f3e" strokeOpacity="0.08" />
        </pattern>
        <pattern id={`tile-${uid}`} width="14" height="14" patternUnits="userSpaceOnUse">
          <path d="M14 0H0V14" fill="none" stroke="#3b6ea5" strokeOpacity="0.14" />
        </pattern>
        <pattern id={`carpet-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="0.7" fill="#64748b" fillOpacity="0.16" />
        </pattern>
        <pattern id={`hatch-${uid}`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="9" stroke="#8aa383" strokeOpacity="0.55" strokeWidth="1.2" />
        </pattern>
        <pattern id={`grid-${uid}`} width={s} height={s} patternUnits="userSpaceOnUse">
          <path d={`M${s} 0H0V${s}`} fill="none" stroke="#14181f" strokeOpacity="0.09" />
        </pattern>
        <filter id={`fshadow-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="0.8" stdDeviation="0.9" floodColor="#000" floodOpacity="0.22" />
        </filter>
        <filter id={`pshadow-${uid}`} x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="5" stdDeviation="7" floodColor="#1d2a44" floodOpacity="0.16" />
        </filter>
      </defs>

      <rect width={box.w} height={box.h} fill="#fff" />
      {!thumb && <rect x="10" y="10" width={box.w - 20} height={box.h - 20} fill="none" stroke={INK} strokeWidth="1.2" />}

      <g transform={`translate(${box.ox},${box.oy})`}>
        {notches.map((n, i) => (
          <g key={`n-${i}`}>
            <rect x={n.x * s} y={n.y * s} width={n.w * s} height={n.h * s} fill="#f3f6f1" />
            <rect x={n.x * s} y={n.y * s} width={n.w * s} height={n.h * s} fill={ref('hatch')} />
            {!thumb && layers.labels && n.w * s > 74 && n.h * s > 34 && (
              <text x={(n.x + n.w / 2) * s} y={(n.y + n.h / 2) * s + 4} textAnchor="middle" fontSize="10.5"
                fill="#5f7a58" fontFamily={FONT}>
                esterno · {fmtM(n.w)} × {fmtM(n.h)} m
              </text>
            )}
          </g>
        ))}

        <g filter={thumb ? undefined : ref('pshadow')}>
          {plan.rooms.map((r) => (
            <rect key={`bg-${r.id}`} x={r.x * s} y={r.y * s} width={r.w * s} height={r.h * s} fill={r.color} />
          ))}
        </g>
        {plan.rooms.map((r) => {
          const fl = FLOOR_BY_KIND[r.kind];
          return fl ? (
            <rect key={`fl-${r.id}`} x={r.x * s} y={r.y * s} width={r.w * s} height={r.h * s} fill={ref(fl)} />
          ) : null;
        })}

        {layers.grid && !thumb && <rect width={W} height={H} fill={ref('grid')} pointerEvents="none" />}

        {!thumb && plan.rooms.map((r) => {
          const on = r.id === hoverId || r.id === selectedId;
          return on ? (
            <rect key={`hl-${r.id}`} className="pf-hl" x={r.x * s} y={r.y * s} width={r.w * s} height={r.h * s}
              fill="#1f4fd8" fillOpacity={r.id === selectedId ? 0.14 : 0.08} pointerEvents="none" />
          ) : null;
        })}

        {showFurn && (
          <g filter={ref('fshadow')}>
            {plan.furniture.map((it, i) => <Furn key={`f-${i}`} item={it} scale={s} />)}
          </g>
        )}

        <g fill={INK}>
          {plan.walls.map((w, i) => (
            <rect key={`w-${i}`} x={w.x * s} y={w.y * s} width={w.w * s} height={w.h * s} />
          ))}
        </g>

        {plan.doors.map((d, i) => {
          const sw = d.w * s;
          const dir = d.openDir;
          const col = d.entrance ? '#d92d20' : '#1f4fd8';
          const cy = wt / 2;
          return (
            <g key={`d-${i}`} transform={`translate(${d.x * s},${d.y * s}) rotate(${d.rot})`}>
              <rect x={0} y={-0.4} width={sw} height={wt + 0.8} fill="#fff" />
              <rect x={0} y={0} width={1.8} height={wt} fill={INK} />
              <rect x={sw - 1.8} y={0} width={1.8} height={wt} fill={INK} />
              <path d={`M 0 ${cy + dir * sw} A ${sw} ${sw} 0 0 ${dir > 0 ? 0 : 1} ${sw} ${cy}`}
                fill="none" stroke={col} strokeWidth="0.9" strokeDasharray="3 2.5" />
              <line x1={0} y1={cy} x2={0} y2={cy + dir * sw} stroke={col} strokeWidth={d.entrance ? 2.6 : 1.8} />
            </g>
          );
        })}

        {plan.windows.map((w, i) => {
          const sw = w.w * s;
          return (
            <g key={`win-${i}`} transform={`translate(${w.x * s},${w.y * s}) rotate(${w.rot})`}>
              <rect width={sw} height={wt} fill="#fff" stroke={INK} strokeWidth="1" />
              <line x1={1} y1={wt * 0.34} x2={sw - 1} y2={wt * 0.34} stroke="#2f6fe4" strokeWidth="0.9" />
              <line x1={1} y1={wt * 0.66} x2={sw - 1} y2={wt * 0.66} stroke="#2f6fe4" strokeWidth="0.9" />
            </g>
          );
        })}

        {!thumb && layers.labels && plan.rooms.map((r) => {
          const lb = roomLabel(r, s);
          if (!lb) return null;
          const cx = (r.x + r.w / 2) * s;
          const cy = (r.y + r.h / 2) * s;
          const sel = r.id === selectedId;
          const halo = { stroke: '#fff', strokeWidth: 3.2, paintOrder: 'stroke', strokeLinejoin: 'round' };
          return (
            <g key={`lb-${r.id}`} pointerEvents="none" fontFamily={FONT} textAnchor="middle">
              {lb.name && (
                <text x={cx} y={cy - 3} fontSize={lb.fs} fontWeight="600" fill={sel ? '#1f4fd8' : '#3d4654'} {...halo}>
                  {lb.name}
                </text>
              )}
              <text x={cx} y={cy + (lb.name ? lb.fs * 0.95 : 4)} fontSize={Math.max(8.5, lb.fs * 0.82)} fill="#6b7482" {...halo}>
                {sel ? `${fmtM(r.w)} × ${fmtM(r.h)} m · ` : ''}{fmt(r.area ?? r.w * r.h)} m²
              </text>
            </g>
          );
        })}

        {!thumb && plan.rooms.map((r) => (
          <rect key={`hit-${r.id}`} className="pf-hit" x={r.x * s} y={r.y * s} width={r.w * s} height={r.h * s}
            fill="transparent" style={{ cursor: 'pointer' }}
            onMouseEnter={() => onHover?.(r.id)} onMouseLeave={() => onHover?.(null)}
            onClick={() => onSelect?.(r.id === selectedId ? null : r.id)} />
        ))}

        {!thumb && layers.dims && (
          <g fontFamily={FONT}>
            <g stroke={INK} strokeWidth="0.8">
              <line x1={0} y1={-6} x2={0} y2={-42} />
              <line x1={W} y1={-6} x2={W} y2={-42} />
              <line x1={-6} y1={0} x2={-42} y2={0} />
              <line x1={-6} y1={H} x2={-42} y2={H} />
            </g>
            <g transform="translate(0,-34)"><Dim len={W} label={`${fmtM(plan.dimensions.width)} m`} /></g>
            <g transform={`translate(-34,${H}) rotate(-90)`}><Dim len={H} label={`${fmtM(plan.dimensions.length)} m`} /></g>
          </g>
        )}
      </g>

      {!thumb && (
        <g fontFamily={FONT}>
          <g transform={`translate(${box.w - 46},52)`} stroke={INK} fill="none" strokeWidth="1.1">
            <circle r="15" />
            <path d="M0 -11 L5 8 L0 4 L-5 8 Z" fill={INK} />
            <text y="-20" textAnchor="middle" fontSize="10" fontWeight="700" fill={INK} stroke="none">N</text>
          </g>

          <g transform={`translate(30,${box.h - 46})`}>
            <rect width={s} height="6" fill={INK} stroke={INK} />
            <rect x={s} width={s} height="6" fill="#fff" stroke={INK} />
            <g fontSize="9" fill={INK} textAnchor="middle">
              <text x="0" y="19">0</text>
              <text x={s} y="19">1</text>
              <text x={s * 2} y="19">2 m</text>
            </g>
          </g>

          <g transform={`translate(${box.w - 10 - 292},${box.h - 10 - 58})`}>
            <rect width="292" height="58" fill="#fff" stroke={INK} strokeWidth="1.2" />
            <line x1="0" y1="24" x2="292" y2="24" stroke={INK} />
            <line x1="196" y1="24" x2="196" y2="58" stroke={INK} />
            <text x="10" y="17" fontSize="13" fontWeight="700" fill={INK}>Planify · {typeLabel || 'Planimetria'}</text>
            <text x="10" y="40" fontSize="10.5" fill="#3d4654">
              {fmtM(plan.dimensions.width)} × {fmtM(plan.dimensions.length)} m, sagoma {shapeName}
            </text>
            <text x="10" y="53" fontSize="10.5" fill="#3d4654">Superficie lorda {fmt(gross)} m²</text>
            <text x="206" y="40" fontSize="10.5" fill="#3d4654">Variante</text>
            <text x="206" y="53" fontSize="12" fontWeight="700" fill={INK}>#{plan.seed ?? 0}</text>
          </g>
        </g>
      )}
    </svg>
  );
}

function serializeSvg(svg) {
  const clone = svg.cloneNode(true);
  clone.querySelectorAll('.pf-hl,.pf-hit').forEach((n) => n.remove());
  const vb = svg.viewBox.baseVal;
  clone.setAttribute('width', vb.width);
  clone.setAttribute('height', vb.height);
  return { xml: new XMLSerializer().serializeToString(clone), w: vb.width, h: vb.height };
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ShapeGlyph({ d }) {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
      {d ? (
        <path d={d} fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      ) : (
        <>
          <path d="M3 5h8v6H3zM13 5h8v14h-8zM3 13h8v6H3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeDasharray="2.4 2" />
        </>
      )}
    </svg>
  );
}

function Logo() {
  return (
    <img 
      src="/favicon.svg" 
      alt="Planify Logo" 
      width="30" 
      height="30" 
      style={{ borderRadius: '8px' }} 
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   App Principale
   ──────────────────────────────────────────────────────────────────────────── */
const lsGet = (k, fallback) => {
  try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; }
};
const lsSet = (k, v) => {
  try { localStorage.setItem(k, v); } catch { }
};

export default function App() {
  const [theme, setTheme] = useState(() =>
    lsGet('planify.theme', window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [backendUrl, setBackendUrl] = useState(() => lsGet('planify.backend', import.meta.env.VITE_BACKEND_URL || ''));
  const [connOpen, setConnOpen] = useState(false);

  const [form, setForm] = useState({
    width: 11, length: 9, roomType: 'apartment', rooms: 3, style: 'modern', shape: 'auto', seed: '',
  });
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(null);

  const [current, setCurrent] = useState(null);      
  const [history, setHistory] = useState([]);
  const [layers, setLayers] = useState({ furniture: true, labels: true, dims: true, grid: false });
  const [zoom, setZoom] = useState(null);            
  const [hoverId, setHoverId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [flash, setFlash] = useState('');

  const svgRef = useRef(null);
  const stageRef = useRef(null);
  const fitRef = useRef(1);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  const plan = current?.plan || null;

  useEffect(() => { lsSet('planify.theme', theme); }, [theme]);
  useEffect(() => { lsSet('planify.backend', backendUrl); }, [backendUrl]);

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
  fitRef.current = fit;
  const z = zoom ?? fit;

  const stats = useMemo(() => {
    if (!plan) return null;
    const st = plan.stats || {};
    const kinds = plan.rooms.map((r) => r.kind);
    return {
      gross: st.grossArea ?? plan.rooms.reduce((a, r) => a + r.w * r.h, 0),
      bedrooms: st.bedrooms ?? kinds.filter((k) => k === 'bed').length,
      baths: st.bathrooms ?? kinds.filter((k) => k === 'bath' || k === 'wc').length,
      doors: st.doors ?? plan.doors.length,
      windows: st.windows ?? plan.windows.length,
    };
  }, [plan]);

  const selectedRoom = plan?.rooms.find((r) => r.id === selectedId) || null;
  const totalArea = plan ? plan.rooms.reduce((a, r) => a + (r.area ?? r.w * r.h), 0) : 0;

  const say = (msg) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 1600);
  };

  const run = async ({ variant = false } = {}) => {
    setError(null);
    const base = backendUrl.trim().replace(/\/+$/, '');
    if (!base) {
      setError("Inserisci l'URL del backend in «Connessione» (oppure imposta VITE_BACKEND_URL su Vercel).");
      setConnOpen(true);
      return;
    }
    const w = parseFloat(String(form.width).replace(',', '.'));
    const l = parseFloat(String(form.length).replace(',', '.'));
    if (!Number.isFinite(w) || !Number.isFinite(l) || w <= 0 || l <= 0) {
      setError('Inserisci larghezza e lunghezza valide (da 5 a 60 metri).');
      return;
    }
    const body = {
      width: clamp(w, 5, 60),
      length: clamp(l, 5, 60),
      room_type: form.roomType,
      num_rooms: Number(form.rooms),
      style: form.style,
      shape: form.shape,
    };
    const seedTxt = String(form.seed).trim();
    if (!variant && seedTxt !== '' && Number.isInteger(Number(seedTxt)) && Number(seedTxt) >= 0) {
      body.seed = Number(seedTxt);
    }

    setIsLoading(true);
    setLoadingStep(0);
    setSlow(false);
    const interval = setInterval(() => setLoadingStep((st) => Math.min(st + 1, 3)), 800);
    const slowTimer = setTimeout(() => setSlow(true), 7000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000); 

    try {
      const res = await fetch(`${base}/generate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        let detail = '';
        try {
          const j = await res.json();
          detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
        } catch { }
        throw new Error(`HTTP ${res.status}${detail ? ' - ' + detail : ''}`);
      }
      const data = await res.json();
      const entry = {
        id: `${Date.now()}`,
        plan: data,
        meta: { type: form.roomType, style: form.style },
        params: { roomType: form.roomType, rooms: Number(form.rooms), style: form.style, shape: form.shape },
      };
      setCurrent(entry);
      setHistory((h) => [entry, ...h].slice(0, 8));
      setSelectedId(null);
      setZoom(null);
      setForm((f) => ({
        ...f,
        width: data.dimensions?.width ?? f.width,
        length: data.dimensions?.length ?? f.length,
        seed: variant ? '' : f.seed,
      }));
    } catch (err) {
      setError(
        err.name === 'AbortError'
          ? 'Il backend non ha risposto entro 90 secondi. Riprova: su Render gratuito la prima richiesta può essere lenta.'
          : `Impossibile contattare il backend (${err.message}).`
      );
    } finally {
      clearInterval(interval);
      clearTimeout(slowTimer);
      clearTimeout(timeout);
      setIsLoading(false);
    }
  };

  const restore = (entry) => {
    setCurrent(entry);
    setSelectedId(null);
    setZoom(null);
    setForm((f) => ({
      ...f,
      ...entry.params,
      width: entry.plan.dimensions.width,
      length: entry.plan.dimensions.length,
      seed: '',
    }));
  };

  const applyPreset = (p) => {
    setForm((f) => ({ ...f, width: p.w, length: p.l, roomType: p.type, rooms: p.rooms }));
  };

  const exportSvg = () => {
    if (!svgRef.current) return;
    const { xml } = serializeSvg(svgRef.current);
    saveBlob(new Blob([xml], { type: 'image/svg+xml' }), 'planimetria.svg');
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
    img.onerror = () => { URL.revokeObjectURL(url); setError('Errore PNG: usa SVG.'); };
    img.src = url;
  };
  const exportJson = () => {
    if (!plan) return;
    saveBlob(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }), 'planimetria.json');
  };
  const copy = async (text, msg) => {
    try {
      await navigator.clipboard.writeText(String(text));
      say(msg);
    } catch { say('Copia non riuscita'); }
  };

  const exportDxf = async () => {
    if (!plan) return;
    say('Generazione file CAD in corso...');
    try {
      const base = backendUrl.trim().replace(/\/+$/, '');
      const res = await fetch(`${base}/export-dxf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan)
      });
      if (!res.ok) throw new Error('Errore DXF');
      const blob = await res.blob();
      saveBlob(blob, 'planimetria.dxf');
      say('File CAD esportato');
    } catch (err) {
      setError('Impossibile esportare in DXF. Verifica che il backend sia aggiornato.');
    }
  };

  const area = (parseFloat(form.width) || 0) * (parseFloat(form.length) || 0);
  const toggle = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  return (
    <div className="pf-app" data-theme={theme}>
      <header className="pf-top">
        <div className="pf-brand">
          <Logo />
          <span className="pf-name">Planify</span>
        </div>
        <div className="pf-top-right">
          <span className={`pf-status ${backendUrl ? 'is-on' : ''}`}>
            <i aria-hidden="true" />
            {backendUrl ? 'Motore collegato' : 'Motore non collegato'}
          </span>
          <button type="button" className="pf-icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'} title={theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'}>
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>

      <div className="pf-body">
        {/* ───────── Pannello comandi Sinistro ───────── */}
        <aside className="pf-rail">
          <form className="pf-form" onSubmit={(e) => { e.preventDefault(); run(); }}>
            <section className="pf-sec">
              <h2>Misure</h2>
              <div className="pf-row2">
                <label className="pf-field">
                  <span>Larghezza</span>
                  <div className="pf-input">
                    <input type="number" min="5" max="60" step="0.5" required value={form.width}
                      onChange={(e) => setF('width', e.target.value)} />
                    <em>m</em>
                  </div>
                </label>
                <label className="pf-field">
                  <span>Lunghezza</span>
                  <div className="pf-input">
                    <input type="number" min="5" max="60" step="0.5" required value={form.length}
                      onChange={(e) => setF('length', e.target.value)} />
                    <em>m</em>
                  </div>
                </label>
              </div>
              <p className="pf-hint">{fmt(area)} m² nel riquadro · da 5 a 60 m per lato</p>
              <div className="pf-chips">
                {PRESETS.map((p) => (
                  <button key={p.label} type="button" className="pf-chip" onClick={() => applyPreset(p)}>{p.label}</button>
                ))}
              </div>
            </section>

            <section className="pf-sec">
              <h2>Tipologia</h2>
              <div className="pf-seg" role="radiogroup" aria-label="Tipologia">
                {TYPES.map(({ id, label, Icon }) => (
                  <button key={id} type="button" role="radio" aria-checked={form.roomType === id}
                    className={form.roomType === id ? 'is-on' : ''} onClick={() => setF('roomType', id)}>
                    <Icon size={15} /> {label}
                  </button>
                ))}
              </div>
              <div className="pf-range">
                <div>
                  <span>Locali principali</span>
                  <strong>{form.rooms}</strong>
                </div>
                <input type="range" min="1" max="8" value={form.rooms} aria-label="Locali principali"
                  onChange={(e) => setF('rooms', Number(e.target.value))} />
              </div>
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
                  ? 'Ogni generazione sceglie una sagoma diversa.'
                  : 'Se le misure sono troppo piccole, la pianta torna rettangolare.'}
              </p>
            </section>

            <section className="pf-sec">
              <h2>Stile</h2>
              <div className="pf-seg" role="radiogroup" aria-label="Stile">
                <button type="button" role="radio" aria-checked={form.style === 'modern'}
                  className={form.style === 'modern' ? 'is-on' : ''} onClick={() => setF('style', 'modern')}>
                  <i className="pf-swatch" style={{ background: '#e0f2fe' }} /> Moderno
                </button>
                <button type="button" role="radio" aria-checked={form.style === 'classic'}
                  className={form.style === 'classic' ? 'is-on' : ''} onClick={() => setF('style', 'classic')}>
                  <i className="pf-swatch" style={{ background: '#fef3c7' }} /> Classico
                </button>
              </div>
            </section>

            <details className="pf-details" open={connOpen} onToggle={(e) => setConnOpen(e.currentTarget.open)}>
              <summary>
                <span>Connessione e seed</span>
                <ChevronDown size={16} />
              </summary>
              <label className="pf-field">
                <span>URL del backend</span>
                <input type="text" className="pf-plain" value={backendUrl} spellCheck="false"
                  placeholder="https://tuo-servizio.onrender.com" onChange={(e) => setBackendUrl(e.target.value)} />
              </label>
              <label className="pf-field">
                <span>Seed (facoltativo)</span>
                <input type="number" min="0" className="pf-plain" value={form.seed} placeholder="vuoto = variante nuova"
                  onChange={(e) => setF('seed', e.target.value)} />
              </label>
              <p className="pf-hint">Con lo stesso seed e gli stessi parametri ottieni sempre la stessa pianta.</p>
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
                {isLoading ? 'Sto disegnando…' : 'Genera planimetria'}
              </button>
              <button type="button" className="pf-secondary" disabled={isLoading} onClick={() => run({ variant: true })}
                title="Stesse misure, nuova disposizione" aria-label="Nuova variante">
                <Shuffle size={17} />
              </button>
            </div>
          </div>
        </aside>

        {/* ───────── Area di lavoro Centrale ───────── */}
        <main className="pf-stage">
          <div className="pf-toolbar">
            <div className="pf-group" role="group" aria-label="Livelli">
              <button type="button" className={`pf-tool ${layers.furniture ? 'is-on' : ''}`} aria-pressed={layers.furniture}
                onClick={() => toggle('furniture')}><Armchair size={15} /> Arredi</button>
              <button type="button" className={`pf-tool ${layers.labels ? 'is-on' : ''}`} aria-pressed={layers.labels}
                onClick={() => toggle('labels')}><Tag size={15} /> Nomi</button>
              <button type="button" className={`pf-tool ${layers.dims ? 'is-on' : ''}`} aria-pressed={layers.dims}
                onClick={() => toggle('dims')}><Ruler size={15} /> Quote</button>
              <button type="button" className={`pf-tool ${layers.grid ? 'is-on' : ''}`} aria-pressed={layers.grid}
                onClick={() => toggle('grid')}><LayoutGrid size={15} /> Griglia</button>
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
              <button type="button" className="pf-tool" disabled={!plan || !backendUrl} onClick={exportDxf} style={{ color: '#0071e3', fontWeight: '500' }}>
                <Briefcase size={15} /> DXF (CAD)
              </button>
              <button type="button" className="pf-tool" disabled={!plan} onClick={exportJson}><FileJson size={15} /> JSON</button>
            </div>
          </div>

          <div className="pf-canvas" ref={stageRef}>
            {plan ? (
              <div className="pf-sheet" key={current.id}>
                <PlanSvg
                  plan={plan} layers={layers} hoverId={hoverId} selectedId={selectedId}
                  onHover={setHoverId} onSelect={setSelectedId} svgRef={svgRef} zoom={z}
                  typeLabel={TYPE_NAME[current.meta?.type]}
                />
              </div>
            ) : (
              !isLoading && (
                <div className="pf-empty">
                  <svg viewBox="0 0 240 150" width="240" height="150" aria-hidden="true">
                    <path d="M20 20h120v50h80v60H20z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
                    <path d="M20 70h60M80 70v60M140 70v60" fill="none" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.5" />
                    <path d="M92 130a14 14 0 0 1 14-14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 3" />
                  </svg>
                  <h3>Nessuna pianta, per ora</h3>
                  <p>Scegli le misure e la sagoma a sinistra, poi genera: ogni pianta può avere una forma diversa.</p>
                  {!backendUrl && (
                    <button type="button" className="pf-link" onClick={() => setConnOpen(true)}>Collega il motore</button>
                  )}
                </div>
              )
            )}

            {isLoading && (
              <div className="pf-loading" role="status" aria-live="polite">
                <div className="pf-loader">
                  <div className="pf-loader-bar"><i /></div>
                  <strong>{LOADING_STEPS[loadingStep]}</strong>
                  <span>{slow ? 'Il server si sta svegliando: la prima richiesta può richiedere un minuto.' : 'Di solito servono pochi secondi.'}</span>
                </div>
              </div>
            )}
            {flash && <div className="pf-flash"><Check size={14} /> {flash}</div>}
          </div>
        </main>

        {/* ───────── Dettagli e Cronologia Destra ───────── */}
        <aside className="pf-inspector">
          {plan && stats ? (
            <>
              <section className="pf-sec">
                <h2>Pianta {SHAPE_NAME[plan.shape] || 'rettangolare'}</h2>
                <dl className="pf-facts">
                  <div><dt>Superficie lorda</dt><dd>{fmt(stats.gross)} m²</dd></div>
                  <div><dt>Camere da letto</dt><dd>{stats.bedrooms}</dd></div>
                  <div><dt>Bagni</dt><dd>{stats.baths}</dd></div>
                  <div><dt>Porte / finestre</dt><dd>{stats.doors} / {stats.windows}</dd></div>
                </dl>
                <div className="pf-seedrow">
                  <span>Variante <b>#{plan.seed}</b></span>
                  <div>
                    <button type="button" className="pf-mini" onClick={() => copy(plan.seed, 'Seed copiato')} title="Copia il seed">
                      <Copy size={13} /> Copia
                    </button>
                    <button type="button" className="pf-mini" onClick={() => { setF('seed', plan.seed); say('Variante bloccata'); }}
                      title="Usa questo seed nelle prossime generazioni">
                      <Lock size={13} /> Blocca
                    </button>
                  </div>
                </div>
              </section>

              <section className="pf-sec">
                <h2>Locali</h2>
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
                {selectedRoom && (
                  <p className="pf-hint pf-selected">
                    {selectedRoom.name}: {fmtM(selectedRoom.w)} × {fmtM(selectedRoom.h)} m, {' '}
                    {plan.furniture.filter((f) => f.room === selectedRoom.id).length} arredi.
                  </p>
                )}
              </section>

              {plan.notes?.length > 0 && (
                <section className="pf-sec">
                  <h2>Avvisi</h2>
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
              <h2>Dettagli</h2>
              <p className="pf-hint">Qui compaiono superficie, locali e avvisi della pianta generata. Passa il mouse su una stanza per evidenziarla.</p>
            </section>
          )}

          {/* Cronologia fissa e organizzata a griglia a fine colonna */}
          {history.length > 0 && (
            <section className="pf-sec" style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
              <div className="pf-history-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h2 style={{ margin: 0 }}>Cronologia</h2>
                <button type="button" className="pf-link" onClick={() => setHistory(current ? [current] : [])}>
                  <Trash2 size={13} /> Svuota
                </button>
              </div>
              <div className="pf-history-list" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {history.map((h) => (
                  <button key={h.id} type="button" className={`pf-thumb ${current?.id === h.id ? 'is-on' : ''}`}
                    onClick={() => restore(h)}
                    title={`${fmtM(h.plan.dimensions.width)} × ${fmtM(h.plan.dimensions.length)} m, ${SHAPE_NAME[h.plan.shape] || ''}`}>
                    <PlanSvg plan={h.plan} layers={{ furniture: false, labels: false, dims: false, grid: false }} thumb />
                    <span>{SHAPE_NAME[h.plan.shape] || 'rettangolare'} · #{h.plan.seed}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}