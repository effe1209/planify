/* Pezzi comuni dei disegni degli arredi (venature, cuscini, braccioli, sedie, piante): vedi lib/furnitureArt.jsx. */

export const F_STROKE = '#5b6472';
export const F_SOFT = '#bcc3ce';
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* Variante stabile per un arredo (es. la specie della pianta), dalla sua posizione. */
const pick = (item, n) => Math.abs(Math.round(((item?.x || 0) * 7.3 + (item?.y || 0) * 13.1) * 10)) % n;

/* Venature del legno lungo il lato lungo di un piano. */
export function Grain({ w, h, t, inset = 3 }) {
  const horiz = w >= h;
  const long = horiz ? w : h;
  const short = horiz ? h : w;
  const n = clamp(Math.round(short / 7), 2, 7);
  return (
    <g stroke={t.woodLine} strokeOpacity="0.28" strokeWidth="0.6" fill="none">
      {Array.from({ length: n }, (_, i) => {
        const c = inset + ((short - 2 * inset) * (i + 0.5)) / n;
        const a = long * (0.25 + 0.1 * (i % 3));
        const d = horiz
          ? `M ${inset} ${c} C ${a} ${c - 1.2} ${long - a} ${c + 1.2} ${long - inset} ${c}`
          : `M ${c} ${inset} C ${c - 1.2} ${a} ${c + 1.2} ${long - a} ${c} ${long - inset}`;
        return <path key={i} d={d} />;
      })}
    </g>
  );
}

/* Cuscino: forma morbida (angoli ampi, lati appena rigonfi) con la cucitura. */
export function Cushion({ x, y, w, h, fill, r, seam = true }) {
  const m = Math.min(w, h);
  const c = Math.max(r, m * 0.28);
  const b = Math.min(2.2, m * 0.05);
  const d = `M ${x + c} ${y} Q ${x + w / 2} ${y - b} ${x + w - c} ${y} Q ${x + w} ${y} ${x + w} ${y + c} Q ${x + w + b} ${y + h / 2} ${x + w} ${y + h - c}`
    + ` Q ${x + w} ${y + h} ${x + w - c} ${y + h} Q ${x + w / 2} ${y + h + b} ${x + c} ${y + h} Q ${x} ${y + h} ${x} ${y + h - c} Q ${x - b} ${y + h / 2} ${x} ${y + c} Q ${x} ${y} ${x + c} ${y} Z`;
  return (
    <g>
      <path d={d} fill={fill} stroke={F_SOFT} strokeWidth="0.8" strokeLinejoin="round" />
      {seam && <rect x={x + 2} y={y + 2} width={Math.max(0, w - 4)} height={Math.max(0, h - 4)} rx={Math.max(0, c - 1.5)}
        fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="0.6" strokeDasharray="1.4 1.2" />}
    </g>
  );
}

/* Bracciolo secondo lo stile. */
export function Arm({ x, y, w, h, t }) {
  const r = t.arm === 'round' ? w / 2 : t.arm === 'rolled' ? w * 0.45 : Math.min(t.round, w / 3);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={r} fill={t.fabricArm} stroke={F_STROKE} strokeWidth="0.9" />
      {t.arm === 'rolled' && <line x1={x + w / 2} y1={y + w * 0.6} x2={x + w / 2} y2={y + h - 2} stroke="#fff" strokeOpacity="0.5" />}
    </g>
  );
}

/* Cuscini decorativi e plaid sul divano, nel colore d'accento. */
export function Throws({ x0, x1, y, depth, t, s }) {
  const p = 0.32 * s;
  return (
    <g>
      <rect x={x0 + 2} y={y + 1} width={p} height={p} rx={3} fill={t.accent} fillOpacity="0.85"
        transform={`rotate(-12 ${x0 + 2 + p / 2} ${y + 1 + p / 2})`} stroke="#fff" strokeWidth="0.6" />
      <rect x={x1 - p - 2} y={y + 1} width={p} height={p} rx={3} fill={t.accentSoft} stroke={t.accent} strokeWidth="0.6"
        transform={`rotate(10 ${x1 - p / 2 - 2} ${y + 1 + p / 2})`} />
      <path d={`M ${x1 - 0.45 * s} ${y} L ${x1} ${y} L ${x1} ${y + depth * 0.95} L ${x1 - 0.2 * s} ${y + depth * 0.95} Z`}
        fill={t.accent} fillOpacity="0.35" stroke={t.accent} strokeOpacity="0.6" strokeWidth="0.6" />
    </g>
  );
}

