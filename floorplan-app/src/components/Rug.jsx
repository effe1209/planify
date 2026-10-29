/* Tappeti disegnati con la trama dello stile (lib/themes.js: rug, rugLine, accent). */

/* Tappeto con la trama dello stile e le frange sui lati corti. */
export default function Rug({ x, y, w, h, t }) {
  const horiz = w >= h;
  const fr = [];
  const n = Math.round((horiz ? h : w) / 3);
  for (let i = 0; i <= n; i++) {
    const k = (horiz ? h : w) * (i / n);
    if (horiz) fr.push(`M ${x - 3} ${y + k} H ${x}`, `M ${x + w} ${y + k} H ${x + w + 3}`);
    else fr.push(`M ${x + k} ${y - 3} V ${y}`, `M ${x + k} ${y + h} V ${y + h + 3}`);
  }
  const ins = 6;
  let pattern = null;
  if (t.rugPattern === 'border' || t.rugPattern === 'ornament') {
    pattern = (
      <g fill="none" stroke={t.rugLine} strokeWidth="0.9">
        <rect x={x + ins} y={y + ins} width={Math.max(0, w - 2 * ins)} height={Math.max(0, h - 2 * ins)} rx={2} />
        {t.rugPattern === 'ornament' && (
          <>
            <rect x={x + ins * 2} y={y + ins * 2} width={Math.max(0, w - 4 * ins)} height={Math.max(0, h - 4 * ins)} rx={2} strokeDasharray="2 2" />
            <ellipse cx={x + w / 2} cy={y + h / 2} rx={w * 0.18} ry={h * 0.18} />
          </>
        )}
      </g>
    );
  } else if (t.rugPattern === 'stripes') {
    const k = Math.max(3, Math.round((horiz ? w : h) / 14));
    pattern = (
      <g stroke={t.accent} strokeOpacity="0.35" strokeWidth="3">
        {Array.from({ length: k }, (_, i) => (horiz
          ? <line key={i} x1={x + (w * (i + 0.5)) / k} y1={y + 2} x2={x + (w * (i + 0.5)) / k} y2={y + h - 2} />
          : <line key={i} x1={x + 2} y1={y + (h * (i + 0.5)) / k} x2={x + w - 2} y2={y + (h * (i + 0.5)) / k} />))}
      </g>
    );
  } else if (t.rugPattern === 'grid') {
    pattern = (
      <g stroke={t.rugLine} strokeOpacity="0.6" strokeWidth="0.6">
        {Array.from({ length: Math.floor(w / 12) }, (_, i) => <line key={`v${i}`} x1={x + 12 * (i + 1)} y1={y} x2={x + 12 * (i + 1)} y2={y + h} />)}
        {Array.from({ length: Math.floor(h / 12) }, (_, i) => <line key={`h${i}`} x1={x} y1={y + 12 * (i + 1)} x2={x + w} y2={y + 12 * (i + 1)} />)}
      </g>
    );
  }
  return (
    <g>
      <path d={fr.join(' ')} stroke={t.rugLine} strokeWidth="0.7" />
      <rect x={x} y={y} width={w} height={h} rx={2} fill={t.rug} stroke={t.rugLine} strokeWidth="0.8" />
      {pattern}
    </g>
  );
}
