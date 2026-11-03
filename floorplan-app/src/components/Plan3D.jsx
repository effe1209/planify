import { useEffect, useRef, useState } from 'react';
import { THEMES } from '../lib/themes';
import { themeFor, themeWithPalette } from '../lib/palette';

/*
 * Vista 3D navigabile del piano aperto o di tutta la casa (piani impilati con i solai, anche esplosa):
 * trascina per ruotare, rotellina per lo zoom, tasto destro (o due dita) per spostarti. three.js si carica solo qui.
 * onReady({ png, dxf }) dà all'app le esportazioni della vista: immagine PNG e DXF 3D (lib/dxf3d.js).
 */
// luci della vista: con la tonalità cinematografica e la luce del cielo (ambiente) servono meno luce diretta e più sole
const HEMI_DAY = 0.4;
const HEMI_NIGHT = 0.35;
const SUN_DAY = 2.0;
const SUN_NIGHT = 0.7;

function disposeTree(root) {
  const materials = new Set();
  root.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) [].concat(o.material).forEach((m) => materials.add(m));
  });
  for (const material of materials) {
    material.userData?.pbrTextures?.forEach((t) => t.dispose());
    material.dispose();
  }
}

export default function Plan3D({ plan, north = 0, roof = null, overlay = null, project = null, palette = null, materials = null, style = 'modern', lowWalls = false, spread = 0, loftLevel = 'all', cut = null, onReady, onPick = null, selection = null }) {
  const host = useRef(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);   // «Riprova» ricrea il contesto WebGL
  const sceneRef = useRef(null);   // { THREE, model, buildRoof, roofFloor }: il tetto si cambia senza ricostruire la scena
  const roofRef = useRef(roof);
  roofRef.current = roof;
  const [ready, setReady] = useState(0);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const prevLevel = useRef('all');
  const builtRef = useRef(null);   // gruppi di sensori, impianto e luci attualmente nella scena
  const propsRef = useRef(null);   // proprietà correnti: la scena resta viva e legge sempre le ultime (esportazioni e ricostruzione del modello)
  propsRef.current = { plan, project, palette, materials, style, lowWalls, spread, north };
  const attachRef = useRef(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  /* Mostra o nasconde sensori, impianto, cavi, coni e luci; a luci accese la scena si abbassa come di sera. */
  const applyShow = (st, built, show, on, fixtures = !!roofRef.current) => {
    if (!built) return;
    const vis = (list, on) => list.forEach((g) => { g.visible = on; });
    vis(built.groups.sensors, !!show?.sensors);
    vis(built.groups.electric, !!show?.electric);
    vis(built.groups.cables, !!show?.electric && !!show?.cables);
    vis(built.groups.cones, !!show?.cones);
    vis(built.groups.lights, !!show?.electric || !!show?.lights);
    // pianta dall'alto (senza tetto): i corpi illuminanti non si vedono, ma restano le luci vere e la scena è illuminata come se ci fossero
    built.groups.lights.forEach((grp) => grp.traverse((o) => { if (o.isMesh) o.visible = fixtures; }));
    st.setLights(built, !!on);
    if (st.hemi) st.hemi.intensity = on ? HEMI_NIGHT : HEMI_DAY;   // di sera la scena si abbassa ma resta leggibile, con le lampade che spiccano
    if (st.sun) st.sun.intensity = on ? SUN_NIGHT : SUN_DAY;
    st.invalidate?.(true);
  };
  /* Costruisce i gruppi del progetto e li aggiunge a `target` (la scena o una copia per il DXF). */
  const attach = (st, target, spreadBy, override = null) => {
    const ov = override || overlayRef.current;
    if (!ov || !st) return null;
    // il giardino sta in un gruppo suo, spostato e ruotato accanto alla facciata: i suoi oggetti vanno là dentro
    const gardenHost = (f) => target.children.find((c) => c.userData.floor?.id === f.id);
    const floors = project
      ? project.floors.filter((f) => (typeof f.level === 'number' || f.level === 'out') && f.plan?.rooms?.length)
        .map((f) => (f.level === 'out'
          ? { floor: f, y: 0, plan: f.plan, host: gardenHost(f) }
          : { floor: f, y: f.level * (st.FLOOR_H + (spreadBy || 0)), plan: f.plan }))
        .filter((f) => f.floor.level !== 'out' || f.host)
      : [{ floor: { id: ov.floorId }, y: 0, plan }];
    const built = st.buildOverlays(st.THREE, { floors, devices: ov.devices || [], electric: ov.electric, theme: themeWithPalette(THEMES[style] || THEMES.modern, project?.palette || palette, project?.materials || materials) });
    for (const g of [built.sensors, built.electric, built.cables, built.cones, built.lights]) target.add(g);   // i gruppi dei piani con host stanno già nel loro host
    applyShow(st, built, ov.show, ov.lightsOn, ov.fixtures ?? !!roofRef.current);
    return built;
  };
  attachRef.current = attach;

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const THREE = await import('three');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        const { EffectComposer } = await import('three/examples/jsm/postprocessing/EffectComposer.js');
        const { RenderPass } = await import('three/examples/jsm/postprocessing/RenderPass.js');
        const { GTAOPass } = await import('three/examples/jsm/postprocessing/GTAOPass.js');
        const { OutputPass } = await import('three/examples/jsm/postprocessing/OutputPass.js');
        const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
        const { buildScene, buildHouse, addGround, buildRoof, roofFloor, WALL_H, FLOOR_H } = await import('../lib/scene3d');
        const { buildOverlays, setLights } = await import('../lib/overlays3d');
        const { sunDirection } = await import('../lib/orientation');
        const { sceneToDxf } = await import('../lib/dxf3d');
        if (disposed || !host.current) return;
        const el = host.current;
        // il contesto WebGL: prima completo; se il browser lo rifiuta (scheda grafica sotto stress, poca memoria) si riprova più leggero.
        // Il motivo del rifiuto (lo dice il browser nell'evento webglcontextcreationerror) finisce nel messaggio: serve a capire se è un
        // limite di contesti, l'accelerazione spenta o la scheda grafica in lista nera.
        let why = '';
        const make = (opts) => {
          const cv = document.createElement('canvas');
          cv.addEventListener('webglcontextcreationerror', (ev) => { why = ev.statusMessage || why; });
          return new THREE.WebGLRenderer({ canvas: cv, preserveDrawingBuffer: true, ...opts });
        };
        let renderer;
        try {
          renderer = make({ antialias: true });
        } catch (e1) {
          try {
            renderer = make({ antialias: false, powerPreference: 'default' });
          } catch (e2) {
            throw new Error(`${e2.message}${why ? ` (${why.slice(0, 160)})` : ''}`);
          }
        }
        // se la scheda grafica si resetta (render pesanti, 4K) il contesto va perso: lo si dice e «Riprova» lo ricrea
        renderer.domElement.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); if (!disposed) setError('Il contesto grafico è stato perso (la scheda grafica si è resettata)'); });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.setClearColor('#eef1f5');
        renderer.toneMapping = THREE.ACESFilmicToneMapping;   // tonalità cinematografica: luci morbide, niente bianchi bruciati
        renderer.toneMappingExposure = 0.85;
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        // cielo sfumato (caldo all'orizzonte) e luce d'ambiente: riflessi e rimbalzi morbidi dallo studio neutro
        {
          const cv = document.createElement('canvas');
          cv.width = 2;
          cv.height = 256;
          const g2 = cv.getContext('2d');
          const grad = g2.createLinearGradient(0, 0, 0, 256);
          grad.addColorStop(0, '#cfdcec');
          grad.addColorStop(0.55, '#eceae6');
          grad.addColorStop(1, '#f2ece2');
          g2.fillStyle = grad;
          g2.fillRect(0, 0, 2, 256);
          const sky = new THREE.CanvasTexture(cv);
          sky.colorSpace = THREE.SRGBColorSpace;
          scene.background = sky;
          const pm = new THREE.PMREMGenerator(renderer);
          scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
          scene.environmentIntensity = 0.4;
          pm.dispose();
        }
        // disegno solo quando serve: a riposo la scheda grafica non lavora. Le ombre (luce e geometria fisse) si ricalcolano solo
        // quando la scena cambia, non a ogni movimento della telecamera.
        renderer.shadowMap.autoUpdate = false;
        renderer.shadowMap.needsUpdate = true;
        let dirty = true;
        let raf = 0;
        let controls = null;
        let composer = null;   // disegno finale (a vista ferma): occlusione ambientale e tonalità; mentre ci si muove si disegna diretto
        let aoOn = false;
        let slowFrames = 0;
        let fast = false;
        let settle = 0;
        const basePixelRatio = Math.min(2, window.devicePixelRatio || 1);
        const invalidate = (sceneChanged = false) => {
          if (sceneChanged) renderer.shadowMap.needsUpdate = true;
          dirty = true;
          if (!raf && !disposed) raf = requestAnimationFrame(loop);
        };
        const draw = (final) => {
          if (final && composer && aoOn) {
            const t0 = performance.now();
            try {
              composer.render();
            } catch {
              composer = null;   // il disegno finale non riesce su questa scheda grafica: da qui in poi diretto
              renderer.render(scene, camera);
              return;
            }
            renderer.getContext().finish();   // misura vera: se il disegno finale è lento su questo computer, l'occlusione si spegne da sola
            if (performance.now() - t0 > 160) slowFrames += 1; else slowFrames = 0;
            if (slowFrames >= 3) {
              aoOn = false;
              try { localStorage.setItem('planify.ao', 'off'); } catch { /* niente memoria: vale per questa sessione */ }
            }
          } else renderer.render(scene, camera);
        };
        function loop() {
          raf = 0;
          if (disposed) return;
          const moving = controls ? controls.update() : false;   // true finché la telecamera si muove (anche per l'inerzia)
          if (moving) {
            fast = true;
            clearTimeout(settle);
            settle = setTimeout(() => { fast = false; invalidate(); }, 220);   // a vista ferma si rifà il disegno completo
          }
          if (moving || dirty) {
            dirty = false;
            draw(!moving && !fast);
            if (moving && !raf) raf = requestAnimationFrame(loop);   // (un 'change' di update() può averlo già pianificato)
          }
        }
        sceneRef.current = { THREE, scene, model: null, ground: null, renderer, buildRoof, roofFloor, WALL_H, FLOOR_H, buildOverlays, setLights, hemi: null, sun: null, invalidate };
        const hemi = new THREE.HemisphereLight('#fff6ea', '#d8d2c8', HEMI_DAY);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight('#fff3e0', SUN_DAY);
        sun.castShadow = true;
        sun.shadow.bias = -0.0004;        // niente righe sfarfallanti sui muri esposti al sole (shadow acne)
        sun.shadow.normalBias = 0.03;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.radius = 3;              // ombre dai bordi morbidi
        scene.add(sun, sun.target);
        sceneRef.current.hemi = hemi;
        sceneRef.current.sun = sun;

        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1500);
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.maxPolarAngle = Math.PI / 2.05;   // mai sotto il pavimento
        controls.minDistance = 2;
        controls.addEventListener('change', () => invalidate());
        try {
          const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
          composer = new EffectComposer(renderer, rt);
          composer.setPixelRatio(basePixelRatio);
          composer.addPass(new RenderPass(scene, camera));
          const gtao = new GTAOPass(scene, camera, 1, 1);
          gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.2, thickness: 1.2, scale: 1, samples: 12 });
          composer.addPass(gtao);
          composer.addPass(new OutputPass());
          let off = false;
          try { off = localStorage.getItem('planify.ao') === 'off'; } catch { /* niente memoria */ }
          aoOn = !off;
        } catch {
          composer = null;   // scheda grafica senza i formati necessari: resta il disegno diretto
        }

        /*
         * Clic sulla scena (non un trascinamento per ruotare): un raggio dalla telecamera trova cosa c'è sotto il cursore.
         * Le parti costruite da scene3d portano un'etichetta (arredo, porta o finestra di origine, locale); tetto e vetri si saltano.
         */
        const raycaster = new THREE.Raycaster();
        const ndc = new THREE.Vector2();
        const visible = (o) => { for (let n = o; n; n = n.parent) if (n.visible === false) return false; return true; };
        const pick = (e) => {
          const st = sceneRef.current;
          if (!st?.model) return null;
          const r = renderer.domElement.getBoundingClientRect();
          ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
          raycaster.setFromCamera(ndc, camera);
          for (const h of raycaster.intersectObject(st.model, true)) {
            if (!visible(h.object) || h.object.isLine || h.object.isPoints) continue;
            let tag = null;
            let floorId = null;
            for (let n = h.object; n; n = n.parent) {
              const u = n.userData;
              if (u.layer === 'TETTO' || u.layer === 'VETRI') { tag = 'skip'; break; }
              if (!tag && u.itemIndex !== undefined) tag = { kind: 'item', index: u.itemIndex };
              else if (!tag && u.openingKind) tag = { kind: u.openingKind, index: u.openingIndex };
              else if (!tag && u.roomId !== undefined) tag = { kind: 'room', roomId: u.roomId };
              if (u.floor?.id !== undefined) floorId = u.floor.id;
            }
            if (tag === 'skip') continue;
            return tag ? { ...tag, floorId } : null;   // un muro o altro senza etichetta: nessuna selezione
          }
          return null;
        };
        let down = null;
        renderer.domElement.addEventListener('pointerdown', (e) => { down = e.button === 0 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; });
        renderer.domElement.addEventListener('pointerup', (e) => {
          const d = down;
          down = null;
          if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || performance.now() - d.t > 600) return;
          onPickRef.current?.(pick(e));
        });
        // mentre si ruota la risoluzione scende (fluido), a mano ferma torna piena
        controls.addEventListener('start', () => { if (basePixelRatio > 1) { renderer.setPixelRatio(1); composer?.setPixelRatio(1); } });
        controls.addEventListener('end', () => { if (basePixelRatio > 1) { renderer.setPixelRatio(basePixelRatio); composer?.setPixelRatio(basePixelRatio); invalidate(); } });
        sceneRef.current.camera = camera;
        sceneRef.current.controls = controls;

        // inquadratura a tre quarti dall'alto: tutta la sfera che contiene il modello entra nel campo più stretto
        const frame = (sphere, aspect) => {
          const v = (40 * Math.PI) / 180;
          const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
          const dist = (sphere.radius / Math.sin(Math.min(v, h) / 2)) * 1.08;
          const dir = new THREE.Vector3(0.45, 0.8, 0.75).normalize();
          camera.position.copy(sphere.center).addScaledVector(dir, dist);
          controls.target.copy(sphere.center);
          controls.update();
        };
        let lastSphere = null;
        let fadeTex = null;
        /*
         * (Ri)costruisce il modello dalle proprietà correnti senza toccare renderer, luci, telecamera e comandi: così una modifica
         * del progetto (o un salvataggio sul cloud) non fa lampeggiare la vista né riporta l'inquadratura all'inizio.
         * L'inquadratura si rifà solo la prima volta o se la casa cambia molto (un altro progetto).
         */
        const loadModel = () => {
          const P = propsRef.current;
          const st = sceneRef.current;
          if (!P || !st || disposed) return;
          const old = st.model;
          const oldGround = st.ground;
          const model = P.project
            ? buildHouse(THREE, P.project, (f) => themeFor(P.project, f), { lowWalls: P.lowWalls, spread: P.spread, timberBeams: true })
            : buildScene(THREE, P.plan, themeWithPalette(THEMES[P.style] || THEMES.modern, P.palette, P.materials), { lowWalls: P.lowWalls, timberBeams: true });
          model.traverse((o) => { if (o.userData?.layer === 'TRAVI' || o.userData?.layer === 'TETTO') o.visible = !!P.roof; });
          scene.add(model);
          import('../lib/customModels').then(({ hydrateCustomModels }) => hydrateCustomModels(THREE, model))
            .then(() => import('../lib/pbr'))
            .then(({ upgradeMaterials }) => upgradeMaterials(THREE, model, { aniso: renderer.capabilities.getMaxAnisotropy?.() || 8 }))
            .then(() => {
              if (model.parent === scene) invalidate(true);
              else model.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => m.userData?.pbrTextures?.forEach((t) => t.dispose())); });
            }).catch(() => {});
          if (old) {
            scene.remove(old);
            disposeTree(old);
          }
          if (oldGround) {
            scene.remove(oldGround);
            oldGround.geometry.dispose();
            oldGround.material.dispose();
          }
          // ingombro reale (con i piani impilati) per terreno, luce e inquadratura
          const { bb, center, size, ground } = addGround(THREE, scene, model);
          // terreno più grande che sfuma nel cielo (non un riquadro tagliato netto), in un colore caldo
          {
            const R = Math.max(size.x, size.z) * 2.2 + 30;
            ground.geometry.dispose();
            ground.geometry = new THREE.CircleGeometry(R, 64);
            if (!fadeTex) {
              const cv = document.createElement('canvas');
              cv.width = cv.height = 256;
              const g2 = cv.getContext('2d');
              const rg = g2.createRadialGradient(128, 128, 0, 128, 128, 128);
              rg.addColorStop(0, '#fff');
              rg.addColorStop(0.45, '#fff');
              rg.addColorStop(1, '#000');
              g2.fillStyle = rg;
              g2.fillRect(0, 0, 256, 256);
              fadeTex = new THREE.CanvasTexture(cv);
            }
            ground.material.alphaMap = fadeTex;
            ground.material.transparent = true;
            ground.material.depthWrite = false;
            ground.material.color.set('#d9d2c6');
            ground.material.needsUpdate = true;
            ground.renderOrder = -1;
          }
          const W = Math.max(1, size.x), L = Math.max(1, size.z), Ht = Math.max(1, bb.max.y);
          const dir = sunDirection(P.north);   // il sole segue il nord del progetto (pomeriggio, a sud-ovest)
          const reach = Math.max(W, L) * 0.6 + 8;
          sun.position.set(center.x + dir.dx * reach, 14 + Ht, center.z + dir.dz * reach);
          sun.target.position.set(center.x, 0, center.z);
          const ext = Math.max(W, L, Ht);
          Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 60 + Ht * 2 });
          sun.shadow.camera.updateProjectionMatrix();
          controls.maxDistance = ext * 14;   // la pianta dall'alto sta lontano (campo stretto)
          const sphere = bb.getBoundingSphere(new THREE.Sphere());
          st.model = model;
          st.ground = ground;
          window.__planify3d = { THREE, camera, controls, model, renderer };   // per i test dell'interfaccia (inquadrature precise)
          const changed = !lastSphere || Math.abs(sphere.radius - lastSphere.radius) > lastSphere.radius * 0.35
            || sphere.center.distanceTo(lastSphere.center) > lastSphere.radius * 0.6;
          lastSphere = sphere;
          if (changed) frame(sphere, camera.aspect);
          setReady((n) => n + 1);
          invalidate(true);
        };
        sceneRef.current.loadModel = loadModel;

        const resize = () => {
          const w = el.clientWidth || 600;
          const h = el.clientHeight || 400;
          renderer.setSize(w, h);
          composer?.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          invalidate();
        };
        const ro = new ResizeObserver(resize);
        ro.observe(el);
        resize();
        loadModel();
        onReady?.({
          // telecamera della vista: per il render con «vista attuale» e per spostarla sulle inquadrature automatiche
          camera: () => ({ position: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov }),
          setCamera: (v) => {
            if (v.ortho) {
              // pianta dall'alto: la distanza si calcola sulla proporzione del riquadro, così la casa entra tutta e riempie il lato che la limita
              const need = Math.max(v.ortho.length ?? 0, (v.ortho.width ?? 0) / Math.max(0.2, camera.aspect)) || v.ortho.height;
              const dist = need / 2 / Math.tan((v.fov * Math.PI) / 360);
              camera.position.set(v.target[0], v.target[1] + dist, v.target[2] + dist * 0.0015);
            } else camera.position.set(...v.position);
            controls.target.set(...v.target);
            camera.fov = v.fov;
            camera.updateProjectionMatrix();
            controls.update();
            invalidate();
          },
          png: () => {
            draw(true);
            return renderer.domElement.toDataURL('image/png');
          },
          // GLB per Blender: la scena com'è (tetto, impianto e sensori visibili), con tutte le luci vere e il sole
          glb: async (extra = {}) => {
            const { plan, project, style, palette, materials, north } = propsRef.current;
            const rf = roofRef.current;
            const fresh = project
              ? buildHouse(THREE, project, (f) => themeFor(project, f), { timberBeams: !!rf })
              : buildScene(THREE, plan, themeWithPalette(THEMES[style] || THEMES.modern, palette, materials), { timberBeams: !!rf });
            const { hydrateCustomModels } = await import('../lib/customModels');
            await hydrateCustomModels(THREE, fresh);
            if (rf) {
              const top = project ? roofFloor(project) : { floor: { plan }, y: plan?.height || WALL_H };
              if (top) fresh.add(buildRoof(THREE, top.floor.plan, top.y, { ...rf, style: project ? (top.floor.meta?.style || style) : style, palette: project?.palette || palette, materials: project?.materials || materials }));
            }
            // i corpi illuminanti ci sono sempre (anche senza impianto elettrico: se ne ricavano i punti luce)
            const cur = overlayRef.current;
            const lamps = { devices: cur?.devices || [], electric: cur?.electric || extra.electric || null, floorId: cur?.floorId,
              show: { ...(cur?.show || {}), lights: true }, lightsOn: false, fixtures: true };
            const built = attachRef.current(sceneRef.current, fresh, 0, lamps);
            if (built) {
              setLights(built, false);
              for (const g of built.glow) g.emissiveIntensity = 1.8;   // corpi illuminanti accesi
            }
            const { sceneToGlb } = await import('../lib/glb');
            const dir = sunDirection(north);
            return sceneToGlb(THREE, fresh, { lightPoints: built?.lightPoints || [], sun: dir });
          },
          // il DXF ha sempre le quote vere e i muri interi, anche se la vista è esplosa o con i muri bassi
          dxf: () => {
            const { plan, project, style, palette, materials, spread, lowWalls } = propsRef.current;
            if (!spread && !lowWalls) return sceneToDxf(THREE, sceneRef.current.model);
            const fresh = project
              ? buildHouse(THREE, project, (f) => themeFor(project, f), { timberBeams: !!roofRef.current })
              : buildScene(THREE, plan, themeWithPalette(THEMES[style] || THEMES.modern, palette, materials), { timberBeams: !!roofRef.current });
            attachRef.current(sceneRef.current, fresh, 0);   // sensori e impianto visibili vanno nel DXF anche con la vista esplosa o i muri bassi
            return sceneToDxf(THREE, fresh);
          },
        });
        cleanup = () => {
          onReady?.(null);
          sceneRef.current = null;
          cancelAnimationFrame(raf);
          ro.disconnect();
          controls.dispose();
          disposeTree(scene);
          renderer.dispose();
          renderer.forceContextLoss();   // libera il contesto WebGL (il browser ne concede pochi: 16 circa)
          renderer.domElement.remove();
        };
      } catch (err) {
        if (!disposed) setError(err.message);
      }
    })();
    return () => {
      disposed = true;
      cleanup();
    };
    // onReady è un callback dell'app: cambiarlo non deve ricostruire la scena. Renderer, luci, telecamera e comandi nascono una volta
    // sola (e con «Riprova»); i dati del progetto cambiano solo il modello (effetto qui sotto).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // il progetto cambia (modifica, palette, stile, nord, vista esplosa…): si sostituisce solo il modello, la vista resta viva
  useEffect(() => {
    sceneRef.current?.loadModel?.();
  }, [plan, project, palette, materials, style, lowWalls, spread, north]);

  /*
   * Livelli del loft e sezione 3D, senza ricostruire la scena. «Sotto» nasconde il soppalco e tutto ciò che sta sopra;
   * «Sopra» taglia via tutto sotto il solaio del soppalco (piano di taglio); la sezione è un piano verticale
   * (longitudinale o trasversale) che toglie metà casa.
   */
  useEffect(() => {
    const st = sceneRef.current;
    if (!st?.renderer) return;
    const { THREE, model, renderer, FLOOR_H } = st;
    model.traverse((o) => { if (o.userData.mezz) o.visible = loftLevel !== 'below'; });
    const planes = [];
    const mzFloor = project ? project.floors.find((f) => f.plan?.mezzanine) : (plan?.mezzanine ? { plan, level: 0 } : null);
    if (loftLevel === 'above' && mzFloor) {
      const mz = mzFloor.plan.mezzanine;
      const y0 = typeof mzFloor.level === 'number' ? mzFloor.level * (FLOOR_H + (spread || 0)) : 0;
      planes.push(new THREE.Plane(new THREE.Vector3(0, 1, 0), -(y0 + mz.elev - mz.slab - 0.02)));
    }
    if (cut) {
      const bb = new THREE.Box3().setFromObject(model);
      const sign = cut.flip ? -1 : 1;
      const n = cut.axis === 'x' ? new THREE.Vector3(sign, 0, 0) : new THREE.Vector3(0, 0, sign);
      const lo = cut.axis === 'x' ? bb.min.x : bb.min.z;
      const hi = cut.axis === 'x' ? bb.max.x : bb.max.z;
      const pos = lo + (hi - lo) * Math.min(1, Math.max(0, cut.t));
      planes.push(new THREE.Plane(n, -sign * pos));
    }
    renderer.clippingPlanes = planes;
    st.invalidate?.(true);
    // passando a «Sopra» la telecamera sale a guardare il soppalco dall'alto, oltre il muro davanti
    if (loftLevel === 'above' && prevLevel.current !== 'above' && mzFloor && st.camera) {
      const mz = mzFloor.plan.mezzanine;
      const y0 = typeof mzFloor.level === 'number' ? mzFloor.level * (FLOOR_H + (spread || 0)) : 0;
      const c = new THREE.Vector3(mz.x + mz.w / 2, y0 + mz.elev, mz.y + mz.h / 2);
      st.controls.target.copy(c);
      st.camera.position.set(c.x - 3, c.y + Math.max(9, mz.h * 1.1), c.z + Math.max(7, mz.h * 0.8));
      st.controls.update();
    }
    st.invalidate?.(true);
    prevLevel.current = loftLevel;
  }, [loftLevel, cut?.axis, cut?.t, cut?.flip, !!cut, ready, plan, project, spread]); // eslint-disable-line react-hooks/exhaustive-deps

  // tetto: si toglie e si rimette senza muovere l'inquadratura
  useEffect(() => {
    const st = sceneRef.current;
    if (!st?.model) return;
    const old = st.model.getObjectByName('tetto');
    if (old) {
      st.model.remove(old);
      disposeTree(old);
    }
    st.model.traverse((o) => {
      if (o.userData?.layer === 'TRAVI' || o.userData?.layer === 'TETTO') o.visible = !!roof;
    });
    st.invalidate?.(true);
    if (!roof) return;
    const top = project ? st.roofFloor(project) : { floor: { plan }, y: plan?.height || st.WALL_H };
    const roofStyle = project ? (top?.floor.meta?.style || style) : style;
    if (top) {
      const roofModel = st.buildRoof(st.THREE, top.floor.plan, top.y + (project ? (spread || 0) * top.floor.level : 0), { ...roof, style: roofStyle, palette: project?.palette || palette, materials: project?.materials || materials });
      st.model.add(roofModel);
      import('../lib/pbr').then(({ upgradeMaterials }) => upgradeMaterials(st.THREE, roofModel)).then(() => {
        if (roofModel.parent === st.model) st.invalidate?.(true);
        else roofModel.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => m.userData?.pbrTextures?.forEach((t) => t.dispose())); });
      }).catch(() => {});
    }
  }, [roof, ready, plan, project, palette, materials, spread, style]);

  // selezione: un riquadro colorato attorno all'oggetto scelto (arredo, porta, finestra o locale)
  const selKey = selection ? `${selection.kind}|${selection.index ?? ''}|${selection.roomId ?? ''}|${selection.floorId ?? ''}` : '';
  useEffect(() => {
    const st = sceneRef.current;
    if (!st?.model) return undefined;
    const THREE = st.THREE;
    const old = st.scene.getObjectByName('selezione');
    if (old) { st.scene.remove(old); old.geometry.dispose(); old.material.dispose(); }
    if (selection) {
      const box = new THREE.Box3();
      st.model.traverse((o) => {
        const u = o.userData;
        const mine = selection.kind === 'item' ? u.itemIndex === selection.index
          : selection.kind === 'room' ? u.roomId === selection.roomId
            : u.openingKind === selection.kind && u.openingIndex === selection.index;
        if (!mine || !(o.isMesh || o.isGroup)) return;
        if (selection.floorId != null) { // nella casa a più piani vale solo quello giusto
          let fid = null;
          for (let n = o; n; n = n.parent) if (n.userData.floor?.id !== undefined) { fid = n.userData.floor.id; break; }
          if (fid != null && fid !== selection.floorId) return;
        }
        box.expandByObject(o);
      });
      if (!box.isEmpty()) {
        const helper = new THREE.Box3Helper(box.expandByScalar(0.03), '#58760a');
        helper.name = 'selezione';
        helper.material.depthTest = false;
        helper.material.transparent = true;
        helper.renderOrder = 999;
        st.scene.add(helper);
      }
    }
    st.invalidate?.();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey, ready]);

  // sensori, impianto e luci: si ricostruiscono quando cambiano i dati e si accendono con gli interruttori
  const overlayKey = overlay ? `${overlay.devices?.length || 0}|${overlay.electric ? 1 : 0}|${overlay.floorId}` : '';
  useEffect(() => {
    const st = sceneRef.current;
    if (!st?.model) return undefined;
    const old = builtRef.current;
    if (old) for (const g of Object.values(old.groups).flat()) {
      g.parent?.remove(g);
      g.traverse((o) => { o.geometry?.dispose(); });
    }
    // le luci puntuali dei gruppi tolti non fanno più parte della scena

    builtRef.current = attach(st, st.model, spread || 0);
    st.invalidate?.(true);
    return undefined;
    // attach legge overlay e project dall'ultimo render: si ricostruisce solo quando cambiano i dati veri
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, plan, project, spread, style, overlay?.devices, overlay?.electric, overlayKey]);
  useEffect(() => {
    const st = sceneRef.current;
    if (st && builtRef.current) applyShow(st, builtRef.current, overlay?.show, overlay?.lightsOn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay?.show, overlay?.lightsOn, ready, !!roof]);

  return (
    <div className="pf-3d" ref={host}>
      {error && (
        <div className="pf-hint pf-3d-error" role="alert">
          <p>Vista 3D non disponibile: {error}</p>
          {/Disabled|0xffff|blocklist/i.test(error) && (
            <p>Il browser ha disattivato WebGL: di solito succede dopo che la scheda grafica si è resettata (render molto pesanti, come il 4K o il path tracing). <b>Chiudi tutte le finestre di Edge e riaprilo</b>: ricaricare la pagina non basta. Poi usa render più leggeri (Full HD, meno campioni).</p>
          )}
          {/WebGL/i.test(error) && !/Disabled|0xffff|blocklist/i.test(error) && (
            <p>Il browser ha finito i contesti grafici (troppe schede o render aperti) o l&apos;accelerazione grafica è spenta. Chiudi le altre schede che usano il 3D e riprova.</p>
          )}
          <button type="button" className="pf-tool" onClick={() => { setError(null); setAttempt((n) => n + 1); }}>Riprova</button>
        </div>
      )}
      <span className="pf-3d-hint">Trascina per ruotare · rotellina per lo zoom · tasto destro per spostarti</span>
    </div>
  );
}
