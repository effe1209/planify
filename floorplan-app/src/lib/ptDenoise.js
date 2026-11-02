/*
 * Filtro del rumore del path tracing guidato dalla geometria («joint bilateral»): per ogni pixel si fa la media dei vicini, ma solo di
 * quelli che hanno la stessa normale, la stessa distanza e lo stesso colore di base, e che stanno dentro o fuori la casa come lui.
 * Le due immagini guida (normali + profondità, colore di base) si disegnano al volo con la stessa telecamera, in raster, senza rumore:
 * per questo i bordi restano netti, a differenza di un filtro che guarda solo il colore (sfoca i contorni e il bordo con lo sfondo).
 * È la stessa idea dei denoiser di Blender (OpenImageDenoise, OptiX), molto più semplice.
 */

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/* Una passata: media pesata dei vicini; l'ultima passata fa anche mappa tonale e sRGB e scrive sul canvas. */
const FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D colorMap;   // path tracing accumulato (lineare, alfa = copertura)
  uniform sampler2D geoMap;     // rgb = normale * 0.5 + 0.5, a = profondità normalizzata (0 = sfondo)
  uniform sampler2D albedoMap;  // colore di base
  uniform vec2 texel;
  uniform float radius;
  uniform float stride;
  uniform float sigmaS;
  uniform float sigmaC;
  uniform float exposure;
  uniform float opaque;         // 1 = alfa pieno ovunque (ripiego se la copertura del path tracing non è affidabile)
  varying vec2 vUv;

  float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  // i «fireflies» (punti bianchissimi di un cammino fortunato) si limitano prima di mediare
  vec3 limitFirefly(vec3 c) {
    if (!(c.r == c.r) || !(c.g == c.g) || !(c.b == c.b)) return vec3(0.0);   // NaN di un cammino sbagliato
    c = min(c, vec3(1.0e4));
    float l = lum(c);
    return c * min(1.0, 6.0 / max(l, 1e-4));
  }

  void main() {
    vec4 c0 = texture2D(colorMap, vUv);
    c0.rgb = limitFirefly(c0.rgb);
    vec4 g0 = texture2D(geoMap, vUv);
    vec3 a0 = texture2D(albedoMap, vUv).rgb;
    vec3 n0 = normalize(g0.rgb * 2.0 - 1.0);
    float inside0 = step(0.0001, g0.a);
    // il colore si confronta compresso (HDR → [0,1)): un lampo isolato non pesa più del resto
    vec3 cc0 = c0.rgb / (1.0 + lum(c0.rgb));
    vec4 sum = vec4(0.0);
    float wsum = 0.0;
    for (int j = -RADIUS; j <= RADIUS; j++) {
      for (int i = -RADIUS; i <= RADIUS; i++) {
        vec2 uv = vUv + vec2(float(i), float(j)) * stride * texel;
        vec4 c = texture2D(colorMap, uv);
        c.rgb = limitFirefly(c.rgb);
        vec4 g = texture2D(geoMap, uv);
        float inside = step(0.0001, g.a);
        if (inside != inside0) continue;                               // dentro o fuori la casa: mai mescolati
        float d2 = float(i * i + j * j);
        float w = exp(-d2 * stride * stride / (2.0 * sigmaS * sigmaS));
        vec3 n = normalize(g.rgb * 2.0 - 1.0);
        w *= pow(max(dot(n0, n), 0.0), 48.0);                          // stessa normale
        w *= exp(-abs(g.a - g0.a) * 400.0 / max(g0.a, 0.02));          // stessa distanza (relativa)
        vec3 a = texture2D(albedoMap, uv).rgb;
        w *= exp(-dot(a - a0, a - a0) * 60.0);                          // stesso colore di base
        vec3 cc = c.rgb / (1.0 + lum(c.rgb));
        w *= exp(-dot(cc - cc0, cc - cc0) / (2.0 * sigmaC * sigmaC));  // colore simile (largo: il rumore è forte)
        sum += vec4(c.rgb, c.a) * w;
        wsum += w;
      }
    }
    vec4 o = wsum > 1e-5 ? sum / wsum : c0;
    #ifdef FINAL
      vec3 col = o.rgb * exposure;
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      // la copertura (dentro/fuori la casa) viene dall'immagine guida, non dall'alfa accumulato dal path tracing: è sempre affidabile
      float cover = opaque > 0.5 ? 1.0 : inside0;
      gl_FragColor = vec4(gl_FragColor.rgb * cover, cover);               // alfa premoltiplicato per il canvas
    #else
      gl_FragColor = o;
    #endif
  }
