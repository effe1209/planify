import { useEffect, useMemo, useState } from 'react';
import { Layers, Loader2, X } from 'lucide-react';

/* Ruoli che si possono dare a un layer del DXF. */
export const LAYER_ROLES = [
  ['wall', 'Muri'], ['door', 'Porte'], ['window', 'Finestre'], ['ignore', 'Ignora'], ['other', 'Altro (arredi, quote…)'],
];
const ROLE_STYLE = {
  wall: { stroke: '#1a1d21', width: 2.2, opacity: 1 },
  door: { stroke: '#d92d20', width: 1.6, opacity: 1 },
  window: { stroke: '#2f7fd1', width: 1.6, opacity: 1 },
  ignore: { stroke: '#9aa1ab', width: 0.8, opacity: 0.25 },
  other: { stroke: '#7a8591', width: 0.8, opacity: 0.5 },
};

/*
 * Scelta dei layer del DXF: l'anteprima del disegno colorata per ruolo (muri neri, porte rosse, finestre blu) e, per ogni
 * layer, il ruolo da dargli. «Reimporta» rifà la pianta con la scelta fatta; vale più dei nomi dei layer.
 */
export default function DxfLayersDialog({ info, error, onApply, onClose, busy }) {
  const [roles, setRoles] = useState({});
  const [hover, setHover] = useState(null);
  useEffect(() => {
    if (info) setRoles(Object.fromEntries(info.layers.map((l) => [l.name, l.role])));
  }, [info]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const view = useMemo(() => {
    const b = info?.bbox;
    if (!b) return null;
    const w = Math.max(1e-6, b[2] - b[0]);
    const h = Math.max(1e-6, b[3] - b[1]);
    const pad = Math.max(w, h) * 0.04;
    return { x: b[0] - pad, y: -(b[3] + pad), w: w + 2 * pad, h: h + 2 * pad, unit: Math.max(w, h) / 600 };
  }, [info]);
  const changed = info && info.layers.some((l) => roles[l.name] && roles[l.name] !== l.role);

  return (
    <div className="pf-modal" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pf-modal-card pf-dxflayers" role="dialog" aria-modal="true" aria-label="Layer del DXF">
        <header>
          <strong><Layers size={15} /> Layer del DXF</strong>
          <button type="button" className="pf-x" onClick={onClose} aria-label="Chiudi"><X size={14} /></button>
        </header>
        {!info && !error && <p className="pf-hint"><Loader2 size={14} className="pf-spin" /> Leggo i layer del disegno…</p>}
        {error && <p className="pf-warn" role="alert">{error}</p>}
        {info && (
          <div className="pf-dxflayers-body">
            <svg className="pf-dxflayers-preview" viewBox={`${view?.x ?? 0} ${view?.y ?? 0} ${view?.w ?? 1} ${view?.h ?? 1}`} role="img"
              aria-label="Anteprima del disegno colorata per ruolo dei layer">
              {info.layers.map((l) => {
                const st = ROLE_STYLE[roles[l.name] || l.role] || ROLE_STYLE.other;
                const dim = hover && hover !== l.name;
                return (
                  <g key={l.name} stroke={st.stroke} strokeWidth={(hover === l.name ? st.width * 1.8 : st.width) * (view?.unit || 1)}
                    strokeLinecap="round" opacity={dim ? st.opacity * 0.35 : st.opacity} fill="none">
                    {l.segs.map((s, i) => <line key={i} x1={s[0]} y1={-s[1]} x2={s[2]} y2={-s[3]} />)}
                  </g>
                );
              })}
            </svg>
            <ul className="pf-dxflayers-list">
              {info.layers.map((l) => (
                <li key={l.name} onMouseEnter={() => setHover(l.name)} onMouseLeave={() => setHover(null)}>
                  <span className="pf-dxflayers-name" title={l.name}>{l.name} <em>{l.n}</em></span>
                  <select value={roles[l.name] || l.role} aria-label={`Ruolo del layer ${l.name}`}
                    onChange={(e) => setRoles((r) => ({ ...r, [l.name]: e.target.value }))}>
                    {LAYER_ROLES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        )}
        <footer>
          <p className="pf-hint">Passa il mouse su un layer per vederlo nel disegno. Muri neri, porte rosse, finestre blu.</p>
          <button type="button" className="pf-tool" onClick={onClose}>Annulla</button>
          <button type="button" className="pf-tool pf-tool-accent" disabled={!info || busy || !changed} onClick={() => onApply(roles)}>
            {busy ? <><Loader2 size={14} className="pf-spin" /> Importo…</> : 'Reimporta con questa scelta'}
          </button>
        </footer>
      </div>
    </div>
  );
}
