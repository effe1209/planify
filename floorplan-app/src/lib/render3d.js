/*
 * Immagine 3D di tutta la casa fuori schermo (PDF del progetto e pannello Render): scena di lib/renderScene.js (tetto,
 * soffitti, sole dalle finestre, luci e allarme), inquadratura, ora del giorno, sfondo e risoluzione a scelta.
 * Tempo reale con mappa tonale ACES, esposizione automatica, occlusione ambientale (GTAO) e bagliore delle luci accese;
 * con `quality: 'high'` il path tracing calcola la luce vera (lib/pathTrace.js).
 * Ogni immagine si controlla: se esce nera o vuota (schede grafiche che non reggono gli effetti o il 4K) si riprova con meno
 * effetti, e il risultato dice quale strada ha funzionato e su quale scheda grafica. three.js si carica solo qui.
 */
import { backgroundFor, brightnessById, cameraViews, houseBounds, timeById } from './renderStudio';
import { clearTextureCache } from './style3d';

function disposeScene(scene) {
  const materials = new Set();
  scene.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) [].concat(o.material).forEach((m) => materials.add(m));
  });
  for (const material of materials) {
    material.userData?.pbrTextures?.forEach((t) => t.dispose());
    material.dispose();
  }
}

/* Nome della scheda grafica (se il browser lo dice), per capire dove un render va storto. */
export function gpuName(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'sconosciuta';
  } catch {
    return 'sconosciuta';
  }
}

/* Luminosità mediana (0-1) dei pixel che non sono sfondo e quota di pixel visibili: dice se l'immagine è nera o vuota. */
export function canvasStats(source, bgSrgb, alphaBg, pw = 256) {
  const ph = Math.max(2, Math.round((pw * source.height) / source.width));
  const c = document.createElement('canvas');
  c.width = pw;
  c.height = ph;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, pw, ph);
  const px = ctx.getImageData(0, 0, pw, ph).data;
  const lum = [];
  let visible = 0;
  for (let k = 0; k < px.length; k += 4) {
    if (px[k + 3] < 200) continue;
    visible++;
    if (!alphaBg && Math.abs(px[k] - bgSrgb[0]) < 6 && Math.abs(px[k + 1] - bgSrgb[1]) < 6 && Math.abs(px[k + 2] - bgSrgb[2]) < 6) continue;
    lum.push((0.2126 * px[k] + 0.7152 * px[k + 1] + 0.0722 * px[k + 2]) / 255);
  }
  lum.sort((x, y) => x - y);
  const total = px.length / 4;
  const at = (q) => (lum.length ? lum[Math.min(lum.length - 1, Math.floor(lum.length * q))] : 0);
  // `level`: metà mediana e metà 85° percentile: una casa con il tetto scuro e le pareti chiare non si esporrebbe sul tetto (che farebbe bruciare le pareti)
  return { median: at(0.5), p85: at(0.85), level: 0.5 * at(0.5) + 0.5 * at(0.85), shown: lum.length / total, visible: visible / total };
}

