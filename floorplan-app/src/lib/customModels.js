/* Modelli GLB importati: i file restano in IndexedDB, mentre la planimetria salva solo metadati leggeri. */
const DB_NAME = 'planify-models';
const STORE = 'glb';
const memory = new Map();

function openDb() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Archivio modelli non disponibile'));
  });
}

async function dbRequest(mode, id, value) {
  const db = await openDb();
  if (!db) return mode === 'put' ? memory.set(id, value) : memory.get(id) || null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode === 'put' ? 'readwrite' : 'readonly');
    const req = mode === 'put' ? tx.objectStore(STORE).put(value, id) : tx.objectStore(STORE).get(id);
    let result = null;
    req.onsuccess = () => { result = mode === 'put' ? id : req.result || null; };
    req.onerror = () => reject(req.error || new Error('Lettura del modello non riuscita'));
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Salvataggio del modello non riuscito')); };
  });
}

export function parseGlb(bytes) {
  return import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new Promise((resolve, reject) => {
    new GLTFLoader().parse(bytes, '', resolve, reject);
  }));
}

function dimensionsOf(THREE, object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  return { x: size.x, y: size.y, z: size.z, minY: box.min.y, centerX: (box.min.x + box.max.x) / 2, centerZ: (box.min.z + box.max.z) / 2 };
}

export async function importGlb(THREE, file) {
  if (!file || !/\.glb$/i.test(file.name)) throw new Error('Seleziona un file .glb esportato da Blender.');
  if (file.size > 80 * 1024 * 1024) throw new Error('Il modello supera il limite di 80 MB.');
  const bytes = await file.arrayBuffer();
  const gltf = await parseGlb(bytes.slice(0));
  const bounds = dimensionsOf(THREE, gltf.scene);
  if (![bounds.x, bounds.y, bounds.z].every((n) => Number.isFinite(n) && n > 0.001)) throw new Error('Il GLB non contiene un oggetto 3D con ingombro valido.');
  const id = `model-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await dbRequest('put', id, bytes);
  return { id, name: file.name.replace(/\.glb$/i, ''), bounds: { x: bounds.x, y: bounds.y, z: bounds.z } };
}

export async function hydrateCustomModels(THREE, root) {
  if (!root) return 0;
  const anchors = [];
  root.traverse((o) => { if (o.userData?.customModel && !o.userData.customModelLoaded) anchors.push(o); });
  let loaded = 0;
  for (const anchor of anchors) {
    if (!anchor.parent) continue;
    const meta = anchor.userData.customModel;
    const bytes = await dbRequest('get', meta.id);
    if (!bytes) { anchor.userData.customModelMissing = true; continue; }
    try {
      const gltf = await parseGlb(bytes.slice(0));
      const object = gltf.scene;
      const bounds = dimensionsOf(THREE, object);
      object.position.x -= bounds.centerX;
      object.position.z -= bounds.centerZ;
      object.position.y -= bounds.minY;
      const target = meta.target;
      object.scale.set(target.w / bounds.x, target.height / bounds.y, target.h / bounds.z);
      object.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        o.userData.layer = 'ARREDI';
        o.userData.customModel = true;
      });
      anchor.add(object);
      anchor.userData.customModelLoaded = true;
      loaded++;
    } catch (e) {
      anchor.userData.customModelError = e?.message || 'GLB non valido';
    }
  }
  return loaded;
}
