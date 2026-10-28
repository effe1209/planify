/*
 * Il foglio della planimetria in SVG: stanze (rettangoli o poligoni liberi), muri, porte,
 * finestre, arredi, quote e cartiglio. Usato per la vista principale, le miniature e l'export.
 */
import { useId } from 'react';
import { SHAPE_NAME } from '../constants';
import { AJAX_MODELS, DEVICE_STYLE } from '../lib/ajax';
import { pointInPolygon, polyPath } from '../lib/geometry';
import { sheetBox } from '../lib/sheet';
import { THEMES } from '../lib/themes';
import { clamp, fmt, fmtM } from '../lib/utils';

const INK = '#14181f';
const FONT = "'Figtree', system-ui, -apple-system, 'Segoe UI', sans-serif";


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
    <g transform={`translate(${cx},${cy}) rotate(${ROT_BY_FACING[facing] ?? 0})${item.flip ? ' scale(-1,1)' : ''} translate(${-cw / 2},${-ch / 2})`}>
      {children(cw, ch)}
    </g>
  );
}

const F_STROKE = '#5b6472';
const F_SOFT = '#bcc3ce';

const GROUND = new Set(['path', 'hedge']);
const GREEN = '#7fae7a';
const GREEN_DARK = '#4f7a4b';
const METAL = '#c9ced6';

