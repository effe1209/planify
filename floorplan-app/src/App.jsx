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
  Unlock,
  Check,
  ChevronDown,
  Image as ImageIcon,
  FileJson,
  BedDouble,
  PenTool,
  Upload,
  RotateCw,
  Plus,
  X,
  Sliders,
  Paintbrush,
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
  { id: 'hotel-room', label: 'Camera Hotel', Icon: BedDouble },
];
const TYPE_NAME = {
  apartment: 'Appartamento',
  'open-space': 'Open space',
  office: 'Ufficio',
  'hotel-room': 'Camera Hotel',
};

const STYLES = [
  { id: 'modern', label: 'Moderno', bg: '#e0f2fe', desc: 'Minimal e contemporaneo' },
  { id: 'classic', label: 'Classico', bg: '#fef3c7', desc: 'Caldo e tradizionale' },
  { id: 'nordic', label: 'Nordico', bg: '#e8f5e9', desc: 'Legno chiaro e salvia' },
  { id: 'industrial', label: 'Industriale', bg: '#cfd8dc', desc: 'Loft e cemento' },
  { id: 'japandi', label: 'Japandi', bg: '#f7f4ea', desc: 'Zen e naturale' },
  { id: 'luxury', label: 'Luxury', bg: '#f9f6f0', desc: 'Elegante e raffinato' },
];
const STYLE_NAME = {
  modern: 'Moderno',
  classic: 'Classico',
  nordic: 'Nordico',
  industrial: 'Industriale',
  japandi: 'Japandi',
  luxury: 'Luxury',
};

const PRESETS = [
  { label: 'Bilocale', w: 8, l: 6.5, type: 'apartment', rooms: 2 },
  { label: 'Trilocale', w: 10, l: 8, type: 'apartment', rooms: 3 },
  { label: 'Quadrilocale', w: 13, l: 9.5, type: 'apartment', rooms: 4 },
  { label: 'Monolocale', w: 6.5, l: 5.5, type: 'open-space', rooms: 1 },
  { label: 'Ufficio', w: 14, l: 10, type: 'office', rooms: 3 },
  { label: 'Camera Std', w: 4.2, l: 6.0, type: 'hotel-room', rooms: 1 },
  { label: 'Camera Deluxe', w: 5.0, l: 6.8, type: 'hotel-room', rooms: 1 },
  { label: 'Suite Hotel', w: 6.0, l: 8.0, type: 'hotel-room', rooms: 1 },
];

const FLOOR_PALETTES = [
  { name: 'Rovere Chiaro', color: '#fdf6e3', floor: 'wood' },
  { name: 'Parquet Noce', color: '#efe0c8', floor: 'wood' },
  { name: 'Ceramica Bianca', color: '#f8fafc', floor: 'tile' },
  { name: 'Cotto Caldo', color: '#fef3c7', floor: 'tile' },
  { name: 'Resina Grigia', color: '#e2e8f0', floor: 'carpet' },
  { name: 'Azzurro Spa', color: '#e0f2fe', floor: 'tile' },
  { name: 'Verde Salvia', color: '#e8f5e9', floor: 'carpet' },
  { name: 'Marmo Luxury', color: '#faf7f5', floor: 'tile' },
];

const FURNITURE_LABELS = {
  bed: 'Letto Matrimoniale',
  sofa: 'Divano',
  table: 'Tavolo con sedie',
  desk: 'Scrivania con sedia',
  tv: 'Mobile TV a parete',
  wardrobe: 'Armadio guardaroba',
  kitchen_counter: 'Piano cucina',
  bathtub: 'Vasca da bagno',
  shower: 'Box doccia',
  toilet: 'WC',
  sink: 'Lavabo',
  minibar: 'Minibar / Mobile bar',
};

const LOADING_STEPS = [
  'Calcolo la sagoma e la volumetria…',
  'Traccio pareti e distribuisco gli ambienti…',
  'Inserisco porte, finestre e dotazioni di arredo…',
  'Controllo passaggi, circolazione e conformità…',
];

const INK = '#14181f';
const FONT = "'Figtree', system-ui, -apple-system, 'Segoe UI', sans-serif";
const MARGIN = 78;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmt = (n, d = 1) => Number(n).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtM = (n) => Number(n).toLocaleString('it-IT', { maximumFractionDigits: 2 });
const snap = (v, s = 0.05) => Math.round(v / s) * s;

function sheetBox(plan, thumb) {
  if (thumb) return { w: plan.svgWidth + 12, h: plan.svgHeight + 12, ox: 6, oy: 6 };
  const w = Math.max(plan.svgWidth + MARGIN * 2, 500);
  return { w, h: MARGIN + plan.svgHeight + 100, ox: (w - plan.svgWidth) / 2, oy: MARGIN };
}

/* ────────────────────────────────────────────────────────────────────────────
   Arredi Grafici SVG
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
  bathtub: (w, h) => (
    <>
      <rect width={w} height={h} rx={4} fill="#e3eefb" stroke={F_STROKE} strokeWidth="1.1" />
      <rect x={3} y={3} width={w - 6} height={h - 6} rx={3} fill="#d0e8f7" stroke={F_SOFT} />
      <ellipse cx={w / 2} cy={h * 0.72} rx={Math.max(4, w * 0.28)} ry={Math.max(3, h * 0.18)} fill="none" stroke={F_SOFT} strokeWidth="0.8" />
      <circle cx={w / 2} cy={h * 0.18} r={2.5} fill={F_STROKE} />
    </>
  ),
  minibar: (w, h) => (
    <>
      <rect width={w} height={h} rx={2} fill="#e8e0d5" stroke={F_STROKE} strokeWidth="1.1" />
      <rect x={2} y={2} width={w - 4} height={h * 0.45} rx={1} fill="#d4c9bb" stroke={F_SOFT} strokeWidth="0.7" />
      <rect x={w * 0.15} y={h * 0.55} width={w * 0.3} height={h * 0.35} rx={1} fill="#c4b8a8" stroke={F_SOFT} strokeWidth="0.7" />
      <rect x={w * 0.55} y={h * 0.55} width={w * 0.3} height={h * 0.35} rx={1} fill="#c4b8a8" stroke={F_SOFT} strokeWidth="0.7" />
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
  kitchen: 'tile', bath: 'tile', wc: 'tile', hotel_room: 'wood',
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
              fill="#1f4fd8" fillOpacity={r.id === selectedId ? 0.16 : 0.08}
              stroke={r.id === selectedId ? '#1f4fd8' : 'none'} strokeWidth={r.id === selectedId ? 2 : 0} pointerEvents="none" />
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
   Client-side DXF Parser Fallback
   ──────────────────────────────────────────────────────────────────────────── */
