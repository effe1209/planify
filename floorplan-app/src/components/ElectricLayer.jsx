import { APPLIANCES, CIRCUITS, KINDS } from '../lib/electric';

/*
 * Tavola elettrica: simboli dei punti (lib/electric.js) e collegamenti sulla pianta.
 * I simboli a parete sono disegnati con +y verso l'interno del locale; le sigle restano sempre dritte.
 */
const FONT = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const BADGE = new Set(['emergency', 'hob', 'hood', 'ev', 'motor', 'tv', 'data', 'thermostat', 'fan', 'chime',
  'intercom', 'panel', 'subpanel']);

/* Il simbolo, centrato in 0,0, con +y verso il locale. */
function Glyph({ kind, color }) {
  const sw = 1.3;
  switch (kind) {
    case 'light':
      return (
        <g>
          <circle r="6" fill="#fff" stroke={color} strokeWidth="1.4" />
          <path d="M -4.2 -4.2 L 4.2 4.2 M -4.2 4.2 L 4.2 -4.2" stroke={color} strokeWidth="1.2" />
        </g>
      );
    case 'light_wall':
      return (
        <g>
          <line x1="-6" y1="0" x2="6" y2="0" stroke={color} strokeWidth="1.6" />
          <circle cy="5" r="4.5" fill="#fff" stroke={color} strokeWidth="1.3" />
          <path d="M -3.2 1.8 L 3.2 8.2 M -3.2 8.2 L 3.2 1.8" stroke={color} strokeWidth="1.1" />
        </g>
      );
    case 'light_ext':
    case 'light_garden':
      return (
        <g>
          <circle r="5.5" fill="#fde68a" stroke={color} strokeWidth="1.3" />
          <path d="M -3.8 -3.8 L 3.8 3.8 M -3.8 3.8 L 3.8 -3.8" stroke={color} strokeWidth="1.1" />
        </g>
      );
    case 'switch':
      return <g><line x1="0" y1="4" x2="5" y2="-1.5" stroke={color} strokeWidth={sw} /><circle cy="4" r="2.4" fill={color} /></g>;
    case 'switch_2way':
      return (
        <g>
          <path d="M -5 9.5 L 0 4 L 5 -1.5" fill="none" stroke={color} strokeWidth={sw} />
          <circle cy="4" r="2.4" fill={color} />
        </g>
      );
    case 'switch_inter':
      return (
        <g>
          <path d="M -5 9.5 L 5 -1.5 M -5 -1.5 L 5 9.5" fill="none" stroke={color} strokeWidth={sw} />
          <circle cy="4" r="2.4" fill={color} />
        </g>
      );
    case 'button':
      return <g><circle cy="4" r="3.4" fill="#fff" stroke={color} strokeWidth={sw} /><circle cy="4" r="1.3" fill={color} /></g>;
    case 'bell':
      return <g><circle r="3.6" fill="#fff" stroke={color} strokeWidth={sw} /><circle r="1.4" fill={color} /></g>;
    case 'socket':
    case 'socket_ip':
    case 'dedicated':
      return (
        <g>
          <line x1="-5.5" y1="0" x2="5.5" y2="0" stroke={color} strokeWidth="1.6" />
          <path d="M -4.5 0 A 4.5 4.5 0 0 0 4.5 0" fill={kind === 'socket' ? '#fff' : color} stroke={color} strokeWidth="1.3" />
        </g>
      );
    case 'box':
      return <rect x="-3" y="-3" width="6" height="6" fill="#fff" stroke={color} strokeWidth="1.1" />;
    default:
      return <circle r="3" fill={color} />;
  }
}

function Badge({ text, color, x = 0, y = 0, big = false }) {
  const w = Math.max(big ? 18 : 11, text.length * (big ? 6.2 : 5) + 5);
  const h = big ? 11 : 8.5;
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={big ? 2 : h / 2} fill={color} stroke="#fff" strokeWidth="1" />
      <text y={big ? 3.6 : 2.9} textAnchor="middle" fontSize={big ? 8 : 6.4} fontWeight="700" fill="#fff" fontFamily={FONT}>{text}</text>
    </g>
  );
}

