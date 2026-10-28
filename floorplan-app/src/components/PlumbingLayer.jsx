import { GENERATORS, PIPES, PKINDS } from '../lib/plumbing';

/*
 * Tavola idraulica: tubazioni (fredda, calda, dorsali, scarichi, collettore di scarico) e simboli
 * (attacchi, colonne, collettore, contatore, generatore, montante, uscita in fognatura).
 */
const FONT = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const LINE = PIPES;

function Badge({ text, color, x = 0, y = 0, outline = false }) {
  const w = Math.max(12, text.length * 5.6 + 6);
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-w / 2} y={-5.5} width={w} height={11} rx={2.5} fill={outline ? '#fff' : color} stroke={outline ? color : '#fff'} strokeWidth="1.1" />
      <text y="3.4" textAnchor="middle" fontSize="7.4" fontWeight="700" fill={outline ? color : '#fff'} fontFamily={FONT}>{text}</text>
    </g>
  );
}

/* Il simbolo di un punto, centrato in 0,0. */
export function PlumbingGlyph({ kind, tag }) {
  const st = PKINDS[kind] || { color: '#333' };
  switch (kind) {
    case 'cold':
    case 'hot':
      return <circle r="2.8" fill={st.color} stroke="#fff" strokeWidth="0.8" />;
    case 'drain':
      return <circle r="3.2" fill="#fff" stroke={st.color} strokeWidth="1.4" />;
    case 'stack':
      return (
        <g>
          <circle r="7" fill="#f3e8dc" stroke={st.color} strokeWidth="1.6" />
          <circle r="3.4" fill="none" stroke={st.color} strokeWidth="1.1" />
        </g>
      );
    case 'stack_pass':
      return <circle r="7" fill="#fff" stroke={st.color} strokeWidth="1.4" strokeDasharray="2.5 2" />;
    case 'manifold':
      return (
        <g>
          <rect x="-11" y="-5" width="22" height="5" fill="#2563eb" />
          <rect x="-11" y="0" width="22" height="5" fill="#dc2626" />
          <rect x="-11" y="-5" width="22" height="10" fill="none" stroke="#fff" strokeWidth="1" />
        </g>
      );
    default:
      return <Badge text={tag || st.tag || '?'} color={st.color} />;
  }
}

function Point({ p, s, generator }) {
  const st = PKINDS[p.kind] || { label: p.kind };
  const x = p.x * s;
  const y = p.y * s;
  const label = p.kind === 'generator' ? GENERATORS[generator]?.label || st.label : st.label;
  const title = <title>{`${label}${p.fixture ? ` · ${p.fixture}` : ''}${p.tag && p.kind === 'drain' ? ` · ${p.tag}` : ''}`}</title>;
  return (
    <g transform={`translate(${x},${y})`}>
      {title}
      <PlumbingGlyph kind={p.kind} tag={p.tag} />
      {(p.kind === 'stack' || p.kind === 'stack_pass') && <Badge text={p.tag} color={st.color} x={0} y={-13} outline />}
      {p.kind === 'drain' && p.tag && (
        <text x="5" y="-4" fontSize="6.6" fontWeight="600" fill={st.color} fontFamily={FONT}
          stroke="#fff" strokeWidth="2.2" paintOrder="stroke">{p.tag}</text>
      )}
    </g>
  );
}

export default function PlumbingLayer({ data, s, generator, showLines = true }) {
  if (!data) return null;
  const order = ['sewer', 'drain', 'main', 'cold', 'hot'];
  const lines = [...data.lines].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return (
    <g fontFamily={FONT}>
      {showLines && (
        <g fill="none" pointerEvents="none" strokeLinejoin="round">
          {lines.map((l, i) => {
            const st = LINE[l.kind] || LINE.main;
            return (
              <polyline key={i} points={l.points.map(([x, y]) => `${x * s},${y * s}`).join(' ')}
                stroke={st.stroke} strokeWidth={st.width} strokeDasharray={st.dash} strokeOpacity="0.85" />
            );
          })}
        </g>
      )}
      {data.points.map((p) => <Point key={p.id} p={p} s={s} generator={generator} />)}
    </g>
  );
}
