/* Tende, quadri e specchi (lib/decor.js) nel colore d'accento dello stile. Coordinate in metri × s. */
export default function Decor({ items, s, t }) {
  return (
    <g pointerEvents="none">
      {items.map((d, i) => {
        if (d.kind === 'curtain') {
          // pannello raccolto: bordo ondulato verso il locale
          const steps = Math.max(3, Math.round(d.len / 0.06));
          const pts = [];
          for (let k = 0; k <= steps; k++) {
            const a = (d.len * k) / steps;
            const dep = k % 2 ? 0.12 : 0.05;
            pts.push(`${(d.x + d.ux * a + d.nx * dep) * s},${(d.y + d.uy * a + d.ny * dep) * s}`);
          }
          const end = `${(d.x + d.ux * d.len) * s},${(d.y + d.uy * d.len) * s}`;
          return (
            <polygon key={i} points={`${d.x * s},${d.y * s} ${pts.join(' ')} ${end}`}
              fill={t.accentSoft} stroke={t.accent} strokeOpacity="0.6" strokeWidth="0.7" strokeLinejoin="round" />
          );
        }
        const half = (d.len / 2) * s;
        const ax = d.x * s - d.ux * half;
        const ay = d.y * s - d.uy * half;
        const bx = d.x * s + d.ux * half;
        const by = d.y * s + d.uy * half;
        const mirror = d.kind === 'mirror';
        return (
          <g key={i}>
            <line x1={ax} y1={ay} x2={bx} y2={by} stroke={mirror ? '#9aa3b2' : t.accent} strokeWidth="4.2" strokeLinecap="butt" />
            <line x1={ax + d.ux * 1.5} y1={ay + d.uy * 1.5} x2={bx - d.ux * 1.5} y2={by - d.uy * 1.5}
              stroke={mirror ? '#e4eef8' : '#fff'} strokeWidth="1.8" />
          </g>
        );
      })}
    </g>
  );
}
