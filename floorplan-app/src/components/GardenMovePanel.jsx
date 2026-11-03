import { Magnet, RotateCcw } from 'lucide-react';
import { gardenFrame } from '../lib/renderStudio';
import { gardenOffset } from '../lib/project';

const GRID = 0.25;      // passo dello scatto
const MAGNET = 0.3;     // entro questa distanza da un allineamento il giardino ci si aggancia

const snapTo = (v, targets) => {
  const near = targets.reduce((b, t) => (Math.abs(t - v) < Math.abs(b - v) ? t : b), Infinity);
  return Math.abs(near - v) <= MAGNET ? near : Math.round(v / GRID) * GRID;
};

/*
 * Sposta il giardino come vuoi: lungo la facciata e verso l'esterno, con lo scatto a 25 cm e l'aggancio agli allineamenti utili
 * (centro della casa, bordi, scala, portoncino). `facade` = project.frontOf().facade (scala e porta in coordinate della facciata).
 */
export default function GardenMovePanel({ project, facade, onChange }) {
  const gf = gardenFrame(project);
  if (!gf) return null;
  const { gw, hx, fw } = gf;
  const off = gardenOffset(project);
  const f = facade;
  const toA = (t) => t - gw / 2 + hx;   // spostamento che porta il punto t della facciata al centro del giardino
  const alongTargets = [
    { id: 'default', label: 'Come generato', a: 0 },
    { id: 'house', label: 'Centrato sulla casa', a: fw / 2 - gw / 2 + hx },
    { id: 'left', label: 'Bordo sinistro', a: hx },
    { id: 'right', label: 'Bordo destro', a: fw - gw + hx },
    ...(f?.stair ? [{ id: 'stair', label: 'Sotto la scala', a: toA(f.stair.x) }] : []),
    ...(f?.door ? [{ id: 'door', label: 'Davanti al portoncino', a: toA(f.door.x) }] : []),
  ];
  const aSnaps = alongTargets.map((t) => t.a);
  const dSnaps = [0, 1.2];
  const span = Math.round((gw + fw) / 2 + 2);
  const moved = Math.abs(off.a) > 1e-6 || Math.abs(off.d) > 1e-6;
  const label = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2).replace('.', ',')} m`;
  return (
    <div className="pf-field-sm pf-gardenmove">
      <span>Posizione del giardino</span>
      <label className="pf-field-sm">
        <span>Lungo la facciata: {label(off.a)}</span>
        <input type="range" min={-span} max={span} step={0.05} value={off.a} aria-label="Spostamento del giardino lungo la facciata"
          onChange={(e) => onChange({ a: snapTo(Number(e.target.value), aSnaps), d: off.d })} />
      </label>
      <label className="pf-field-sm">
        <span>Distanza dalla casa: {label(off.d)}</span>
        <input type="range" min={-2} max={12} step={0.05} value={off.d} aria-label="Distanza del giardino dalla casa"
          onChange={(e) => onChange({ a: off.a, d: snapTo(Number(e.target.value), dSnaps) })} />
      </label>
      <div className="pf-chips" role="group" aria-label="Allineamenti del giardino">
        {alongTargets.filter((t) => t.id !== 'default').map((t) => (
          <button key={t.id} type="button" className={`pf-chip ${Math.abs(off.a - t.a) < 0.01 ? 'is-on' : ''}`} onClick={() => onChange({ a: t.a, d: off.d })}>
            <Magnet size={11} /> {t.label}
          </button>
        ))}
      </div>
      <button type="button" className="pf-minibtn" disabled={!moved} onClick={() => onChange(null)}><RotateCcw size={12} /> Rimetti il giardino com&apos;era</button>
    </div>
  );
}
