import { useEffect, useState } from 'react';
import { Bookmark, RotateCcw, X } from 'lucide-react';
import { PALETTE_KEYS, cleanPalette, parseColor, styleColors, toRgb } from '../lib/palette';
import { deletePalette, loadPalettes, savePalette } from '../lib/savedPalettes';

/* Palette pronte: cinque colori armonici (pareti, facciata, pavimenti, legno, tessuti) da cui partire e ritoccare. */
const PRESETS = [
  { name: 'Sabbia e salvia', colors: { walls: '#f1ece1', facade: '#d9cfb9', floor: '#cdb48c', wood: '#d8c4a2', fabric: '#a8b59a' } },
  { name: 'Bianco e quercia', colors: { walls: '#fbfaf7', facade: '#f1f0ec', floor: '#d9c19a', wood: '#e6d3b0', fabric: '#d9dfe6' } },
  { name: 'Terra e crema', colors: { walls: '#f4e9d8', facade: '#c98f6b', floor: '#b0774e', wood: '#a9714a', fabric: '#d9b99a' } },
  { name: 'Grafite e noce', colors: { walls: '#d6d6d4', facade: '#6b7076', floor: '#7a5a3b', wood: '#6e4d32', fabric: '#8b9199' } },
  { name: 'Blu e bianco', colors: { walls: '#f5f7fa', facade: '#cfd9e6', floor: '#e0d2b8', wood: '#efe4cf', fabric: '#6f8fb5' } },
];

/* Una voce: selettore, codice esadecimale (#b7773f) e canali R G B, tutti legati allo stesso colore. */
function ColorRow({ label, value, custom, onChange }) {
  const [hex, setHex] = useState(value.toUpperCase());
  useEffect(() => { setHex(value.toUpperCase()); }, [value]);
  const rgb = toRgb(value);
  const typeHex = (v) => {
    setHex(v);
    const c = parseColor(v);
    if (c) onChange(c);
  };
  const typeChannel = (i, v) => {
    const n = Math.max(0, Math.min(255, Math.round(Number(v) || 0)));
    const next = rgb.map((x, k) => (k === i ? n : x));
    onChange(parseColor(`rgb(${next.join(',')})`));
  };
  return (
    <li>
      <div className="pf-pal-head">
        <input type="color" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)} />
        <span>{label}{!custom && <em> · stile</em>}</span>
      </div>
      <div className="pf-pal-codes">
        <input type="text" className="pf-pal-hex" value={hex} aria-label={`${label}: codice esadecimale`} spellCheck="false" maxLength={9}
          onChange={(e) => typeHex(e.target.value)} onBlur={() => setHex(value.toUpperCase())} placeholder="#B7773F" />
        {['R', 'G', 'B'].map((ch, i) => (
          <label key={ch} className="pf-pal-ch">
            <span>{ch}</span>
            <input type="number" min="0" max="255" step="1" value={rgb[i]} aria-label={`${label}: ${ch}`} onChange={(e) => typeChannel(i, e.target.value)} />
          </label>
        ))}
      </div>
    </li>
  );
}

/* Colori principali della casa: i selettori partono dai colori dello stile; chi si cambia ricolora tutto il resto. */
export default function PalettePanel({ palette, styleId, onChange }) {
  const base = styleColors(styleId);
  const cur = cleanPalette(palette) || {};
  const set = (key, value) => onChange(cleanPalette({ ...cur, [key]: value }));
  const preset = (colors) => onChange(cleanPalette(colors));
  const [saved, setSaved] = useState(loadPalettes);
  const [name, setName] = useState('');
  // si salvano i cinque colori che si vedono adesso (anche quelli ancora dello stile), così la palette resta uguale cambiando stile
  const effective = Object.fromEntries(PALETTE_KEYS.map(({ key }) => [key, cur[key] || base[key]]));
  const store = () => {
    const n = name.trim() || `Palette ${saved.length + 1}`;
    setSaved(savePalette(n, effective, saved));
    setName('');
  };
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
      <div className="pf-chips" role="group" aria-label="Le mie palette">
        {saved.map((p) => (
          <span key={p.id} className="pf-pal-saved">
            <button type="button" onClick={() => preset(p.colors)} title={`Applica «${p.name}»`}>
              <span className="pf-pal-dots" aria-hidden="true">{Object.values(p.colors).map((c, i) => <i key={i} style={{ background: c }} />)}</span>
              {p.name}
            </button>
            <button type="button" className="pf-chip-x" onClick={() => setSaved(deletePalette(p.id, saved))} aria-label={`Elimina la palette ${p.name}`} title="Elimina"><X size={11} /></button>
          </span>
        ))}
      </div>
      <ul className="pf-pal-list">
        {PALETTE_KEYS.map(({ key, label }) => (
          <ColorRow key={key} label={label} value={cur[key] || base[key]} custom={!!cur[key]} onChange={(v) => set(key, v)} />
        ))}
      </ul>
      <div className="pf-row pf-pal-save">
        <input type="text" value={name} maxLength={40} placeholder="Nome della palette" aria-label="Nome della palette da salvare"
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') store(); }} />
        <button type="button" className="pf-btn-add" onClick={store} aria-label="Salva la palette"><Bookmark size={13} /> Salva</button>
      </div>
      <div className="pf-row">
        <button type="button" className="pf-btn-add" disabled={!Object.keys(cur).length} onClick={() => onChange(null)}>
          <RotateCcw size={13} /> Torna ai colori dello stile
        </button>
      </div>
    </section>
  );
}
