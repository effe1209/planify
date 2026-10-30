import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { elevation, levelMarks, section, stack } from '../lib/elevation';
import { fmt } from '../lib/utils';
import { serializeSvg } from '../lib/sheet';

const S = 38;          // pixel per metro
const PAD = 54;
const INK = '#1f2630';
const FILL = { wall: '#ece8df', below: '#d6d3cc', slab: '#8d939c', glass: '#bfe0f5', door: '#9a7b5a', roof: '#a8604a', room: '#fbfaf6' };

const num = (v) => fmt(v, 2);

/* Un disegno (prospetto o sezione) in SVG: terreno, forme, quote dei piani. */
function Drawing({ d, marks, svgRef }) {
  const w = Math.max(1, d.maxX - d.minX) * S + PAD * 2 + 30;
  const h = (d.maxY - d.minY) * S + PAD * 2;
  const X = (x) => PAD + 22 + (x - d.minX) * S;
  const Y = (y) => PAD + (d.maxY - y) * S;
  const poly = (pts) => pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
  const order = ['below', 'room', 'wall', 'glass', 'door', 'roof', 'slab'];
  const shapes = [...d.shapes].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return (
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={d.title}
      fontFamily="Figtree, system-ui, sans-serif">
      <rect width={w} height={h} fill="#fff" />
      <text x={PAD} y={26} fontSize="15" fontWeight="700" fill={INK}>{d.title}</text>
      {shapes.map((s, i) => (
        <polygon key={i} points={poly(s.pts)} fill={FILL[s.kind] || '#eee'} stroke={INK}
          strokeWidth={s.kind === 'glass' || s.kind === 'door' ? 0.8 : s.kind === 'room' ? 0 : 1.2}
          strokeDasharray={s.kind === 'below' ? '4 3' : undefined} fillOpacity={s.kind === 'glass' ? 0.8 : 1} />
      ))}
      {shapes.filter((s) => s.kind === 'room').map((s, i) => {
        const [x0, y0] = s.pts[0];
        const [x1, , , y1] = [s.pts[1][0], 0, 0, s.pts[2][1]];
        return (
          <g key={`t${i}`} fontSize="10.5" fill="#3d4654" textAnchor="middle">
            <text x={X((x0 + x1) / 2)} y={Y((y0 + y1) / 2)}>{s.name}</text>
            <text x={X((x0 + x1) / 2)} y={Y((y0 + y1) / 2) + 13} fontSize="9.5" fill="#6b7482">h {num(s.h)} m</text>
          </g>
        );
      })}
      <line x1={X(d.minX) - 22} x2={X(d.maxX) + 22} y1={Y(0)} y2={Y(0)} stroke={INK} strokeWidth="2" />
      {Array.from({ length: Math.ceil((d.maxX - d.minX + 1.5) / 0.4) }, (_, k) => {
        const x = X(d.minX - 0.7) + k * 0.4 * S;
        return <line key={k} x1={x} y1={Y(0)} x2={x - 6} y2={Y(0) + 7} stroke={INK} strokeWidth="0.7" />;
      })}
      {marks.map((m) => (
        <g key={m.label} fontSize="10.5" fill={INK}>
          <line x1={X(d.minX) - 18} x2={X(d.minX) - 6} y1={Y(m.y)} y2={Y(m.y)} stroke={INK} strokeWidth="0.8" />
          <text x={X(d.minX) - 22} y={Y(m.y) - 3} textAnchor="end">{m.label}</text>
        </g>
      ))}
      <g fontSize="10.5" fill="#6b7482" textAnchor="end">
        <text x={w - 10} y={h - 10}>altezza massima {num(d.maxY)} m sul piano terra</text>
      </g>
    </svg>
  );
}

/* Scheda dei prospetti N/E/S/O e delle sezioni, con il tetto e la posizione dei tagli. */
export default function SheetsView({ project, north = 0, roof = null, plan }) {
  const [cut, setCut] = useState({ a: 0.5, b: 0.5 });
  const levels = useMemo(() => stack(project), [project]);
  const marks = useMemo(() => levelMarks(project), [project]);
  const dims = (levels[0]?.floor.plan || plan).dimensions;
  const sheets = useMemo(() => {
    if (!levels.length) return [];
    const L = dims.length * cut.a;
    const W = dims.width * cut.b;
    return [
      ...['down', 'up', 'right', 'left'].map((s) => elevation(project, s, { north, roof })),
      section(project, 'x', L, { roof }),
      section(project, 'y', W, { roof }),
    ];
  }, [levels, project, north, roof, cut, dims]);

  const download = () => {
    const holder = document.querySelector('.pf-sheets-grid');
    const svgs = [...holder.querySelectorAll('svg')];
    const widths = svgs.map((s) => Number(s.getAttribute('width')));
    const heights = svgs.map((s) => Number(s.getAttribute('height')));
    const cols = 2;
    const rows = Math.ceil(svgs.length / cols);
    const cw = Math.max(...widths);
    const rh = Math.max(...heights);
    const body = svgs.map((s, i) => `<g transform="translate(${(i % cols) * cw},${Math.floor(i / cols) * rh})">${serializeSvg(s).xml.replace(/^<\?xml[^>]*>/, '').replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>`).join('');
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw * cols}" height="${rh * rows}" viewBox="0 0 ${cw * cols} ${rh * rows}">${body}</svg>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
    a.download = 'prospetti-e-sezioni.svg';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!sheets.length) return <div className="pf-empty"><p>Genera una pianta per vedere prospetti e sezioni.</p></div>;
  return (
    <div className="pf-sheets">
      <div className="pf-sheets-bar">
        <label>Taglio A–A <input type="range" min="0.1" max="0.9" step="0.05" value={cut.a} aria-label="Posizione del taglio A–A"
          onChange={(e) => setCut({ ...cut, a: Number(e.target.value) })} /></label>
        <label>Taglio B–B <input type="range" min="0.1" max="0.9" step="0.05" value={cut.b} aria-label="Posizione del taglio B–B"
          onChange={(e) => setCut({ ...cut, b: Number(e.target.value) })} /></label>
        <button type="button" className="pf-tool" onClick={download} title="Scarica prospetti e sezioni in un solo SVG">
          <Download size={15} /> <span>SVG</span>
        </button>
      </div>
      <div className="pf-sheets-grid">
        {sheets.map((d) => <Drawing key={d.title} d={d} marks={marks} />)}
      </div>
    </div>
  );
}
