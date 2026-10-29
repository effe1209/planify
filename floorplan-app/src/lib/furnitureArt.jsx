/*
 * Disegni degli arredi principali, in vista dall'alto, con la grammatica delle forme dello stile
 * (lib/themes.js: round, arm, legs, low, tuft, accent…). Ogni disegno riceve (w, h, s, t, item):
 * larghezza e profondità in px nel riferimento dell'arredo (fronte verso il basso, muro in alto),
 * scala px/m, tema e l'arredo (per le posizioni interne o per variare le piante).
 */
import { Arm, Chair, Cushion, F_SOFT, F_STROKE, Feet, Grain, Plant, Throws } from '../components/FurnitureParts';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

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
  bed: (w, h, s, t) => {
    const n = w > 1.3 * s ? 2 : 1;
    const head = t.low ? 0.06 * s : t.tuft ? 0.14 * s : 0.08 * s;
    const plat = t.low ? 0.12 * s : 0;                    // japandi: pedana in legno attorno al materasso
    const mx = plat;
    const mw = w - 2 * plat;
    const my = head;
    const mh = h - head - plat;
    const gap = 4;
    const pw = (mw - gap * (n + 1)) / n;
    const fold = my + mh * 0.3;
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
        {Array.from({ length: n }, (_, i) => (
          <g key={i}>
            <rect x={mx + gap + i * (pw + gap)} y={my + 3} width={pw} height={mh * 0.17} rx={4} fill="#fbfbfd" stroke={F_SOFT} />
            <line x1={mx + gap + i * (pw + gap) + 3} y1={my + 3 + mh * 0.085} x2={mx + gap + i * (pw + gap) + pw - 3}
              y2={my + 3 + mh * 0.085} stroke={F_SOFT} strokeWidth="0.5" />
          </g>
        ))}
        {/* piumone con risvolto del lenzuolo e trapuntatura */}
        <rect x={mx + 1} y={fold} width={mw - 2} height={my + mh - fold - 1} rx={2} fill={t.duvet} stroke={F_SOFT} />
        <rect x={mx + 1} y={fold} width={mw - 2} height={mh * 0.06} fill="#fff" stroke={F_SOFT} strokeWidth="0.6" />
        <g stroke="#fff" strokeOpacity="0.7" strokeWidth="0.6">
          {Array.from({ length: 4 }, (_, i) => {
            const y = fold + mh * 0.06 + ((my + mh - fold - mh * 0.06) * (i + 1)) / 5;
            return <line key={i} x1={mx + 3} y1={y} x2={mx + mw - 3} y2={y} />;
          })}
        </g>
        {/* coperta ai piedi */}
        <rect x={mx} y={my + mh * 0.78} width={mw} height={mh * 0.14} fill={t.accent} fillOpacity="0.55" stroke={t.accent} strokeWidth="0.6" />
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
        <ellipse cx={w / 2} cy={h / 2} rx={Math.min(w, h) * 0.16} ry={Math.min(w, h) * 0.12} fill="#fff" fillOpacity="0.7" stroke={F_SOFT} strokeWidth="0.6" />
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
  nightstand: (w, h, s, t) => (
    <g>
      <rect width={w} height={h} rx={t.round} fill={t.wood} stroke={t.legs === 'metal' ? t.metal : t.woodLine} strokeWidth="1" />
      <line x1={2} y1={h * 0.82} x2={w - 2} y2={h * 0.82} stroke={t.woodLine} strokeOpacity="0.5" />
      <circle cx={w / 2} cy={h * 0.42} r={Math.min(w, h) * 0.3} fill="#fff8de" fillOpacity="0.9" stroke={t.woodLine} strokeWidth="0.7" />
      <circle cx={w / 2} cy={h * 0.42} r={Math.min(w, h) * 0.1} fill="#f2c94c" />
    </g>
  ),
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
    const fridge = w >= 3 * s;
    const f0 = fridge ? 0.62 * s : 0;
    const usable = w - f0;
    const sinkW = Math.min(usable * 0.3, 0.8 * s);
    // posizioni scelte dal motore (lavello sotto la finestra, fuochi lontani dal vetro) o quelle standard
    const hobC = item?.parts?.hob != null ? item.parts.hob * s : f0 + usable * (fridge ? 0.3 : 0.18) + 0.3 * s;
    const sinkX = item?.parts?.sink != null ? item.parts.sink * s - sinkW / 2 : f0 + usable * 0.58;
    const hobW = 0.6 * s;
    const hx = hobC - hobW / 2;
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
};
