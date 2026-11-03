import { extStairGeometry } from '../lib/extStair';

const INK = '#14181f';
const FONT = 'system-ui, sans-serif';

/* Scala esterna al giardino in pianta: pianerottolo davanti alla porta, gradini che scendono e freccia «giù». */
export default function ExtStairShape({ es, s, labels = true }) {
  const g = extStairGeometry(es);
  const px = (r) => ({ x: r.x * s, y: r.y * s, width: r.w * s, height: r.h * s });
  const [from, to] = g.arrow;
  const ang = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const head = (len) => [[to[0] * s, to[1] * s], [to[0] * s - Math.cos(ang - 0.5) * len, to[1] * s - Math.sin(ang - 0.5) * len], [to[0] * s - Math.cos(ang + 0.5) * len, to[1] * s - Math.sin(ang + 0.5) * len]];
  const lab = g.bounds;
  return (
    <g pointerEvents="none" className="pf-extstair">
      {g.steps.map((r, i) => (
        <rect key={i} {...px(r)} fill={i % 2 ? '#f1ede6' : '#f7f4ee'} stroke={INK} strokeWidth="0.8" />
      ))}
      <rect {...px(g.landing)} fill="#e7e2d8" stroke={INK} strokeWidth="1.4" />
      <line x1={from[0] * s} y1={from[1] * s} x2={to[0] * s} y2={to[1] * s} stroke="#58760a" strokeWidth="1.6" />
      <polygon points={head(8).map((p) => p.join(',')).join(' ')} fill="#58760a" />
      {labels && (
        <text x={(lab.x + lab.w / 2) * s} y={(lab.y + lab.h) * s + 13} textAnchor="middle" fontSize="9" fontWeight="700" fontFamily={FONT} fill="#58760a"
          stroke="#fff" strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">
          Scala al giardino · −{g.rise.toFixed(2).replace('.', ',')} m
        </text>
      )}
    </g>
  );
}
