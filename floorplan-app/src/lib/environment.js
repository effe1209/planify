/*
 * Terreno e ambiente dei render: invece di un quadrato di terra con il bordo in vista, quattro scelte.
 *   horizon  orizzonte infinito: un grande grande prato che sfuma in trasparenza sullo sfondo o sul cielo;
 *   model    plastico architettonico: una base pulita con il bordo in vista e un fondale neutro sotto;
 *   context  contesto urbano semplice: prato, marciapiede, strada davanti alla casa e due case vicine ai lati;
 *   studio   studio bianco continuo: pavimento senza fine, né bordo né orizzonte.
 * Tutto procedurale (nessun file). `front` = lato d'ingresso (N/E/S/W), la strada sta davanti.
 */

export const GROUNDS = [
  { id: 'horizon', label: 'Orizzonte infinito' },
  { id: 'model', label: 'Plastico architettonico' },
  { id: 'context', label: 'Contesto urbano' },
  { id: 'studio', label: 'Studio bianco continuo' },
];

const ROT = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };   // la strada si disegna con il fronte a +z e poi si ruota

function mesh(THREE, geo, color, { rough = 0.95, receive = true, cast = false, layer = 'TERRENO', ...extra } = {}) {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra }));
  m.receiveShadow = receive;
  m.castShadow = cast;
  m.userData.layer = layer;
  return m;
}

/*
 * Dissolvenza ai bordi del terreno: una mappa di trasparenza radiale (opaco al centro, trasparente al bordo). Dove il prato finisce si vede
 * lo sfondo scelto (bianco, grigio o il cielo vero), senza una riga di bordo. Al posto della nebbia, che rovinava gli effetti del render.
 */
function fadeEdge(THREE, material, { from = 0.3 } = {}) {
  if (typeof document === 'undefined') return material;   // senza canvas (prove con Node) il terreno resta pieno
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(from, '#ffffff');
  gr.addColorStop(0.97, '#000000');
  gr.addColorStop(1, '#000000');
  g.fillStyle = gr;
  g.fillRect(0, 0, N, N);
  const tex = new THREE.CanvasTexture(cv);
  material.alphaMap = tex;
  material.transparent = true;
  material.depthWrite = false;
  return material;
}

/* Una casetta semplice (volume e tetto a due falde) per le case vicine: pareti chiare, tetto scuro. */
function neighbour(THREE, w, d, h, wall, roof) {
  const g = new THREE.Group();
  const body = mesh(THREE, new THREE.BoxGeometry(w, h, d), wall, { cast: true, layer: 'CONTESTO' });
  body.position.y = h / 2;
  g.add(body);
  const rise = Math.min(w, d) * 0.28;
  const alongX = w >= d;
  const shape = new THREE.Shape();
  const half = (alongX ? d : w) / 2 + 0.3;
  shape.moveTo(-half, 0); shape.lineTo(half, 0); shape.lineTo(0, rise); shape.closePath();
  const len = (alongX ? w : d) + 0.6;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
  geo.translate(0, 0, -len / 2);
  const r = mesh(THREE, geo, roof, { cast: true, layer: 'CONTESTO', rough: 0.85 });
  r.position.y = h;
  if (alongX) r.rotation.y = Math.PI / 2;   // il colmo corre lungo il lato maggiore
  g.add(r);
  return g;
}

/*
 * Aggiunge il terreno alla scena. `model` = la casa (con il giardino); `lot` = rettangolo del lotto { x0, x1, z0, z1 } se serve (altrimenti
 * l'ingombro del modello); `bgColor` e `skyColor` non servono più (il terreno sfuma in trasparenza sullo sfondo). Ritorna { bb, center, size, ground } come addGround.
 */
