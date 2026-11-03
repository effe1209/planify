/*
 * Colore di un singolo arredo (item.color, #rrggbb): tinge la parte principale, imbottita (divani, poltrone, letti)
 * oppure di legno/laccato (tavoli, armadi, mobili); il resto segue lo stile. Per la pianta si ricava un tema, per il 3D
 * i materiali.
 */
export const UPHOLSTERED = /^(sofa|armchair|bed|ottoman|pouf)/;
export const isUpholstered = (type) => UPHOLSTERED.test(type);
export const validColor = (c) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null);

/* schiarisce (k > 0) o scurisce (k < 0) un colore #rrggbb */
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const t = k >= 0 ? 255 : 0;
    return Math.round(v + (t - v) * Math.abs(k));
  });
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/* tema per la pianta */
export function tintTheme(theme, type, color) {
  const c = validColor(color);
  if (!c) return theme;
  if (isUpholstered(type)) return { ...theme, fabric: c, fabricArm: shade(c, -0.1), fabricSoft: shade(c, 0.12), duvet: c };
  return { ...theme, wood: c, woodLine: shade(c, -0.3), cabinet: c, chair: c };
}

/* materiali per il 3D: copie con il colore dell'arredo (la tinta della texture PBR segue) */
export function tintMaterials(M, type, color) {
  const c = validColor(color);
  if (!c) return M;
  const keys = isUpholstered(type) ? ['fabric', 'duvet'] : ['wood', 'cabinet'];
  const out = { ...M };
  for (const k of keys) {
    if (!M[k]) continue;
    const m = M[k].clone();
    m.color.set(c);
    m.userData = { ...M[k].userData, pbrTint: c };
    out[k] = m;
  }
  return out;
}