/* Gambe/telaio visibili da sopra (industriale: telaio in metallo; classico: piedini torniti). */
export function Feet({ w, h, t }) {
  if (t.legs === 'metal') {
    return <rect x={-1} y={-1} width={w + 2} height={h + 2} rx={1} fill="none" stroke={t.metal} strokeWidth="1.6" />;
  }
  if (t.legs === 'turned') {
    return (
      <g fill={t.woodLine}>
        {[[2.5, 2.5], [w - 2.5, 2.5], [2.5, h - 2.5], [w - 2.5, h - 2.5]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={2.2} />)}
      </g>
    );
  }
  return null;
}

/* Sedia vista da sopra: seduta e schienale verso l'esterno (dir = verso dello schienale). */
export function Chair({ x, y, w, h, dir, t }) {
  const r = Math.min(t.round + 1, Math.min(w, h) / 2);
  const back = 0.22 * Math.min(w, h);
  const seat = t.arm === 'rolled' ? t.fabric : t.chair;
  const bar = {
    up: [x, y, w, back], down: [x, y + h - back, w, back], left: [x, y, back, h], right: [x + w - back, y, back, h],
  }[dir];
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={r} fill={seat} stroke={t.legs === 'metal' ? t.metal : t.woodLine} strokeWidth="0.8" />
      <rect x={bar[0]} y={bar[1]} width={bar[2]} height={bar[3]} rx={r / 2} fill={t.legs === 'metal' ? t.metal : t.woodLine} fillOpacity="0.75" />
    </g>
  );
}

export function Plant({ w, h, t, item }) {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2;
  const kind = pick(item, 3);
  const leaves = kind === 1 ? 9 : kind === 2 ? 12 : 10;
  const length = r * (kind === 2 ? 0.76 : 0.7);
  const width = r * (kind === 1 ? 0.17 : 0.2);
  const phase = pick(item, 8) * 4.5;
  const variation = pick(item, 97);
  const pot = r * 0.25;
  return (
    <g>
      <ellipse cx={cx} cy={cy + r * 0.08} rx={r * 0.36} ry={r * 0.22} fill="#354c33" fillOpacity="0.12" />
      {Array.from({ length: leaves }, (_, i) => {
        const angle = phase + (i * 360) / leaves + (((i * 7 + variation) % 5) - 2) * 5;
        const len = length * (0.76 + ((i * 11 + variation) % 6) * 0.05);
        const leaf = `M 0 0 C ${len * 0.18} ${-width * 0.52} ${len * 0.72} ${-width * 0.42} ${len} 0`
          + ` C ${len * 0.72} ${width * 0.42} ${len * 0.18} ${width * 0.52} 0 0 Z`;
        const color = ['#5f9255', '#78a967', '#8bb877', '#4f7a4b'][(i + kind) % 4];
        return (
          <g key={i} transform={`translate(${cx} ${cy}) rotate(${angle})`}>
            <path d={leaf} fill={color} fillOpacity="0.94" stroke="#4f7a4b" strokeWidth="0.55" strokeLinejoin="round" />
            <path d={`M 1 0 Q ${len * 0.48} -0.35 ${len * 0.94} 0`} fill="none" stroke="#d5e3c5" strokeOpacity="0.65" strokeWidth="0.55" />
            {i % 2 === 0 && <path d={`M ${len * 0.46} 0 Q ${len * 0.58} ${-width * 0.2} ${len * 0.7} ${-width * 0.31} M ${len * 0.46} 0 Q ${len * 0.58} ${width * 0.2} ${len * 0.7} ${width * 0.31}`}
              fill="none" stroke="#d5e3c5" strokeOpacity="0.45" strokeWidth="0.45" />}
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={pot} fill={t.pot} stroke={t.woodLine} strokeWidth="0.8" />
      <circle cx={cx} cy={cy} r={pot * 0.72} fill="#554332" stroke="#44372d" strokeWidth="0.45" />
      <circle cx={cx - pot * 0.1} cy={cy - pot * 0.12} r={pot * 0.2} fill="#766049" fillOpacity="0.8" />
    </g>
  );
}

