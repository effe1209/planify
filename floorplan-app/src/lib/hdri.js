/* Cieli HDRI (Poly Haven, CC0, public/hdri): luce d'ambiente e riflessi veri, e sfondo «Cielo» del render. */
const FILE = { morning: 'day', noon: 'day', afternoon: 'day', sunset: 'dusk', evening: 'night' };
const cache = new Map();
export const hdriFile = (timeId) => FILE[timeId] || 'day';

/* Copia della texture con i colori attenuati verso il grigio: come luce diffusa il cielo azzurro tingerebbe
   di blu soffitto e tessuti (dentro casa le pareti rimbalzano e neutralizzano); i riflessi restano nitidi. */
function softened(THREE, tex, keep) {
  const { data, width, height } = tex.image;
  const out = new Uint16Array(data.length);
  const D = THREE.DataUtils;
  for (let i = 0; i < data.length; i += 4) {
    const r = THREE.DataUtils.fromHalfFloat(data[i]), g = D.fromHalfFloat(data[i + 1]), b = D.fromHalfFloat(data[i + 2]);
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    out[i] = D.toHalfFloat(l + (r - l) * keep);
    out[i + 1] = D.toHalfFloat(l + (g - l) * keep);
    out[i + 2] = D.toHalfFloat(l + (b - l) * keep);
    out[i + 3] = data[i + 3];
  }
  const t = new THREE.DataTexture(out, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/* Il cielo HDRI dell'ora del giorno: la texture, con in `userData.soft` la versione per la luce diffusa.
   Se il file non si carica restituisce null e resta lo studio neutro. */
export async function loadHdri(THREE, timeId) {
  const name = hdriFile(timeId);
  if (!cache.has(name)) {
    cache.set(name, import('three/examples/jsm/loaders/RGBELoader.js').then(({ RGBELoader }) => new Promise((ok) => {
      new RGBELoader().setDataType(THREE.HalfFloatType).load(`/hdri/${name}.hdr`, (t) => {
        t.mapping = THREE.EquirectangularReflectionMapping;
        try { t.userData.soft = softened(THREE, t, 0.35); } catch { t.userData.soft = t; }
        ok(t);
      }, undefined, () => ok(null));
    })).catch(() => null));
  }
  return cache.get(name);
}
