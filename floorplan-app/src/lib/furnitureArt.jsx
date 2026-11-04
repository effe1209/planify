/*
 * Disegni degli arredi principali, in vista dall'alto, con la grammatica delle forme dello stile
 * (lib/themes.js: round, arm, legs, low, tuft, accent…). Ogni disegno riceve (w, h, s, t, item):
 * larghezza e profondità in px nel riferimento dell'arredo (fronte verso il basso, muro in alto),
 * scala px/m, tema e l'arredo (per le posizioni interne o per variare le piante).
 */
import { Arm, Chair, Cushion, F_SOFT, F_STROKE, Feet, Grain, Plant, Throws } from '../components/FurnitureParts';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* variazione ripetibile per ogni arredo (stessa posizione, stesso risultato), in -1..1 */
const vary = (item, k) => {
  let stable = 0;
  for (const c of String(item?.id || '')) stable = Math.imul(stable ^ c.charCodeAt(0), 16777619);
  const x = Math.sin(((item?.id ? stable : (item?.x ?? 0) * 12.9898 + (item?.y ?? 0) * 78.233) + k * 37.719)) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};

/* Cuscino morbido visto dall'alto: lati leggermente rigonfi e angoli arrotondati, come un cuscino vero (non un rettangolo). */
const pillowPath = (x, y, w, h) => {
  const c = Math.min(w, h) * 0.3;
  const b = Math.min(w, h) * 0.07;
  return `M ${x + c} ${y} Q ${x + w / 2} ${y - b} ${x + w - c} ${y} Q ${x + w} ${y} ${x + w} ${y + c} Q ${x + w + b} ${y + h / 2} ${x + w} ${y + h - c}`
    + ` Q ${x + w} ${y + h} ${x + w - c} ${y + h} Q ${x + w / 2} ${y + h + b} ${x + c} ${y + h} Q ${x} ${y + h} ${x} ${y + h - c} Q ${x - b} ${y + h / 2} ${x} ${y + c} Q ${x} ${y} ${x + c} ${y} Z`;
};
/* pieghette negli angoli del cuscino */
const pillowCreases = (x, y, w, h) => {
  const k = Math.min(w, h) * 0.2;
  return [[x + k * 0.5, y + k * 0.5, 1, 1], [x + w - k * 0.5, y + k * 0.5, -1, 1], [x + k * 0.5, y + h - k * 0.5, 1, -1], [x + w - k * 0.5, y + h - k * 0.5, -1, -1]]
    .map(([cx, cy, dx, dy]) => `M ${cx} ${cy} q ${dx * k * 0.5} ${dy * k * 0.15} ${dx * k * 0.9} ${dy * k * 0.6}`).join(' ');
};
/* striscia (coperta) con i lati un po' ondulati: x, y = angolo, w, h = misure, `ph` = fase */
const wavyStrip = (x, y, w, h, ph) => {
  const n = 14;
  const left = Array.from({ length: n + 1 }, (_, i) => [x + Math.sin(i * 0.9 + ph) * w * 0.035, y + (h * i) / n]);
  const right = Array.from({ length: n + 1 }, (_, i) => [x + w + Math.sin(i * 0.8 + ph * 1.7) * w * 0.035, y + h - (h * i) / n]);
  return `M ${[...left, ...right].map(([px, py]) => `${px.toFixed(1)} ${py.toFixed(1)}`).join(' L ')} Z`;
};

