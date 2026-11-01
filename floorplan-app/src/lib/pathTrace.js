/*
 * «Qualità alta»: path tracing (three-gpu-pathtracer) della scena di lib/renderScene.js. Calcola la luce vera: il sole che entra
 * dalle finestre e rimbalza, luce morbida del cielo, ombre fisiche, lampade accese, vetro trasparente.
 * Per renderlo affidabile:
 *   • i materiali hanno colori piatti (la media della texture): il path tracing impacchetta le texture a modo suo e sulle facciate
 *     sbagliava pannelli e lasciava buchi; il disegno delle texture resta nel tempo reale;
 *   • negli interni chiusi (tetto e soffitti) la luce del sole non basta: ogni locale ha una luce di riempimento morbida che
 *     rappresenta i rimbalzi che con pochi campioni non si vedrebbero;
 *   • l'esposizione si regola da sola mentre i campioni si accumulano, così l'immagine non esce né nera né bruciata;
 *   • alla fine un filtro leviga la grana residua senza sfocare i bordi.
 */
import { FLOOR_H } from './scene3d';
import { timeById } from './renderStudio';

export const SAMPLE_PRESETS = [
  { id: 'preview', label: 'Anteprima (16 campioni)', samples: 16 },
  { id: 'high', label: 'Alta (400 campioni)', samples: 400 },
  { id: 'max', label: 'Massima (1200 campioni)', samples: 1200 },
];

/* Colore medio di una texture (la prima faccia disegnata su canvas), come '#rrggbb'; null se non si legge. */
function averageColor(map) {
  try {
    const img = map?.image;
    if (!img || typeof document === 'undefined') return null;
    // si dimezza a ogni passo (come le mipmap): campionare 8×8 di colpo da un canvas grande vede solo pochi pixel (la malta, non il mattone)
    let cur = img;
    let w = img.width || 8;
    let h = img.height || 8;
    while (w > 8 || h > 8) {
      w = Math.max(8, Math.ceil(w / 2));
      h = Math.max(8, Math.ceil(h / 2));
      const next = document.createElement('canvas');
      next.width = w;
      next.height = h;
      const nctx = next.getContext('2d');
      nctx.imageSmoothingEnabled = true;
      nctx.imageSmoothingQuality = 'high';
      nctx.drawImage(cur, 0, 0, w, h);
      cur = next;
    }
    const ctx = cur.getContext ? cur.getContext('2d', { willReadFrequently: true }) : null;
    if (!ctx) return null;
    const d = ctx.getImageData(0, 0, cur.width, cur.height).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    return [r / n, g / n, b / n];
  } catch {
    return null;
  }
}

/* Colori piatti al posto delle texture, vetro vero al posto del vetro a opacità. */
function prepareMaterials(THREE, model) {
  const glassCache = new Map();
  const flat = new Map();
  model.traverse((o) => {
    if (!o.isMesh) return;
    const next = [].concat(o.material).map((m) => {
      if (m.userData?.cat === 'VETRO') {
        if (!glassCache.has(m)) glassCache.set(m, new THREE.MeshPhysicalMaterial({ color: '#f2f8ff', transmission: 1, ior: 1.5, roughness: 0, thickness: 0.02, metalness: 0 }));
        return glassCache.get(m);
      }
      if (!m.isMeshStandardMaterial) return m;
      if (!flat.has(m)) {
        const avg = averageColor(m.map);
        const n = m.clone();
        n.userData = { ...m.userData };
        if (avg) {
          const base = m.color ? [m.color.r, m.color.g, m.color.b] : [1, 1, 1];
          // la texture è in sRGB: si porta in lineare e si moltiplica per il colore del materiale
          const lin = avg.map((v) => (v / 255) ** 2.2);
          n.color = new THREE.Color().setRGB(lin[0] * base[0], lin[1] * base[1], lin[2] * base[2], THREE.LinearSRGBColorSpace);
        }
        n.map = null;
        n.bumpMap = null;
        n.normalMap = null;
        n.roughnessMap = null;
        flat.set(m, n);
      }
      return flat.get(m);
    });
    o.material = Array.isArray(o.material) ? next : next[0];
  });
}

