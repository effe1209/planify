/*
 * La scena del render: tutta la casa con tetto e soffitti, luce del sole che entra dalle finestre, luce d'ambiente,
 * corpi illuminanti (accesi al tramonto e di sera) e sensori dell'allarme. La usano il render in tempo reale e il path tracing.
 */
import { THEMES } from './themes';
import { buildOverlays, setLights } from './overlays3d';
import { planElectric } from './electric';
import { backgroundFor, lampsOn, sunFor, timeById } from './renderStudio';
import { FLOOR_H, addGround, buildHouse, buildRoof, roofFloor } from './scene3d';
import { ROOF_DEFAULTS } from './roof';

/* Texture di rumore per dare grana a pareti, pavimenti e tessuti (bump fine): niente superfici lisce da plastica. */
function noiseTexture(THREE) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(256, 256);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + rnd() * 70;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* Materiali meno «plasticosi»: grana sulle superfici con texture, riflessi dall'ambiente, vetro che non fa ombra. */
export function refineMaterials(THREE, model, maxAniso = 8) {
  const grain = noiseTexture(THREE);
  const seen = new Set();
  model.traverse((o) => {
    if (!o.isMesh) return;
    const mats = [].concat(o.material);
    const glass = o.userData.layer === 'VETRI' || mats.some((m) => m.userData?.cat === 'VETRO');
    if (glass) o.castShadow = false;   // il sole passa dalle finestre
    for (const m of mats) {
      if (seen.has(m) || !m.isMeshStandardMaterial) continue;
      seen.add(m);
      if (m.map) {
        m.map.anisotropy = maxAniso;
        if (grain && !m.bumpMap && m.userData?.cat !== 'LUCE') { m.bumpMap = grain; m.bumpScale = 0.35; }
      }
      if (m.userData?.cat === 'VETRO') { m.roughness = 0.04; m.opacity = Math.min(m.opacity, 0.28); m.depthWrite = false; }
      else if (m.userData?.cat === 'METALLO') { m.roughness = Math.min(m.roughness, 0.35); m.metalness = Math.max(m.metalness, 0.7); }
      else if (m.userData?.cat === 'CERAMICA') m.roughness = Math.min(m.roughness, 0.25);
      else if (m.roughness > 0.8 && !m.userData?.cat) m.roughness = 0.78;
    }
  });
}

/* Piani da dare agli overlay (impianto, sensori): ogni piano abitato alla sua quota. */
const overlayFloors = (project) => project.floors
  .filter((f) => typeof f.level === 'number' && f.plan?.rooms?.length && !f.plan.rooms.every((r) => r.kind === 'garden'))
  .map((f) => ({ floor: f, y: f.level * FLOOR_H, plan: f.plan }));

/*
 * { scene, model, bounds: { bb, center, size }, lamps: [{ x, y, z }], sun, built }
 *   opts: renderer (per l'ambiente), view (la vista: la «pianta 3D dall'alto» toglie il tetto), time, background, roof (false per toglierlo)
 */
export function buildRenderScene(THREE, project, { renderer = null, RoomEnvironment = null, hdri = null, view = null, time = 'afternoon', background = 'white', roof = true, lowWalls = false } = {}) {
  const t = timeById(time);
  const scene = new THREE.Scene();
  const model = buildHouse(THREE, project, (f) => THEMES[f.meta?.style] || THEMES.modern, { lowWalls, ceiling: true });
  if (!model.children.length) return null;
  // il tetto lo decide chi chiama (il pannello Render lo accende da solo nelle viste da fuori e lo spegne nella pianta dall'alto)
  const withRoof = roof !== false;
  const top = withRoof ? roofFloor(project) : null;
  if (top) model.add(buildRoof(THREE, top.floor.plan, top.y, { ...ROOF_DEFAULTS, style: top.floor.meta?.style || 'modern' }));
  refineMaterials(THREE, model, renderer?.capabilities?.getMaxAnisotropy?.() || 8);
  scene.add(model);
  const bounds = addGround(THREE, scene, model);
  const { center, size, bb } = bounds;
  if (bounds.ground && t.ground < 1) bounds.ground.material.color.multiplyScalar(t.ground);   // di sera il prato non è chiaro come di giorno
  const W = size.x, L = size.z, H = bb.max.y;

  // luce: sole attraverso le finestre, ambiente (cielo) e riempimento morbido
  const sunSet = sunFor(time, project.north || 0, [center.x, 0, center.z], Math.max(W, L) * 0.6 + 8 + H);
  const hemi = new THREE.HemisphereLight('#ffffff', '#b9bfc9', t.hemi);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(sunSet.color, t.sun);
  sun.position.set(...sunSet.position);
  sun.target.position.set(center.x, 0, center.z);
  sun.castShadow = true;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 3;
  const ext = Math.max(W, L, H);
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 60 + H * 2 + sunSet.position[1] });
  scene.add(sun, sun.target);
  if (renderer) {
    // riflessi e luce d'ambiente: il cielo HDRI dell'ora (se si è caricato), altrimenti uno studio neutro
    const pm = new THREE.PMREMGenerator(renderer);
    if (hdri) {
      scene.environment = pm.fromEquirectangular(hdri.userData.soft || hdri).texture;
      scene.environmentIntensity = t.env * 1.2;
    } else if (RoomEnvironment) {
      scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = t.env;
    }
  }
  const bg = backgroundFor(background, time);
  // sfondo «Cielo»: il cielo vero dell'ora (HDRI) dietro la casa; con gli altri sfondi, il colore scelto
  if (!bg.alpha) scene.background = background === 'sky' && hdri ? hdri : new THREE.Color(bg.color);
  if (background === 'sky' && hdri) { scene.backgroundBlurriness = 0.04; scene.backgroundIntensity = Math.max(0.35, t.env * 2.2); }

  // corpi illuminanti (sempre) e sensori dell'allarme (se ci sono): accesi al tramonto e di sera
  const devices = project.security?.devices || [];
  const electric = planElectric(project, { level: project.electric?.level || 2 });
  const built = buildOverlays(THREE, { floors: overlayFloors(project), devices, electric, theme: THEMES[top?.floor.meta?.style] || THEMES.modern });
  scene.add(built.lights);
  if (devices.length) scene.add(built.sensors);
  setLights(built, lampsOn(time));
  // le lampade accese illuminano la stanza con calore, senza bruciare l'immagine (setLights è tarato per la vista interattiva)
  for (const l of built.realLights) l.intensity = lampsOn(time) ? 1.6 : 0;
  for (const g of built.glow) g.emissiveIntensity = lampsOn(time) ? 1.3 : 0.1;
  return { scene, model, bounds, sun, hemi, built, lamps: built.lightPoints, lampsOn: lampsOn(time), time: t, background: bg };
}