`;

const NORMAL_VERT = /* glsl */`
  varying vec3 vN;
  varying float vZ;
  void main() {
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vZ = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const NORMAL_FRAG = /* glsl */`
  uniform float far;
  varying vec3 vN;
  varying float vZ;
  void main() {
    vec3 n = gl_FrontFacing ? vN : -vN;
    gl_FragColor = vec4(n * 0.5 + 0.5, clamp(vZ / far, 0.0005, 1.0));
  }
`;

/* Disegna `scene` con una sola materia per ogni mesh (override) nel target; i vetri non ci sono: la guida mostra ciò che si vede attraverso. */
function renderGuide(THREE, renderer, scene, camera, target, makeMaterial) {
  const swapped = [];
  const hidden = [];
  scene.traverse((o) => {
    if (o.isLight) return;
    if (o.isMesh) {
      const glass = o.userData.layer === 'VETRI' || [].concat(o.material).some((m) => m.isMeshPhysicalMaterial && m.transmission > 0);
      if (glass && o.visible) { o.visible = false; hidden.push(o); return; }
      if (makeMaterial) {
        swapped.push([o, o.material]);
        o.material = makeMaterial(o.material);
      }
    }
  });
  const bg = scene.background;
  const env = scene.environment;
  scene.background = null;
  scene.environment = null;
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevTone = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.toneMapping = prevTone;
  scene.background = bg;
  scene.environment = env;
  for (const [o, m] of swapped) o.material = m;
  for (const o of hidden) o.visible = true;
}

/*
 * Prepara le immagini guida una volta sola; ritorna draw(exposure) che filtra l'accumulato e lo scrive sul canvas del renderer
 * (mappa tonale + sRGB), e dispose(). `colorTexture` è il target del path tracing.
 */
export function guidedDenoiser(THREE, renderer, { scene, camera, width, height, colorTexture, far = 200 }) {
  const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, samples: 4, depthBuffer: true };
  const geo = new THREE.WebGLRenderTarget(width, height, opts);
  const alb = new THREE.WebGLRenderTarget(width, height, { ...opts, type: THREE.UnsignedByteType });
  const normalMat = new THREE.ShaderMaterial({ vertexShader: NORMAL_VERT, fragmentShader: NORMAL_FRAG, uniforms: { far: { value: far } }, side: THREE.DoubleSide });
  const albedoCache = new Map();
  renderGuide(THREE, renderer, scene, camera, geo, () => normalMat);
  renderGuide(THREE, renderer, scene, camera, alb, (m) => {
    const key = [].concat(m)[0];
    if (!albedoCache.has(key)) {
      const col = key.color ? key.color.clone() : new THREE.Color(0.8, 0.8, 0.8);
      albedoCache.set(key, new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, toneMapped: false }));
    }
    return albedoCache.get(key);
  });

  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const mk = (final) => new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: { RADIUS: 5, ...(final ? { FINAL: 1 } : {}) },
    uniforms: {
      colorMap: { value: null }, geoMap: { value: geo.texture }, albedoMap: { value: alb.texture },
      texel: { value: new THREE.Vector2(1 / width, 1 / height) }, radius: { value: 5 }, stride: { value: 1 },
      sigmaS: { value: 4.5 }, sigmaC: { value: 0.4 }, exposure: { value: 1 }, opaque: { value: 0 },
    },
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
  const matA = mk(false);
  const matFinal = mk(true);
  const mesh = new THREE.Mesh(quadGeo, matA);
  const quadScene = new THREE.Scene();
  quadScene.add(mesh);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const tmp = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, format: THREE.RGBAFormat });

  return {
    draw(exposure, opaque = false) {
      // ogni passata a fasce orizzontali, con un finish() tra l'una e l'altra: una passata a schermo intero con 121 letture per pixel può
      // tenere occupata la scheda grafica troppo a lungo (reset del sistema); a fasce ogni disegno è breve
      const gl = renderer.getContext();
      const bands = Math.max(1, Math.ceil(height / 135));
      const run = (target) => {
        renderer.setRenderTarget(target);
        renderer.autoClear = true;
        renderer.setScissorTest(bands > 1);
        for (let i = 0; i < bands; i++) {
          if (bands > 1) renderer.setScissor(0, Math.floor((i * height) / bands), width, Math.ceil(height / bands) + 1);
          renderer.autoClear = i === 0 && !target ? true : false;
          renderer.render(quadScene, quadCam);
          gl.finish();
        }
        renderer.setScissorTest(false);
        renderer.autoClear = true;
      };
      mesh.material = matA;
      matA.uniforms.colorMap.value = colorTexture;
      matA.uniforms.stride.value = 1;
      run(tmp);
      mesh.material = matFinal;
      matFinal.uniforms.colorMap.value = tmp.texture;
      matFinal.uniforms.stride.value = 1;
      matFinal.uniforms.exposure.value = exposure;
      matFinal.uniforms.opaque.value = opaque ? 1 : 0;
      renderer.toneMappingExposure = 1;   // l'esposizione la applica già lo shader (prima della mappa tonale)
      run(null);
    },
    dispose() {
      for (const t of [geo, alb, tmp]) t.dispose();
      for (const m of [matA, matFinal, normalMat, ...albedoCache.values()]) m.dispose();
      quadGeo.dispose();
    },
  };
}
