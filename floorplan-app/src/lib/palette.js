/*
 * Colori principali della casa: 5 scelte (pareti, facciata, pavimenti, legno degli arredi, tessuti) che ricolorano tutto il resto
 * in modo coordinato (battiscopa, tende, cuscini, tappeti, cuciture, giunti del parquet…). Vale per tutto il progetto: si vede
 * nel 3D, nel render, in Blender, nella pianta e nei PDF. Una chiave assente = il colore dello stile del piano.
 * project.palette = { walls?, facade?, floor?, wood?, fabric? } con colori '#rrggbb'.
 */
import { THEMES } from './themes';
import { STYLE_KITS } from './style3d';
import { cleanMaterials } from './materials';

export const PALETTE_KEYS = [
  { key: 'walls', label: 'Pareti interne' },
  { key: 'facade', label: 'Facciata' },
  { key: 'floor', label: 'Pavimenti' },
  { key: 'wood', label: 'Legno degli arredi' },
  { key: 'fabric', label: 'Tessuti e divani' },
];

const HEX = /^#[0-9a-f]{6}$/i;
const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const hex = (v) => `#${v.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => { const p = rgb(a); const q = rgb(b); return hex(p.map((x, i) => x + (q[i] - x) * t)); };
const tint = (c, t) => mix(c, '#ffffff', t);
const shade = (c, t) => mix(c, '#000000', t);

/* Un colore scritto a mano → '#rrggbb', o null se non si capisce: «#b7773f», «b7773f», «#b73», «rgb(183, 119, 63)», «183 119 63». */
export function parseColor(text) {
  const t = String(text ?? '').trim().toLowerCase();
  let m = /^#?([0-9a-f]{6})$/.exec(t);
  if (m) return `#${m[1]}`;
  m = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t);
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  m = /^(?:rgb\(\s*)?(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*\)?$/.exec(t);
  if (m && [m[1], m[2], m[3]].every((v) => Number(v) <= 255)) return hex([m[1], m[2], m[3]].map(Number));
  return null;
}

/* '#rrggbb' → [r, g, b]. */
export const toRgb = (c) => rgb(c);

/* Solo le chiavi valide: ciò che non è un colore esadecimale si ignora. */
export function cleanPalette(p) {
  const out = {};
  for (const { key } of PALETTE_KEYS) if (p && HEX.test(p[key] || '')) out[key] = p[key].toLowerCase();
  return Object.keys(out).length ? out : null;
}

/* I cinque colori dello stile: i valori di partenza dei selettori. */
export function styleColors(styleId) {
  const kit = STYLE_KITS[styleId] || STYLE_KITS.modern;
  const th = THEMES[styleId] || THEMES.modern;
  return { walls: kit.wallIn.color, facade: kit.facade.color, floor: kit.floor.a, wood: th.wood, fabric: th.fabric };
}

/* Il tema (arredi, tessuti, pavimento della pianta) con la palette sopra. Senza palette ritorna lo stesso tema. */
export function themeWithPalette(theme, palette, materials = null) {
  const p = cleanPalette(palette);
  const mats = cleanMaterials(materials);
  if (!p && !mats) return theme;
  const out = { ...theme, ...(p && { palette: p }), ...(mats && { materials: mats }) };
  if (!p) return out;
  if (p.wood) Object.assign(out, { wood: p.wood, woodLine: shade(p.wood, 0.3), chair: tint(p.wood, 0.1), cabinet: tint(p.wood, 0.4) });
  if (p.fabric) {
    Object.assign(out, {
      fabric: p.fabric, fabricSoft: tint(p.fabric, 0.5), fabricArm: shade(p.fabric, 0.08), duvet: tint(p.fabric, 0.4),
      rug: tint(p.fabric, 0.45), rugLine: shade(p.fabric, 0.2), accent: shade(p.fabric, 0.45), accentSoft: tint(p.fabric, 0.7),
    });
  }
  if (p.floor) out.floorInk = shade(p.floor, 0.3);
  return out;
}

/* Il kit dei materiali 3D dello stile con la palette (pareti, facciata, pavimenti dei locali asciutti). */
export function kitWithPalette(kit, palette) {
  const p = cleanPalette(palette);
  if (!p) return kit;
  const out = { ...kit };
  if (p.walls) out.wallIn = { ...kit.wallIn, color: p.walls, tone: shade(p.walls, 0.07) };
  if (p.facade) {
    // mattoni, doghe e travertino hanno la loro seconda tinta (malta, fughe): si cambia solo il colore principale
    const flat = ['stucco', 'concrete', 'woodlap', 'logwall', 'cladding'].includes(kit.facade.tex);
    out.facade = { ...kit.facade, color: p.facade, ...(flat && { tone: shade(p.facade, 0.1) }) };
  }
  if (p.floor) out.floor = { ...kit.floor, a: p.floor, b: shade(p.floor, 0.07), joint: shade(p.floor, 0.3) };
  return out;
}

/* Tema del piano `f` del progetto con la palette del progetto. */
export const themeFor = (project, f) => themeWithPalette(THEMES[f?.meta?.style] || THEMES.modern, project?.palette, project?.materials);