/*
 * Geometrie uniformi: il path tracing le fonde in una sola e perde quelle che non hanno gli stessi attributi (tetto, estrusioni, muri
 * con aperture: pezzi mancanti e facciate a pannelli). Tutte non indicizzate, con posizione, normale e uv.
 */
function normalizeGeometries(THREE, model) {
  let fixed = 0;
  model.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    let g = o.geometry;
    if (g.index) { g = g.toNonIndexed(); fixed++; } else g = g.clone();
    const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    o.geometry = g;
  });
  return fixed;
}

/*
 * Una mesh con più materiali (i muri hanno una faccia per lato) diventa tante mesh con un materiale solo: il path tracing con i gruppi
 * di materiali sbagliava i colori delle facciate.
 */
function splitMultiMaterial(THREE, model) {
  const jobs = [];
  model.traverse((o) => { if (o.isMesh && Array.isArray(o.material) && o.geometry.groups.length) jobs.push(o); });
  for (const o of jobs) {
    const g = o.geometry;
    for (const grp of g.groups) {
      const sub = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(g.attributes)) {
        const sz = attr.itemSize;
        sub.setAttribute(name, new THREE.BufferAttribute(attr.array.slice(grp.start * sz, (grp.start + grp.count) * sz), sz));
      }
      const m = new THREE.Mesh(sub, o.material[grp.materialIndex]);
      m.userData = { ...o.userData };
      m.castShadow = o.castShadow;
      m.receiveShadow = o.receiveShadow;
      // stesso posto dell'originale, nello stesso gruppo (le mesh di un padre invisibile il path tracing non le vede)
      m.position.copy(o.position);
      m.quaternion.copy(o.quaternion);
      m.scale.copy(o.scale);
      o.parent.add(m);
    }
    o.parent.remove(o);
  }
  return jobs.length;
}

/* Tutto ciò che serve alla scena prima di darla al path tracing (anche per le prove senza scheda grafica). */
export function preparePathTraceScene(THREE, model) {
  prepareMaterials(THREE, model);
  normalizeGeometries(THREE, model);
  return splitMultiMaterial(THREE, model);
}

/* Una luce di riempimento per ogni locale abitato (una ogni ~25 m² nei locali grandi), a poco meno del soffitto. */
function fillLights(THREE, project) {
  const out = [];
  for (const f of project.floors || []) {
    if (typeof f.level !== 'number' || !f.plan?.rooms?.length) continue;
    const y0 = f.level * FLOOR_H;
    const h = Math.min((f.plan.height || 2.7) - 0.35, 3.4);
    for (const r of f.plan.rooms) {
      if (r.kind === 'garden' || r.kind === 'stairs' || r.poly) continue;
      const area = r.w * r.h;
      if (area < 3) continue;
      const n = Math.max(1, Math.round(area / 25));
      const alongX = r.w >= r.h;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const l = new THREE.PointLight('#fff1dc', Math.min(9, 2.5 + area * 0.09) / n ** 0.5, 0, 2);
        l.position.set(alongX ? r.x + r.w * t : r.x + r.w / 2, y0 + h, alongX ? r.y + r.h / 2 : r.y + r.h * t);
        l.userData.fill = true;
        out.push(l);
      }
    }
  }
  return out;
}