/* Simbolo per legende (fuori dalla pianta). */
export function ElectricGlyph({ kind, tag, size = 22 }) {
  const st = KINDS[kind] || { color: '#333' };
  const label = tag || st.tag;
  return (
    <svg width={size} height={size} viewBox="-11 -11 22 22" aria-hidden="true">
      {BADGE.has(kind) ? <Badge text={label || '?'} color={st.color} big={kind === 'panel' || kind === 'subpanel'} />
        : (
          <g transform={['light', 'light_ext', 'light_garden', 'bell', 'box'].includes(kind) ? '' : 'translate(0,-4)'}>
            <Glyph kind={kind} color={st.color} />
            {label && <Badge text={label} color={st.color} y={9} />}
          </g>
        )}
    </svg>
  );
}

const angle = (p) => (p.nx || p.ny ? (Math.atan2(-p.nx, p.ny) * 180) / Math.PI : 0);

function Point({ p, s }) {
  const st = KINDS[p.kind] || { color: '#333', label: p.kind };
  const x = p.x * s;
  const y = p.y * s;
  const what = p.tag ? `${st.label} · ${APPLIANCES[p.tag] || p.tag}` : st.label;
  const circuit = p.circuit && CIRCUITS[p.circuit] ? ` · circuito ${p.circuit} (${CIRCUITS[p.circuit].name})` : '';
  const title = <title>{`${what}${circuit}${p.note ? ` · ${p.note}` : ''}`}</title>;
  if (BADGE.has(p.kind)) {
    // sigla appena dentro il locale, davanti al muro
    return (
      <g transform={`translate(${x + (p.nx || 0) * 5},${y + (p.ny || 0) * 5})`}>
        {title}
        <Badge text={st.tag} color={st.color} big={p.kind === 'panel' || p.kind === 'subpanel'} />
      </g>
    );
  }
  const tag = p.tag || (p.kind === 'socket_ip' ? 'IP' : null);
  return (
    <g>
      {title}
      <g transform={`translate(${x},${y}) rotate(${angle(p)})`}>
        <Glyph kind={p.kind} color={st.color} />
      </g>
      {tag && <Badge text={tag} color={st.color} x={x + (p.nx || 0) * 13} y={y + (p.ny || 0) * 13} />}
    </g>
  );
}

/* Curva leggera tra comando e luce, perché le linee non si sovrappongano ai muri. */
function cmdPath([[ax, ay], [bx, by]], s) {
  const x1 = ax * s;
  const y1 = ay * s;
  const x2 = bx * s;
  const y2 = by * s;
  const mx = (x1 + x2) / 2 - (y2 - y1) * 0.18;
  const my = (y1 + y2) / 2 + (x2 - x1) * 0.18;
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
}

export default function ElectricLayer({ data, s, showLinks = true }) {
  if (!data) return null;
  return (
    <g fontFamily={FONT}>
      {showLinks && (
        <g fill="none" pointerEvents="none">
          {data.links.filter((l) => l.kind === 'feed').map((l, i) => (
            <polyline key={`f-${i}`} points={l.points.map(([x, y]) => `${x * s},${y * s}`).join(' ')}
              stroke="#64748b" strokeWidth="1" strokeDasharray="4 3" strokeOpacity="0.7" />
          ))}
          {data.links.filter((l) => l.kind === 'cmd').map((l, i) => (
            <path key={`c-${i}`} d={cmdPath(l.points, s)} stroke="#d97706" strokeWidth="0.9" strokeOpacity="0.6" />
          ))}
        </g>
      )}
      {data.points.map((p) => <Point key={p.id} p={p} s={s} />)}
    </g>
  );
}