function parseDxfClientSide(dxfText, style = 'modern') {
  const lines = dxfText.split(/\r?\n/).map((l) => l.trim());
  const polylines = [];
  const lineSegs = [];
  let curType = null;
  let curLayer = '';
  let curPts = [];
  let curP = {};

  for (let i = 0; i < lines.length; i += 2) {
    const code = parseInt(lines[i], 10);
    const val = lines[i + 1] || '';
    if (isNaN(code)) continue;

    if (code === 0) {
      if (curType === 'LWPOLYLINE' && curPts.length >= 3) {
        polylines.push({ layer: curLayer, pts: curPts });
      } else if (curType === 'LINE' && curP[10] !== undefined && curP[20] !== undefined && curP[11] !== undefined && curP[21] !== undefined) {
        lineSegs.push({ p1: [curP[10], curP[20]], p2: [curP[11], curP[21]] });
      }
      curType = val.toUpperCase();
      curLayer = '';
      curPts = [];
      curP = {};
    } else if (curType) {
      if (code === 8) curLayer = val;
      else if ([10, 20, 11, 21].includes(code)) {
        const fval = parseFloat(val);
        if (!isNaN(fval)) {
          curP[code] = fval;
          if (curType === 'LWPOLYLINE') {
            if (code === 10) curPts.push([fval, 0]);
            else if (code === 20 && curPts.length > 0) curPts[curPts.length - 1][1] = fval;
          }
        }
      }
    }
  }

  const allX = [];
  const allY = [];
  polylines.forEach((poly) => poly.pts.forEach(([x, y]) => { allX.push(x); allY.push(y); }));
  lineSegs.forEach((seg) => { allX.push(seg.p1[0], seg.p2[0]); allY.push(seg.p1[1], seg.p2[1]); });

  let minX = allX.length ? Math.min(...allX) : 0;
  let maxX = allX.length ? Math.max(...allX) : 10;
  let minY = allY.length ? Math.min(...allY) : 0;
  let maxY = allY.length ? Math.max(...allY) : 8;

  let rawW = maxX - minX;
  let rawH = maxY - minY;
  let scaleFactor = 1.0;
  if (rawW > 500 || rawH > 500) scaleFactor = 0.001;
  else if (rawW > 50 || rawH > 50) scaleFactor = 0.01;

  const W = clamp(Math.round(rawW * scaleFactor * 10) / 10, 5, 30);
  const L = clamp(Math.round(rawH * scaleFactor * 10) / 10, 5, 30);
  const SCALE = 45;
  const WALL = 0.20;

  const detectedRooms = [];
  polylines.forEach((poly) => {
    const xs = poly.pts.map((p) => (p[0] - minX) * scaleFactor);
    const ys = poly.pts.map((p) => (p[1] - minY) * scaleFactor);
    const rx0 = Math.min(...xs);
    const rx1 = Math.max(...xs);
    const ry0 = Math.min(...ys);
    const ry1 = Math.max(...ys);
    const rw = rx1 - rx0;
    const rh = ry1 - ry0;
    if (rw >= 1.5 && rh >= 1.5 && rw <= W && rh <= L) {
      detectedRooms.push({ x: rx0, y: ry0, w: rw, h: rh });
    }
  });

  const rooms = [];
  const furniture = [];
  const doors = [];
  const windows = [];

  if (detectedRooms.length >= 2) {
    detectedRooms.forEach((dr, i) => {
      const area = dr.w * dr.h;
      let name = `Stanza ${i + 1}`;
      let kind = 'bed';
      let color = '#f8fafc';
      if (area >= 18 || i === 0) { name = 'Soggiorno con Cucina'; kind = 'living_kitchen'; color = '#f1f5f9'; }
      else if (area <= 5.5) { name = 'Bagno'; kind = 'bath'; color = '#e0f2fe'; }
      else { name = i === 1 ? 'Camera Matrimoniale' : 'Camera'; kind = 'bed'; color = '#f8fafc'; }

      const rid = i + 1;
      rooms.push({ id: rid, name, kind, x: dr.x, y: dr.y, w: dr.w, h: dr.h, area: Math.round(area * 10) / 10, zone: rid, color });

      if (kind === 'living_kitchen') {
        furniture.push({ type: 'sofa', x: dr.x + 0.4, y: dr.y + dr.h - 1.2, w: 1.8, h: 0.9, rot: 0, facing: 'N', room: rid });
        furniture.push({ type: 'tv', x: dr.x + 0.4, y: dr.y + 0.2, w: 1.4, h: 0.25, rot: 0, facing: 'S', room: rid });
        furniture.push({ type: 'kitchen_counter', x: dr.x + dr.w - 1.8, y: dr.y + 0.2, w: 1.8, h: 0.6, rot: 0, facing: 'S', room: rid });
        furniture.push({ type: 'table', x: dr.x + dr.w / 2 - 0.7, y: dr.y + dr.h / 2 - 0.4, w: 1.4, h: 0.8, rot: 0, facing: 'S', room: rid });
      } else if (kind === 'bed') {
        furniture.push({ type: 'bed', x: dr.x + 0.4, y: dr.y + 0.2, w: 1.8, h: 2.0, rot: 0, facing: 'S', room: rid });
        furniture.push({ type: 'wardrobe', x: dr.x + dr.w - 1.6, y: dr.y + dr.h - 0.8, w: 1.6, h: 0.6, rot: 0, facing: 'N', room: rid });
      } else if (kind === 'bath') {
        furniture.push({ type: 'shower', x: dr.x + 0.2, y: dr.y + 0.2, w: 0.9, h: 0.9, rot: 0, facing: 'S', room: rid });
        furniture.push({ type: 'toilet', x: dr.x + dr.w - 0.6, y: dr.y + 0.2, w: 0.4, h: 0.65, rot: 0, facing: 'S', room: rid });
        furniture.push({ type: 'sink', x: dr.x + dr.w - 0.7, y: dr.y + dr.h - 0.6, w: 0.6, h: 0.5, rot: 0, facing: 'N', room: rid });
      }
    });
  } else {
    const xw = Math.round(W * 0.55 * 10) / 10;
    const bh = Math.round(L * 0.38 * 10) / 10;
    rooms.push({ id: 1, name: 'Soggiorno con Cucina', kind: 'living_kitchen', x: 0, y: 0, w: xw, h: L, area: Math.round(xw * L * 10) / 10, zone: 1, color: '#f1f5f9' });
    rooms.push({ id: 2, name: 'Camera Matrimoniale', kind: 'bed', x: xw, y: 0, w: W - xw, h: L - bh, area: Math.round((W - xw) * (L - bh) * 10) / 10, zone: 2, color: '#f8fafc' });
    rooms.push({ id: 3, name: 'Bagno', kind: 'bath', x: xw, y: L - bh, w: W - xw, h: bh, area: Math.round((W - xw) * bh * 10) / 10, zone: 3, color: '#e0f2fe' });

    furniture.push({ type: 'sofa', x: 0.4, y: L - 1.2, w: 1.8, h: 0.9, rot: 0, facing: 'N', room: 1 });
    furniture.push({ type: 'tv', x: 0.4, y: 0.2, w: 1.4, h: 0.25, rot: 0, facing: 'S', room: 1 });
    furniture.push({ type: 'kitchen_counter', x: xw - 2.0, y: 0.2, w: 1.8, h: 0.6, rot: 0, facing: 'S', room: 1 });
    furniture.push({ type: 'table', x: xw / 2 - 0.7, y: L / 2 - 0.4, w: 1.4, h: 0.8, rot: 0, facing: 'S', room: 1 });
    furniture.push({ type: 'bed', x: xw + 0.4, y: 0.2, w: 1.8, h: 2.0, rot: 0, facing: 'S', room: 2 });
    furniture.push({ type: 'wardrobe', x: W - 1.8, y: L - bh - 0.8, w: 1.6, h: 0.6, rot: 0, facing: 'N', room: 2 });
    furniture.push({ type: 'shower', x: xw + 0.2, y: L - 1.0, w: 0.9, h: 0.9, rot: 0, facing: 'N', room: 3 });
    furniture.push({ type: 'toilet', x: W - 0.6, y: L - bh + 0.2, w: 0.4, h: 0.65, rot: 0, facing: 'S', room: 3 });
    furniture.push({ type: 'sink', x: W - 0.7, y: L - 0.6, w: 0.6, h: 0.5, rot: 0, facing: 'N', room: 3 });
  }

  const walls = [
    { x: 0, y: 0, w: W, h: WALL },
    { x: 0, y: L - WALL, w: W, h: WALL },
    { x: 0, y: 0, w: WALL, h: L },
    { x: W - WALL, y: 0, w: WALL, h: L },
  ];
  rooms.forEach((r) => {
    if (r.x > 0.1) walls.push({ x: r.x - WALL / 2, y: r.y, w: WALL, h: r.h });
    if (r.y > 0.1) walls.push({ x: r.x, y: r.y - WALL / 2, w: r.w, h: WALL });
  });

  doors.push({ x: 0.5, y: L - WALL, w: 0.9, rot: 0, openDir: -1, entrance: true });
  rooms.forEach((r) => {
    if (r.id !== 1) {
      doors.push({ x: r.x + 0.3, y: r.y, w: 0.8, rot: 0, openDir: 1, entrance: false });
    }
    windows.push({ x: r.x + r.w / 2 - 0.7, y: r.y === 0 ? 0 : L - WALL, w: 1.4, rot: 0 });
  });

  return {
    dimensions: { width: W, length: L },
    svgWidth: W * SCALE,
    svgHeight: L * SCALE,
    scale: SCALE,
    wallThickness: WALL * SCALE,
    shape: 'rect',
    seed: Math.floor(Math.random() * 900000) + 100000,
    stats: {
      grossArea: Math.round(W * L * 10) / 10,
      boundingBox: Math.round(W * L * 10) / 10,
      rooms: rooms.length,
      bedrooms: rooms.filter((r) => r.kind === 'bed').length,
      bathrooms: rooms.filter((r) => r.kind === 'bath').length,
      doors: doors.length,
      windows: windows.length,
      furniture: furniture.length,
    },
    notches: [],
    rooms,
    walls,
    doors,
    windows,
    furniture,
    notes: ['Planimetria importata da DXF ed arredata con successo.'],
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Componente Sketch / Disegno a Mano Libera
   ──────────────────────────────────────────────────────────────────────────── */
function SketchBoard({ onGeneratePlan, onClose }) {
  const [tool, setTool] = useState('box'); // 'box' | 'pen'
  const [roomKind, setRoomKind] = useState('living');
  const [rooms, setRooms] = useState([]);
  const [freeLines, setFreeLines] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [startPt, setStartPt] = useState(null);
  const [curBox, setCurBox] = useState(null);
  const canvasRef = useRef(null);

  const ROOM_COLORS = {
    living: '#f1f5f9',
    bed: '#f8fafc',
    bath: '#e0f2fe',
    kitchen: '#fef3c7',
    study: '#f5ecd7',
  };
  const ROOM_NAMES = {
    living: 'Soggiorno',
    bed: 'Camera da Letto',
    bath: 'Bagno',
    kitchen: 'Cucina',
    study: 'Studio',
  };

  const getCanvasPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handlePointerDown = (e) => {
    const pos = getCanvasPos(e);
    setDrawing(true);
    setStartPt(pos);
    if (tool === 'pen') {
      setFreeLines((prev) => [...prev, [pos]]);
    } else {
      setCurBox({ x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y });
    }
  };

  const handlePointerMove = (e) => {
    if (!drawing) return;
    const pos = getCanvasPos(e);
    if (tool === 'pen') {
      setFreeLines((prev) => {
        const last = prev[prev.length - 1];
        return [...prev.slice(0, -1), [...last, pos]];
      });
    } else {
      setCurBox((prev) => prev ? { ...prev, x1: pos.x, y1: pos.y } : null);
    }
  };

  const handlePointerUp = () => {
    if (!drawing) return;
    setDrawing(false);
    if (tool === 'box' && curBox) {
      const minX = Math.min(curBox.x0, curBox.x1);
      const maxX = Math.max(curBox.x0, curBox.x1);
      const minY = Math.min(curBox.y0, curBox.y1);
      const maxY = Math.max(curBox.y0, curBox.y1);
      const w = maxX - minX;
      const h = maxY - minY;
      if (w > 30 && h > 30) {
        setRooms((prev) => [
          ...prev,
          {
            id: Date.now(),
            name: ROOM_NAMES[roomKind] || 'Stanza',
            kind: roomKind,
            x: minX,
            y: minY,
            w,
            h,
          },
        ]);
      }
      setCurBox(null);
    }
  };

  const convertSketchToPlan = () => {
    const SCALE = 45;
    const WALL = 0.20;

    let targetRooms = [];
    if (rooms.length > 0) {
      const allX = rooms.flatMap((r) => [r.x, r.x + r.w]);
      const allY = rooms.flatMap((r) => [r.y, r.y + r.h]);
      const minX = Math.min(...allX);
      const maxX = Math.max(...allX);
      const minY = Math.min(...allY);
      const maxY = Math.max(...allY);
      const pxW = maxX - minX;
      const pxH = maxY - minY;

      // Realistic target dimension (e.g. 10m x 8m)
      const targetW = clamp(Math.round((pxW / 40) * 10) / 10, 6, 20);
      const targetL = clamp(Math.round((pxH / 40) * 10) / 10, 5, 20);
      const sx = targetW / pxW;
      const sy = targetL / pxH;

      targetRooms = rooms.map((r, i) => {
        const rw = clamp(Math.round(r.w * sx * 10) / 10, 1.8, targetW);
        const rh = clamp(Math.round(r.h * sy * 10) / 10, 1.8, targetL);
        const rx = clamp(Math.round((r.x - minX) * sx * 10) / 10, 0, targetW - rw);
        const ry = clamp(Math.round((r.y - minY) * sy * 10) / 10, 0, targetL - rh);
        return {
          id: i + 1,
          name: r.name,
          kind: r.kind,
          x: rx,
          y: ry,
          w: rw,
          h: rh,
          area: Math.round(rw * rh * 10) / 10,
          zone: i + 1,
          color: ROOM_COLORS[r.kind] || '#f8fafc',
        };
      });

      const W = targetW;
      const L = targetL;
      const walls = [
        { x: 0, y: 0, w: W, h: WALL },
        { x: 0, y: L - WALL, w: W, h: WALL },
        { x: 0, y: 0, w: WALL, h: L },
        { x: W - WALL, y: 0, w: WALL, h: L },
      ];
      targetRooms.forEach((r) => {
        if (r.x > 0.1) walls.push({ x: r.x - WALL / 2, y: r.y, w: WALL, h: r.h });
        if (r.y > 0.1) walls.push({ x: r.x, y: r.y - WALL / 2, w: r.w, h: WALL });
      });

      const furniture = [];
      targetRooms.forEach((r) => {
        if (r.kind === 'living' || r.kind === 'living_kitchen') {
          furniture.push({ type: 'sofa', x: r.x + 0.3, y: r.y + r.h - 1.1, w: 1.8, h: 0.9, rot: 0, facing: 'N', room: r.id });
          furniture.push({ type: 'tv', x: r.x + 0.3, y: r.y + 0.2, w: 1.4, h: 0.25, rot: 0, facing: 'S', room: r.id });
          furniture.push({ type: 'table', x: r.x + r.w / 2 - 0.7, y: r.y + r.h / 2 - 0.4, w: 1.4, h: 0.8, rot: 0, facing: 'S', room: r.id });
        } else if (r.kind === 'bed') {
          furniture.push({ type: 'bed', x: r.x + 0.3, y: r.y + 0.2, w: 1.8, h: 2.0, rot: 0, facing: 'S', room: r.id });
          furniture.push({ type: 'wardrobe', x: r.x + r.w - 1.6, y: r.y + r.h - 0.8, w: 1.6, h: 0.6, rot: 0, facing: 'N', room: r.id });
        } else if (r.kind === 'bath') {
          furniture.push({ type: 'shower', x: r.x + 0.2, y: r.y + 0.2, w: 0.9, h: 0.9, rot: 0, facing: 'S', room: r.id });
          furniture.push({ type: 'toilet', x: r.x + r.w - 0.5, y: r.y + 0.2, w: 0.4, h: 0.65, rot: 0, facing: 'S', room: r.id });
          furniture.push({ type: 'sink', x: r.x + r.w - 0.6, y: r.y + r.h - 0.5, w: 0.6, h: 0.5, rot: 0, facing: 'N', room: r.id });
        }
      });

      const doors = [{ x: 0.4, y: L - WALL, w: 0.9, rot: 0, openDir: -1, entrance: true }];
      targetRooms.forEach((r) => {
        if (r.id !== 1) doors.push({ x: r.x + 0.3, y: r.y, w: 0.8, rot: 0, openDir: 1, entrance: false });
      });
      const windows = targetRooms.map((r) => ({
        x: r.x + r.w / 2 - 0.7,
        y: r.y === 0 ? 0 : L - WALL,
        w: 1.4,
        rot: 0,
      }));

      onGeneratePlan({
        dimensions: { width: W, length: L },
        svgWidth: W * SCALE,
        svgHeight: L * SCALE,
        scale: SCALE,
        wallThickness: WALL * SCALE,
        shape: 'rect',
        seed: Math.floor(Math.random() * 900000) + 100000,
        stats: {
          grossArea: Math.round(W * L * 10) / 10,
          boundingBox: Math.round(W * L * 10) / 10,
          rooms: targetRooms.length,
          bedrooms: targetRooms.filter((r) => r.kind === 'bed').length,
          bathrooms: targetRooms.filter((r) => r.kind === 'bath').length,
          doors: doors.length,
          windows: windows.length,
          furniture: furniture.length,
        },
        notches: [],
        rooms: targetRooms,
        walls,
        doors,
        windows,
        furniture,
        notes: ['Planimetria creata dallo schizzo a mano ed arredata automaticamente.'],
      });
    } else {
      // Fallback clean plan
      const defaultPlan = parseDxfClientSide('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF');
      defaultPlan.notes = ['Planimetria generata con arredo automatico da bozza.'];
      onGeneratePlan(defaultPlan);
    }
  };

  return (
    <div className="pf-sketch-wrap">
      <div className="pf-sketch-bar">
        <div className="pf-sketch-tools">
          <button type="button" className={`pf-sketch-tool ${tool === 'box' ? 'is-on' : ''}`} onClick={() => setTool('box')}>
            <Maximize2 size={15} /> Rettangolo Stanza
          </button>
          <button type="button" className={`pf-sketch-tool ${tool === 'pen' ? 'is-on' : ''}`} onClick={() => setTool('pen')}>
            <PenTool size={15} /> Mano Libera
          </button>
        </div>

        {tool === 'box' && (
          <div className="pf-group">
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', marginRight: '6px' }}>Stanza:</span>
            {['living', 'bed', 'bath', 'kitchen'].map((k) => (
              <button key={k} type="button" className={`pf-tool ${roomKind === k ? 'is-on' : ''}`} onClick={() => setRoomKind(k)}>
                {ROOM_NAMES[k]}
              </button>
            ))}
          </div>
        )}

        <button type="button" className="pf-tool" onClick={() => { setRooms([]); setFreeLines([]); }}>
          <Trash2 size={14} /> Pulisci
        </button>

        <div className="pf-spacer" />

        <button type="button" className="pf-tool" onClick={onClose}>
          <X size={15} /> Annulla
        </button>
        <button type="button" className="pf-sketch-action" onClick={convertSketchToPlan}>
          <Sparkles size={16} /> Genera Planimetria Arredata
        </button>
      </div>

      <div
        className="pf-sketch-canvas-area"
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ cursor: tool === 'pen' ? 'crosshair' : 'cell', touchAction: 'none' }}
      >
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <pattern id="sketch-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeOpacity="0.08" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#sketch-grid)" />

          {/* Linee a mano libera */}
          {freeLines.map((line, idx) => (
            <polyline
              key={idx}
              points={line.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#1f4fd8"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* Stanze disegnate */}
          {rooms.map((r) => (
            <g key={r.id}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={ROOM_COLORS[r.kind]} stroke="#1f4fd8" strokeWidth="2" rx="4" />
              <text x={r.x + r.w / 2} y={r.y + r.h / 2} textAnchor="middle" fontSize="12" fontWeight="600" fill="#1f4fd8">
                {r.name}
              </text>
              <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 16} textAnchor="middle" fontSize="10" fill="#64748b">
                {Math.round((r.w / 40) * 10) / 10} × {Math.round((r.h / 40) * 10) / 10} m
              </text>
            </g>
          ))}

          {/* Box in corso di trascinamento */}
          {curBox && (
            <rect
              x={Math.min(curBox.x0, curBox.x1)}
              y={Math.min(curBox.y0, curBox.y1)}
              width={Math.abs(curBox.x1 - curBox.x0)}
              height={Math.abs(curBox.y1 - curBox.y0)}
              fill="rgba(31, 79, 216, 0.1)"
              stroke="#1f4fd8"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
          )}
        </svg>

        {rooms.length === 0 && freeLines.length === 0 && !drawing && (
          <div className="pf-empty" style={{ pointerEvents: 'none' }}>
            <PenTool size={36} color="var(--accent)" />
            <h3>Traccia il tuo spazio</h3>
            <p>Trascina il mouse per creare stanze o disegna a mano libera i muri, poi clicca «Genera Planimetria» per arredarla automaticamente.</p>
          </div>
        )}
      </div>
    </div>
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
    width: 10, length: 8, roomType: 'apartment', rooms: 3, style: 'modern', shape: 'auto', seed: '',
  });
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Nuovo seed automatico ad ogni generazione di default
  const [autoSeed, setAutoSeed] = useState(true);

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

  // Modalità Schizzo a mano libera
  const [isDrawMode, setIsDrawMode] = useState(false);

  // Arredo da aggiungere per personalizzazione
  const [selectedNewFurn, setSelectedNewFurn] = useState('bed');

  const svgRef = useRef(null);
  const stageRef = useRef(null);
  const dxfInputRef = useRef(null);
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
  const roomFurniture = plan && selectedRoom ? plan.furniture.filter((f) => f.room === selectedRoom.id) : [];
  const totalArea = plan ? plan.rooms.reduce((a, r) => a + (r.area ?? r.w * r.h), 0) : 0;

  const say = (msg) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 1800);
  };

  /* ────────────────────────────────────────────────────────────────────────────
     Personalizzazione Spazi Singoli
     ──────────────────────────────────────────────────────────────────────────── */
  const updateRoomName = (roomId, newName) => {
    if (!current?.plan) return;
    setCurrent((prev) => ({
      ...prev,
      plan: {
        ...prev.plan,
        rooms: prev.plan.rooms.map((r) => (r.id === roomId ? { ...r, name: newName } : r)),
      },
    }));
  };

  const updateRoomKind = (roomId, newKind) => {
    if (!current?.plan) return;
    setCurrent((prev) => ({
      ...prev,
      plan: {
        ...prev.plan,
        rooms: prev.plan.rooms.map((r) => (r.id === roomId ? { ...r, kind: newKind } : r)),
      },
    }));
  };

  const updateRoomColor = (roomId, newColor) => {
    if (!current?.plan) return;
    setCurrent((prev) => ({
      ...prev,
      plan: {
        ...prev.plan,
        rooms: prev.plan.rooms.map((r) => (r.id === roomId ? { ...r, color: newColor } : r)),
      },
    }));
  };

  const removeFurniture = (item) => {
    if (!current?.plan) return;
    setCurrent((prev) => ({
      ...prev,
      plan: {
        ...prev.plan,
        furniture: prev.plan.furniture.filter((f) => f !== item),
      },
    }));
    say('Arredo rimosso');
  };

  const rotateFurniture = (item) => {
    if (!current?.plan) return;
    const nextFacing = { S: 'W', W: 'N', N: 'E', E: 'S' };
    setCurrent((prev) => ({
      ...prev,
      plan: {
        ...prev.plan,
        furniture: prev.plan.furniture.map((f) => {
          if (f === item) {
            return { ...f, facing: nextFacing[f.facing || 'S'] || 'S' };
          }
          return f;
        }),
      },
    }));
  };

  const addFurnitureToRoom = (roomId, type) => {
    if (!current?.plan) return;
    const room = current.plan.rooms.find((r) => r.id === roomId);
    if (!room) return;

    const SIZES = {
      bed: { w: 1.8, h: 2.0 },
      sofa: { w: 1.8, h: 0.9 },
      table: { w: 1.4, h: 0.8 },
      desk: { w: 1.2, h: 0.6 },
      tv: { w: 1.4, h: 0.25 },
      wardrobe: { w: 1.6, h: 0.6 },
      kitchen_counter: { w: 1.8, h: 0.6 },
      bathtub: { w: 1.5, h: 0.75 },
      shower: { w: 0.9, h: 0.9 },
      toilet: { w: 0.4, h: 0.65 },
      sink: { w: 0.6, h: 0.5 },
      minibar: { w: 0.8, h: 0.5 },
    };
    const sz = SIZES[type] || { w: 1.0, h: 0.8 };
    const existingInRoom = current.plan.furniture.filter((f) => f.room === roomId);
    const offset = (existingInRoom.length * 0.3) % Math.max(0.2, room.w - sz.w);

    const newItem = {
      type,
      x: clamp(snap(room.x + 0.3 + offset), room.x, room.x + Math.max(0, room.w - sz.w)),
      y: clamp(snap(room.y + 0.3 + offset), room.y, room.y + Math.max(0, room.h - sz.h)),
      w: sz.w,
      h: sz.h,
      rot: 0,
      facing: 'S',
      room: roomId,
    };

    setCurrent((prev) => ({
      ...prev,
      plan: {
        ...prev.plan,
        furniture: [...prev.plan.furniture, newItem],
      },
    }));
    say(`${FURNITURE_LABELS[type] || type} aggiunto!`);
  };

  /* ────────────────────────────────────────────────────────────────────────────
     Generazione Planimetria
     ──────────────────────────────────────────────────────────────────────────── */
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
      setError('Inserisci larghezza e lunghezza valide.');
      return;
    }

    // Calcolo seed: nuovo seed diverso ogni volta a meno che non sia bloccato esplicitamente
    let requestSeed = undefined;
    const seedTxt = String(form.seed).trim();
    if (!autoSeed && !variant && seedTxt !== '' && Number.isInteger(Number(seedTxt)) && Number(seedTxt) >= 0) {
      requestSeed = Number(seedTxt);
    } else {
      requestSeed = Math.floor(Math.random() * 899999) + 100000;
    }

    const body = {
      width: clamp(w, 3.5, 60),
      length: clamp(l, 3.5, 60),
      room_type: form.roomType,
      num_rooms: Number(form.rooms),
      style: form.style,
      shape: form.shape,
      seed: requestSeed,
    };

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
        seed: data.seed ?? requestSeed,
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

  /* ────────────────────────────────────────────────────────────────────────────
     Importazione DXF
     ──────────────────────────────────────────────────────────────────────────── */
  const handleDxfFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    say('Importazione DXF in corso…');
    try {
      const text = await file.text();
      const base = backendUrl.trim().replace(/\/+$/, '');

      // Prova con endpoint backend se disponibile
      if (base) {
        try {
          const res = await fetch(`${base}/import-dxf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dxf_content: text, style: form.style }),
          });
          if (res.ok) {
            const data = await res.json();
            const entry = {
              id: `${Date.now()}`,
              plan: data,
              meta: { type: 'apartment', style: form.style },
              params: { roomType: 'apartment', rooms: data.rooms.length, style: form.style, shape: 'rect' },
            };
            setCurrent(entry);
            setHistory((h) => [entry, ...h].slice(0, 8));
            setSelectedId(null);
            say('Planimetria DXF importata ed arredata!');
            return;
          }
        } catch { }
      }

      // Parser client-side di fallback
      const data = parseDxfClientSide(text, form.style);
      const entry = {
        id: `${Date.now()}`,
        plan: data,
        meta: { type: 'apartment', style: form.style },
        params: { roomType: 'apartment', rooms: data.rooms.length, style: form.style, shape: 'rect' },
      };
      setCurrent(entry);
      setHistory((h) => [entry, ...h].slice(0, 8));
      setSelectedId(null);
      say('Planimetria DXF importata ed arredata!');
    } catch (err) {
      setError(`Errore durante l'importazione del file DXF: ${err.message}`);
    } finally {
      if (e.target) e.target.value = '';
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
      seed: entry.plan.seed || '',
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

  const exportDxf = async () => {
    if (!plan) return;
    say('Generazione file CAD in corso…');
    try {
      const base = backendUrl.trim().replace(/\/+$/, '');
      if (base) {
        const res = await fetch(`${base}/export-dxf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(plan),
        });
        if (res.ok) {
          const blob = await res.blob();
          saveBlob(blob, 'planimetria.dxf');
          say('File CAD esportato');
          return;
        }
      }
      // Client-side fallback DXF export
      const lines = ['0', 'SECTION', '2', 'ENTITIES'];
      plan.rooms.forEach((r) => {
        lines.push('0', 'LWPOLYLINE', '8', 'AREE', '90', '4', '70', '1');
        lines.push('10', String(r.x), '20', String(r.y));
        lines.push('10', String(r.x + r.w), '20', String(r.y));
        lines.push('10', String(r.x + r.w), '20', String(r.y + r.h));
        lines.push('10', String(r.x), '20', String(r.y + r.h));
      });
      plan.walls.forEach((w) => {
        lines.push('0', 'LWPOLYLINE', '8', 'MURI', '90', '4', '70', '1');
        lines.push('10', String(w.x), '20', String(w.y));
        lines.push('10', String(w.x + w.w), '20', String(w.y));
        lines.push('10', String(w.x + w.w), '20', String(w.y + w.h));
        lines.push('10', String(w.x), '20', String(w.y + w.h));
      });
      plan.furniture.forEach((f) => {
        lines.push('0', 'LWPOLYLINE', '8', 'ARREDI', '90', '4', '70', '1');
        lines.push('10', String(f.x), '20', String(f.y));
        lines.push('10', String(f.x + f.w), '20', String(f.y));
        lines.push('10', String(f.x + f.w), '20', String(f.y + f.h));
        lines.push('10', String(f.x), '20', String(f.y + f.h));
      });
      lines.push('0', 'ENDSEC', '0', 'EOF');
      saveBlob(new Blob([lines.join('\n')], { type: 'application/dxf' }), 'planimetria.dxf');
      say('File CAD esportato!');
    } catch {
      setError('Impossibile esportare in DXF.');
    }
  };

  const copy = async (text, msg) => {
    try {
      await navigator.clipboard.writeText(String(text));
      say(msg);
    } catch { say('Copia non riuscita'); }
  };

  const area = (parseFloat(form.width) || 0) * (parseFloat(form.length) || 0);
  const toggle = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  return (
    <div className="pf-app" data-theme={theme}>
      <Analytics/>
      {/* File input nascosto per importazione DXF */}
      <input
        type="file"
        accept=".dxf"
        ref={dxfInputRef}
        onChange={handleDxfFile}
        style={{ display: 'none' }}
      />

      <header className="pf-top">
        <div className="pf-brand">
          <Logo />
          <span className="pf-name">Planify</span>
        </div>
        <div className="pf-top-right">
          <span className={`pf-status ${backendUrl ? 'is-on' : ''}`}>
            <i aria-hidden="true" />
            {backendUrl ? 'Motore collegato' : 'Motore offline (modalità locale)'}
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
              <h2>Misure Riquadro</h2>
              <div className="pf-row2">
                <label className="pf-field">
                  <span>Larghezza</span>
                  <div className="pf-input">
                    <input type="number" min="3.5" max="60" step="0.5" required value={form.width}
                      onChange={(e) => setF('width', e.target.value)} />
                    <em>m</em>
                  </div>
                </label>
                <label className="pf-field">
                  <span>Lunghezza</span>
                  <div className="pf-input">
                    <input type="number" min="3.5" max="60" step="0.5" required value={form.length}
                      onChange={(e) => setF('length', e.target.value)} />
                    <em>m</em>
                  </div>
                </label>
              </div>
              <p className="pf-hint">{fmt(area)} m² nel riquadro · da 3.5 a 60 m per lato</p>
              <div className="pf-chips">
                {PRESETS.map((p) => (
                  <button key={p.label} type="button" className="pf-chip" onClick={() => applyPreset(p)}>{p.label}</button>
                ))}
              </div>
            </section>

            <section className="pf-sec">
              <h2>Tipologia</h2>
              <div className="pf-type-grid" role="radiogroup" aria-label="Tipologia">
                {TYPES.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={form.roomType === id}
                    className={`pf-type-card ${form.roomType === id ? 'is-on' : ''}`}
                    onClick={() => {
                      setF('roomType', id);
                      if (id === 'hotel-room' && (parseFloat(form.width) > 6 || parseFloat(form.length) > 8)) {
                        setF('width', 4.2);
                        setF('length', 6.0);
                        setF('rooms', 1);
                      }
                    }}
                  >
                    <Icon size={16} />
                    <span>{label}</span>
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
                  : form.roomType === 'hotel-room'
                    ? 'La camera hotel ha sagoma rettangolare ad alta efficienza.'
                    : 'La sagoma viene applicata proporzionalmente alle misure.'}
              </p>
            </section>

            <section className="pf-sec">
              <h2>Stile d'Interni</h2>
              <div className="pf-styles-grid" role="radiogroup" aria-label="Stile d'Interni">
                {STYLES.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    role="radio"
                    aria-checked={form.style === st.id}
                    className={`pf-style-card ${form.style === st.id ? 'is-on' : ''}`}
                    onClick={() => setF('style', st.id)}
                    title={st.desc}
                  >
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

              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px' }}>Nuovo seed ad ogni click</span>
                <button
                  type="button"
                  className="pf-mini"
                  style={{ fontWeight: 600, color: autoSeed ? 'var(--accent)' : 'var(--text-muted)' }}
                  onClick={() => setAutoSeed(!autoSeed)}
                >
                  {autoSeed ? <Sparkles size={12} /> : <Lock size={12} />}
                  {autoSeed ? 'Attivo (casuale)' : 'Bloccato'}
                </button>
              </div>

              {!autoSeed && (
                <label className="pf-field" style={{ marginTop: '8px' }}>
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
                {isLoading ? 'Sto disegnando…' : 'Genera planimetria'}
              </button>
              <button type="button" className="pf-secondary" disabled={isLoading} onClick={() => run({ variant: true })}
                title="Nuovo seed e nuova disposizione" aria-label="Nuova variante">
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

            <div className="pf-group" role="group" aria-label="Strumenti disegno e import">
              <button
                type="button"
                className={`pf-tool ${isDrawMode ? 'is-on' : ''}`}
                style={{ color: '#1f4fd8', fontWeight: 600 }}
                onClick={() => setIsDrawMode(!isDrawMode)}
              >
                <PenTool size={15} /> Disegna Schizzo
              </button>
              <button
                type="button"
                className="pf-tool"
                onClick={() => dxfInputRef.current?.click()}
                title="Carica planimetria da file CAD DXF"
              >
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
              <button type="button" className="pf-tool" disabled={!plan} onClick={exportDxf} style={{ color: '#0071e3', fontWeight: '500' }}>
                <Briefcase size={15} /> DXF (CAD)
              </button>
              <button type="button" className="pf-tool" disabled={!plan} onClick={exportJson}><FileJson size={15} /> JSON</button>
            </div>
          </div>

          <div className="pf-canvas" ref={stageRef}>
            {isDrawMode ? (
              <SketchBoard
                onClose={() => setIsDrawMode(false)}
                onGeneratePlan={(newPlan) => {
                  const entry = {
                    id: `${Date.now()}`,
                    plan: newPlan,
                    meta: { type: 'sketch', style: form.style },
                    params: { roomType: 'apartment', rooms: newPlan.rooms.length, style: form.style, shape: 'rect' },
                  };
                  setCurrent(entry);
                  setHistory((h) => [entry, ...h].slice(0, 8));
                  setIsDrawMode(false);
                  say('Planimetria creata dallo schizzo!');
                }}
              />
            ) : plan ? (
              <div className="pf-sheet" key={current.id}>
                <PlanSvg
                  plan={plan} layers={layers} hoverId={hoverId} selectedId={selectedId}
                  onHover={setHoverId} onSelect={setSelectedId} svgRef={svgRef} zoom={z}
                  typeLabel={TYPE_NAME[current.meta?.type] || 'Planimetria'}
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
                  <h3>Inizia a progettare</h3>
                  <p>Scegli le misure e clicca <b>«Genera planimetria»</b>, oppure usa <b>«Disegna Schizzo»</b> o <b>«Importa DXF»</b>.</p>
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
                  <span>{slow ? 'Il server si sta avviando: la prima richiesta può richiedere un minuto.' : 'Generazione in corso…'}</span>
                </div>
              </div>
            )}
            {flash && <div className="pf-flash"><Check size={14} /> {flash}</div>}
          </div>
        </main>

        {/* ───────── Dettagli, Personalizzazione e Cronologia Destra ───────── */}
        <aside className="pf-inspector">
          {plan && stats ? (
            <>
              {/* Sezione Personalizzazione Spazio Selezionato */}
              {selectedRoom ? (
                <section className="pf-sec pf-customizer">
                  <div className="pf-customizer-head">
                    <span className="pf-customizer-title"><Sliders size={14} /> Modifica Locale</span>
                    <button type="button" className="pf-customizer-close" onClick={() => setSelectedId(null)} title="Chiudi">
                      <X size={15} />
                    </button>
                  </div>

                  <label className="pf-field-sm">
                    <span>Nome del locale</span>
                    <input
                      type="text"
                      className="pf-input-sm"
                      value={selectedRoom.name}
                      onChange={(e) => updateRoomName(selectedRoom.id, e.target.value)}
                    />
                  </label>

                  <div className="pf-chips">
                    {['Soggiorno', 'Cucina', 'Camera da Letto', 'Bagno', 'Studio', 'Guardaroba', 'Palestra'].map((nm) => (
                      <button key={nm} type="button" className="pf-chip" onClick={() => updateRoomName(selectedRoom.id, nm)}>
                        {nm}
                      </button>
                    ))}
                  </div>

                  <label className="pf-field-sm">
                    <span>Destinazione d'uso</span>
                    <select
                      className="pf-input-sm"
                      value={selectedRoom.kind}
                      onChange={(e) => updateRoomKind(selectedRoom.id, e.target.value)}
                    >
                      <option value="living">Soggiorno</option>
                      <option value="living_kitchen">Soggiorno con Cucina</option>
                      <option value="kitchen">Cucina separata</option>
                      <option value="bed">Camera da letto</option>
                      <option value="hotel_room">Camera hotel</option>
                      <option value="bath">Bagno con sanitari</option>
                      <option value="study">Studio / Ufficio</option>
                      <option value="corridor">Disimpegno / Ingresso</option>
                    </select>
                  </label>

                  <div className="pf-field-sm">
                    <span>Finitura e Pavimento</span>
                    <div className="pf-color-swatches">
                      {FLOOR_PALETTES.map((fp) => (
                        <button
                          key={fp.name}
                          type="button"
                          className={`pf-swatch-btn ${selectedRoom.color === fp.color ? 'is-on' : ''}`}
                          style={{ background: fp.color }}
                          title={fp.name}
                          onClick={() => updateRoomColor(selectedRoom.id, fp.color)}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="pf-field-sm">
                    <span>Arredi nella stanza ({roomFurniture.length})</span>
                    <div className="pf-furn-list">
                      {roomFurniture.map((f, idx) => (
                        <div key={idx} className="pf-furn-row">
                          <span>{FURNITURE_LABELS[f.type] || f.type}</span>
                          <div className="pf-furn-actions">
                            <button type="button" className="pf-btn-icon" title="Ruota arredo di 90°" onClick={() => rotateFurniture(f)}>
                              <RotateCw size={12} />
                            </button>
                            <button type="button" className="pf-btn-icon is-danger" title="Elimina arredo" onClick={() => removeFurniture(f)}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pf-field-sm">
                    <span>Aggiungi arredo alla stanza</span>
                    <div className="pf-add-furn">
                      <select value={selectedNewFurn} onChange={(e) => setSelectedNewFurn(e.target.value)}>
                        <option value="bed">Letto matrimoniale</option>
                        <option value="sofa">Divano</option>
                        <option value="table">Tavolo da pranzo</option>
                        <option value="desk">Scrivania</option>
                        <option value="wardrobe">Armadio guardaroba</option>
                        <option value="tv">Mobile TV</option>
                        <option value="kitchen_counter">Piano cucina</option>
                        <option value="bathtub">Vasca da bagno</option>
                        <option value="shower">Box doccia</option>
                        <option value="toilet">WC</option>
                        <option value="sink">Lavabo</option>
                        <option value="minibar">Minibar</option>
                      </select>
                      <button type="button" className="pf-btn-add" onClick={() => addFurnitureToRoom(selectedRoom.id, selectedNewFurn)}>
                        <Plus size={13} /> Aggiungi
                      </button>
                    </div>
                  </div>
                </section>
              ) : null}

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
                    <button
                      type="button"
                      className="pf-mini"
                      onClick={() => {
                        if (autoSeed) {
                          setAutoSeed(false);
                          setF('seed', plan.seed);
                          say('Variante bloccata');
                        } else {
                          setAutoSeed(true);
                          say('Nuovo seed casuale attivo');
                        }
                      }}
                      title={autoSeed ? 'Blocca questa variante' : 'Sblocca per generare seed casuali'}
                    >
                      {autoSeed ? <Unlock size={13} /> : <Lock size={13} />}
                      {autoSeed ? 'Blocca' : 'Sblocca'}
                    </button>
                  </div>
                </div>
              </section>

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
                  <h2>Note e Conformità</h2>
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
              <h2>Dettagli e Modifiche</h2>
              <p className="pf-hint">Genera o carica una planimetria. Potrai selezionare e personalizzare ogni singolo ambiente, cambiare arredi, colori e finiture.</p>
            </section>
          )}

          {/* Cronologia fissa e organizzata a griglia */}
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
