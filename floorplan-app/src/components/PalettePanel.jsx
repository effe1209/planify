import { RotateCcw } from 'lucide-react';
import { PALETTE_KEYS, cleanPalette, styleColors } from '../lib/palette';

/* Palette pronte: cinque colori armonici (pareti, facciata, pavimenti, legno, tessuti) da cui partire e ritoccare. */
const PRESETS = [
  { name: 'Sabbia e salvia', colors: { walls: '#f1ece1', facade: '#d9cfb9', floor: '#cdb48c', wood: '#d8c4a2', fabric: '#a8b59a' } },
  { name: 'Bianco e quercia', colors: { walls: '#fbfaf7', facade: '#f1f0ec', floor: '#d9c19a', wood: '#e6d3b0', fabric: '#d9dfe6' } },
  { name: 'Terra e crema', colors: { walls: '#f4e9d8', facade: '#c98f6b', floor: '#b0774e', wood: '#a9714a', fabric: '#d9b99a' } },
  { name: 'Grafite e noce', colors: { walls: '#d6d6d4', facade: '#6b7076', floor: '#7a5a3b', wood: '#6e4d32', fabric: '#8b9199' } },
  { name: 'Blu e bianco', colors: { walls: '#f5f7fa', facade: '#cfd9e6', floor: '#e0d2b8', wood: '#efe4cf', fabric: '#6f8fb5' } },
];

/* Colori principali della casa: i selettori partono dai colori dello stile; chi si cambia ricolora tutto il resto. */
export default function PalettePanel({ palette, styleId, onChange }) {
  const base = styleColors(styleId);
  const cur = cleanPalette(palette) || {};
  const set = (key, value) => onChange(cleanPalette({ ...cur, [key]: value }));
  const preset = (colors) => onChange(cleanPalette(colors));
  return (
    <section className="pf-sec pf-palette">
      <h2>Colori della casa</h2>
      <p className="pf-hint">Cambia i colori principali: battiscopa, tende, cuscini, tappeti e giunti si adattano da soli. Vale per tutta la casa, in pianta, 3D, render e PDF.</p>
      <div className="pf-chips" role="group" aria-label="Palette pronte">
        {PRESETS.map((p) => (
          <button key={p.name} type="button" className="pf-chip pf-chip-pal" onClick={() => preset(p.colors)} title={p.name}>
            <span className="pf-pal-dots" aria-hidden="true">{Object.values(p.colors).map((c) => <i key={c} style={{ background: c }} />)}</span>
            {p.name}
          </button>
        ))}
      </div>
      <ul className="pf-pal-list">
        {PALETTE_KEYS.map(({ key, label }) => (
          <li key={key}>
            <label>
              <input type="color" value={cur[key] || base[key]} aria-label={label} onChange={(e) => set(key, e.target.value)} />
              <span>{label}</span>
              <em>{cur[key] ? cur[key].toUpperCase() : 'stile'}</em>
            </label>
          </li>
        ))}
      </ul>
      <div className="pf-row">
        <button type="button" className="pf-btn-add" disabled={!Object.keys(cur).length} onClick={() => onChange(null)}>
          <RotateCcw size={13} /> Torna ai colori dello stile
        </button>
      </div>
    </section>
  );
}
