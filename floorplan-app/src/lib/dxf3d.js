/*
 * Scena 3D (lib/scene3d.js) → DXF R12 con facce 3D (3DFACE), in metri, Z verso l'alto.
 * Layer per piano e per tipo: «PT_MURI», «P1_ARREDI», «P1_SOLAI», «EST_ARREDI» (giardino)… (senza prefisso per un solo piano).
 * Le facce delle scatole (muri, arredi) escono come quadrilateri, il resto (pavimenti, sfere, cilindri) a triangoli.
 */
const COLORS = { MURI: 7, VETRI: 4, PAVIMENTI: 8, ARREDI: 30, SOLAI: 9 };
const n3 = (v) => (Math.round(v * 1000) / 1000).toString();

/* Sigla del piano per i layer: PT, P1, P2, S1 (interrato)… */
const floorTag = (level) => (level === 'out' ? 'EST' : level === 0 ? 'PT' : level > 0 ? `P${level}` : `S${-level}`);

export function sceneToDxf(THREE, root) {
  root.updateMatrixWorld(true);
  const faces = [];   // { layer, pts: [[x, y, z] × 3 o 4] }
  const box = new THREE.Box3().setFromObject(root);
  const zMax = box.max.z;   // la pianta ha la y verso il basso: nel DXF si ribalta
  const toDxf = (v) => [v.x, zMax - v.z, v.y];

  /* Facce di una mesh (quadrilateri per le scatole, triangoli per il resto) con i vertici trasformati da `map`. */
  const meshFaces = (o, map) => {
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const vert = (i) => map(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
    const at = (k) => (idx ? idx.getX(k) : k);
    const count = idx ? idx.count : pos.count;
    const out = [];
    if (o.geometry.type === 'BoxGeometry' && count === 36) {
      // 6 facce da due triangoli (a, b, d) (b, c, d): un quadrilatero a, b, c, d
      for (let f = 0; f < 6; f++) {
        const k = f * 6;
        out.push([vert(at(k)), vert(at(k + 1)), vert(at(k + 4)), vert(at(k + 2))]);
      }
    } else {
      for (let k = 0; k + 2 < count; k += 3) out.push([vert(at(k)), vert(at(k + 1)), vert(at(k + 2))]);
    }
    return out;
  };
  const levelOf = (o) => {
    for (let p = o; p; p = p.parent) if (p.userData?.floor) return p.userData.floor.level;
    return null;
  };

  // arredi con un modello: un blocco per tipo e misura (geometria locale), inserito dove sta ogni arredo
  const blocks = new Map();    // nome → facce in coordinate locali
  const inserts = [];          // { name, layer, x, y, z, rot }
  const inBlock = new Set();
  root.traverse((o) => {
    if (!o.userData?.furniture) return;
    const { key } = o.userData.furniture;
    o.traverse((c) => { if (c.isMesh) inBlock.add(c); });
    if (!blocks.has(key)) {
      // locale DXF: x = x, y = −z, quota = y della scena; il gruppo è alla sua origine, senza rotazione
      const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
      const local = [];
      o.traverse((c) => {
        if (!c.isMesh || !c.geometry?.attributes?.position) return;
        for (const f of meshFaces(c, (v) => { v.applyMatrix4(inv); return [v.x, -v.z, v.y]; })) local.push(f);
      });
      blocks.set(key, local);
    }
    const level = levelOf(o);
    const origin = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
    const yaw = new THREE.Euler().setFromRotationMatrix(o.matrixWorld, 'YXZ').y;
    const [x, y, z] = toDxf(origin);
    inserts.push({ name: key, layer: level == null ? 'ARREDI' : `${floorTag(level)}_ARREDI`, x, y, z, rot: (yaw * 180) / Math.PI });
  });

  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position || inBlock.has(o)) return;
    const level = levelOf(o);
    const kind = o.userData.layer || 'ARREDI';
    const layer = level == null ? kind : `${floorTag(level)}_${kind}`;
    for (const pts of meshFaces(o, toDxf)) faces.push({ layer, pts });
  });

  const layers = [...new Set([...faces.map((f) => f.layer), ...inserts.map((i) => i.layer)])].sort();
  const out = [];
  const put = (...pairs) => { for (let i = 0; i < pairs.length; i += 2) out.push(String(pairs[i]), String(pairs[i + 1])); };
  put(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 6,
    9, '$EXTMIN', 10, n3(box.min.x), 20, 0, 30, n3(box.min.y), 9, '$EXTMAX', 10, n3(box.max.x), 20, n3(zMax - box.min.z), 30, n3(box.max.y),
    0, 'ENDSEC');
  put(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LTYPE', 70, 1, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Continua', 72, 65, 73, 0, 40, 0, 0, 'ENDTAB');
  put(0, 'TABLE', 2, 'LAYER', 70, layers.length + 1, 0, 'LAYER', 2, '0', 70, 0, 62, 7, 6, 'CONTINUOUS');
  for (const l of layers) put(0, 'LAYER', 2, l, 70, 0, 62, COLORS[l.split('_').pop()] ?? 7, 6, 'CONTINUOUS');
  put(0, 'ENDTAB', 0, 'ENDSEC');
  if (blocks.size) {
    put(0, 'SECTION', 2, 'BLOCKS');
    for (const [name, local] of blocks) {
      put(0, 'BLOCK', 8, '0', 2, name, 70, 0, 10, 0, 20, 0, 30, 0, 3, name);
      for (const pts of local) {
        const p = pts.length === 3 ? [...pts, pts[2]] : pts;
        put(0, '3DFACE', 8, '0');
        p.forEach(([x, y, z], i) => put(10 + i, n3(x), 20 + i, n3(y), 30 + i, n3(z)));
      }
      put(0, 'ENDBLK', 8, '0');
    }
    put(0, 'ENDSEC');
  }
  put(0, 'SECTION', 2, 'ENTITIES');
  for (const { layer, pts } of faces) {
    const p = pts.length === 3 ? [...pts, pts[2]] : pts;
    put(0, '3DFACE', 8, layer);
    p.forEach(([x, y, z], i) => put(10 + i, n3(x), 20 + i, n3(y), 30 + i, n3(z)));
  }
  for (const i of inserts) put(0, 'INSERT', 8, i.layer, 2, i.name, 10, n3(i.x), 20, n3(i.y), 30, n3(i.z), 50, n3(i.rot));
  put(0, 'ENDSEC', 0, 'EOF');
  return { text: out.join('\n'), faces: faces.length + [...blocks.values()].reduce((a, b) => a + b.length, 0), layers, blocks: [...blocks.keys()], inserts: inserts.length };
}
