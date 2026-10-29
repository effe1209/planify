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

/* Cuscino: rettangolo morbido con la cucitura. */
export function Cushion({ x, y, w, h, fill, r, seam = true }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} stroke={F_SOFT} strokeWidth="0.8" />
      {seam && <rect x={x + 1.6} y={y + 1.6} width={Math.max(0, w - 3.2)} height={Math.max(0, h - 3.2)} rx={Math.max(0, r - 1)}
        fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="0.6" strokeDasharray="1.4 1.2" />}
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
  const pot = <circle cx={cx} cy={cy} r={r * 0.5} fill={t.pot} stroke={t.woodLine} strokeWidth="0.8" />;
  if (kind === 0) {
    // ficus: chioma a ciuffi
    return (
      <g>
        {pot}
        {Array.from({ length: 9 }, (_, i) => {
          const a = (i / 9) * Math.PI * 2;
          const d = r * (i % 2 ? 0.55 : 0.35);
          return <circle key={i} cx={cx + Math.cos(a) * d} cy={cy + Math.sin(a) * d} r={r * 0.36}
            fill={i % 3 ? '#7fae7a' : '#6a9a66'} fillOpacity="0.92" stroke="#4f7a4b" strokeWidth="0.5" />;
        })}
      </g>
    );
  }
  if (kind === 1) {
    // monstera: foglie grandi con il taglio centrale
    return (
      <g>
        {pot}
        {Array.from({ length: 5 }, (_, i) => {
          const a = (i / 5) * Math.PI * 2 + 0.4;
          const lx = cx + Math.cos(a) * r * 0.5;
          const ly = cy + Math.sin(a) * r * 0.5;
          return (
            <g key={i} transform={`rotate(${(a * 180) / Math.PI} ${lx} ${ly})`}>
              <ellipse cx={lx} cy={ly} rx={r * 0.5} ry={r * 0.3} fill="#5f9a5d" stroke="#3e6b3c" strokeWidth="0.6" />
              <line x1={lx - r * 0.45} y1={ly} x2={lx + r * 0.45} y2={ly} stroke="#3e6b3c" strokeWidth="0.6" />
            </g>
          );
        })}
      </g>
    );
  }
  // sansevieria: foglie lunghe e appuntite
  return (
    <g>
      {pot}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const tip = [cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95];
        const l = [cx + Math.cos(a + 0.35) * r * 0.25, cy + Math.sin(a + 0.35) * r * 0.25];
        const rr = [cx + Math.cos(a - 0.35) * r * 0.25, cy + Math.sin(a - 0.35) * r * 0.25];
        return <path key={i} d={`M ${l[0]} ${l[1]} L ${tip[0]} ${tip[1]} L ${rr[0]} ${rr[1]} Z`}
          fill={i % 2 ? '#6f9c5a' : '#8bb36f'} stroke="#4a6b3a" strokeWidth="0.5" />;
      })}
    </g>
  );
}