export async function pathTraceImage(THREE, renderer, built, camera, { width, height, bg, samples = 400, onProgress = null, signal = null, project = null } = {}) {
  const { WebGLPathTracer, GradientEquirectTexture, DenoiseMaterial } = await import('three-gpu-pathtracer');
  const { FullScreenQuad } = await import('three/examples/jsm/postprocessing/Pass.js');
  const { scene, lampsOn, time, lamps } = built;
  const t = timeById(time.id);
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  preparePathTraceScene(THREE, built.model);

  // cielo come ambiente: più azzurro in alto, terreno chiaro in basso; di sera è scuro
  const sky = new GradientEquirectTexture(32);
  sky.topColor.set(t.sky);
  sky.bottomColor.set(lampsOn ? '#2a2a33' : '#d4d4d4');
  sky.update();
  scene.environment = sky;
  scene.environmentIntensity = Math.max(0.2, t.env * 3.4);
  // sfondo: si disegna trasparente e si compone alla fine sul colore scelto. Così il colore è esatto (la libreria non aggiorna la
  // texture del fondo se è bianco puro, e resta nera) e l'esposizione si misura solo sulla casa
  scene.background = null;

  // lampade accese: una luce per ogni punto luce; di giorno, luci di riempimento per i rimbalzi
  built.built.realLights.forEach((l) => l.parent?.remove(l));
  if (lampsOn) {
    for (const p of lamps.slice(0, 28)) {
      const l = new THREE.PointLight('#ffd9a0', 7, 0, 2);
      l.position.set(p.x, p.y, p.z);
      scene.add(l);
    }
  }
  if (project) for (const l of fillLights(THREE, project)) { if (lampsOn) l.intensity *= 0.18; scene.add(l); }
  scene.updateMatrixWorld(true);

  let exposure = (built.exposure || t.exposure) * 2.3;
  renderer.toneMappingExposure = exposure;
  const pt = new WebGLPathTracer(renderer);
  pt.bounces = 8;
  pt.transmissiveBounces = 6;
  pt.filterGlossyFactor = 0.4;
  pt.renderDelay = 0;
  pt.minSamples = 1;
  pt.fadeDuration = 0;
  pt.rasterizeScene = false;
  pt.dynamicLowRes = false;
  pt.tiles.set(width > 2500 ? 4 : 2, width > 2500 ? 4 : 2);
  pt.setScene(scene, camera);

  // l'esposizione si regola mentre i campioni si accumulano: ogni tanto si guarda l'immagine e si corregge
  const measure = async () => {
    const { canvasStats } = await import('./render3d');
    const bgSrgb = bg.alpha ? [-99, -99, -99] : [1, 3, 5].map((i) => parseInt(bg.color.slice(i, i + 2), 16));
    return canvasStats(renderer.domElement, bgSrgb, true, 192);
  };
  const started = Date.now();
  let guard = 0;
  let nextCheck = 4;
  while (pt.samples < samples) {
    if (signal?.aborted) throw new Error('interrotto');
    pt.renderSample();
    if (pt.samples >= nextCheck && pt.samples < Math.max(40, samples * 0.4)) {
      const st = await measure();
      const target = lampsOn ? 0.3 : 0.5;
      if (st.shown > 0.03 && Math.abs(st.median - target) > 0.05) {
        exposure = Math.min(40, Math.max(0.2, exposure * (target / Math.max(0.01, st.median)) ** 0.8));
        renderer.toneMappingExposure = exposure;
      }
      nextCheck = pt.samples + Math.max(4, Math.round(samples / 20));
    }
    if (++guard % 2 === 0) {
      onProgress?.(Math.min(1, pt.samples / samples));
      await new Promise((r) => setTimeout(r, 0));
    }
    if (Date.now() - started > 25 * 60 * 1000) break;   // oltre 25 minuti si salva quel che c'è
  }
  const done = Math.round(pt.samples);

  // filtro finale: leviga la grana che resta senza sfocare i bordi (sul risultato accumulato, già tonale e sRGB)
  let denoised = false;
  try {
    const quad = new FullScreenQuad(new DenoiseMaterial({ map: pt.target.texture, sigma: 4, threshold: 0.05, kSigma: 1 }));
    renderer.setRenderTarget(null);
    renderer.autoClear = true;
    quad.render(renderer);
    quad.material.dispose();
    quad.dispose();
    denoised = true;
  } catch {
    denoised = false;   // resta l'immagine accumulata, più granulosa
  }
  let data = renderer.domElement.toDataURL('image/png');
  if (!bg.alpha) {
    // composizione sul colore dello sfondo
    const img = new Image();
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = data; });
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0);
    data = c.toDataURL('image/png');
  }
  onProgress?.(1);
  // pt.dispose() della libreria (0.0.23) punta a un campo che non esiste: si libera a mano
  try { pt._pathTracer?.dispose?.(); pt._lowResPathTracer?.dispose?.(); pt._quad?.dispose?.(); pt._quad?.material?.dispose?.(); } catch { /* già liberato */ }
  return { data, w: width, h: height, samples: done, exposure: +exposure.toFixed(2), denoised };
}
