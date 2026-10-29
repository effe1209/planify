/*
 * Immagine 3D di tutta la casa fuori schermo (per il PDF del progetto): stessa scena della vista interattiva
 * (lib/scene3d.js), inquadratura a tre quarti dall'alto, ombre del sole. three.js si carica solo qui.
 */
import { THEMES } from './themes';

export async function houseImage(project, { width = 1800, height = 1100, lowWalls = false } = {}) {
  const THREE = await import('three');
  const { buildHouse } = await import('./scene3d');
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  try {
    renderer.setSize(width, height, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor('#ffffff');
    const scene = new THREE.Scene();
    const model = buildHouse(THREE, project, (f) => THEMES[f.meta?.style] || THEMES.modern, { lowWalls });
    if (!model.children.length) return null;
    scene.add(model);
    const bb = new THREE.Box3().setFromObject(model);
    const W = bb.max.x, L = bb.max.z, H = bb.max.y;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 30, L + 30), new THREE.MeshStandardMaterial({ color: '#eef1f5' }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(W / 2, bb.min.y - 0.01, L / 2);
    ground.receiveShadow = true;
    scene.add(ground);
    scene.add(new THREE.HemisphereLight('#ffffff', '#cfd6e0', 1.3));
    const sun = new THREE.DirectionalLight('#fff7ea', 1.6);
    const ext = Math.max(W, L, H);
    sun.position.set(W * 0.2 - 6, 14 + H, L * 0.2 - 4);
    sun.target.position.set(W / 2, 0, L / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 60 + H * 2 });
    scene.add(sun, sun.target);
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 400);
    const sphere = bb.getBoundingSphere(new THREE.Sphere());
    const v = (35 * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(v / 2) * (width / height));
    const dist = sphere.radius / Math.sin(Math.min(v, hf) / 2);
    camera.position.copy(sphere.center).addScaledVector(new THREE.Vector3(0.55, 0.65, 0.8).normalize(), dist);
    camera.lookAt(sphere.center);
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