const FURNITURE = {
  /* ── garage ── */
  car: (w, h) => (
    <>
      <rect x={w * 0.04} width={w * 0.92} height={h} rx={w * 0.28} fill="#d5dde8" stroke={F_STROKE} strokeWidth="1.2" />
      {[[0.16, 0.0], [0.16, 0.74], [0.84, 0.0], [0.84, 0.74]].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={w * x - w * 0.09} y={h * (y + 0.1)} width={w * 0.18} height={h * 0.14} rx={2} fill="#3a404a" />
      ))}
      <path d={`M${w * 0.2} ${h * 0.62}Q${w / 2} ${h * 0.56} ${w * 0.8} ${h * 0.62}L${w * 0.86} ${h * 0.74}Q${w / 2} ${h * 0.7} ${w * 0.14} ${h * 0.74}Z`}
        fill="#9fb4cc" stroke={F_STROKE} strokeWidth="0.7" />
      <path d={`M${w * 0.22} ${h * 0.22}Q${w / 2} ${h * 0.27} ${w * 0.78} ${h * 0.22}L${w * 0.82} ${h * 0.14}Q${w / 2} ${h * 0.18} ${w * 0.18} ${h * 0.14}Z`}
        fill="#9fb4cc" stroke={F_STROKE} strokeWidth="0.7" />
      <rect x={w * 0.24} y={h * 0.3} width={w * 0.52} height={h * 0.28} rx={3} fill="#e6ecf3" stroke={F_SOFT} />
    </>
  ),
  motorbike: (w, h) => (
    <>
      <rect x={w * 0.36} y={0} width={w * 0.28} height={h * 0.2} rx={3} fill="#3a404a" />
      <rect x={w * 0.36} y={h * 0.8} width={w * 0.28} height={h * 0.2} rx={3} fill="#3a404a" />
      <ellipse cx={w / 2} cy={h / 2} rx={w * 0.22} ry={h * 0.32} fill="#d9534f" stroke={F_STROKE} strokeWidth="0.9" />
      <line x1={w * 0.08} y1={h * 0.72} x2={w * 0.92} y2={h * 0.72} stroke={F_STROKE} strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  workbench: (w, h, s, t) => (
    <>
      <rect width={w} height={h} fill={t.wood} stroke={t.woodLine} strokeWidth="1.1" />
      <rect x={w * 0.06} y={h * 0.15} width={Math.min(0.25 * s, w * 0.15)} height={h * 0.45} fill={METAL} stroke={F_STROKE} strokeWidth="0.7" />
      {[0.4, 0.55, 0.7, 0.85].map((x) => <circle key={x} cx={w * x} cy={h * 0.35} r={1.2} fill={F_STROKE} />)}
    </>
  ),
  shelving_heavy: (w, h) => {
    const n = Math.max(1, Math.round(w / h / 2));
    return (
      <>
        <rect width={w} height={h} fill="#e3e6eb" stroke={F_STROKE} strokeWidth="1.1" />
        {Array.from({ length: n }, (_, i) => (
          <line key={i} x1={(w * (i + 1)) / (n + 1)} y1={0} x2={(w * (i + 1)) / (n + 1)} y2={h} stroke={F_STROKE} strokeWidth="1" />
        ))}
        <line x1={0} y1={0} x2={w} y2={h} stroke={F_SOFT} />
        <line x1={0} y1={h} x2={w} y2={0} stroke={F_SOFT} />
      </>
    );
  },
  /* ── lavanderia e ripostiglio ── */
  dryer: (w, h) => (
    <>
      <rect width={w} height={h} rx={2} fill="#eef0f3" stroke={F_STROKE} strokeWidth="1.1" />
      <circle cx={w / 2} cy={h * 0.55} r={Math.min(w, h) * 0.3} fill="#fff" stroke={F_STROKE} strokeWidth="0.8" />
      <circle cx={w / 2} cy={h * 0.55} r={Math.min(w, h) * 0.16} fill="none" stroke={F_SOFT} strokeDasharray="2 1.5" />
      <rect x={w * 0.15} y={h * 0.1} width={w * 0.3} height={h * 0.08} fill={F_SOFT} />
    </>
  ),
  utility_sink: (w, h) => (
    <>
      <rect width={w} height={h} rx={2} fill="#fff" stroke={F_STROKE} strokeWidth="1.1" />
      <rect x={w * 0.12} y={h * 0.22} width={w * 0.76} height={h * 0.66} rx={3} fill="#e3eefb" stroke={F_SOFT} />
      <circle cx={w / 2} cy={h * 0.12} r={1.8} fill={F_STROKE} />
    </>
  ),
  laundry_basket: (w, h) => (
    <>
      <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 1} ry={h / 2 - 1} fill="#efe3c8" stroke="#a88f68" strokeWidth="0.9" />
      <ellipse cx={w / 2} cy={h / 2} rx={w * 0.3} ry={h * 0.3} fill="none" stroke="#a88f68" strokeDasharray="1.5 1.5" />
    </>
  ),
  shelving: (w, h, s, t) => {
    const n = Math.max(1, Math.round(w / (0.8 * s)) - 1);
    return (
      <>
        <rect width={w} height={h} fill={t.cabinet} stroke={F_STROKE} strokeWidth="1" />
        {Array.from({ length: n }, (_, i) => (
          <line key={i} x1={(w * (i + 1)) / (n + 1)} y1={0} x2={(w * (i + 1)) / (n + 1)} y2={h} stroke={F_SOFT} />
        ))}
        <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={F_SOFT} strokeDasharray="2 2" />
      </>
    );
  },
  vacuum: (w, h) => (
    <>
      <circle cx={w / 2} cy={h * 0.6} r={Math.min(w, h) * 0.38} fill="#dfe3ea" stroke={F_STROKE} strokeWidth="0.9" />
      <line x1={w / 2} y1={h * 0.25} x2={w / 2} y2={0} stroke={F_STROKE} strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  /* ── giardino ── */
  hedge: (w, h) => {
    const horiz = w >= h;
    const n = Math.max(2, Math.round((horiz ? w : h) / Math.min(w, h)));
    const r = Math.min(w, h) / 2;
    return (
      <>
        <rect width={w} height={h} rx={r} fill={GREEN} fillOpacity="0.55" />
        {Array.from({ length: n }, (_, i) => (
          <circle key={i} cx={horiz ? (w * (i + 0.5)) / n : w / 2} cy={horiz ? h / 2 : (h * (i + 0.5)) / n} r={r * 0.95}
            fill={GREEN} fillOpacity="0.8" stroke={GREEN_DARK} strokeWidth="0.6" />
        ))}
      </>
    );
  },
  fence: (w, h) => {
    const posts = Math.max(2, Math.round(w / 30)) + 1;
    return (
      <>
        <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="#6b5a45" strokeWidth="1.6" />
        {Array.from({ length: posts }, (_, i) => (
          <rect key={i} x={(w * i) / (posts - 1) - 1.5} y={0} width={3} height={Math.max(h, 3)} fill="#6b5a45" />
        ))}
      </>
    );
  },
  gate_pedestrian: (w, h) => (
    <>
      <rect x={-2} y={-1} width={4} height={Math.max(h, 4) + 2} fill={INK} />
      <rect x={w - 2} y={-1} width={4} height={Math.max(h, 4) + 2} fill={INK} />
      <path d={`M2 ${h / 2}A${w - 4} ${w - 4} 0 0 0 ${w - 2} ${h / 2 - (w - 4)}`} fill="none" stroke="#d92d20" strokeWidth="0.9" strokeDasharray="3 2.5" />
      <line x1={2} y1={h / 2} x2={w - 2} y2={h / 2 - (w - 4)} stroke="#d92d20" strokeWidth="2" />
    </>
  ),
  gate_driveway: (w, h) => (
    <>
      <rect x={-2} y={-1} width={4} height={Math.max(h, 4) + 2} fill={INK} />
      <rect x={w - 2} y={-1} width={4} height={Math.max(h, 4) + 2} fill={INK} />
      <line x1={2} y1={h / 2} x2={w - 2} y2={h / 2} stroke="#d92d20" strokeWidth="2.2" />
      <line x1={2} y1={h / 2 + 4} x2={w - 2} y2={h / 2 + 4} stroke="#d92d20" strokeWidth="0.8" strokeDasharray="4 3" />
    </>
  ),
  gazebo: (w, h, s, t) => (
    <>
      <rect width={w} height={h} fill={t.wood} fillOpacity="0.35" stroke={t.woodLine} strokeWidth="1.2" strokeDasharray="5 3" />
      <line x1={0} y1={0} x2={w} y2={h} stroke={t.woodLine} strokeOpacity="0.6" />
      <line x1={w} y1={0} x2={0} y2={h} stroke={t.woodLine} strokeOpacity="0.6" />
      {[[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x - 3} y={y - 3} width={6} height={6} fill={t.woodLine} />
      ))}
    </>
  ),
  path: (w, h) => {
    const step = Math.min(w, h) * 0.9;
    const horiz = w >= h;
    const n = Math.max(1, Math.floor((horiz ? w : h) / step));
    return (
      <>
        {Array.from({ length: n }, (_, i) => (
          <rect key={i} x={horiz ? i * step + 2 : 2} y={horiz ? 2 : i * step + 2}
            width={horiz ? step - 4 : w - 4} height={horiz ? h - 4 : step - 4} rx={3}
            fill="#e4ded3" stroke="#b9ae9c" strokeWidth="0.8" />
        ))}
      </>
    );
  },
  tree: (w, h) => (
    <>
      <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) / 2} fill={GREEN} fillOpacity="0.45" stroke={GREEN_DARK} strokeWidth="0.8" />
      <circle cx={w * 0.4} cy={h * 0.42} r={Math.min(w, h) * 0.28} fill={GREEN} fillOpacity="0.7" />
      <circle cx={w * 0.62} cy={h * 0.6} r={Math.min(w, h) * 0.24} fill={GREEN} fillOpacity="0.7" />
      <circle cx={w / 2} cy={h / 2} r={2.2} fill="#7a5a3a" />
    </>
  ),
  washer: (w, h) => (
    <>
      <rect width={w} height={h} rx={2} fill="#f4f6f8" stroke={F_STROKE} strokeWidth="1.1" />
      <circle cx={w / 2} cy={h * 0.55} r={Math.min(w, h) * 0.3} fill="#e3eefb" stroke={F_SOFT} />
      <line x1={w * 0.15} y1={h * 0.15} x2={w * 0.5} y2={h * 0.15} stroke={F_SOFT} />
    </>
  ),
  console: (w, h, s, t) => (
    <>
      <rect width={w} height={h} rx={1.5} fill={t.wood} stroke={t.woodLine} strokeWidth="1" />
      <line x1={w / 3} y1={1} x2={w / 3} y2={h - 1} stroke={t.woodLine} strokeOpacity="0.5" />
      <line x1={(2 * w) / 3} y1={1} x2={(2 * w) / 3} y2={h - 1} stroke={t.woodLine} strokeOpacity="0.5" />
    </>
  ),
  plant: (w, h, s, t) => {
    const r = Math.min(w, h) / 2;
    const leaves = Array.from({ length: 7 }, (_, i) => (i / 7) * Math.PI * 2);
    return (
      <>
        <circle cx={w / 2} cy={h / 2} r={r * 0.55} fill={t.pot} stroke={t.woodLine} strokeWidth="0.8" />
        {leaves.map((a, i) => (
          <ellipse key={i} cx={w / 2 + Math.cos(a) * r * 0.45} cy={h / 2 + Math.sin(a) * r * 0.45} rx={r * 0.42} ry={r * 0.2}
            transform={`rotate(${(a * 180) / Math.PI} ${w / 2 + Math.cos(a) * r * 0.45} ${h / 2 + Math.sin(a) * r * 0.45})`}
            fill="#7fae7a" fillOpacity="0.85" stroke="#4f7a4b" strokeWidth="0.6" />
        ))}
      </>
    );
  },
  bed: (w, h, s, t) => {
    const n = w > 1.3 * s ? 2 : 1;
    const gap = 3;
    const pw = (w - gap * (n + 1)) / n;
    return (
      <>
        <rect width={w} height={h} rx={3} fill="#fff" stroke={F_STROKE} strokeWidth="1.2" />
        <rect x={1.5} y={h * 0.3} width={w - 3} height={h * 0.7 - 1.5} rx={2} fill={t.duvet} stroke={F_SOFT} />
        <line x1={1.5} y1={h * 0.3} x2={w - 1.5} y2={h * 0.3} stroke={F_SOFT} />
        {Array.from({ length: n }, (_, i) => (
          <rect key={i} x={gap + i * (pw + gap)} y={h * 0.05} width={pw} height={h * 0.18} rx={3} fill="#fff" stroke={F_SOFT} />
        ))}
      </>
    );
  },
  sofa: (w, h, s, t) => {
    const back = Math.min(h * 0.3, 0.3 * s);
    const arm = Math.min(w * 0.1, 0.14 * s);
    const n = w > 1.9 * s ? 3 : 2;
    const seat = (w - 2 * arm) / n;
    return (
      <>
        <rect width={w} height={h} rx={4} fill={t.fabric} stroke={F_STROKE} strokeWidth="1.2" />
        <rect x={arm} y={back} width={w - 2 * arm} height={h - back - 1.5} rx={2} fill={t.fabricSoft} stroke={F_SOFT} />
        {Array.from({ length: n - 1 }, (_, i) => (
          <line key={i} x1={arm + seat * (i + 1)} y1={back} x2={arm + seat * (i + 1)} y2={h - 1.5} stroke={F_SOFT} />
        ))}
        <rect x={0} y={back * 0.5} width={arm} height={h - back * 0.5} rx={2} fill={t.fabricArm} stroke={F_SOFT} />
        <rect x={w - arm} y={back * 0.5} width={arm} height={h - back * 0.5} rx={2} fill={t.fabricArm} stroke={F_SOFT} />
      </>
    );
  },
  table: (w, h, s, t) => {
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
          <rect key={i} x={x} y={y} width={cw} height={ch} rx={3} fill={t.chair} stroke={t.woodLine} strokeWidth="0.8" />
        ))}
        <rect width={w} height={h} rx={3} fill={t.wood} stroke={t.woodLine} strokeWidth="1.2" />
      </>
    );
  },
  desk: (w, h, s, t) => (
    <>
      <rect x={w / 2 - 0.21 * s} y={h - 0.1 * s} width={0.42 * s} height={0.4 * s} rx={5} fill="#e3e7ee" stroke={F_STROKE} strokeWidth="0.9" />
      <rect width={w} height={h} rx={2} fill={t.wood} stroke={t.woodLine} strokeWidth="1.2" />
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
  sink: (w, h, s) => {
    const n = w >= 1.05 * s ? 2 : 1; // lavabo doppio da 1,1-1,2 m
    return (
      <>
        <rect width={w} height={h} rx={3} fill="#fff" stroke={F_STROKE} strokeWidth="1.1" />
        {Array.from({ length: n }, (_, i) => {
          const cx = (w * (i + 0.5)) / n;
          return (
            <g key={i}>
              <ellipse cx={cx} cy={h * 0.58} rx={(w / n) * 0.32} ry={h * 0.28} fill="#e3eefb" stroke={F_SOFT} />
              <circle cx={cx} cy={h * 0.15} r={1.8} fill={F_STROKE} />
            </g>
          );
        })}
      </>
    );
  },
  bidet: (w, h) => (
    <>
      <rect x={w * 0.1} width={w * 0.8} height={h * 0.18} rx={2} fill="#fff" stroke={F_STROKE} strokeWidth="1" />
      <ellipse cx={w / 2} cy={h * 0.58} rx={w * 0.42} ry={h * 0.38} fill="#fff" stroke={F_STROKE} strokeWidth="1.1" />
      <ellipse cx={w / 2} cy={h * 0.6} rx={w * 0.22} ry={h * 0.2} fill="#e3eefb" stroke={F_SOFT} />
      <circle cx={w / 2} cy={h * 0.3} r={1.5} fill={F_STROKE} />
    </>
  ),
  /* doccia angolare a quarto di cerchio: angolo dei muri in alto a sinistra (flip = muro a destra) */
  shower_round: (w, h) => (
    <>
      <path d={`M0 0H${w}A${w} ${h} 0 0 1 0 ${h}Z`} fill="#e3eefb" stroke={F_STROKE} strokeWidth="1.1" />
      <path d={`M0 0H${w * 0.82}A${w * 0.82} ${h * 0.82} 0 0 1 0 ${h * 0.82}`} fill="none" stroke="#fff" strokeWidth="1.5" />
      <circle cx={w * 0.3} cy={h * 0.3} r={3} fill="#fff" stroke={F_STROKE} />
    </>
  ),
  /* doccia walk-in: piatto lungo con vetro fisso sul lato lungo, ingresso libero a destra */
  shower_walkin: (w, h) => (
    <>
      <rect width={w} height={h} fill="#e3eefb" stroke={F_STROKE} strokeWidth="1.1" />
      <line x1={0} y1={h - 1.5} x2={w * 0.62} y2={h - 1.5} stroke="#7fb3e6" strokeWidth="2.4" />
      <line x1={w * 0.1} y1={h * 0.5} x2={w * 0.55} y2={h * 0.5} stroke={F_SOFT} strokeDasharray="2 2" />
      <circle cx={w * 0.3} cy={h * 0.3} r={3} fill="#fff" stroke={F_STROKE} />
    </>
  ),
  nightstand: (w, h, s, t) => (
    <>
      <rect width={w} height={h} rx={2} fill={t.wood} stroke={t.woodLine} strokeWidth="1" />
      <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.22} fill="#fff7d6" stroke={t.woodLine} strokeWidth="0.8" />
    </>
  ),
  table_round: (w, h, s, t) => {
    const r = Math.min(w, h) / 2;
    const n = clamp(Math.round((2 * Math.PI * (r / s)) / 0.6), 2, 8);
    const cr = 0.2 * s;
    return (
      <>
        {Array.from({ length: n }, (_, i) => {
          const a = (2 * Math.PI * i) / n - Math.PI / 2;
          return <circle key={i} cx={w / 2 + Math.cos(a) * (r + cr * 0.6)} cy={h / 2 + Math.sin(a) * (r + cr * 0.6)}
            r={cr} fill={t.chair} stroke={t.woodLine} strokeWidth="0.8" />;
        })}
        <circle cx={w / 2} cy={h / 2} r={r} fill={t.wood} stroke={t.woodLine} strokeWidth="1.2" />
      </>
    );
  },
  coffee_table: (w, h, s, t) => (
    <rect x={1} y={1} width={w - 2} height={h - 2} rx={Math.min(w, h) * 0.25} fill={t.wood} stroke={t.woodLine} strokeWidth="1" />
  ),
  armchair: (w, h, s, t) => (
    <>
      <rect width={w} height={h} rx={5} fill={t.fabric} stroke={F_STROKE} strokeWidth="1.1" />
      <rect x={w * 0.18} y={h * 0.28} width={w * 0.64} height={h * 0.66} rx={3} fill={t.fabricSoft} stroke={F_SOFT} />
    </>
  ),
  /* divano angolare: schienale in alto, penisola (chaise) a destra verso il basso */
  sofa_corner: (w, h, s, t) => {
    const back = 0.25 * s;
    const seatD = Math.min(0.95 * s, h * 0.55);
    const chaise = Math.min(0.95 * s, w * 0.4);
    const path = `M0 0H${w}V${h}H${w - chaise}V${seatD}H0Z`;
    return (
      <>
        <path d={path} fill={t.fabric} stroke={F_STROKE} strokeWidth="1.2" strokeLinejoin="round" />
        <path d={`M${back} ${back}H${w - back}V${h - 2}H${w - chaise + 2}V${seatD - 2}H${back}Z`}
          fill={t.fabricSoft} stroke={F_SOFT} />
        <line x1={w - chaise} y1={back} x2={w - chaise} y2={seatD - 2} stroke={F_SOFT} />
        <line x1={(w - chaise) / 2} y1={back} x2={(w - chaise) / 2} y2={seatD - 2} stroke={F_SOFT} />
      </>
    );
  },
  /* penisola: piano lungo che sporge dal muro (in alto), sgabelli sul lato destro */
  kitchen_peninsula: (w, h, s, t) => {
    const n = clamp(Math.floor(h / (0.6 * s)), 1, 4);
    return (
      <>
        {Array.from({ length: n }, (_, i) => (
          <circle key={i} cx={w + 0.22 * s} cy={(h * (i + 0.5)) / n} r={0.17 * s} fill={t.chair} stroke={t.woodLine} strokeWidth="0.8" />
        ))}
        <rect width={w} height={h} fill="#f1f2f5" stroke={F_STROKE} strokeWidth="1.1" />
        <rect x={w * 0.2} y={h * 0.12} width={w * 0.45} height={Math.min(h * 0.25, 0.5 * s)} rx={2} fill="#e3eefb" stroke={F_SOFT} />
      </>
    );
  },
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
  wardrobe: (w, h, s, t) => {
    const n = Math.max(2, Math.round(w / 38));
    return (
      <>
        <rect width={w} height={h} fill={t.cabinet} stroke={F_STROKE} strokeWidth="1.1" />
        {Array.from({ length: n - 1 }, (_, i) => (
          <line key={i} x1={(w / n) * (i + 1)} y1={0} x2={(w / n) * (i + 1)} y2={h} stroke={F_SOFT} />
        ))}
        <line x1={0} y1={h} x2={w} y2={0} stroke={F_SOFT} opacity="0.7" />
      </>
    );
  },
};

