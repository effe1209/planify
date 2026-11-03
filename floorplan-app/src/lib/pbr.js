/*
 * Materiali PBR veri (colore, normale, rugosità) per il render e per Blender: texture ambientCG, licenza CC0 (public/pbr/LICENZA.txt).
 * Le texture disegnate al volo (lib/style3d.js) restano per la vista interattiva e come ripiego; nel render si sostituiscono con queste,
 * che hanno rilievo e rugosità vere. I materiali dei kit portano `userData.pbr` (il tipo) e `userData.pbrTint` (il colore dello stile).
 *   rep   = ripetizioni per metro (le UV sono in metri): 0,8 → la texture copre 1,25 m
 *   tint  = quanto il colore dello stile colora la texture (0 = com'è, 1 = tutto il colore dello stile)
 *   gain  = schiarita del colore (le texture grigie di intonaco e cemento sono scure se moltiplicate per un bianco caldo)
 */
const SETS = {
  plank: { dir: 'plank', rep: 0.75, tint: 0.3, gain: 1.05 },
  herringbone: { dir: 'herringbone', rep: 0.75, tint: 0.35, gain: 1.15 },
  concrete: { dir: 'concrete', rep: 0.6, tint: 0.0, gain: 1.0 },
  stucco: { dir: 'plaster', rep: 0.5, tint: 1.0, gain: 1.4 },
  tile: { dir: 'tile', rep: 0.9, tint: 0.2, gain: 1.05 },
  marble: { dir: 'marble', rep: 0.55, tint: 0.15, gain: 1.05 },
  travertine: { dir: 'travertine', rep: 0.55, tint: 0.2, gain: 1.05 },
  tileroof: { dir: 'roof', rep: 0.6, tint: 0.65, gain: 1.0 },
  woodlap: { dir: 'boards', rep: 0.5, tint: 0.5, gain: 2.1 },    // doghe e tronchi: assi vere di legno, schiarite e tinte dal colore scelto
  logwall: { dir: 'boards', rep: 0.5, tint: 0.5, gain: 2.1 },
  cladding: { dir: 'boards', rep: 0.5, tint: 0.5, gain: 2.1 },
  fabric: { dir: 'fabric', rep: 2.6, tint: 0.85, gain: 1.15 },   // divani, tende, cuscini, tappeti: trama vera di tessuto
};

const cache = new Map();   // dir → Promise<{ color, normal, rough }>

function load(THREE, url, srgb, aniso) {
  return new Promise((ok) => {
    new THREE.TextureLoader().load(url, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = aniso;
      ok(t);
    }, undefined, () => ok(null));   // un file mancante non blocca il render: resta la texture disegnata
  });
}

const fetchSet = (THREE, dir, aniso) => {
  if (!cache.has(dir)) {
    cache.set(dir, Promise.all([
      load(THREE, `/pbr/${dir}/color.jpg`, true, aniso), load(THREE, `/pbr/${dir}/normal.jpg`, false, aniso), load(THREE, `/pbr/${dir}/rough.jpg`, false, aniso),
    ]).then(([color, normal, rough]) => (color ? { color, normal, rough } : null)));
  }
  return cache.get(dir);
};

/* Sostituisce le texture dei materiali con i set PBR. Ritorna quanti materiali ha aggiornato (0 senza `document`, come nelle prove con Node). */
export async function upgradeMaterials(THREE, model, { aniso = 8 } = {}) {
  if (typeof document === 'undefined') return 0;
  const mats = new Set();
  model.traverse((o) => { if (o.isMesh) [].concat(o.material).forEach((m) => { if (m?.userData?.pbr && SETS[m.userData.pbr]) mats.add(m); }); });
  let n = 0;
  for (const m of mats) {
    const spec = SETS[m.userData.pbr];
    const set = await fetchSet(THREE, spec.dir, aniso);
    if (!set) continue;
    // ogni materiale ha il suo `repeat`: le texture sono condivise, ma la scala sta nella trasformazione UV del materiale (clone leggero)
    const clone = (t) => {
      if (!t) return null;
      const c = t.clone();
      c.repeat.set(spec.rep, spec.rep);
      c.needsUpdate = true;
      return c;
    };
    m.userData.pbrTextures?.forEach((t) => t.dispose());
    const maps = [clone(set.color), clone(set.normal), clone(set.rough)];
    [m.map, m.normalMap, m.roughnessMap] = maps;
    m.userData.pbrTextures = maps.filter(Boolean);
    m.bumpMap = null;
    m.normalScale?.set(1, 1);
    m.roughness = 1;                     // la rugosità vera è nella mappa
    const base = new THREE.Color(m.userData.pbrTint || '#ffffff');
    m.color = new THREE.Color('#ffffff').lerp(base, spec.tint);
    if (spec.gain !== 1) m.color.multiplyScalar(spec.gain);
    m.needsUpdate = true;
    n++;
  }
  return n;
}
