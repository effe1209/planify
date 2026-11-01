/*
 * Immagine 3D di tutta la casa fuori schermo (PDF del progetto e pannello Render): stessa scena della vista
 * interattiva (lib/scene3d.js), con inquadratura, ora del giorno, sfondo e risoluzione a scelta (lib/renderStudio.js).
 * Senza opzioni: tre quarti dall'alto, pomeriggio, sfondo bianco. three.js si carica solo qui.
 */
import { THEMES } from './themes';
import { backgroundFor, cameraViews, houseBounds, sunFor } from './renderStudio';

export async function houseImage(project, {
  width = 1800, height = 1100, lowWalls = false, view = null, time = 'afternoon', background = 'white', roof = null,
} = {}) {
  const THREE = await import('three');
  const { buildHouse, addGround, buildRoof, roofFloor } = await import('./scene3d');
  const canvas = document.createElement('canvas');
  const bg = backgroundFor(background, time);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  try {
    renderer.setSize(width, height, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(bg.color, bg.alpha ? 0 : 1);
    const scene = new THREE.Scene();
    const model = buildHouse(THREE, project, (f) => THEMES[f.meta?.style] || THEMES.modern, { lowWalls });
    if (!model.children.length) return null;
    if (roof) {
      const top = roofFloor(project);
      if (top) model.add(buildRoof(THREE, top.floor.plan, top.y, { ...roof, style: top.floor.meta?.style || 'modern' }));
    }
    scene.add(model);
    const { bb, center, size } = addGround(THREE, scene, model);
    const W = size.x, L = size.z, H = bb.max.y;
    const sunSet = sunFor(time, project.north || 0, [center.x, 0, center.z], Math.max(W, L) * 0.6 + 8 + H);
    scene.add(new THREE.HemisphereLight('#ffffff', '#cfd6e0', sunSet.hemi));
    const sun = new THREE.DirectionalLight(sunSet.color, sunSet.intensity);
    const ext = Math.max(W, L, H);
    sun.position.set(...sunSet.position);
    sun.target.position.set(center.x, 0, center.z);
    sun.castShadow = true;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.mapSize.set(width > 2500 ? 4096 : 2048, width > 2500 ? 4096 : 2048);
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 60 + H * 2 + sunSet.position[1] });
    scene.add(sun, sun.target);
    // l'inquadratura scelta; senza, tre quarti dall'alto (la prima delle viste automatiche)
    const v = view || cameraViews(project, { aspect: width / height })[0] || { position: [W, H * 2, L * 1.5], target: [W / 2, H / 2, L / 2], fov: 35 };
    const camera = new THREE.PerspectiveCamera(v.fov, width / height, 0.05, 400);
    camera.position.set(...v.position);
    camera.lookAt(new THREE.Vector3(...v.target));
    renderer.render(scene, camera);
    const data = canvas.toDataURL('image/png');
    scene.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) [].concat(o.material).forEach((m) => m.dispose());
    });
    return { data, w: width, h: height };
  } finally {
    renderer.dispose();
  }
}
export { houseBounds };