function Furn({ item, scale, theme }) {
  const draw = FURNITURE[item.type];
  if (!draw) {
    return (
      <rect x={item.x * scale} y={item.y * scale} width={item.w * scale} height={item.h * scale}
        fill="#f1f3f6" stroke={F_STROKE} strokeWidth="1" />
    );
  }
  return <Oriented item={item} scale={scale}>{(w, h) => draw(w, h, scale, theme)}</Oriented>;
}

/* ────────────────────────────────────────────────────────────────────────────
   Pavimenti, quote, etichette
   ──────────────────────────────────────────────────────────────────────────── */
/*
 * Tappeti: definiscono le zone come farebbe un arredatore. Sotto il tavolino del salotto (largo
 * abbastanza da toccare divano e poltrone) e sotto la parte bassa dei letti matrimoniali.
 * Sempre dentro la stanza, a 25 cm dai muri.
 */
function rugsFor(plan) {
  const rooms = new Map(plan.rooms.map((r) => [r.id, r]));
  const out = [];
  const clipTo = (r, room) => {
    const m = 0.25;
    const x0 = Math.max(r.x, room.x + m);
    const y0 = Math.max(r.y, room.y + m);
    const x1 = Math.min(r.x + r.w, room.x + room.w - m);
    const y1 = Math.min(r.y + r.h, room.y + room.h - m);
    return x1 - x0 > 0.8 && y1 - y0 > 0.8 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  };
  for (const it of plan.furniture) {
    const room = rooms.get(it.room);
    if (!room) continue;
    let rug = null;
    if (it.type === 'coffee_table') {
      rug = { x: it.x - 0.55, y: it.y - 0.55, w: it.w + 1.1, h: it.h + 1.1 };
    } else if (it.type === 'bed' && it.w >= 1.3 && it.h >= 1.3) {
      // dalla metà del letto verso i piedi, 50 cm oltre i lati
      const f = it.facing || 'S';
      const hx = f === 'E' ? it.w / 2 : 0;
      const hy = f === 'S' ? it.h / 2 : 0;
      const w = f === 'E' || f === 'W' ? it.w / 2 + 0.6 : it.w + 1.0;
      const h = f === 'S' || f === 'N' ? it.h / 2 + 0.6 : it.h + 1.0;
      rug = {
        x: f === 'E' || f === 'W' ? it.x + hx - (f === 'W' ? 0.6 : 0) : it.x - 0.5,
        y: f === 'S' || f === 'N' ? it.y + hy - (f === 'N' ? 0.6 : 0) : it.y - 0.5,
        w, h,
      };
    }
    const clipped = rug && clipTo(rug, room);
    // stanze di forma libera: il tappeto si disegna solo se sta tutto dentro (a 25 cm dal muro)
    const inside = (r) => !room.poly || [[r.x - 0.25, r.y - 0.25], [r.x + r.w + 0.25, r.y - 0.25],
      [r.x + r.w + 0.25, r.y + r.h + 0.25], [r.x - 0.25, r.y + r.h + 0.25]].every((p) => pointInPolygon(p, room.poly));
    if (clipped && inside(clipped)) out.push(clipped);
  }
  return out;
}

