import { useEffect, useRef, useState } from 'react';
import { THEMES } from '../lib/themes';

/*
 * Vista 3D navigabile della pianta del piano aperto: trascina per ruotare, rotellina per lo zoom,
 * tasto destro (o due dita) per spostarti. three.js si carica solo qui (import dinamico).
 */
export default function Plan3D({ plan, style = 'modern', lowWalls = false }) {
  const host = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const THREE = await import('three');
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        const { buildScene } = await import('../lib/scene3d');
        if (disposed || !host.current) return;
        const el = host.current;
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.setClearColor('#eef1f5');
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const { width: W, length: L } = plan.dimensions;
        scene.add(buildScene(THREE, plan, THEMES[style] || THEMES.modern, { lowWalls }));
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 20, L + 20), new THREE.MeshStandardMaterial({ color: '#e4e8ee' }));
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(W / 2, -0.01, L / 2);
        ground.receiveShadow = true;
        scene.add(ground);
        scene.add(new THREE.HemisphereLight('#ffffff', '#cfd6e0', 1.3));
        const sun = new THREE.DirectionalLight('#fff7ea', 1.6);
        sun.position.set(W * 0.2 - 6, 14, L * 0.2 - 4);
        sun.target.position.set(W / 2, 0, L / 2);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const ext = Math.max(W, L);
        Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 60 });
        scene.add(sun, sun.target);

        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
        // inquadratura a tre quarti dall'alto, abbastanza lontana da far entrare tutta la pianta
        const frame = (aspect) => {
          const fit = (ext * 0.75) / Math.tan((40 * Math.PI) / 360) / Math.min(1, aspect);
          const dir = new THREE.Vector3(0.45, 0.8, 0.75).normalize();
          camera.position.set(W / 2 + dir.x * fit, dir.y * fit, L / 2 + dir.z * fit);
        };
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(W / 2, 0.6, L / 2);
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
        cleanup = () => {
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
  }, [plan, style, lowWalls]);

  return (
    <div className="pf-3d" ref={host}>
      {error && <p className="pf-hint">Vista 3D non disponibile: {error}</p>}
      <span className="pf-3d-hint">Trascina per ruotare · rotellina per lo zoom · tasto destro per spostarti</span>
    </div>
  );
}
