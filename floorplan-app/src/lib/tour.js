/*
 * Tour 3D della casa: un panorama a 360° per ogni locale (immagine equirettangolare, quella che leggono i visori 360° e i siti) e un
 * video di percorso che gira per i locali (un giro completo in ognuno, con il nome del locale), partendo da un'inquadratura da fuori.
 * Usa la stessa scena del render (lib/renderScene.js): sole dalle finestre, cielo, luci, materiali veri, soffitti. Le parti pure
 * (percorso della telecamera, scelta del formato video) si provano senza scheda grafica; three.js si carica solo qui.
 */
import { cameraViews, timeById } from './renderStudio';
import { canvasStats, gpuName } from './render3d';

const TAU = Math.PI * 2;
export const EASE = (t) => t * t * (3 - 2 * t);   // inizio e fine dolci

/* Le viste interne (una per locale, più il soppalco) con il punto d'occhio a 1,6 m. */
export const tourViews = (project) => cameraViews(project, { aspect: 2 }).filter((v) => v.kind === 'inside');

/*
 * Il percorso del video: il fronte della casa (un'orbita) e un giro in ogni locale. Ogni segmento ha la sua durata e la sua vista.
 *   [{ kind: 'outside' | 'room', label, view, seconds }]
 */
export function planTour(project, { secondsPerRoom = 7, secondsOutside = 5 } = {}) {
  const all = cameraViews(project, { aspect: 16 / 9 });
  const front = all.find((v) => v.id === 'three-quarter') || all.find((v) => v.kind === 'outside' && !v.ortho);
  const rooms = all.filter((v) => v.kind === 'inside');
  return [
    ...(front ? [{ kind: 'outside', label: 'La casa', view: front, seconds: secondsOutside }] : []),
    ...rooms.map((v) => ({ kind: 'room', label: v.label.replace(/^Interno:\s*/, ''), view: v, seconds: secondsPerRoom })),
  ];
}

/* Telecamera di un segmento al tempo t (0-1): da fuori un'orbita di circa 70° attorno alla casa; dentro un giro completo sul posto
   con un piccolo avanzamento verso il centro del locale. Ritorna { position, target, fov } con il bersaglio a 5 m dall'occhio. */
export function tourCamera(seg, t) {
  const e = EASE(Math.min(1, Math.max(0, t)));
  const v = seg.view;
  if (seg.kind === 'outside') {
    const c = v.target;
    const dx = v.position[0] - c[0];
    const dz = v.position[2] - c[2];
    const a = (-0.6 + 1.2 * e) * 0.55;   // da -19° a +19° attorno alla posizione di partenza
    const x = c[0] + dx * Math.cos(a) - dz * Math.sin(a);
    const z = c[2] + dx * Math.sin(a) + dz * Math.cos(a);
    return { position: [x, v.position[1], z], target: c, fov: v.fov || 35 };
  }
  const dir = [v.target[0] - v.position[0], v.target[2] - v.position[2]];
  const len = Math.hypot(...dir) || 1;
  const ux = dir[0] / len;
  const uz = dir[1] / len;
  const yaw0 = Math.atan2(ux, -uz);
  const yaw = yaw0 + TAU * e * 0.96;   // quasi un giro intero: l'ultimo fotogramma non ripete il primo
  const adv = Math.min(0.4, len * 0.12) * e;
  const position = [v.position[0] + ux * adv, v.position[1], v.position[2] + uz * adv];
  const pitch = -0.06;
  const target = [position[0] + Math.sin(yaw) * Math.cos(pitch) * 5, position[1] + Math.sin(pitch) * 5, position[2] - Math.cos(yaw) * Math.cos(pitch) * 5];
  return { position, target, fov: 70 };
}

/* Il formato di registrazione che il browser sa fare: mp4 se può, altrimenti webm. */
export function pickRecorderType(isSupported) {
  const list = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return list.find((t) => isSupported(t)) || '';
}
export const extensionOf = (mime) => (mime.startsWith('video/mp4') ? 'mp4' : 'webm');

const slug = (v) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'progetto';

/* ── scena ── */

