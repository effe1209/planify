import { useEffect, useRef, useState } from 'react';

/*
 * Visore di un panorama a 360° (immagine equirettangolare): si trascina per guardarsi intorno, rotellina o pizzico per lo zoom.
 * Un solo passaggio grafico: per ogni pixel si ricava la direzione dello sguardo e si legge il punto dell'immagine (stessa
 * convenzione di lib/tour.js: il centro guarda a -Z, a destra si va verso +X).
 */
const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const FRAG = `uniform sampler2D tex; uniform float yaw; uniform float pitch; uniform float tanHalf; uniform float aspect; varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  vec3 r = normalize(vec3(p.x * tanHalf * aspect, p.y * tanHalf, -1.0));
  float cp = cos(pitch); float sp = sin(pitch);
  r = vec3(r.x, r.y * cp - r.z * sp, r.y * sp + r.z * cp);
  float cy = cos(yaw); float sy = sin(yaw);
  r = vec3(r.x * cy - r.z * sy, r.y, r.x * sy + r.z * cy);
  float lon = atan(r.x, -r.z);
  float lat = asin(clamp(r.y, -1.0, 1.0));
  gl_FragColor = texture2D(tex, vec2(lon / 6.2831853 + 0.5, lat / 3.1415927 + 0.5));
  #include <colorspace_fragment>
}`;

export default function PanoViewer({ url, label = 'Panorama a 360°' }) {
  const host = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const THREE = await import('three');
        if (disposed || !host.current) return;
        const el = host.current;
        const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        el.appendChild(renderer.domElement);
        renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;cursor:grab';
        const tex = await new Promise((resolve, reject) => new THREE.TextureLoader().load(url, resolve, undefined, () => reject(new Error('Immagine non leggibile'))));
        if (disposed) { tex.dispose(); renderer.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        const state = { yaw: 0, pitch: 0, fov: 75 };
        const mat = new THREE.ShaderMaterial({ uniforms: { tex: { value: tex }, yaw: { value: 0 }, pitch: { value: 0 }, tanHalf: { value: 1 }, aspect: { value: 1.6 } },
          vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false });
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
        const scene = new THREE.Scene();
        scene.add(quad);
        const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        let raf = 0;
        const draw = () => {
          raf = 0;
          mat.uniforms.yaw.value = state.yaw;
          mat.uniforms.pitch.value = state.pitch;
          mat.uniforms.tanHalf.value = Math.tan((state.fov * Math.PI) / 360);
          renderer.render(scene, cam);
        };
        const invalidate = () => { if (!raf && !disposed) raf = requestAnimationFrame(draw); };
        const resize = () => {
          const w = el.clientWidth || 640;
          const h = el.clientHeight || 360;
          renderer.setSize(w, h, false);
          mat.uniforms.aspect.value = w / h;
          invalidate();
        };
        const ro = new ResizeObserver(resize);
        ro.observe(el);
        resize();
        // trascinamento (mouse e dito) e zoom (rotella, pizzico)
        const pts = new Map();
        let pinch = 0;
        const cv = renderer.domElement;
        const down = (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); cv.style.cursor = 'grabbing'; pinch = 0; };
        const move = (e) => {
          const p = pts.get(e.pointerId);
          if (!p) return;
          if (pts.size === 2) {
            pts.set(e.pointerId, [e.clientX, e.clientY]);
            const [a, b] = [...pts.values()];
            const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
            if (pinch) state.fov = Math.min(110, Math.max(35, state.fov * (pinch / d)));
            pinch = d;
          } else {
            const k = (state.fov / (el.clientHeight || 360)) * (Math.PI / 180);
            state.yaw -= (e.clientX - p[0]) * k;
            state.pitch = Math.min(1.45, Math.max(-1.45, state.pitch + (e.clientY - p[1]) * k));
            pts.set(e.pointerId, [e.clientX, e.clientY]);
          }
          invalidate();
        };
        const up = (e) => { pts.delete(e.pointerId); cv.style.cursor = 'grab'; pinch = 0; };
        const wheel = (e) => { e.preventDefault(); state.fov = Math.min(110, Math.max(35, state.fov * (1 + Math.sign(e.deltaY) * 0.08))); invalidate(); };
        cv.addEventListener('pointerdown', down);
        cv.addEventListener('pointermove', move);
        cv.addEventListener('pointerup', up);
        cv.addEventListener('pointercancel', up);
        cv.addEventListener('wheel', wheel, { passive: false });
        cleanup = () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          cv.removeEventListener('pointerdown', down);
          cv.removeEventListener('pointermove', move);
          cv.removeEventListener('pointerup', up);
          cv.removeEventListener('pointercancel', up);
          cv.removeEventListener('wheel', wheel);
          tex.dispose();
          mat.dispose();
          quad.geometry.dispose();
          renderer.dispose();
          renderer.forceContextLoss();
          cv.remove();
        };
      } catch (e) {
        if (!disposed) setError(e.message);
      }
    })();
    return () => { disposed = true; cleanup(); };
  }, [url]);

  return (
    <div className="pf-pano" ref={host} role="img" aria-label={label}>
      {error && <p className="pf-hint pf-pano-error" role="alert">Visore non disponibile: {error}</p>}
      <span className="pf-pano-hint">Trascina per guardarti intorno · rotellina o pizzico per lo zoom</span>
    </div>
  );
}
