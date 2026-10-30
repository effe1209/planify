import { useEffect, useRef, useState } from 'react';
import { THEMES } from '../lib/themes';

/*
 * Vista 3D navigabile del piano aperto o di tutta la casa (piani impilati con i solai, anche esplosa):
 * trascina per ruotare, rotellina per lo zoom, tasto destro (o due dita) per spostarti. three.js si carica solo qui.
 * onReady({ png, dxf }) dà all'app le esportazioni della vista: immagine PNG e DXF 3D (lib/dxf3d.js).
 */
export default function Plan3D({ plan, north = 0, roof = null, project = null, style = 'modern', lowWalls = false, spread = 0, onReady }) {
  const host = useRef(null);
  const [error, setError] = useState(null);
  const sceneRef = useRef(null);   // { THREE, model, buildRoof, roofFloor }: il tetto si cambia senza ricostruire la scena
  const roofRef = useRef(roof);
  roofRef.current = roof;
  const [ready, setReady] = useState(0);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const THREE = await import('three');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        const { buildScene, buildHouse, addGround, buildRoof, roofFloor, WALL_H } = await import('../lib/scene3d');
        const { sunDirection } = await import('../lib/orientation');
        const { sceneToDxf } = await import('../lib/dxf3d');
        if (disposed || !host.current) return;
        const el = host.current;
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.setClearColor('#eef1f5');
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const model = project
          ? buildHouse(THREE, project, (f) => THEMES[f.meta?.style] || THEMES.modern, { lowWalls, spread })
          : buildScene(THREE, plan, THEMES[style] || THEMES.modern, { lowWalls });
        scene.add(model);
        sceneRef.current = { THREE, model, buildRoof, roofFloor, WALL_H };
        setReady((n) => n + 1);
        // ingombro reale (con i piani impilati) per terreno, luce e inquadratura
        const { bb, center, size } = addGround(THREE, scene, model);
        const W = Math.max(1, size.x), L = Math.max(1, size.z), Ht = Math.max(1, bb.max.y);
        scene.add(new THREE.HemisphereLight('#ffffff', '#cfd6e0', 1.3));
        const sun = new THREE.DirectionalLight('#fff7ea', 1.6);
        const dir = sunDirection(north);   // il sole segue il nord del progetto (pomeriggio, a sud-ovest)
        const reach = Math.max(W, L) * 0.6 + 8;
        sun.position.set(center.x + dir.dx * reach, 14 + Ht, center.z + dir.dz * reach);
        sun.target.position.set(center.x, 0, center.z);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const ext = Math.max(W, L, Ht);
        Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 60 + Ht * 2 });
        scene.add(sun, sun.target);

        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
        // inquadratura a tre quarti dall'alto, abbastanza lontana da far entrare tutta la pianta
        // inquadratura a tre quarti dall'alto: tutta la sfera che contiene il modello entra nel campo più stretto
        const sphere = bb.getBoundingSphere(new THREE.Sphere());
        const frame = (aspect) => {
          const v = (40 * Math.PI) / 180;
          const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
          const dist = (sphere.radius / Math.sin(Math.min(v, h) / 2)) * 1.08;
          const dir = new THREE.Vector3(0.45, 0.8, 0.75).normalize();
          camera.position.copy(sphere.center).addScaledVector(dir, dist);
        };
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.copy(sphere.center);
        controls.enableDamping = true;
        controls.maxPolarAngle = Math.PI / 2.05;   // mai sotto il pavimento
        controls.minDistance = 2;
        controls.maxDistance = ext * 6;

        const resize = () => {
          const w = el.clientWidth || 600;
          const h = el.clientHeight || 400;
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          if (!framed) {
            frame(w / h);
            framed = true;
          }
        };
        let framed = false;
        const ro = new ResizeObserver(resize);
        ro.observe(el);
        resize();
        let raf = 0;
        const loop = () => {
          controls.update();
          renderer.render(scene, camera);
          raf = requestAnimationFrame(loop);
        };
        loop();
        onReady?.({
          png: () => {
            renderer.render(scene, camera);
            return renderer.domElement.toDataURL('image/png');
          },
          // il DXF ha sempre le quote vere e i muri interi, anche se la vista è esplosa o con i muri bassi
          dxf: () => sceneToDxf(THREE, !spread && !lowWalls ? model : project
            ? buildHouse(THREE, project, (f) => THEMES[f.meta?.style] || THEMES.modern)
            : buildScene(THREE, plan, THEMES[style] || THEMES.modern)),
        });
        cleanup = () => {
          onReady?.(null);
          cancelAnimationFrame(raf);
          ro.disconnect();
          controls.dispose();
          scene.traverse((o) => {
            o.geometry?.dispose();
            if (o.material) [].concat(o.material).forEach((m) => m.dispose());
          });
          renderer.dispose();
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
    // onReady è un callback dell'app: cambiarlo non deve ricostruire la scena
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, project, style, lowWalls, spread, north]);

  // tetto: si toglie e si rimette senza muovere l'inquadratura
  useEffect(() => {
    const st = sceneRef.current;
    if (!st) return;
    const old = st.model.getObjectByName('tetto');
    if (old) {
      st.model.remove(old);
      old.traverse((o) => { o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach((m) => m.dispose()); });
    }
    if (!roof) return;
    const top = project ? st.roofFloor(project) : { floor: { plan }, y: st.WALL_H };
    if (top) st.model.add(st.buildRoof(st.THREE, top.floor.plan, top.y + (project ? (spread || 0) * top.floor.level : 0), roof));
  }, [roof, ready, plan, project, spread]);

  return (
    <div className="pf-3d" ref={host}>
      {error && <p className="pf-hint">Vista 3D non disponibile: {error}</p>}
      <span className="pf-3d-hint">Trascina per ruotare · rotellina per lo zoom · tasto destro per spostarti</span>
    </div>
  );
}