export async function houseImage(project, {
  width = 1800, height = 1100, lowWalls = false, view = null, time = 'afternoon', background = 'white', roof = true,
  quality = 'fast', samples = undefined, onProgress = null, signal = null, effects = true, ground = 'horizon', brightness = 'natural',
} = {}) {
  clearTextureCache();   // il render ha texture sue: non condivide con la vista 3D quelle che un altro contesto grafico potrebbe lasciare in uno stato strano
  const THREE = await import('three');
  const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
  const { buildRenderScene } = await import('./renderScene');
  let canvas = document.createElement('canvas');
  const bg = backgroundFor(background, time);
  const t = timeById(time);
  let renderer;
  let why = '';   // il motivo del rifiuto, dall'evento del browser: dice se è il limite di contesti, l'accelerazione spenta o la scheda in lista nera
  const watch = (cv) => cv.addEventListener('webglcontextcreationerror', (ev) => { why = ev.statusMessage || why; });
  try {
    watch(canvas);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    // il browser rifiuta il contesto completo: si riprova su un canvas nuovo, senza antialias (il canvas ha già provato un contesto)
    const cv = document.createElement('canvas');
    watch(cv);
    try {
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, alpha: true, preserveDrawingBuffer: true });
    } catch (e) {
      throw new Error(`${e.message}${why ? ` (${why.slice(0, 160)})` : ''}`);
    }
  }
  canvas = renderer.domElement;   // quello che ha davvero il contesto
  try {
    const gl = renderer.getContext();
    const info = { gpu: gpuName(gl), mode: '', exposure: 0, notes: [] };
    // dimensioni che la scheda grafica regge: oltre, si riduce in proporzione (il 4K su alcune schede o browser non esce)
    const maxSide = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096, renderer.capabilities.maxTextureSize || 4096, gl.getParameter(gl.MAX_VIEWPORT_DIMS)?.[0] || 4096);
    if (Math.max(width, height) > maxSide) {
      const k = maxSide / Math.max(width, height);
      info.notes.push(`la scheda grafica regge ${maxSide} px: immagine ridotta da ${width}×${height}`);
      width = Math.floor(width * k);
      height = Math.floor(height * k);
    }
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    let exposure = t.exposure;
    renderer.toneMappingExposure = exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(bg.color, bg.alpha ? 0 : 1);
    const v = view || cameraViews(project, { aspect: width / height })[0];
    const { RectAreaLightUniformsLib } = await import('three/examples/jsm/lights/RectAreaLightUniformsLib.js');
    RectAreaLightUniformsLib.init();
    const { loadHdri } = await import('./hdri');
    const hdri = await loadHdri(THREE, time);
    const built = await buildRenderScene(THREE, project, { renderer, RoomEnvironment, hdri, view: v, time, background, roof, lowWalls, windows: true, ground });
    if (!built) return null;
    try {
      const { upgradeMaterials } = await import('./pbr');
      const n = await upgradeMaterials(THREE, built.model, { aniso: renderer.capabilities.getMaxAnisotropy?.() || 8 });
      info.pbr = n;
    } catch (e) { info.notes.push(`materiali PBR non caricati (${e.message})`); }
    const { scene, bounds } = built;
    const { size } = bounds;
    built.sun.shadow.mapSize.set(width > 2500 ? 4096 : 2048, width > 2500 ? 4096 : 2048);
    // la pianta dall'alto è ortografica (il path tracing non la supporta: lì resta un campo strettissimo da lontano)
    const asp = width / height;
    const oh = v.ortho ? Math.max(v.ortho.length ?? 0, (v.ortho.width ?? 0) / asp, v.ortho.height * 0) || v.ortho.height : 0;   // altezza visibile: la casa entra in entrambe le direzioni, con qualunque proporzione
    const camera = v.ortho && quality !== 'high'
      ? new THREE.OrthographicCamera(-(oh / 2) * asp, (oh / 2) * asp, oh / 2, -oh / 2, 0.5, 800)
      : new THREE.PerspectiveCamera(v.fov, width / height, 0.05, 400 + (v.ortho ? v.position[1] * 3 : 0));
    camera.position.set(...v.position);
    camera.lookAt(new THREE.Vector3(...v.target));
    // colore dello sfondo in sRGB 0-255 (per non contarlo nella luminosità)
    const bgSrgb = bg.alpha ? [-99, -99, -99] : [1, 3, 5].map((i) => parseInt(bg.color.slice(i, i + 2), 16));

    // nella misura (esposizione e controllo dell'occlusione) la casa sta da sola, su sfondo trasparente: il terreno che riempie l'inquadratura e il cielo
    // vero non devono contare, e con un colore di sfondo le pareti bianche verrebbero scambiate per sfondo (l'esposizione salirebbe senza fine)
    const hold = {};
    const measureOn = () => {
      hold.tg = scene.getObjectByName('TERRENO');
      Object.assign(hold, { fog: scene.fog, background: scene.background, ground: hold.tg?.visible });
      if (hold.tg) hold.tg.visible = false;
      scene.fog = null;
      scene.background = null;
      renderer.setClearColor('#000000', 0);
    };
    const measureOff = () => {
      if (hold.tg) hold.tg.visible = hold.ground;
      scene.fog = hold.fog;
      scene.background = hold.background;
      renderer.setClearColor(bg.color, bg.alpha ? 0 : 1);
    };

    let directMedian = null;
    // esposizione automatica: si prova il render in piccolo, si misura la luminosità di ciò che non è sfondo e si corregge
    // l'esposizione finché l'immagine non è né nera né bruciata (stile scuro, sera, GPU diversa: non importa)
    {
      const pw = 256;
      const ph = Math.max(2, Math.round((256 * height) / width));
      renderer.setSize(pw, ph, false);
      camera.aspect = pw / ph;
      camera.updateProjectionMatrix();
      measureOn();
      for (let i = 0; i < 3; i++) {
        renderer.toneMappingExposure = exposure;
        renderer.render(scene, camera);
        const st = canvasStats(canvas, bgSrgb, true, pw);
        directMedian = st.level;
        if (st.shown < 0.03) break;
        if (st.level < 0.004) { info.notes.push('anteprima di esposizione nera'); break; }   // nera davvero: non è questione di esposizione
        const target = (built.lampsOn ? 0.2 : 0.52) * brightnessById(brightness).k;   // la sera resta più scura, ma mai nera
        if (Math.abs(st.level - target) < 0.04) break;
        // di giorno l'esposizione può cambiare molto (stili scuri); di sera resta vicina a quella della scena, che deve restare notte
        const [lo, hi] = built.lampsOn ? [t.exposure * 0.6, t.exposure * 1.5] : [0.35, 6];
        exposure = THREE.MathUtils.clamp(exposure * (target / Math.max(0.02, st.level)) ** 1.3, lo, hi);
      }
      measureOff();
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.toneMappingExposure = exposure;
      built.exposure = exposure;
      info.exposure = +exposure.toFixed(2);
    }

    if (quality === 'high') {
      const { pathTraceImage } = await import('./pathTrace');
      try {
        const res = await pathTraceImage(THREE, renderer, built, camera, { width, height, bg, samples, onProgress, signal, project });
        // l'immagine del path tracing si controlla come le altre: bianca, vuota o nera → si cade sul tempo reale
        if (res.ok) return { ...res, info: { ...info, exposure: res.exposure, mode: res.denoised ? `path tracing con filtro ${res.filterKind === 'guided' ? 'guidato' : 'semplice'}` : 'path tracing', notes: [...info.notes, ...(res.notes || [])] } };
        info.notes.push(`il path tracing è uscito ${res.notes?.length ? 'storto' : 'vuoto o nero'} (${(res.notes || []).join(', ') || 'nessuna esposizione utile'}): salvato in tempo reale`);
      } catch (e) {
        if (e.message === 'interrotto') throw e;
        info.notes.push(`path tracing non riuscito (${e.message}): salvato in tempo reale`);
      }
      // ripiego: si rifà la scena e si disegna in tempo reale (il path tracing ha cambiato materiali e luci)
      disposeScene(scene);
      return houseImage(project, { width, height, lowWalls, view, time, background, roof, quality: 'fast', onProgress, signal, effects, ground, brightness })
        .then((r) => r && { ...r, info: { ...r.info, notes: [...info.notes, ...(r.info?.notes || [])] } });
    }

    // l'occlusione ambientale dipende molto dalla scheda grafica: si prova in piccolo e, se rende l'immagine molto più scura
    // del render diretto (pareti nere), si lascia da parte
    // a oltre 2500 px niente occlusione ambientale né target a mezzo float con 4 campioni: sono i passaggi che più caricano la scheda grafica
    const big = width > 2500;
    let aoOk = !bg.alpha && effects && !big;
    if (aoOk && directMedian != null && directMedian > 0.02) {
      try {
        const pw = 256;
        const ph = Math.max(2, Math.round((256 * height) / width));
        renderer.setSize(pw, ph, false);
        camera.aspect = pw / ph;
        camera.updateProjectionMatrix();
        measureOn();
        // il riferimento si rifà all'esposizione finale (l'ultima misura dell'esposizione può essere stata a un valore più basso)
        renderer.toneMappingExposure = exposure;
        renderer.render(scene, camera);
        const direct = canvasStats(canvas, bgSrgb, true, pw);
        const { run, done } = await composerFor(THREE, renderer, scene, camera, { width: pw, height: ph, size, t, built, heavy: false, gl, ao: true });
        run();
        const st = canvasStats(canvas, bgSrgb, true, pw);
        done();
        measureOff();
        if (st.level < direct.level * 0.72) {
          aoOk = false;
          info.notes.push(`occlusione ambientale disattivata: su questa scheda grafica scuriva troppo (${st.level.toFixed(2)} contro ${direct.level.toFixed(2)})`);
        }
      } catch (e) {
        measureOff();
        aoOk = false;
        info.notes.push(`occlusione ambientale disattivata (${e.message})`);
      }
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.toneMappingExposure = exposure;
    }

    // tempo reale: più strade, dalla più bella alla più sicura; ognuna si controlla (immagine nera = si passa alla successiva)
    const attempts = [];
    if (!bg.alpha && effects && !big) attempts.push('post');        // render + occlusione ambientale + bagliore + mappa tonale (target a mezzo float, 4 campioni)
    if (!bg.alpha && effects) attempts.push('post-light');  // come sopra, ma con target a 8 bit e senza antialias multicampione
    attempts.push('direct');                    // render diretto, senza effetti
    let data = null;
    for (const mode of attempts) {
      try {
        if (mode === 'direct') {
          renderer.setClearColor(bg.color, bg.alpha ? 0 : 1);
          renderer.render(scene, camera);
        } else {
          const useAo = mode === 'post' || mode === 'post-light';
          const { run, done } = await composerFor(THREE, renderer, scene, camera, { width, height, size, t, built, heavy: mode === 'post', gl, ao: useAo && aoOk });
          run();
          done();   // l'immagine resta nel canvas (preserveDrawingBuffer)
        }
        const st = canvasStats(canvas, bgSrgb, bg.alpha);
        if (gl.isContextLost()) throw new Error('contesto grafico perso');
        // nera o vuota: la strada non ha funzionato su questa scheda grafica
        if (st.visible < 0.02 || (!bg.alpha && st.shown > 0.03 && st.median < 0.004)) {
          info.notes.push(`modo «${mode}» uscito nero`);
          continue;
        }
        info.mode = mode === 'post' ? 'occlusione ambientale e bagliore' : mode === 'post-light' ? 'occlusione ambientale (leggera)' : 'diretto';
        data = canvas.toDataURL('image/png');
        break;
      } catch (e) {
        info.notes.push(`modo «${mode}» non riuscito (${e.message})`);
      }
    }
    if (!data) {
      renderer.render(scene, camera);
      info.mode = 'diretto (ultima risorsa)';
      data = canvas.toDataURL('image/png');
    }
    disposeScene(scene);
    return { data, w: width, h: height, info };
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();   // senza, il contesto WebGL resta vivo: dopo una quindicina di render il browser rifiuta di crearne di nuovi («Error creating WebGL context»)
    clearTextureCache();   // e la vista 3D, la prossima volta, ne costruisce di fresche
  }
}
/* Passaggi di post-produzione: render, (occlusione ambientale), bagliore delle luci, mappa tonale e sRGB. run() disegna; done() libera. */
async function composerFor(THREE, renderer, scene, camera, { width, height, size, t, built, heavy, gl, ao }) {
  const { EffectComposer } = await import('three/examples/jsm/postprocessing/EffectComposer.js');
  const { RenderPass } = await import('three/examples/jsm/postprocessing/RenderPass.js');
  const { GTAOPass } = await import('three/examples/jsm/postprocessing/GTAOPass.js');
  const { UnrealBloomPass } = await import('three/examples/jsm/postprocessing/UnrealBloomPass.js');
  const { OutputPass } = await import('three/examples/jsm/postprocessing/OutputPass.js');
  const maxMs = gl.getParameter(gl.MAX_SAMPLES) || 0;
  const target = new THREE.WebGLRenderTarget(width, height, heavy
    ? { type: THREE.HalfFloatType, samples: Math.min(4, maxMs) }
    : { type: THREE.UnsignedByteType, samples: 0 });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(1);
  composer.setSize(width, height);
  composer.addPass(new RenderPass(scene, camera));
  if (ao) {
    const pass = new GTAOPass(scene, camera, width, height);
    pass.updateGtaoMaterial({ radius: Math.max(0.35, Math.min(1.2, Math.max(size.x, size.z) / 25)), distanceExponent: 1.5, thickness: 1.5, scale: 1.1, samples: heavy ? 16 : 8, distanceFallOff: 1 });
    pass.normalMaterial.side = THREE.DoubleSide;   // il tetto e i soffitti si disegnano da due lati: senza, l'AO "vede" l'interno attraverso
    pass.blendIntensity = 0.85;
    composer.addPass(pass);
  }
  if (t.bloom > 0) composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), t.bloom, 0.6, built.lampsOn ? 0.85 : 0.95));
  composer.addPass(new OutputPass());
  return {
    run: () => composer.render(),
    done: () => { composer.dispose?.(); target.dispose(); },
  };
}
export { houseBounds };