export const FURNITURE_ART = {
  sofa: (w, h, s, t) => {
    const back = Math.min(h * 0.28, 0.26 * s);
    const arm = t.arm === 'slim' ? Math.min(w * 0.06, 0.08 * s) : Math.min(w * 0.1, 0.16 * s);
    const n = w > 1.9 * s ? 3 : 2;
    const seatW = (w - 2 * arm - 2) / n;
    const r = t.round;
    return (
      <g>
        <rect width={w} height={h} rx={r + 1} fill={t.fabric} stroke={F_STROKE} strokeWidth="1.2" />
        {Array.from({ length: n }, (_, i) => (
          <Cushion key={`b${i}`} x={arm + 1 + i * seatW} y={1.5} w={seatW - 1} h={back} r={r} fill={t.fabricArm} seam={false} />
        ))}
        {Array.from({ length: n }, (_, i) => (
          <Cushion key={`s${i}`} x={arm + 1 + i * seatW} y={back + 1} w={seatW - 1} h={h - back - 3} r={r} fill={t.fabricSoft} />
        ))}
        {t.tuft && Array.from({ length: n * 2 }, (_, i) => (
          <circle key={`t${i}`} cx={arm + 1 + (seatW * (i + 0.5)) / 2} cy={back * 0.5} r={0.8} fill={F_STROKE} fillOpacity="0.5" />
        ))}
        <Arm x={0} y={0} w={arm} h={h} t={t} />
        <Arm x={w - arm} y={0} w={arm} h={h} t={t} />
        <Throws x0={arm} x1={w - arm} y={back + 1} depth={h - back - 3} t={t} s={s} />
      </g>
    );
  },
  /* angolare: schienale in alto, penisola (chaise) a destra verso il basso */
  sofa_corner: (w, h, s, t) => {
    const back = 0.24 * s;
    const seatD = Math.min(0.95 * s, h * 0.55);
    const chaise = Math.min(0.95 * s, w * 0.4);
    const r = t.round;
    const n = Math.max(2, Math.round((w - chaise) / (0.75 * s)));
    const seatW = (w - chaise - back) / n;
    return (
      <g>
        <path d={`M0 0H${w}V${h}H${w - chaise}V${seatD}H0Z`} fill={t.fabric} stroke={F_STROKE} strokeWidth="1.2" strokeLinejoin="round" />
        {Array.from({ length: n }, (_, i) => (
          <Cushion key={`s${i}`} x={back + i * seatW + 0.5} y={back} w={seatW - 1} h={seatD - back - 2} r={r} fill={t.fabricSoft} />
        ))}
        <Cushion x={w - chaise + 1} y={back} w={chaise - back - 2} h={h - back - 2} r={r} fill={t.fabricSoft} />
        <rect x={0} y={0} width={back} height={seatD} rx={r} fill={t.fabricArm} stroke={F_SOFT} strokeWidth="0.8" />
        <rect x={w - back} y={0} width={back} height={h} rx={r} fill={t.fabricArm} stroke={F_SOFT} strokeWidth="0.8" />
        <rect x={0} y={0} width={w} height={back} rx={r} fill={t.fabricArm} stroke={F_SOFT} strokeWidth="0.8" />
        <Throws x0={back} x1={w - chaise} y={back + 1} depth={seatD - back - 3} t={t} s={s} />
      </g>
    );
  },
  armchair: (w, h, s, t) => {
    const arm = t.arm === 'slim' ? w * 0.08 : w * 0.17;
    const back = h * 0.26;
    return (
      <g>
        <rect width={w} height={h} rx={t.round + 3} fill={t.fabric} stroke={F_STROKE} strokeWidth="1.1" />
        <Cushion x={arm} y={1.5} w={w - 2 * arm} h={back} r={t.round} fill={t.fabricArm} seam={false} />
        <Cushion x={arm} y={back + 1} w={w - 2 * arm} h={h - back - 2.5} r={t.round} fill={t.fabricSoft} />
        <Arm x={0} y={0} w={arm} h={h} t={t} />
        <Arm x={w - arm} y={0} w={arm} h={h} t={t} />
        <rect x={w / 2 - 0.1 * s} y={back + 3} width={0.2 * s} height={0.2 * s} rx={3} fill={t.accent} fillOpacity="0.8" />
      </g>
    );
  },
  bed: (w, h, s, t, item) => {
    const n = w > 1.3 * s ? 2 : 1;
    const head = t.low ? 0.06 * s : t.tuft ? 0.14 * s : 0.08 * s;
    const plat = t.low ? 0.12 * s : 0;                    // japandi: pedana in legno attorno al materasso
    const mx = plat;
    const mw = w - 2 * plat;
    const my = head;
    const mh = h - head - plat;
    const gap = 4;
    const n2 = w > 1.7 * s ? 3 : w > 1.1 * s ? 2 : 1;
    const pw2 = (mw - gap * (n2 + 1)) / n2;
    const fold = my + mh * 0.34;
    return (
      <g>
        {t.low && <rect width={w} height={h} rx={t.round} fill={t.wood} stroke={t.woodLine} strokeWidth="1.1" />}
        <rect x={t.low ? 0 : -1} y={0} width={t.low ? w : w + 2} height={head} rx={t.round}
          fill={t.legs === 'metal' && !t.tuft ? t.metal : t.tuft ? t.fabricArm : t.wood}
          stroke={t.legs === 'metal' ? t.metal : t.woodLine} strokeWidth="1" />
        {t.tuft && Array.from({ length: Math.round(w / 9) }, (_, i) => (
          <circle key={i} cx={4 + i * 9} cy={head / 2} r={0.9} fill={F_STROKE} fillOpacity="0.45" />
        ))}
        <rect x={mx} y={my} width={mw} height={mh} rx={3} fill="#fff" stroke={F_STROKE} strokeWidth="1.1" />
        {/* cuscini: fila dietro bianca (1-3), forme morbide, ognuno un po' diverso; davanti due più piccoli verde e sabbia */}
        {item.integratedPillows !== false && Array.from({ length: n2 }, (_, i) => {
          const px = mx + gap + i * (pw2 + gap) + vary(item, i) * 1.2;
          const py = my + 3 + vary(item, i + 9) * 1;
          const ph = mh * 0.19;
          return (
            <g key={i} transform={`rotate(${(vary(item, i + 20) * 2.2).toFixed(2)} ${px + pw2 / 2} ${py + ph / 2})`}>
              <path d={pillowPath(px, py, pw2, ph)} fill="#fbfbfd" stroke={F_SOFT} strokeWidth="0.9" />
              <path d={pillowCreases(px, py, pw2, ph)} fill="none" stroke={F_SOFT} strokeWidth="0.5" />
              <path d={`M ${px + pw2 * 0.18} ${py + ph * 0.55} Q ${px + pw2 / 2} ${py + ph * 0.66} ${px + pw2 * 0.82} ${py + ph * 0.55}`} fill="none" stroke={F_SOFT} strokeWidth="0.5" />
            </g>
          );
        })}
        {/* piumone con risvolto del lenzuolo e trapuntatura */}
        <rect x={mx + 1} y={fold} width={mw - 2} height={my + mh - fold - 1} rx={Math.min(8, mw * 0.05)} fill={t.duvet} stroke={F_SOFT} />
        <path d={`M ${mx + 1} ${fold + mh * 0.06} Q ${mx + mw * 0.3} ${fold + mh * 0.075 + vary(item, 41) * 1.5} ${mx + mw * 0.55} ${fold + mh * 0.06} T ${mx + mw - 1} ${fold + mh * 0.06} L ${mx + mw - 1} ${fold} L ${mx + 1} ${fold} Z`}
          fill="#fff" stroke={F_SOFT} strokeWidth="0.6" />
        <g stroke="#fff" strokeOpacity="0.7" strokeWidth="0.6">
          {Array.from({ length: 4 }, (_, i) => {
            const y = fold + mh * 0.06 + ((my + mh - fold - mh * 0.06) * (i + 1)) / 5;
            return <line key={i} x1={mx + 3} y1={y} x2={mx + mw - 3} y2={y} />;
          })}
        </g>
        {/* cuscini davanti, sopra il piumone */}
        {item.integratedPillows !== false && [[0.2, '#7d8050', -0.05], [0.5, '#e8dcc3', 0.04]].map(([k, c, rot], i) => {
          const cw = Math.min(mw * 0.3, 0.42 * s);
          const cx = mx + mw * (n2 > 1 ? k + 0.12 : 0.5) - cw / 2 + vary(item, 60 + i) * 2;
          const cy0 = fold - mh * 0.05 + vary(item, 70 + i) * 1.5;
          const ch = mh * 0.17;
          return (
            <g key={i} transform={`rotate(${(rot * 57 + vary(item, 80 + i) * 8).toFixed(1)} ${cx + cw / 2} ${cy0 + ch / 2})`}>
              <path d={pillowPath(cx, cy0, cw, ch)} fill={c} stroke="#5f6240" strokeOpacity="0.5" strokeWidth="0.7" />
              <path d={pillowCreases(cx, cy0, cw, ch)} fill="none" stroke="#5f6240" strokeOpacity="0.35" strokeWidth="0.5" />
            </g>
          );
        })}
        {/* coperta verde drappeggiata in lungo sul letto, con lati ondulati, pieghe e frange irregolari ai piedi */}
        {item.integratedThrow !== false && (() => {
          const sw = Math.min(mw * 0.22, 0.4 * s);
          const sx = mx + mw / 2 - sw / 2 + vary(item, 90) * 1.5;
          const y0 = fold + mh * 0.1;
          const y1 = my + mh - 2;
          const ph = vary(item, 95) * 3;
          const folds = [0.22, 0.5, 0.74].map((f, k) => `M ${sx + sw * 0.1} ${y0 + (y1 - y0) * f} q ${sw * 0.4} ${(k % 2 ? -1 : 1) * 2.2} ${sw * 0.8} ${(k % 2 ? 1 : -1) * 0.8}`).join(' ');
          return (
            <g>
              <path d={wavyStrip(sx, y0, sw, y1 - y0, ph)} fill="#7d8050" fillOpacity="0.93" stroke="#5f6240" strokeWidth="0.7" strokeLinejoin="round" />
              <path d={folds} fill="none" stroke="#5f6240" strokeOpacity="0.4" strokeWidth="0.8" />
              <line x1={sx + sw * 0.15} y1={y0 + 2} x2={sx + sw * 0.15} y2={y1 - 3} stroke="#d9d6b4" strokeOpacity="0.45" strokeWidth="0.6" />
              <line x1={sx + sw * 0.85} y1={y0 + 2} x2={sx + sw * 0.85} y2={y1 - 3} stroke="#d9d6b4" strokeOpacity="0.45" strokeWidth="0.6" />
              <path d={Array.from({ length: 9 }, (_, i) => `M ${sx + (sw * i) / 8} ${y1} v ${(2.4 + 1.6 * Math.abs(vary(item, 100 + i))).toFixed(1)}`).join(' ')} stroke="#7d8050" strokeWidth="0.8" />
            </g>
          );
        })()}
      </g>
    );
  },
  table: (w, h, s, t) => {
    const horiz = w >= h;
    const long = Math.max(w, h);
    const n = clamp(Math.floor(long / (0.55 * s)), 1, 8);
    const cl = 0.42 * s;
    const cd = 0.38 * s;
    const off = 0.04 * s;
    const runnerH = Math.min(h * 0.34, Math.min(w, h) * 0.28);
    const fruitR = Math.min(w, h) * 0.035;
    const chairs = [];
    for (let i = 0; i < n; i++) {
      const p = (long * (i + 0.5)) / n - cl / 2;
      if (horiz) chairs.push([p, -cd - off, cl, cd, 'up'], [p, h + off, cl, cd, 'down']);
      else chairs.push([-cd - off, p, cd, cl, 'left'], [w + off, p, cd, cl, 'right']);
    }
    if (long > 2.4 * s) {
      if (horiz) chairs.push([-cd - off, h / 2 - cl / 2, cd, cl, 'left'], [w + off, h / 2 - cl / 2, cd, cl, 'right']);
      else chairs.push([w / 2 - cl / 2, -cd - off, cl, cd, 'up'], [w / 2 - cl / 2, h + off, cl, cd, 'down']);
    }
    const r = t.legs === 'turned' ? Math.min(w, h) * 0.18 : t.round;
    return (
      <g>
        {chairs.map(([x, y, cw, ch, dir], i) => <Chair key={i} x={x} y={y} w={cw} h={ch} dir={dir} t={t} />)}
        <rect width={w} height={h} rx={r} fill={t.wood} stroke={t.woodLine} strokeWidth="1.2" />
        {t.legs === 'turned' && <rect x={3} y={3} width={w - 6} height={h - 6} rx={Math.max(0, r - 3)} fill="none" stroke={t.woodLine} strokeOpacity="0.5" />}
        <Grain w={w} h={h} t={t} />
        <Feet w={w} h={h} t={t} />
        <rect x={w * 0.2} y={(h - runnerH) / 2} width={w * 0.6} height={runnerH} rx={runnerH * 0.18}
          fill={t.rug} fillOpacity="0.9" stroke={t.rugLine} strokeWidth="0.7" />
        <ellipse cx={w / 2} cy={h / 2} rx={Math.min(w, h) * 0.16} ry={Math.min(w, h) * 0.12} fill="#fff" fillOpacity="0.7" stroke={F_SOFT} strokeWidth="0.6" />
        {['#bd5946', '#d6a644', '#75924d'].map((color, i) => (
          <circle key={color} cx={w / 2 + (i - 1) * fruitR * 2.1} cy={h / 2 + (i === 1 ? -fruitR * 0.35 : 0)} r={fruitR} fill={color} stroke="#fff" strokeWidth="0.5" />
        ))}
      </g>
    );
  },
  table_round: (w, h, s, t) => {
    const r = Math.min(w, h) / 2;
    const n = clamp(Math.round((2 * Math.PI * (r / s)) / 0.6), 2, 8);
    const cs = 0.4 * s;
    return (
      <g>
        {Array.from({ length: n }, (_, i) => {
          const a = (2 * Math.PI * i) / n - Math.PI / 2;
          const cx = w / 2 + Math.cos(a) * (r + cs * 0.45);
          const cy = h / 2 + Math.sin(a) * (r + cs * 0.45);
          return (
            <g key={i} transform={`rotate(${(a * 180) / Math.PI + 90} ${cx} ${cy})`}>
              <Chair x={cx - cs / 2} y={cy - cs / 2} w={cs} h={cs} dir="down" t={t} />
            </g>
          );
        })}
        <circle cx={w / 2} cy={h / 2} r={r} fill={t.wood} stroke={t.woodLine} strokeWidth="1.2" />
        {[0.72, 0.45].map((k) => <circle key={k} cx={w / 2} cy={h / 2} r={r * k} fill="none" stroke={t.woodLine} strokeOpacity="0.25" strokeWidth="0.6" />)}
        {t.legs === 'metal' && <circle cx={w / 2} cy={h / 2} r={r + 1} fill="none" stroke={t.metal} strokeWidth="1.4" />}
        <circle cx={w / 2} cy={h / 2} r={r * 0.2} fill="#fff" fillOpacity="0.75" stroke={F_SOFT} strokeWidth="0.6" />
      </g>
    );
  },
  coffee_table: (w, h, s, t) => {
    const marble = t.legs === 'metal' && t.tuft;           // lusso: piano in marmo con bordo in ottone
    const r = t.arm === 'round' ? Math.min(w, h) / 2 : t.round + 1;
    return (
      <g>
        <rect x={1} y={1} width={w - 2} height={h - 2} rx={r} fill={marble ? '#f7f5f2' : t.wood}
          stroke={t.legs === 'metal' ? t.metal : t.woodLine} strokeWidth={t.legs === 'metal' ? 1.6 : 1} />
        {marble
          ? <path d={`M ${w * 0.15} ${h * 0.3} C ${w * 0.4} ${h * 0.1} ${w * 0.5} ${h * 0.8} ${w * 0.85} ${h * 0.6}`} fill="none" stroke="#c9c4bc" strokeWidth="0.7" />
          : <Grain w={w} h={h} t={t} />}
        {/* libri e una ciotola */}
        <rect x={w * 0.12} y={h * 0.25} width={w * 0.28} height={h * 0.5} rx={1} fill={t.accent} fillOpacity="0.75" />
        <rect x={w * 0.15} y={h * 0.3} width={w * 0.22} height={h * 0.4} rx={1} fill="#fff" fillOpacity="0.6" />
        <circle cx={w * 0.7} cy={h / 2} r={Math.min(w, h) * 0.18} fill="#fff" stroke={F_SOFT} strokeWidth="0.7" />
      </g>
    );
  },
  desk: (w, h, s, t) => (
    <g>
      <rect x={w / 2 - 0.22 * s} y={h - 0.08 * s} width={0.44 * s} height={0.42 * s} rx={6} fill="#e3e7ee" stroke={F_STROKE} strokeWidth="0.9" />
      <rect x={w / 2 - 0.16 * s} y={h + 0.22 * s} width={0.32 * s} height={0.08 * s} rx={2} fill="#cfd5de" />
      <rect width={w} height={h} rx={t.round} fill={t.wood} stroke={t.legs === 'metal' ? t.metal : t.woodLine} strokeWidth="1.2" />
      <Grain w={w} h={h} t={t} />
      {/* portatile aperto e lampada da tavolo */}
      <rect x={w / 2 - 0.17 * s} y={h * 0.14} width={0.34 * s} height={Math.max(2, h * 0.1)} rx={1} fill="#2b3340" />
      <rect x={w / 2 - 0.17 * s} y={h * 0.3} width={0.34 * s} height={Math.max(3, h * 0.32)} rx={1.5} fill="#e5e8ed" stroke={F_SOFT} strokeWidth="0.6" />
      <g stroke={F_SOFT} strokeWidth="0.4">
        {[0.38, 0.46, 0.54].map((k) => <line key={k} x1={w / 2 - 0.14 * s} y1={h * k} x2={w / 2 + 0.14 * s} y2={h * k} />)}
      </g>
      <circle cx={w - 0.16 * s} cy={h * 0.32} r={0.09 * s} fill="#fff7d6" stroke={t.woodLine} strokeWidth="0.8" />
      <circle cx={w - 0.16 * s} cy={h * 0.32} r={0.03 * s} fill="#f2c94c" />
    </g>
  ),
  nightstand: (w, h, s, t, item) => {
    const p = Math.min(w, h) * 0.36;
    const lampX = w * 0.72;
    const lampY = h * 0.34;
    const lampR = Math.min(w, h) * 0.18;
    return (
      <g>
        <rect width={w} height={h} rx={t.round} fill={t.wood} stroke={t.legs === 'metal' ? t.metal : t.woodLine} strokeWidth="1" />
        <g transform={`translate(${w * 0.1} ${h * 0.08})`}><Plant w={p} h={p} t={t} item={item} /></g>
        <circle cx={lampX} cy={lampY} r={lampR} fill="#fff8de" fillOpacity="0.9" stroke={t.woodLine} strokeWidth="0.7" />
        <circle cx={lampX} cy={lampY} r={lampR * 0.62} fill="none" stroke="#d8c99e" strokeOpacity="0.75" strokeWidth="0.65" />
        <circle cx={lampX} cy={lampY} r={lampR * 0.24} fill="#f2c94c" />
        <line x1={2} y1={h * 0.82} x2={w - 2} y2={h * 0.82} stroke={t.woodLine} strokeOpacity="0.5" />
        <line x1={w * 0.43} y1={h * 0.91} x2={w * 0.57} y2={h * 0.91} stroke={t.woodLine} strokeWidth="1.2" strokeLinecap="round" />
      </g>
    );
  },
  wardrobe: (w, h, s, t) => {
    const n = Math.max(2, Math.round(w / (0.5 * s)));
    const dw = w / n;
    return (
      <g>
        <rect width={w} height={h} rx={Math.min(t.round, 2)} fill={t.cabinet} stroke={F_STROKE} strokeWidth="1.1" />
        {Array.from({ length: n - 1 }, (_, i) => (
          <line key={i} x1={dw * (i + 1)} y1={0} x2={dw * (i + 1)} y2={h} stroke={F_SOFT} />
        ))}
        {/* maniglie al centro di ogni coppia di ante, sul fronte */}
        {Array.from({ length: n }, (_, i) => {
          const x = i % 2 ? dw * i + 3 : dw * (i + 1) - 3;
          return <line key={`m${i}`} x1={x} y1={h - 1.5} x2={x} y2={h - 6} stroke={t.legs === 'metal' ? t.metal : t.woodLine} strokeWidth="1.4" strokeLinecap="round" />;
        })}
      </g>
    );
  },
  kitchen_counter: (w, h, s, t, item) => {
    const fridge = w >= 3 * s && !item?.noFridge;   // con la cucina completa il frigo è una colonna a parte
    const f0 = fridge ? 0.62 * s : 0;
    const usable = w - f0;
    const sinkW = Math.min(usable * 0.3, 0.8 * s);
    // posizioni scelte dal motore (lavello sotto la finestra, fuochi lontani dal vetro) o quelle standard
    const hobC = item?.parts?.hob != null ? item.parts.hob * s : f0 + usable * (fridge ? 0.3 : 0.18) + 0.3 * s;
    const sinkX = item?.parts?.sink != null ? item.parts.sink * s - sinkW / 2 : f0 + usable * 0.58;
    const hobW = 0.6 * s;
    const hx = hobC - hobW / 2;
    const applianceGap = sinkX - (hx + hobW);
    const rr = Math.min(5.5, h * 0.16);
    return (
      <g>
        <rect width={w} height={h} fill="#f1f2f5" stroke={F_STROKE} strokeWidth="1.1" />
        {/* ante con maniglie sul fronte */}
        <g stroke={F_SOFT} strokeWidth="0.6">
          {Array.from({ length: Math.max(1, Math.round((w - f0) / (0.6 * s))) - 1 }, (_, i) => {
            const x = f0 + ((w - f0) * (i + 1)) / Math.round((w - f0) / (0.6 * s));
            return <line key={i} x1={x} y1={h - 4} x2={x} y2={h} />;
          })}
        </g>
        <line x1={f0 + 2} y1={h - 1.2} x2={w - 2} y2={h - 1.2} stroke={t.legs === 'metal' ? t.metal : t.woodLine} strokeWidth="0.9" strokeDasharray="7 11" />
        {fridge && (
          <g>
            <rect x={0} y={0} width={f0} height={h} fill="#e3e6eb" stroke={F_STROKE} strokeWidth="1.1" />
            <line x1={f0 * 0.15} y1={h * 0.25} x2={f0 * 0.15} y2={h * 0.75} stroke={F_STROKE} strokeWidth="1.6" strokeLinecap="round" />
          </g>
        )}
        {/* piano cottura a induzione: vetro scuro e quattro zone */}
        <rect x={hx} y={h * 0.1} width={hobW} height={h * 0.8} rx={2} fill="#2d333d" />
        {[[0.27, 0.3], [0.73, 0.3], [0.27, 0.7], [0.73, 0.7]].map(([kx, ky], i) => (
          <circle key={i} cx={hx + hobW * kx} cy={h * ky} r={rr * (i === 1 ? 1.15 : 0.9)} fill="none" stroke="#9aa3b2" strokeWidth="0.8" />
        ))}
        {/* lavello con rubinetto */}
        <rect x={sinkX} y={h * 0.18} width={sinkW} height={h * 0.62} rx={3} fill="#e3eefb" stroke={F_SOFT} />
        <circle cx={sinkX + sinkW / 2} cy={h * 0.62} r={1.4} fill={F_STROKE} />
        <path d={`M ${sinkX + sinkW / 2} ${h * 0.06} L ${sinkX + sinkW / 2} ${h * 0.3}`} stroke="#9aa3b2" strokeWidth="1.8" strokeLinecap="round" />
        {applianceGap > 0.2 * s && (() => {
          const cx = hx + hobW + applianceGap / 2;
          const rx = Math.min(h * 0.17, applianceGap * 0.19);
          const ry = Math.min(h * 0.17, rx * 0.9);
          return (
            <g>
              <ellipse cx={cx} cy={h * 0.53} rx={rx} ry={ry} fill="#d9dee5" stroke="#7c8793" strokeWidth="0.8" />
              <path d={`M ${cx - rx * 0.64} ${h * 0.53 - ry * 0.62} C ${cx - rx * 1.55} ${h * 0.53 - ry * 0.8} ${cx - rx * 1.55} ${h * 0.53 + ry * 0.8} ${cx - rx * 0.64} ${h * 0.53 + ry * 0.62}`}
                fill="none" stroke="#7c8793" strokeWidth="1.2" strokeLinecap="round" />
              <path d={`M ${cx + rx * 0.65} ${h * 0.53 - ry * 0.25} L ${cx + rx * 1.45} ${h * 0.53 - ry * 0.42} L ${cx + rx * 1.58} ${h * 0.53 - ry * 0.1}`}
                fill="none" stroke="#7c8793" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={cx} cy={h * 0.53} r={Math.min(rx * 0.22, 2.3)} fill="#f3f4f5" stroke="#7c8793" strokeWidth="0.6" />
            </g>
          );
        })()}
      </g>
    );
  },
  plant: (w, h, s, t, item) => <Plant w={w} h={h} t={t} item={item} />,

  /* ── arredi nuovi ── */
  sideboard: (w, h, s, t) => {
    const n = Math.max(2, Math.round(w / (0.45 * s)));
    return (
      <g>
        <rect width={w} height={h} rx={t.round} fill={t.wood} stroke={t.legs === 'metal' ? t.metal : t.woodLine} strokeWidth="1.1" />
        <Grain w={w} h={h} t={t} />
        {Array.from({ length: n - 1 }, (_, i) => <line key={i} x1={(w * (i + 1)) / n} y1={h - 4} x2={(w * (i + 1)) / n} y2={h} stroke={t.woodLine} strokeOpacity="0.6" />)}
        {/* vaso, libri e una lampada sul piano */}
        <circle cx={w * 0.18} cy={h * 0.45} r={Math.min(h * 0.28, 0.09 * s)} fill={t.accentSoft} stroke={t.accent} strokeWidth="0.8" />
        <rect x={w * 0.42} y={h * 0.2} width={w * 0.16} height={h * 0.5} rx={1} fill={t.accent} fillOpacity="0.7" />
        <circle cx={w * 0.82} cy={h * 0.45} r={Math.min(h * 0.3, 0.1 * s)} fill="#fff8de" stroke={t.woodLine} strokeWidth="0.7" />
      </g>
    );
  },
  bookcase: (w, h, s, t) => {
    const n = Math.max(3, Math.round(w / (0.04 * s)));
    const colors = [t.accent, '#c9b79c', '#8aa1b8', '#d6c7a8', t.woodLine, '#b9c9b0'];
    return (
      <g>
        <rect width={w} height={h} fill={t.cabinet} stroke={F_STROKE} strokeWidth="1.1" />
        {Array.from({ length: n }, (_, i) => {
          const bw = w / n;
          const hh = h * (0.55 + 0.3 * (((i * 37) % 7) / 7));
          return (i * 13) % 9 === 0 ? null : (
            <rect key={i} x={i * bw + 0.3} y={1} width={bw - 0.6} height={hh} fill={colors[(i * 7) % colors.length]} fillOpacity="0.85" />
          );
        })}
        <line x1={0} y1={h - 1} x2={w} y2={h - 1} stroke={F_STROKE} strokeWidth="0.8" />
      </g>
    );
  },
  dresser: (w, h, s, t) => (
    <g>
      <rect width={w} height={h} rx={t.round} fill={t.wood} stroke={t.legs === 'metal' ? t.metal : t.woodLine} strokeWidth="1.1" />
      <Grain w={w} h={h} t={t} />
      {[0.33, 0.66].map((k) => <line key={k} x1={w * k} y1={h - 5} x2={w * k} y2={h} stroke={t.woodLine} strokeOpacity="0.6" />)}
      {[0.16, 0.5, 0.84].map((k) => <circle key={k} cx={w * k} cy={h - 2} r={1.1} fill={t.legs === 'metal' ? t.metal : t.woodLine} />)}
      <rect x={w * 0.35} y={h * 0.15} width={w * 0.3} height={h * 0.2} rx={1} fill="#e8eef5" stroke={F_SOFT} strokeWidth="0.6" />
    </g>
  ),
  shoe_cabinet: (w, h, s, t) => (
    <g>
      <rect width={w} height={h} rx={Math.min(2, t.round)} fill={t.cabinet} stroke={F_STROKE} strokeWidth="1" />
      {[0.33, 0.66].map((k) => <line key={k} x1={w * k} y1={0} x2={w * k} y2={h} stroke={F_SOFT} />)}
      <circle cx={w * 0.15} cy={h * 0.45} r={Math.min(h * 0.25, 0.07 * s)} fill={t.accentSoft} stroke={t.accent} strokeWidth="0.7" />
      <rect x={w * 0.6} y={h * 0.3} width={w * 0.2} height={h * 0.3} rx={1} fill="#c9a86b" />
    </g>
  ),
  floor_lamp: (w, h, s, t) => (
    <g>
      <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.46} fill="#fff8de" fillOpacity="0.85" stroke={t.legs === 'metal' ? t.metal : t.woodLine} strokeWidth="0.9" />
      <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.12} fill="#f2c94c" />
    </g>
  ),
  pillow: (w, h, s, t, item) => (
    <g>
      <path d={pillowPath(1, 1, w - 2, h - 2)} fill={item.color || t.accentSoft} stroke={t.accent} strokeWidth="0.9" />
      <path d={pillowCreases(1, 1, w - 2, h - 2)} fill="none" stroke={t.accent} strokeOpacity="0.4" strokeWidth="0.65" />
    </g>
  ),
  throw: (w, h, s, t, item) => (
    <g>
      <path d={wavyStrip(1, 1, w - 2, h - 2, vary(item, 41))} fill={item.color || '#a89a7b'} fillOpacity="0.9" stroke={F_SOFT} strokeWidth="0.8" />
      {Array.from({ length: 5 }, (_, i) => <path key={i} d={`M ${w * (0.16 + i * 0.16)} ${h * 0.15} Q ${w * (0.1 + i * 0.16)} ${h * 0.5} ${w * (0.16 + i * 0.16)} ${h * 0.82}`} fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="0.65" />)}
    </g>
  ),
  book_stack: (w, h, s, t, item) => (
    <g>
      {[0, 1, 2].map((i) => {
        const bh = Math.max(1.5, h * (0.2 + (i % 2) * 0.08));
        const x = w * (0.05 + i * 0.08);
        const y = h - bh - i * Math.max(1, h * 0.07);
        return <g key={i}><rect x={x} y={y} width={w * (0.78 - i * 0.08)} height={bh} rx="1" fill={i === 0 ? (item.color || '#9b6957') : ['#65745f', '#485c72'][i - 1]} stroke={F_STROKE} strokeWidth="0.55" /><line x1={x + 2} y1={y + bh / 2} x2={x + w * 0.7} y2={y + bh / 2} stroke="#eee6d5" strokeOpacity="0.75" strokeWidth="0.6" /></g>;
      })}
    </g>
  ),
  vase: (w, h, s, t, item) => (
    <g>
      <path d={`M ${w * 0.34} ${h * 0.12} L ${w * 0.66} ${h * 0.12} L ${w * 0.68} ${h * 0.34} Q ${w * 0.94} ${h * 0.72} ${w * 0.72} ${h * 0.92} L ${w * 0.28} ${h * 0.92} Q ${w * 0.06} ${h * 0.72} ${w * 0.32} ${h * 0.34} Z`} fill={item.color || '#a98467'} stroke={F_STROKE} strokeWidth="0.8" />
      <ellipse cx={w / 2} cy={h * 0.12} rx={w * 0.16} ry={h * 0.055} fill="#eee8dc" stroke={F_STROKE} strokeWidth="0.6" />
      <path d={`M ${w * 0.5} ${h * 0.12} Q ${w * 0.42} ${h * 0.02} ${w * 0.38} ${h * 0.01} M ${w * 0.5} ${h * 0.12} Q ${w * 0.56} ${h * 0.02} ${w * 0.64} ${h * 0.04}`} fill="none" stroke="#6f8a61" strokeWidth="1" />
    </g>
  ),
  candle: (w, h, s, t, item) => (
    <g>
      <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.42} fill={item.color || '#eee5d3'} stroke={F_STROKE} strokeWidth="0.7" />
      <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.22} fill="#fff8dc" />
      <path d={`M ${w / 2} ${h * 0.18} q ${-w * 0.13} ${h * 0.16} 0 ${h * 0.26} q ${w * 0.13} ${-h * 0.11} 0 ${-h * 0.26}`} fill="#f2b64a" />
    </g>
  ),
  figurine: (w, h, s, t, item) => (
    <g fill={item.color || '#b99a69'} stroke={F_STROKE} strokeWidth="0.65">
      <ellipse cx={w / 2} cy={h * 0.76} rx={w * 0.34} ry={h * 0.2} />
      <circle cx={w / 2} cy={h * 0.4} r={Math.min(w, h) * 0.22} />
      <path d={`M ${w * 0.38} ${h * 0.26} L ${w * 0.3} ${h * 0.04} L ${w * 0.48} ${h * 0.2} M ${w * 0.62} ${h * 0.26} L ${w * 0.7} ${h * 0.04} L ${w * 0.52} ${h * 0.2}`} />
    </g>
  ),
  decor_lamp: (w, h, s, t, item) => (
    <g>
      <circle cx={w / 2} cy={h * 0.62} r={Math.min(w, h) * 0.43} fill="#f8edcf" stroke={F_STROKE} strokeWidth="0.75" />
      <circle cx={w / 2} cy={h * 0.62} r={Math.min(w, h) * 0.23} fill={item.color || '#e4d5b6'} />
      <path d={`M ${w * 0.5} ${h * 0.4} L ${w * 0.5} ${h * 0.12}`} stroke={F_STROKE} strokeWidth="1.2" />
    </g>
  ),
  wall_shelf: (w, h, s, t, item) => (
    <g>
      <rect x="0.5" y={h * 0.64} width={w - 1} height={Math.max(2, h * 0.23)} rx="1" fill={item.color || t.wood} stroke={F_STROKE} strokeWidth="0.75" />
      {[0.16, 0.24, 0.33, 0.42, 0.51].map((k, i) => <rect key={i} x={w * k} y={h * (0.24 + (i % 2) * 0.05)} width={w * 0.07} height={h * (0.38 - (i % 2) * 0.05)} rx="0.5" fill={['#9c6958', '#65745f', '#485c72', '#b58b55', '#725b77'][i]} />)}
      <line x1={w * 0.2} y1={h * 0.9} x2={w * 0.2} y2={h * 0.99} stroke={F_STROKE} strokeWidth="0.8" />
      <line x1={w * 0.8} y1={h * 0.9} x2={w * 0.8} y2={h * 0.99} stroke={F_STROKE} strokeWidth="0.8" />
    </g>
  ),
  led_strip: (w, h, s, t, item) => (
    <g>
      <rect x="0.5" y={h * 0.35} width={w - 1} height={Math.max(1.5, h * 0.3)} rx="1" fill={item.color || '#f1cf9d'} />
      <line x1="1" y1={h / 2} x2={w - 1} y2={h / 2} stroke="#fff4d5" strokeWidth="0.55" strokeDasharray="2 2" />
    </g>
  ),
};
