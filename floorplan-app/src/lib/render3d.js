/*
 * Immagine 3D di tutta la casa fuori schermo (PDF del progetto e pannello Render): scena di lib/renderScene.js (tetto,
 * soffitti, sole dalle finestre, luci e allarme), inquadratura, ora del giorno, sfondo e risoluzione a scelta.
 * Tempo reale con mappa tonale ACES, occlusione ambientale (GTAO) e bagliore delle luci accese; con `quality: 'high'`
 * il path tracing calcola la luce vera (lib/pathTrace.js). Senza opzioni: tre quarti, pomeriggio, sfondo bianco.
 * three.js si carica solo qui.
 */
import { backgroundFor, cameraViews, houseBounds, timeById } from './renderStudio';

function disposeScene(scene) {
  scene.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) [].concat(o.material).forEach((m) => m.dispose());
  });
}

export async function houseImage(project, {
  width = 1800, height = 1100, lowWalls = false, view = null, time = 'afternoon', background = 'white', roof = true,
  quality = 'fast', samples = undefined, onProgress = null, signal = null,
} = {}) {
  const THREE = await import('three');
  const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
  const { buildRenderScene } = await import('./renderScene');
  const canvas = document.createElement('canvas');
  const bg = backgroundFor(background, time);
  const t = timeById(time);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  try {
    renderer.setSize(width, height, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    let exposure = t.exposure;
    renderer.toneMappingExposure = exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(bg.color, bg.alpha ? 0 : 1);
    const v = view || cameraViews(project, { aspect: width / height })[0];
    const built = buildRenderScene(THREE, project, { renderer, RoomEnvironment, view: v, time, background, roof, lowWalls });
    if (!built) return null;
    const { scene, bounds } = built;
    const { size, bb } = bounds;
    const sunMap = width > 2500 ? 4096 : 2048;
    built.sun.shadow.mapSize.set(sunMap, sunMap);
    const camera = new THREE.PerspectiveCamera(v.fov, width / height, 0.05, 400);
    camera.position.set(...v.position);
    camera.lookAt(new THREE.Vector3(...v.target));

    // esposizione automatica: si prova il render in piccolo, si misura la luminosità di ciò che non è sfondo e si corregge
    // l'esposizione finché l'immagine non è né nera né bruciata (stile scuro, sera, GPU diversa: non importa)
    {
      const pw = 256;
      const ph = Math.max(2, Math.round((256 * height) / width));
      const probeCanvas = document.createElement('canvas');
      probeCanvas.width = pw;
      probeCanvas.height = ph;
      const pctx = probeCanvas.getContext('2d', { willReadFrequently: true });
      // colore dello sfondo in sRGB 0-255 (per non contarlo nella luminosità)
      const bgSrgb = bg.alpha ? [-99, -99, -99] : [1, 3, 5].map((i) => parseInt(bg.color.slice(i, i + 2), 16));
      renderer.setSize(pw, ph, false);
      camera.aspect = pw / ph;
      camera.updateProjectionMatrix();
      for (let i = 0; i < 3; i++) {
        renderer.toneMappingExposure = exposure;
        renderer.render(scene, camera);
        pctx.clearRect(0, 0, pw, ph);
        pctx.drawImage(canvas, 0, 0, pw, ph);
        const px = pctx.getImageData(0, 0, pw, ph).data;
        const lum = [];
        for (let k = 0; k < px.length; k += 4) {
          if (px[k + 3] < 200) continue;   // trasparente
          if (!bg.alpha && Math.abs(px[k] - bgSrgb[0]) < 6 && Math.abs(px[k + 1] - bgSrgb[1]) < 6 && Math.abs(px[k + 2] - bgSrgb[2]) < 6) continue;   // sfondo
          lum.push((0.2126 * px[k] + 0.7152 * px[k + 1] + 0.0722 * px[k + 2]) / 255);
        }
        if (lum.length < px.length / 4 * 0.03) break;
        lum.sort((x, y) => x - y);
        const med = lum[Math.floor(lum.length / 2)];
        const target = built.lampsOn ? 0.2 : 0.52;   // la sera resta più scura, ma mai nera
        if (Math.abs(med - target) < 0.04) break;
        // la risposta è circa una potenza: si corregge con un esponente per non oscillare
        // di giorno l'esposizione può cambiare molto (stili scuri); di sera resta vicina a quella della scena, che deve restare notte
        const [lo, hi] = built.lampsOn ? [t.exposure * 0.6, t.exposure * 1.5] : [0.35, 6];
        exposure = THREE.MathUtils.clamp(exposure * (target / Math.max(0.02, med)) ** 1.3, lo, hi);
      }
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.toneMappingExposure = exposure;
      built.exposure = exposure;
    }

    if (quality === 'high') {
      const { pathTraceImage } = await import('./pathTrace');
      return await pathTraceImage(THREE, renderer, built, camera, { width, height, bg, samples, onProgress, signal });
    }

    // tempo reale: render → occlusione ambientale → bagliore (luci accese) → mappa tonale e sRGB
    let drawn = false;
    if (!bg.alpha) {
      try {
        const { EffectComposer } = await import('three/examples/jsm/postprocessing/EffectComposer.js');
        const { RenderPass } = await import('three/examples/jsm/postprocessing/RenderPass.js');
        const { GTAOPass } = await import('three/examples/jsm/postprocessing/GTAOPass.js');
        const { UnrealBloomPass } = await import('three/examples/jsm/postprocessing/UnrealBloomPass.js');
        const { OutputPass } = await import('three/examples/jsm/postprocessing/OutputPass.js');
        const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4 });
        const composer = new EffectComposer(renderer, target);
        composer.setPixelRatio(1);
        composer.setSize(width, height);
        composer.addPass(new RenderPass(scene, camera));
        const ao = new GTAOPass(scene, camera, width, height);
        ao.updateGtaoMaterial({ radius: Math.max(0.35, Math.min(1.2, Math.max(size.x, size.z) / 25)), distanceExponent: 1.5, thickness: 1.5, scale: 1.1, samples: 16, distanceFallOff: 1 });
        ao.normalMaterial.side = THREE.DoubleSide;   // il tetto e i soffitti si disegnano da due lati: senza, l'AO "vede" l'interno attraverso
        ao.blendIntensity = 0.85;
        composer.addPass(ao);
        if (t.bloom > 0) composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), t.bloom, 0.6, built.lampsOn ? 0.85 : 0.95));
        composer.addPass(new OutputPass());
        composer.render();
        drawn = true;
        composer.dispose?.();
        target.dispose();
      } catch (e) {
        drawn = false;   // senza i passaggi extra si disegna diretto
      }
    }
    if (!drawn) renderer.render(scene, camera);
    const data = canvas.toDataURL('image/png');
    disposeScene(scene);
    void bb;
    return { data, w: width, h: height };
  } finally {
    renderer.dispose();
  }
}
export { houseBounds };