const FLOOR_BY_KIND = {
  living: 'wood', living_kitchen: 'wood', zone_day: 'wood', zone_night: 'wood', bed: 'wood', bed_single: 'wood', study: 'wood',
  kitchen: 'tile', bath: 'tile', wc: 'tile', hotel_room: 'wood', closet: 'wood', entry: 'wood', storage: 'tile', dining: 'wood',
  laundry: 'tile', garage: 'concrete', garden: 'lawn',
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

/* Una stanza è un rettangolo (piante del motore) o un poligono libero (schizzi a mano). */
function RoomShape({ room, s, ...rest }) {
  return room.poly
    ? <path d={polyPath(room.poly, s)} {...rest} />
    : <rect x={room.x * s} y={room.y * s} width={room.w * s} height={room.h * s} {...rest} />;
}

const linePath = ({ pts, closed }, s) =>
  `M${pts.map(([x, y]) => `${(x * s).toFixed(2)} ${(y * s).toFixed(2)}`).join('L')}${closed ? 'Z' : ''}`;

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
export default function PlanSvg({
  plan, layers, hoverId = null, selectedId = null, onHover, onSelect,
  thumb = false, svgRef, zoom = 1, typeLabel = '', style = 'modern', devices = null,
}) {
  const uid = useId().replace(/:/g, '');
  const theme = THEMES[style] || THEMES.modern;
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
        <pattern id={`plank-${uid}`} width="44" height="9" patternUnits="userSpaceOnUse">
          <line x1="0" y1="8.5" x2="44" y2="8.5" stroke={theme.floorInk} strokeOpacity="0.12" />
          <line x1="22" y1="0" x2="22" y2="8.5" stroke={theme.floorInk} strokeOpacity="0.09" />
        </pattern>
        <pattern id={`herringbone-${uid}`} width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M0 8L8 0M8 16L16 8M0 8L8 16M8 0L16 8" fill="none" stroke={theme.floorInk} strokeOpacity="0.13" />
        </pattern>
        <pattern id={`lawn-${uid}`} width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M2 10l1-3M7 5l1-3M10 11l1-3" stroke="#5f8f55" strokeOpacity="0.35" strokeWidth="0.8" />
        </pattern>
        <pattern id={`concrete-${uid}`} width="90" height="90" patternUnits="userSpaceOnUse">
          <path d="M90 0H0V90" fill="none" stroke={theme.floorInk} strokeOpacity="0.10" />
          {[[12, 20], [47, 33], [70, 64], [25, 71], [61, 11]].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="0.9" fill={theme.floorInk} fillOpacity="0.14" />
          ))}
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
            <RoomShape key={`bg-${r.id}`} room={r} s={s} fill={r.color} />
          ))}
        </g>
        {plan.rooms.map((r) => {
          const kind = FLOOR_BY_KIND[r.kind];
          const fl = kind === 'wood' ? theme.floor : kind;   // 'concrete' e 'lawn' sono fissi
          return fl ? (
            <RoomShape key={`fl-${r.id}`} room={r} s={s} fill={ref(fl)} />
          ) : null;
        })}

        {layers.grid && !thumb && <rect width={W} height={H} fill={ref('grid')} pointerEvents="none" />}

        {!thumb && plan.rooms.map((r) => {
          const on = r.id === hoverId || r.id === selectedId;
          return on ? (
            <RoomShape key={`hl-${r.id}`} className="pf-hl" room={r} s={s}
              fill="#1f4fd8" fillOpacity={r.id === selectedId ? 0.16 : 0.08}
              stroke={r.id === selectedId ? '#1f4fd8' : 'none'} strokeWidth={r.id === selectedId ? 2 : 0} pointerEvents="none" />
          ) : null;
        })}

        {showFurn && (
          <g pointerEvents="none">
            {rugsFor(plan).map((r, i) => (
              <rect key={`rug-${i}`} x={r.x * s} y={r.y * s} width={r.w * s} height={r.h * s} rx={3}
                fill={theme.rug} stroke={theme.rugLine} strokeWidth="0.8" strokeDasharray="1.5 2" />
            ))}
          </g>
        )}
        {showFurn && (
          <g filter={ref('fshadow')}>
            {/* camminamenti e siepi sotto, poi il resto */}
            {[...plan.furniture].sort((a, b) => (GROUND.has(b.type) ? 1 : 0) - (GROUND.has(a.type) ? 1 : 0))
              .map((it, i) => <Furn key={`f-${i}`} item={it} scale={s} theme={theme} />)}
          </g>
        )}

        <g fill={INK}>
          {plan.walls.map((w, i) => (
            <rect key={`w-${i}`} x={w.x * s} y={w.y * s} width={w.w * s} height={w.h * s} />
          ))}
        </g>
        {plan.wallLines?.length > 0 && (
          <g fill="none" stroke={INK} strokeWidth={wt} strokeLinejoin="miter" strokeMiterlimit="3">
            {plan.wallLines.map((l, i) => <path key={`wl-${i}`} d={linePath(l, s)} />)}
          </g>
        )}

        {plan.doors.map((d, i) => {
          const sw = d.w * s;
          const dir = d.openDir;
          const col = d.entrance ? '#d92d20' : '#1f4fd8';
          const cy = wt / 2;
          if (d.kind === 'gate') return null;   // il cancello è disegnato con gli arredi del giardino
          if (d.kind === 'garage') {
            // basculante: varco nel muro e pannello che ruota verso l'alto dentro il garage
            const depth = Math.min(sw * 0.42, 0.7 * s);   // ingombro del pannello che sale (come la soglia libera nel motore)
            return (
              <g key={`d-${i}`} transform={`translate(${d.x * s},${d.y * s}) rotate(${d.rot})`}>
                <rect x={0} y={-0.4} width={sw} height={wt + 0.8} fill="#fff" />
                <rect x={0} y={0} width={2.2} height={wt} fill={INK} />
                <rect x={sw - 2.2} y={0} width={2.2} height={wt} fill={INK} />
                <rect x={3} y={dir > 0 ? cy : cy - depth} width={sw - 6} height={depth} fill="none"
                  stroke={col} strokeWidth="1" strokeDasharray="5 3" />
                <line x1={0} y1={cy} x2={sw} y2={cy} stroke={col} strokeWidth="2.6" />
              </g>
            );
          }
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
          const cx = (r.label ? r.label[0] : r.x + r.w / 2) * s;
          const cy = (r.label ? r.label[1] : r.y + r.h / 2) * s;
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
                {sel && !r.poly ? `${fmtM(r.w)} × ${fmtM(r.h)} m · ` : ''}{fmt(r.area ?? r.w * r.h)} m²
              </text>
            </g>
          );
        })}

        {!thumb && plan.rooms.map((r) => (
          <RoomShape key={`hit-${r.id}`} className="pf-hit" room={r} s={s}
            fill="transparent" style={{ cursor: 'pointer' }}
            onMouseEnter={() => onHover?.(r.id)} onMouseLeave={() => onHover?.(null)}
            onClick={() => onSelect?.(r.id === selectedId ? null : r.id)} />
        ))}

        {!thumb && layers.alarm !== false && devices?.length > 0 && (
          <g pointerEvents="none" fontFamily={FONT} fontWeight="700" textAnchor="middle">
            {devices.map((d) => {
              const st = DEVICE_STYLE[d.model] || { tag: '?', color: INK };
              const r = st.tag.length > 2 ? 9.5 : 7.5;
              return (
                <g key={d.id} transform={`translate(${d.x * s},${d.y * s})`}>
                  <title>{`${AJAX_MODELS[d.model]?.name || d.model} — ${d.purpose}`}</title>
                  <circle r={r} fill={st.color} stroke="#fff" strokeWidth="1.6" />
                  <text y="2.4" fontSize={st.tag.length > 2 ? 6 : 6.8} fill="#fff">{st.tag}</text>
                </g>
              );
            })}
          </g>
        )}

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