export function addEnvironment(THREE, scene, model, { mode = 'horizon', front = 'S', grade = null } = {}) {
  const bb = new THREE.Box3().setFromObject(model);
  const y0 = grade ?? model.userData.grade ?? bb.min.y;
  const size = bb.getSize(new THREE.Vector3());
  const center = bb.getCenter(new THREE.Vector3());
  const R = Math.max(8, Number.isFinite(size.x + size.z) ? Math.hypot(size.x, size.z) / 2 : 8);
  const g = new THREE.Group();
  g.name = 'TERRENO';
  let ground;
  const below = bb.min.y < y0 - 0.5;   // garage interrato: il terreno lascia intravedere la rampa
  const soften = below ? { transparent: true, opacity: 0.5, depthWrite: false } : {};

  if (mode === 'model') {
    // base: la casa e il giardino più un bordo, spessa 25 cm, con il fianco in vista; sotto, un fondale chiaro che prende l'ombra
    const m = 2.5;
    const base = mesh(THREE, new THREE.BoxGeometry(size.x + 2 * m, 0.25, size.z + 2 * m), '#eef0f2', { cast: true, layer: 'TERRENO', rough: 0.9 });
    base.position.set(center.x, y0 - 0.125 - 0.01, center.z);
    ground = base;
    g.add(base);
    const floor = mesh(THREE, new THREE.CircleGeometry(R * 14, 64), '#dfe2e6', { layer: 'TERRENO_BASE' });
    fadeEdge(THREE, floor.material, { from: 0.55 });
    floor.renderOrder = -2;
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(center.x, y0 - 0.26, center.z);
    g.add(floor);
  } else if (mode === 'studio') {
    const rad = Math.min(R * 40, 380);
    const floor = mesh(THREE, new THREE.CircleGeometry(rad, 64), '#f1f2f4', { rough: 0.85, ...soften });
    fadeEdge(THREE, floor.material, { from: 0.55 });
    floor.renderOrder = -2;
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(center.x, y0 - 0.01, center.z);
    ground = floor;
    g.add(floor);
  } else {
    // orizzonte e contesto: prato grande che sfuma in lontananza
    const rad = Math.min(R * 40, 380);
    const lawn = mesh(THREE, new THREE.CircleGeometry(rad, 72), '#d6dec8', { ...soften });
    fadeEdge(THREE, lawn.material, { from: 0.6 });
    lawn.renderOrder = -2;
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(center.x, y0 - 0.01, center.z);
    ground = lawn;
    g.add(lawn);
    if (mode === 'context') {
      const ctx = new THREE.Group();   // locale: fronte a +z, centro del lotto nell'origine
      const w = size.x; const d = size.z;
      const front0 = d / 2;           // il lotto finisce qui (davanti)
      const walk = mesh(THREE, new THREE.PlaneGeometry(rad * 2, 1.8), '#cfd1d3', { layer: 'CONTESTO' });
      walk.rotation.x = -Math.PI / 2; walk.position.set(0, 0.012, front0 + 0.9 + 1.2);
      const road = mesh(THREE, new THREE.PlaneGeometry(rad * 2, 6.4), '#6a6e73', { layer: 'CONTESTO', rough: 0.9 });
      road.rotation.x = -Math.PI / 2; road.position.set(0, 0.014, front0 + 1.2 + 1.8 + 3.2);
      const line = mesh(THREE, new THREE.PlaneGeometry(rad * 2, 0.12), '#e9e7d8', { layer: 'CONTESTO' });
      line.rotation.x = -Math.PI / 2; line.position.set(0, 0.02, front0 + 1.2 + 1.8 + 3.2);
      const walk2 = mesh(THREE, new THREE.PlaneGeometry(rad * 2, 1.6), '#cfd1d3', { layer: 'CONTESTO' });
      walk2.rotation.x = -Math.PI / 2; walk2.position.set(0, 0.012, front0 + 1.2 + 1.8 + 6.4 + 0.8);
      ctx.add(walk, road, line, walk2);
      // le case vicine, ai lati del lotto e un po' dietro il fronte
      const gap = 6;
      const kit = [['#e9e4da', '#6b5348'], ['#d9dde1', '#4a4f55']];
      [[-1, 0], [1, 1]].forEach(([s, k]) => {
        const nw = 9 + k * 2; const nd = Math.min(12, d * 0.85); const nh = 5.6 + k * 1.2;
        const n = neighbour(THREE, nw, nd, nh, kit[k][0], kit[k][1]);
        n.position.set(s * (w / 2 + gap + nw / 2), 0, -d / 2 + nd / 2 + 1);
        ctx.add(n);
      });
      ctx.rotation.y = ROT[front] ?? 0;
      ctx.position.set(center.x, y0, center.z);
      g.add(ctx);
    }
  }
  scene.add(g);
  return { bb, center, size, ground };
}