/* La scena del render con un suo contesto grafico: serve per tutti i panorami e per il video; `dispose()` la libera. */
export async function createTourStage(project, { time = 'afternoon', width = 1280, height = 720 } = {}) {
  const THREE = await import('three');
  const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
  const { buildRenderScene, windowAreaLights } = await import('./renderScene');
  const { RectAreaLightUniformsLib } = await import('three/examples/jsm/lights/RectAreaLightUniformsLib.js');
  const { loadHdri } = await import('./hdri');
  const { clearTextureCache } = await import('./style3d');
  clearTextureCache();
  const canvas = document.createElement('canvas');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  } catch (e) {
    throw new Error(`Il browser non dà il contesto grafico (${e.message})`);
  }
  const t = timeById(time);
  const gl = renderer.getContext();
  const maxSide = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096, renderer.capabilities.maxTextureSize || 4096, gl.getParameter(gl.MAX_VIEWPORT_DIMS)?.[0] || 4096);
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = t.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  RectAreaLightUniformsLib.init();
  const views = tourViews(project);
  const hdri = await loadHdri(THREE, time);
  const built = await buildRenderScene(THREE, project, { renderer, RoomEnvironment, hdri, view: views[0] || null, time, background: 'sky', roof: true, windows: false, ground: 'horizon' });
  if (!built) { renderer.dispose(); throw new Error('Non c\'è nulla da mostrare.'); }
  try {
    const { upgradeMaterials } = await import('./pbr');
    await upgradeMaterials(THREE, built.model, { aniso: renderer.capabilities.getMaxAnisotropy?.() || 8 });
  } catch { /* restano i materiali di base */ }
  built.sun.shadow.mapSize.set(2048, 2048);

  const stage = {
    THREE, renderer, canvas, scene: built.scene, built, time: t, gpu: gpuName(gl), maxSide, exposure: t.exposure,
    lights: [],
    /* le luci d'area alle finestre più vicine a questo punto di vista (come nel render di un locale) */
    lightFor(view) {
      for (const l of stage.lights) { stage.scene.remove(l); l.dispose?.(); }
      stage.lights = windowAreaLights(THREE, built.model, built.bounds, view, t, built.lampsOn, true);
      for (const l of stage.lights) stage.scene.add(l);
    },
    /* esposizione da un punto di vista: piccoli render di prova, si corregge finché l'immagine non è né nera né bruciata */
    exposureFor(view, camera) {
      const target = built.lampsOn ? 0.2 : 0.52;
      const pw = 192;
      const ph = 108;
      const size = renderer.getSize(new THREE.Vector2());
      renderer.setSize(pw, ph, false);
      let exposure = stage.exposure;
      const save = camera.aspect;
      camera.aspect = pw / ph;
      camera.updateProjectionMatrix();
      for (let i = 0; i < 3; i++) {
        renderer.toneMappingExposure = exposure;
        renderer.render(stage.scene, camera);
        const st = canvasStats(canvas, [0, 0, 0], true, pw);
        if (st.level < 0.004 || Math.abs(st.level - target) < 0.04) break;
        exposure = THREE.MathUtils.clamp(exposure * (target / Math.max(0.02, st.level)) ** 1.3, 0.35, 6);
      }
      renderer.setSize(size.x, size.y, false);
      camera.aspect = save;
      camera.updateProjectionMatrix();
      stage.exposure = exposure;
      return exposure;
    },
    dispose() {
      for (const l of stage.lights) stage.scene.remove(l);
      stage.scene.traverse((o) => { o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach((m) => m.dispose()); });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  return stage;
}

/* ── panorama 360° ── */

const QUAD_VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
// equirettangolare: il centro dell'immagine guarda verso -Z (il «davanti» della telecamera), a destra si gira verso +X, in alto è su
const EQUI_FRAG = `uniform samplerCube env; varying vec2 vUv;
void main() {
  float lon = (vUv.x - 0.5) * 6.2831853;
  float lat = (vUv.y - 0.5) * 3.1415927;
  vec3 d = vec3(sin(lon) * cos(lat), sin(lat), -cos(lon) * cos(lat));
  gl_FragColor = vec4(textureCube(env, d).rgb, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/*
 * Il panorama di una vista interna: sei facce dal punto d'occhio (cubemap in mezzo float), poi un passaggio le dispone in 2:1 con la
 * stessa tonalità del render. Ritorna { blob, url, width, height, exposure }; `url` è un indirizzo blob da liberare con URL.revokeObjectURL.
 */
export async function renderPanorama(stage, view, { width = 4096, type = 'image/jpeg', quality = 0.92 } = {}) {
  const { THREE, renderer, scene } = stage;
  width = Math.min(width, stage.maxSide);
  const height = Math.round(width / 2);
  stage.lightFor(view);
  const cam = new THREE.PerspectiveCamera(view.fov || 72, 16 / 9, 0.05, 400);
  cam.position.set(...view.position);
  cam.lookAt(new THREE.Vector3(...view.target));
  const exposure = stage.exposureFor(view, cam);
  const face = Math.min(2048, Math.max(512, width / 2));
  const rt = new THREE.WebGLCubeRenderTarget(face, { type: THREE.HalfFloatType, generateMipmaps: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
  const cube = new THREE.CubeCamera(0.05, 400, rt);
  cube.position.set(...view.position);
  cube.update(renderer, scene);
  const mat = new THREE.ShaderMaterial({ uniforms: { env: { value: rt.texture } }, vertexShader: QUAD_VERT, fragmentShader: EQUI_FRAG, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const qs = new THREE.Scene();
  qs.add(quad);
  const old = renderer.getSize(new THREE.Vector2());
  renderer.setSize(width, height, false);
  renderer.toneMappingExposure = exposure;
  renderer.render(qs, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
  const blob = await new Promise((resolve) => stage.canvas.toBlob(resolve, type, quality));
  renderer.setSize(old.x, old.y, false);
  rt.dispose();
  mat.dispose();
  quad.geometry.dispose();
  return { blob, url: URL.createObjectURL(blob), width, height, exposure };
}

/* ── video di percorso ── */

/*
 * Registra il giro della casa: ogni segmento di `planTour`, alla dimensione e ai fotogrammi chiesti, con il nome del locale in basso a
 * sinistra e una dissolvenza in nero tra un locale e l'altro. Si disegna in tempo reale (la durata del video è quella del giro).
 * Ritorna { blob, mime, seconds }. `signal` (AbortController) interrompe; `onProgress(0-1, etichetta)`.
 */
export async function recordTour(stage, project, { width = 1280, height = 720, fps = 30, onProgress = null, signal = null, plan = null } = {}) {
  const { THREE, renderer, scene } = stage;
  const segs = plan || planTour(project);
  if (!segs.length) throw new Error('Non c\'è un percorso da registrare.');
  if (typeof MediaRecorder === 'undefined') throw new Error('Questo browser non sa registrare il video.');
  const mime = pickRecorderType((m) => MediaRecorder.isTypeSupported(m));
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  const stream = out.captureStream(fps);
  const chunks = [];
  const rec = new MediaRecorder(stream, { ...(mime && { mimeType: mime }), videoBitsPerSecond: 8_000_000 });
  rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  const done = new Promise((resolve) => { rec.onstop = resolve; });
  const old = renderer.getSize(new THREE.Vector2());
  renderer.setSize(width, height, false);
  const camera = new THREE.PerspectiveCamera(70, width / height, 0.05, 600);
  const total = segs.reduce((s, g) => s + g.seconds, 0);
  let elapsed = 0;
  rec.start(500);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    for (const seg of segs) {
      const first = tourCamera(seg, 0);
      camera.fov = first.fov;
      camera.position.set(...first.position);
      camera.lookAt(new THREE.Vector3(...first.target));
      camera.updateProjectionMatrix();
      if (seg.kind === 'room') stage.lightFor(seg.view); else stage.lightFor({ position: seg.view.position });
      const exposure = stage.exposureFor(seg.view, camera);
      const n = Math.round(seg.seconds * fps);
      const t0 = performance.now();
      for (let f = 0; f < n; f++) {
        if (signal?.aborted) throw new Error('interrotto');
        const t = n > 1 ? f / (n - 1) : 0;
        const c = tourCamera(seg, t);
        camera.fov = c.fov;
        camera.position.set(...c.position);
        camera.lookAt(new THREE.Vector3(...c.target));
        camera.updateProjectionMatrix();
        // dissolvenza in nero: mezzo secondo all'inizio e alla fine di ogni segmento
        const edge = Math.min(1, f / (fps * 0.5), (n - 1 - f) / (fps * 0.5));
        const k = EASE(Math.max(0, edge));
        renderer.toneMappingExposure = Math.max(0.001, exposure * k);
        renderer.render(scene, camera);
        ctx.drawImage(stage.canvas, 0, 0, width, height);
        if (seg.label) {
          const a = Math.min(1, f / (fps * 0.8)) * Math.min(1, (n - 1 - f) / (fps * 0.8)) * k;
          ctx.save();
          ctx.globalAlpha = Math.max(0, a);
          ctx.font = `600 ${Math.round(height / 22)}px -apple-system, "Segoe UI", sans-serif`;
          const tw = ctx.measureText(seg.label).width;
          const px = Math.round(height * 0.05);
          const py = height - Math.round(height * 0.07);
          ctx.fillStyle = 'rgba(0,0,0,0.38)';
          ctx.beginPath();
          ctx.roundRect?.(px - 14, py - Math.round(height / 22) - 6, tw + 28, Math.round(height / 22) + 20, 14);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.fillText(seg.label, px, py);
          ctx.restore();
        }
        onProgress?.((elapsed + (f + 1) / fps) / total, seg.label);
        // passo in tempo reale: la registrazione dura quanto il giro
        const wait = t0 + ((f + 1) * 1000) / fps - performance.now();
        if (wait > 0) await sleep(wait);
      }
      elapsed += seg.seconds;
    }
  } finally {
    if (rec.state !== 'inactive') rec.stop();
    await done;
    stream.getTracks().forEach((tr) => tr.stop());
    renderer.setSize(old.x, old.y, false);
    renderer.toneMappingExposure = stage.exposure;
  }
  return { blob: new Blob(chunks, { type: mime || 'video/webm' }), mime: mime || 'video/webm', seconds: total };
}

export const tourFileName = (project, what, ext) => `${slug(project?.name)}-${what}.${ext}`;
