/*
 * «Qualità alta»: path tracing (three-gpu-pathtracer) della scena di lib/renderScene.js. Calcola la luce vera: il sole che entra
 * dalle finestre e rimbalza, luce morbida del cielo, ombre fisiche, lampade accese, vetro trasparente. Più campioni = meno grana.
 * Le luci della scena (sole, punti luce) e i materiali Standard/Physical sono quelli del render in tempo reale.
 */
import { timeById } from './renderStudio';

export const SAMPLE_PRESETS = [
  { id: 'preview', label: 'Anteprima (16 campioni)', samples: 16 },
  { id: 'high', label: 'Alta (250 campioni)', samples: 250 },
  { id: 'max', label: 'Massima (800 campioni)', samples: 800 },
];

/* Vetro vero: trasparente con rifrazione, invece del vetro «a opacità» del tempo reale. */
function glassify(THREE, model) {
  const cache = new Map();
  model.traverse((o) => {
    if (!o.isMesh) return;
    const mats = [].concat(o.material);
    const next = mats.map((m) => {
      if (m.userData?.cat !== 'VETRO') return m;
      if (!cache.has(m)) {
        cache.set(m, new THREE.MeshPhysicalMaterial({ color: '#f2f8ff', transmission: 1, ior: 1.5, roughness: 0, thickness: 0.02, metalness: 0, transparent: false }));
      }
      return cache.get(m);
    });
    o.material = Array.isArray(o.material) ? next : next[0];
  });
}

/*
 * Ritorna { data, w, h } come houseImage. `built` è il risultato di buildRenderScene; `renderer` ha già dimensione e tono.
 * onProgress(0..1) ogni tanto; signal (AbortSignal) interrompe.
 */
export async function pathTraceImage(THREE, renderer, built, camera, { width, height, bg, samples = 250, onProgress = null, signal = null } = {}) {
  const { WebGLPathTracer, GradientEquirectTexture } = await import('three-gpu-pathtracer');
  const { scene, lampsOn, time, lamps } = built;
  const t = timeById(time.id);
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  glassify(THREE, built.model);
  // la grana (bump) è per il tempo reale; nel path tracing la danno già i rimbalzi, e le texture in più rallentano l'impacchettamento
  built.model.traverse((o) => { if (o.isMesh) [].concat(o.material).forEach((m) => { if (m.bumpMap) { m.bumpMap = null; m.needsUpdate = true; } }); });
  // il path tracing è fisicamente corretto: un interno con poche finestre è scuro, la macchina fotografica compensa con l'esposizione
  renderer.toneMappingExposure = t.exposure * (lampsOn ? 1.6 : 2.6);

  // cielo come ambiente: più azzurro in alto, terreno chiaro in basso; di sera è scuro
  const sky = new GradientEquirectTexture(32);
  sky.topColor.set(t.sky);
  sky.bottomColor.set(lampsOn ? '#2a2a33' : '#d4d4d4');
  sky.update();
  scene.environment = sky;
  scene.environmentIntensity = Math.max(0.15, t.env * 3.2);
  scene.background = bg.alpha ? null : new THREE.Color(bg.color);
  scene.environmentRotation?.set?.(0, 0, 0);

  // le lampade accese illuminano davvero (il tempo reale ne usa poche per velocità)
  if (lampsOn) {
    built.built.realLights.forEach((l) => l.parent?.remove(l));   // al loro posto, una luce per ogni punto luce
    const { Vector3 } = THREE;
    for (const p of lamps.slice(0, 28)) {
      const l = new THREE.PointLight('#ffd9a0', 7, 0, 2);
      l.position.copy(new Vector3(p.x, p.y, p.z));
      scene.add(l);
    }
  }
  scene.updateMatrixWorld(true);

  const pt = new WebGLPathTracer(renderer);
  pt.bounces = 8;
  pt.transmissiveBounces = 6;
  pt.filterGlossyFactor = 0.3;
  pt.renderDelay = 0;
  pt.minSamples = 1;
  pt.fadeDuration = 0;
  pt.rasterizeScene = false;
  pt.dynamicLowRes = false;
  pt.tiles.set(width > 2500 ? 4 : 2, width > 2500 ? 4 : 2);
  pt.setScene(scene, camera);
  const started = Date.now();
  let guard = 0;
  while (pt.samples < samples) {
    if (signal?.aborted) throw new Error('interrotto');
    pt.renderSample();
    // un respiro ogni tanto: la pagina resta viva e la barra avanza
    if (++guard % 2 === 0) {
      onProgress?.(Math.min(1, pt.samples / samples));
      await new Promise((r) => setTimeout(r, 0));
    }
    if (Date.now() - started > 25 * 60 * 1000) break;   // oltre 25 minuti si salva quel che c'è
  }
  const data = renderer.domElement.toDataURL('image/png');
  const done = Math.round(pt.samples);
  onProgress?.(1);
  // pt.dispose() della libreria (0.0.23) punta a un campo che non esiste: si libera a mano
  try { pt._pathTracer?.dispose?.(); pt._lowResPathTracer?.dispose?.(); pt._quad?.dispose?.(); pt._quad?.material?.dispose?.(); } catch { /* già liberato */ }
  return { data, w: width, h: height, samples: done };
}
