/*
 * Scena 3D → GLB (glTF binario) per Blender, Unreal, Unity: unità in metri, materiali PBR con le texture dello stile
 * (incorporate), arredi come gruppi con il nome del mobile, luci come luci puntuali vere (candele) e il sole.
 * Blender lo apre di serie (File → Importa → glTF 2.0) e converte l'asse Y in Z da solo.
 */
const LUMENS = 1500;                      // un punto luce da soffitto (≈ lampadina da 100 W incandescente)
const CANDELA = LUMENS / (4 * Math.PI);   // intensità luminosa di una sorgente puntiforme
const SUN_LUX = 3000;                     // sole attenuato: in Blender (modo «Standard») sono circa 4,4 W/m²

/* Nomi leggibili in Blender: ogni mesh prende il nome del suo livello (MURI, ARREDI, SOLAI…) se non ne ha uno. */
function nameNodes(root) {
  const count = new Map();
  root.traverse((o) => {
    if (o.name || !o.isMesh) return;
    const base = o.userData?.layer || 'OGGETTO';
    const n = (count.get(base) || 0) + 1;
    count.set(base, n);
    o.name = `${base}_${n}`;
  });
}

/*
 * root: scena già completa (casa o pianta, tetto, sensori e impianto visibili, punti luce in `lightPoints`).
 * opts.sun: direzione del sole { dx, dz } (rispetto al nord del progetto) o null.
 * Ritorna { buffer, lights, meshes } con buffer = ArrayBuffer del .glb.
 */
export async function sceneToGlb(THREE, root, { lightPoints = [], sun = null } = {}) {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  let lights = 0;
  for (const p of lightPoints) {
    const l = new THREE.PointLight('#ffd9a0', CANDELA, 0, 2);
    l.name = 'LUCE_PUNTUALE';
    l.position.set(p.x, p.y, p.z);
    (p.g || root).add(l);
    lights++;
  }
  if (sun) {
    const d = new THREE.DirectionalLight('#fff4e0', SUN_LUX);
    d.name = 'SOLE';
    d.position.set(sun.dx * 30, 25, sun.dz * 30);
    d.target.position.set(0, 0, 0);
    root.add(d, d.target);
    lights++;
  }
  nameNodes(root);
  root.updateMatrixWorld(true);
  let meshes = 0;
  root.traverse((o) => { if (o.isMesh && o.visible) meshes++; });
  const buffer = await new Promise((resolve, reject) => {
    new GLTFExporter().parse(root, resolve, reject, { binary: true, onlyVisible: true, maxTextureSize: 1024, includeCustomExtensions: false });
  });
  return { buffer, lights, meshes };
}
