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

  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    let level = null;
    for (let p = o; p; p = p.parent) if (p.userData?.floor) { level = p.userData.floor.level; break; }
    const kind = o.userData.layer || 'ARREDI';
    const layer = level == null ? kind : `${floorTag(level)}_${kind}`;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const vert = (i) => toDxf(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
    const at = (k) => (idx ? idx.getX(k) : k);
    const count = idx ? idx.count : pos.count;
    if (o.geometry.type === 'BoxGeometry' && count === 36) {
      // 6 facce da due triangoli (a, b, d) (b, c, d): un quadrilatero a, b, c, d
      for (let f = 0; f < 6; f++) {
        const k = f * 6;
        faces.push({ layer, pts: [vert(at(k)), vert(at(k + 1)), vert(at(k + 4)), vert(at(k + 2))] });
      }
    } else {
      for (let k = 0; k + 2 < count; k += 3) faces.push({ layer, pts: [vert(at(k)), vert(at(k + 1)), vert(at(k + 2))] });
    }
  });

  const layers = [...new Set(faces.map((f) => f.layer))].sort();
  const out = [];
  const put = (...pairs) => { for (let i = 0; i < pairs.length; i += 2) out.push(String(pairs[i]), String(pairs[i + 1])); };
  put(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 6,
    9, '$EXTMIN', 10, n3(box.min.x), 20, 0, 30, n3(box.min.y), 9, '$EXTMAX', 10, n3(box.max.x), 20, n3(zMax - box.min.z), 30, n3(box.max.y),
    0, 'ENDSEC');
  put(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LTYPE', 70, 1, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Continua', 72, 65, 73, 0, 40, 0, 0, 'ENDTAB');
  put(0, 'TABLE', 2, 'LAYER', 70, layers.length + 1, 0, 'LAYER', 2, '0', 70, 0, 62, 7, 6, 'CONTINUOUS');
  for (const l of layers) put(0, 'LAYER', 2, l, 70, 0, 62, COLORS[l.split('_').pop()] ?? 7, 6, 'CONTINUOUS');
  put(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
  for (const { layer, pts } of faces) {
    const p = pts.length === 3 ? [...pts, pts[2]] : pts;
    put(0, '3DFACE', 8, layer);
    p.forEach(([x, y, z], i) => put(10 + i, n3(x), 20 + i, n3(y), 30 + i, n3(z)));
  }
  put(0, 'ENDSEC', 0, 'EOF');
  return { text: out.join('\n'), faces: faces.length, layers };
}
