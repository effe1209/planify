/*
 * Sensori Ajax, impianto elettrico e luci nel 3D. Si costruiscono solo quando il progetto li ha calcolati
 * (project.security.devices, planElectric) e vivono in gruppi propri che si accendono e si spengono:
 *   sensori · impianto · cavi · copertura (coni dei sensori) · luci (corpi illuminanti, anche con luce vera)
 * Ogni oggetto è un gruppo con userData.furniture (chiave, layer) e finisce nel DXF 3D come blocco su un layer suo.
 */
import { aimDevice, reachAt, sensorModel } from './coverage';
import { KINDS } from './electric';
import { WALL_H } from './scene3d';
import { styleKit } from './style3d';

const deg = Math.PI / 180;
const MAX_REAL_LIGHTS = 10;   // luci puntuali vere: le altre restano bagliori emissivi (iPad e telefono)

/* Quote di montaggio (m) dei punti dell'impianto. */
const HEIGHT = {
  switch: 1.05, switch_2way: 1.05, switch_inter: 1.05, button: 1.05, bell: 1.2, socket: 0.3, socket_ip: 0.3, dedicated: 0.3,
  tv: 0.9, data: 0.3, thermostat: 1.5, chime: 2.2, intercom: 1.5, panel: 1.5, subpanel: 1.5, box: 2.3, ev: 1.3, motor: 2.2,
  hob: 0.5, hood: 2.1, fan: 2.4, light_wall: 1.9, light_ext: 2.4, emergency: 0.3,
};

export function buildOverlays(THREE, { floors, devices = [], electric = null, theme = {} }) {
  const out = {
    sensors: new THREE.Group(), electric: new THREE.Group(), cables: new THREE.Group(), cones: new THREE.Group(), lights: new THREE.Group(),
    realLights: [], glow: [],
  };
  out.sensors.name = 'sensori';
  out.electric.name = 'impianto';
  out.cables.name = 'cavi';
  out.cones.name = 'copertura';
  out.lights.name = 'luci';
  // i piani con un `host` (il giardino, spostato e ruotato accanto alla casa) tengono i loro oggetti nel gruppo del piano
  out.groups = { sensors: [out.sensors], electric: [out.electric], cables: [out.cables], cones: [out.cones], lights: [out.lights] };
  const sub = (kind, host) => {
    if (!host) return out[kind];
    let g = host.userData[`ov_${kind}`];
    if (!g) {
      g = new THREE.Group();
      g.name = out[kind].name;
      host.add(g);
      host.userData[`ov_${kind}`] = g;
      out.groups[kind].push(g);
    }
    return g;
  };
  const kit = styleKit(theme.id);
  const mats = new Map();
  const mat = (key, color, extra = {}, cat = 'PLASTICA') => {
    if (!mats.has(key)) {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
      m.userData.cat = cat;
      mats.set(key, m);
    }
    return mats.get(key);
  };
  const white = mat('ow', '#f4f5f7');
  const black = mat('ob', '#16181c');
  const grey = mat('og', '#8b929b');
  const plate = mat('plate', '#f1f1ee');
  const metal = mat('ometal', '#c4cad3', { metalness: 0.7, roughness: 0.3 }, 'METALLO');

  const part = (g, geo, m, x, y, z) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  const box = (g, w, h, d, m, x, y, z) => part(g, new THREE.BoxGeometry(w, h, d), m, x, y, z);
  const cyl = (g, rt, rb, h, m, x, y, z, seg = 18) => part(g, new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z);
  const object = (type, layer, key) => {
    const g = new THREE.Group();
    g.name = type;
    g.userData.furniture = { type, key, layer, w: 0.1, d: 0.1, style: '' };
    return g;
  };
  /* orienta il fronte (+z) del gruppo verso (dx, dz) nel piano della pianta */
  const face = (g, dx, dz) => { g.rotation.y = Math.atan2(dx, dz); };
  /* sposta i pezzi in modo che il retro dell'oggetto stia a z = 0: così appoggia alla parete invece di affondarci a metà */
  const mountBack = (g) => {
    const bb = new THREE.Box3().setFromObject(g);
    const dz = -bb.min.z;
    g.children.forEach((c) => { c.position.z += dz; });
  };

  for (const { floor, y, plan, host } of floors) {
    const G = (kind) => sub(kind, host);
    const at = (g, x, h, z, group) => {
      g.position.set(x, y + h, z);
      group.add(g);
    };
    // muri del piano: gli oggetti a parete si appoggiano alla faccia del muro più vicino, non restano in aria
    const walls = (plan.walls || []).map((w) => ({ ...w, horiz: w.w >= w.h }));
    const snap = (x, z, reach = 0.7) => {
      let best = null;
      for (const w of walls) {
        const dx = Math.max(w.x - x, 0, x - (w.x + w.w));
        const dz = Math.max(w.y - z, 0, z - (w.y + w.h));
        const d = Math.hypot(dx, dz);
        if (d <= reach && (!best || d < best.d)) best = { d, w };
      }
      if (!best) return null;
      const { w } = best;
      if (w.horiz) {
        const south = z > w.y + w.h / 2;
        return { x: Math.min(w.x + w.w - 0.05, Math.max(w.x + 0.05, x)), z: south ? w.y + w.h : w.y, nx: 0, nz: south ? 1 : -1 };
      }
      const east = x > w.x + w.w / 2;
      return { x: east ? w.x + w.w : w.x, z: Math.min(w.y + w.h - 0.05, Math.max(w.y + 0.05, z)), nx: east ? 1 : -1, nz: 0 };
    };

    // ── sensori Ajax ──
    for (const dev of devices.filter((d) => d.floor === floor.id)) {
      const aim = aimDevice(plan, dev);
      const m = sensorModel(dev.model);
      const id = dev.model;
      const g = object(`AJAX_${id.toUpperCase()}`, 'SENSORI', `AJAX_${id.toUpperCase()}`);
      let h = dev.h ?? aim.h;
      const dir = aim.dir * deg;
      const dx = Math.cos(dir);
      const dz = Math.sin(dir);
      if (id === 'hub2_plus') {
        // centrale: scatola bianca con anello e LED, appoggiata a 1,4 m
        box(g, 0.163, 0.032, 0.163, white, 0, 0.016, 0);
        cyl(g, 0.045, 0.045, 0.004, mat('ring', '#2bd96b', { emissive: '#1fa752', emissiveIntensity: 0.7 }), 0, 0.034, 0, 24);
        h = dev.h ?? 1.4;
      } else if (id === 'keypad_touchscreen') {
        box(g, 0.15, 0.2, 0.02, white, 0, 0, 0);
        box(g, 0.12, 0.15, 0.004, black, 0, 0.005, 0.011);
        h = dev.h ?? 1.3;
      } else if (id === 'streetsiren') {
        box(g, 0.19, 0.19, 0.06, white, 0, 0, 0);
        box(g, 0.19, 0.05, 0.07, mat('siren', '#c1272d'), 0, 0.07, 0.005);
        h = dev.h ?? 2.5;
      } else if (id === 'doorprotect_plus' || id === 'doorprotect') {
        // sensore apertura: corpo sul telaio e magnete accanto
        box(g, 0.1, 0.03, 0.025, white, 0, 0, 0);
        box(g, 0.04, 0.03, 0.02, white, 0.1, 0, 0);
        h = dev.h ?? 2.05;
      } else if (id === 'fireprotect2_co' || id === 'fireprotect') {
        cyl(g, 0.06, 0.06, 0.03, white, 0, -0.015, 0, 24);
        cyl(g, 0.03, 0.03, 0.005, mat('grille', '#cfd4da'), 0, -0.032, 0, 20);
        h = dev.h ?? WALL_H;
      } else if (id === 'leaksprotect') {
        box(g, 0.05, 0.02, 0.1, white, 0, 0.01, 0);
        box(g, 0.04, 0.003, 0.01, metal, 0, 0.003, 0.06);
        h = dev.h ?? 0.02;
      } else {
        // rilevatori di movimento (interni, tendina, camera, esterni): corpo con lente rivolta verso `dir`
        const outdoor = m?.kind === 'outdoor' || id.includes('outdoor');
        const body = outdoor ? mat('obody', '#1d2025') : white;
        const curtain = m?.kind === 'curtain';
        box(g, curtain ? 0.2 : 0.065, curtain ? 0.04 : 0.1, 0.05, body, 0, 0, 0);
        const lens = part(g, new THREE.SphereGeometry(0.025, 14, 10), mat('lens', '#2a2230', { roughness: 0.2 }), 0, curtain ? 0 : 0.02, 0.03);
        lens.scale.set(1.6, 1, 0.6);
        if (id.includes('cam')) cyl(g, 0.012, 0.012, 0.01, black, 0.02, -0.025, 0.027, 12).rotation.x = Math.PI / 2;
        if (outdoor) box(g, 0.08, 0.012, 0.07, body, 0, 0.056, 0.012);   // tettuccio
      }
      // sensori a parete (movimento, apertura, tastiera, sirena, centrale): attaccati alla faccia del muro più vicino
      const wallMounted = !(id.startsWith('fireprotect') || id === 'leaksprotect');
      const hit = wallMounted ? snap(dev.x, dev.y, 0.8) : null;
      if (hit) {
        mountBack(g);
        face(g, hit.nx, hit.nz);
        if (id.startsWith('doorprotect') && dev.h == null) h = 2.2;   // sopra l'architrave, dove il muro c'è
        at(g, hit.x + hit.nx * 0.001, h, hit.z + hit.nz * 0.001, G('sensors'));
      } else {
        face(g, dx, dz);
        at(g, dev.x, h, dev.y, G('sensors'));
      }
      g.userData.dev = dev.id;

      // cono di rilevazione: ventaglio dall'apparecchio al pavimento, con la portata del diagramma Ajax
      if (m && m.kind !== 'glass' && m.hAngle) {
        const dirs = m.twoWay ? [aim.dir, aim.dir + 180] : [aim.dir];
        const col = m.kind === 'outdoor' || id.includes('outdoor') ? '#0f7b5f' : '#7a2ee6';
        for (const d0 of dirs) {
          const steps = Math.max(6, Math.round(m.hAngle / 6));
          const pts = [];
          for (let i = 0; i <= steps; i++) {
            const off = -m.hAngle / 2 + (m.hAngle * i) / steps;
            const r = reachAt(m, Math.abs(off)) || 0.01;
            const a = (d0 + off) * deg;
            pts.push([dev.x + Math.cos(a) * r, dev.y + Math.sin(a) * r]);
          }
          const pos = [];
          const fy = y + 0.05;
          for (let i = 0; i < steps; i++) {
            pos.push(dev.x, y + h, dev.y, pts[i][0], fy, pts[i][1], pts[i + 1][0], fy, pts[i + 1][1]);   // fianco
            pos.push(dev.x, fy, dev.y, pts[i][0], fy, pts[i][1], pts[i + 1][0], fy, pts[i + 1][1]);       // pavimento
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          const cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
          cone.userData.layer = 'COPERTURA';
          G('cones').add(cone);
        }
      }
    }

    // ── impianto elettrico ──
    const ep = electric?.floors?.[floor.id];
    if (!ep) continue;
    const lightsSeen = [];
    for (const p of ep.points) {
      const k = p.kind;
      let nx = p.nx || 0;
      let nz = p.ny || 0;
      let px = p.x;
      let pz = p.y;
      if (!(nx || nz) && !['light_garden', 'fan', 'box', 'hob', 'hood'].includes(k)) {
        // senza normale (luci esterne, campanello, motore): si appoggia al muro più vicino, dalla parte in cui sta
        const hit = snap(p.x, p.y, 0.6);
        if (hit) { px = hit.x; pz = hit.z; nx = hit.nx; nz = hit.nz; }
      }
      const wall = nx !== 0 || nz !== 0;
      const key = `IMP_${k.toUpperCase()}`;
      const layerOf = (kk) => (['light', 'light_wall', 'light_ext', 'light_garden', 'emergency', 'fan'].includes(kk) ? 'IMP_LUCI'
        : ['switch', 'switch_2way', 'switch_inter', 'button', 'bell', 'thermostat'].includes(kk) ? 'IMP_COMANDI'
          : ['panel', 'subpanel', 'box'].includes(kk) ? 'IMP_QUADRI' : 'IMP_PRESE');
      if (k === 'light') {
        // punto luce a soffitto: nei locali di passaggio e di servizio (scale, corridoi, bagni…) una plafoniera, che non
        // scende sulla testa; in soggiorno e in camera un lampadario o una sospensione nello stile della casa
        const g = object('PLAFONIERA', 'IMP_LUCI', `IMP_LIGHT_${(theme.id || 'modern').toUpperCase()}`);
        const lamp = mat('lampglow', '#fff3d4', { emissive: '#ffcf80', emissiveIntensity: 0.15 }, 'LUCE');
        out.glow.push(lamp);
        const style = theme.id || 'modern';
        const rk = plan.rooms.find((r) => r.id === p.room)?.kind;
        const flush = ['stairs', 'corridor', 'entry', 'bath', 'wc', 'storage', 'closet', 'laundry', 'garage', 'kitchen', 'study', 'meeting', 'director'].includes(rk);
        const brass = mat('lampring', kit.handle, { metalness: 0.7, roughness: 0.3 }, 'METALLO');
        if (flush) {
          g.name = 'PLAFONIERA';
          if (style === 'classic') {
            cyl(g, 0.17, 0.15, 0.09, lamp, 0, -0.045, 0, 28);
            cyl(g, 0.185, 0.185, 0.014, brass, 0, -0.092, 0, 28);
          } else if (style === 'luxury') {
            cyl(g, 0.2, 0.2, 0.05, lamp, 0, -0.025, 0, 28);
            for (let i = 0; i < 10; i++) {
              const a = (i * Math.PI * 2) / 10;
              part(g, new THREE.SphereGeometry(0.022, 10, 8), brass, Math.cos(a) * 0.21, -0.05, Math.sin(a) * 0.21);
            }
          } else if (style === 'industrial') {
            cyl(g, 0.11, 0.11, 0.02, black, 0, -0.01, 0, 20);
            cyl(g, 0.085, 0.085, 0.11, lamp, 0, -0.075, 0, 18);
            for (let i = 0; i < 6; i++) {
              const a = (i * Math.PI * 2) / 6;
              box(g, 0.008, 0.12, 0.008, black, Math.cos(a) * 0.1, -0.075, Math.sin(a) * 0.1);
            }
            cyl(g, 0.105, 0.105, 0.012, black, 0, -0.135, 0, 20);
          } else if (style === 'nordic') {
            cyl(g, 0.2, 0.2, 0.035, white, 0, -0.0175, 0, 30);
            cyl(g, 0.17, 0.17, 0.012, lamp, 0, -0.04, 0, 30);
          } else if (style === 'japandi') {
            cyl(g, 0.22, 0.22, 0.09, lamp, 0, -0.045, 0, 30);
            cyl(g, 0.225, 0.225, 0.012, mat('lampwood', kit.plinth, {}, 'LEGNO'), 0, -0.094, 0, 30);
          } else {
            box(g, 0.32, 0.035, 0.32, white, 0, -0.0175, 0);
            box(g, 0.27, 0.01, 0.27, lamp, 0, -0.04, 0);
          }
          at(g, p.x, WALL_H, p.y, G('lights'));
          lightsSeen.push({ x: p.x, y: y + WALL_H - 0.15, z: p.y });
          continue;
        }
        g.name = 'LAMPADARIO';
        if (style === 'classic') {
          // lampadario a sei braccia con le lampadine a candela
          cyl(g, 0.008, 0.008, 0.28, brass, 0, -0.14, 0, 8);
          cyl(g, 0.03, 0.03, 0.2, brass, 0, -0.38, 0, 12);
          for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI * 2) / 6;
            const arm = box(g, 0.2, 0.012, 0.012, brass, Math.cos(a) * 0.1, -0.44, Math.sin(a) * 0.1);
            arm.rotation.y = -a;
            cyl(g, 0.012, 0.012, 0.08, lamp, Math.cos(a) * 0.2, -0.4, Math.sin(a) * 0.2, 8);
            part(g, new THREE.SphereGeometry(0.017, 8, 6), lamp, Math.cos(a) * 0.2, -0.355, Math.sin(a) * 0.2);
          }
        } else if (style === 'luxury') {
          // lampadario a tre anelli dorati con gocce di cristallo
          cyl(g, 0.006, 0.006, 0.34, brass, 0, -0.17, 0, 8);
          [[0.24, -0.4], [0.17, -0.5], [0.1, -0.58]].forEach(([r, yy]) => {
            part(g, new THREE.TorusGeometry(r, 0.008, 6, 28), brass, 0, yy, 0).rotation.x = Math.PI / 2;
            for (let i = 0; i < 12; i++) {
              const a = (i * Math.PI * 2) / 12;
              part(g, new THREE.SphereGeometry(0.016, 8, 6), lamp, Math.cos(a) * r, yy - 0.03, Math.sin(a) * r);
            }
          });
        } else if (style === 'industrial') {
          cyl(g, 0.006, 0.006, 0.5, black, 0, -0.25, 0, 8);
          const dome = part(g, new THREE.SphereGeometry(0.18, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), black, 0, -0.6, 0);
          dome.rotation.x = Math.PI;
          part(g, new THREE.SphereGeometry(0.05, 12, 10), lamp, 0, -0.55, 0);
        } else if (style === 'nordic') {
          cyl(g, 0.005, 0.005, 0.32, grey, 0, -0.16, 0, 8);
          part(g, new THREE.SphereGeometry(0.2, 22, 14), lamp, 0, -0.5, 0);
        } else if (style === 'japandi') {
          cyl(g, 0.005, 0.005, 0.3, grey, 0, -0.15, 0, 8);
          cyl(g, 0.15, 0.15, 0.34, lamp, 0, -0.47, 0, 26);
        } else {
          // moderno: tre sfere di vetro a quote diverse
          [[-0.09, 0.14, -0.3], [0.1, 0.12, -0.44], [0, 0.13, -0.58]].forEach(([dx2, r, yy], i) => {
            cyl(g, 0.004, 0.004, Math.abs(yy) - r, grey, dx2, yy / 2 + r / 2, i ? 0.05 : -0.05, 6);
            part(g, new THREE.SphereGeometry(r, 18, 12), lamp, dx2, yy, i ? 0.05 : -0.05);
          });
          cyl(g, 0.12, 0.12, 0.02, white, 0, -0.01, 0, 22);
        }
        at(g, p.x, WALL_H, p.y, G('lights'));
        lightsSeen.push({ x: p.x, y: y + WALL_H - 0.5, z: p.y });
        continue;
      }
      const g = object(`IMP_${k.toUpperCase()}`, layerOf(k), key);
      const lampLike = k === 'light_wall' || k === 'light_ext' || k === 'light_garden' || k === 'emergency';
      const baseH = HEIGHT[k] ?? 1.2;
      if (k === 'switch' || k === 'switch_2way' || k === 'switch_inter' || k === 'button' || k === 'bell') {
        box(g, 0.08, 0.08, 0.012, plate, 0, 0, 0.006);
        box(g, 0.025, 0.045, 0.008, k === 'bell' ? mat('bell', '#c9a14a', {}, 'METALLO') : white, 0, 0, 0.014);
      } else if (k === 'socket' || k === 'socket_ip' || k === 'dedicated') {
        box(g, 0.08, 0.08, 0.012, k === 'socket_ip' ? mat('ip', '#9aa3ad') : plate, 0, 0, 0.006);
        for (const sx of [-0.016, 0.016]) cyl(g, 0.007, 0.007, 0.004, black, sx, 0, 0.013, 10).rotation.x = Math.PI / 2;
        if (k === 'dedicated') box(g, 0.075, 0.01, 0.004, mat('ded', '#7a2ee6'), 0, 0.03, 0.013);
      } else if (k === 'tv' || k === 'data') {
        box(g, 0.08, 0.08, 0.012, plate, 0, 0, 0.006);
        if (k === 'tv') cyl(g, 0.012, 0.012, 0.006, mat('coax', '#0f7b5f', {}, 'METALLO'), 0, 0, 0.014, 12).rotation.x = Math.PI / 2;
        else box(g, 0.025, 0.02, 0.006, black, 0, 0, 0.014);
      } else if (k === 'thermostat') {
        box(g, 0.09, 0.09, 0.02, white, 0, 0, 0.01);
        box(g, 0.05, 0.03, 0.004, mat('lcd', '#243b4a', { emissive: '#4fa8ff', emissiveIntensity: 0.3 }), 0, 0.01, 0.022);
      } else if (k === 'intercom') {
        box(g, 0.15, 0.2, 0.025, white, 0, 0, 0.0125);
        box(g, 0.12, 0.09, 0.004, black, 0, 0.04, 0.027);
      } else if (k === 'panel' || k === 'subpanel') {
        const big = k === 'panel';
        box(g, big ? 0.45 : 0.3, big ? 0.55 : 0.4, 0.12, mat('qe', '#d7dade'), 0, 0, 0.06);
        box(g, big ? 0.4 : 0.26, big ? 0.5 : 0.36, 0.006, mat('qeglass', '#8fa0ad', { transparent: true, opacity: 0.6 }, 'VETRO'), 0, 0, 0.123);
        for (let r = 0; r < 3; r++) for (let c = 0; c < (big ? 8 : 5); c++) box(g, 0.025, 0.04, 0.02, c % 3 ? white : black, (c - (big ? 3.5 : 2)) * 0.04, 0.15 - r * 0.1, 0.108);
      } else if (k === 'box') {
        box(g, 0.1, 0.1, 0.05, grey, 0, 0, 0.025);
      } else if (k === 'ev') {
        box(g, 0.22, 0.32, 0.1, white, 0, 0, 0.05);
        box(g, 0.05, 0.015, 0.004, mat('evled', '#2bd96b', { emissive: '#1fa752', emissiveIntensity: 0.8 }), 0, 0.1, 0.102);
        cyl(g, 0.045, 0.045, 0.03, black, 0, -0.02, 0.115, 16).rotation.x = Math.PI / 2;
      } else if (k === 'motor') {
        box(g, 0.28, 0.12, 0.14, grey, 0, 0, 0.07);
      } else if (k === 'hob' || k === 'hood') {
        box(g, 0.08, 0.08, 0.03, k === 'hob' ? black : grey, 0, 0, 0.015);
      } else if (k === 'fan') {
        cyl(g, 0.08, 0.08, 0.012, white, 0, 0, 0.006, 20).rotation.x = Math.PI / 2;
      } else if (k === 'chime') {
        box(g, 0.1, 0.06, 0.03, white, 0, 0, 0.015);
      } else if (k === 'light_wall') {
        // applique nello stile della casa: braccio con paralume (classico, luxury), cilindro (moderno), collo d'oca (industriale),
        // calotta (nordico, japandi)
        const gl = mat('applglow', '#fff3d4', { emissive: '#ffcf80', emissiveIntensity: 0.15 }, 'LUCE');
        out.glow.push(gl);
        const st = theme.id || 'modern';
        const brass = mat('lampring', kit.handle, { metalness: 0.7, roughness: 0.3 }, 'METALLO');
        box(g, 0.07, 0.1, 0.012, st === 'industrial' ? black : st === 'classic' || st === 'luxury' ? brass : metal, 0, 0, 0.006);
        if (st === 'classic' || st === 'luxury') {
          box(g, 0.015, 0.015, 0.14, brass, 0, 0, 0.08);
          cyl(g, 0.05, 0.09, 0.14, gl, 0, 0.07, 0.15, 20);
        } else if (st === 'modern') {
          cyl(g, 0.04, 0.04, 0.2, gl, 0, 0, 0.06, 18);
          cyl(g, 0.042, 0.042, 0.012, white, 0, 0.1, 0.06, 18);
          cyl(g, 0.042, 0.042, 0.012, white, 0, -0.1, 0.06, 18);
        } else if (st === 'industrial') {
          box(g, 0.012, 0.012, 0.18, black, 0, 0.04, 0.1);
          const dome = part(g, new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), black, 0, 0.02, 0.24);
          dome.rotation.x = Math.PI / 2 + 0.5;
          part(g, new THREE.SphereGeometry(0.035, 10, 8), gl, 0, 0.0, 0.25);
        } else {
          part(g, new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), gl, 0, 0, 0.012).rotation.x = Math.PI / 2;
        }
        lightsSeen.push({ x: px + nx * 0.25, y: y + baseH, z: pz + nz * 0.25 });
      } else if (k === 'light_ext') {
        box(g, 0.16, 0.22, 0.1, mat('extlamp', '#2b3036', { metalness: 0.4 }, 'METALLO'), 0, 0, 0.05);
        const gl = mat('extglow', '#fff3d4', { emissive: '#ffcf80', emissiveIntensity: 0.15 }, 'LUCE');
        out.glow.push(gl);
        box(g, 0.12, 0.18, 0.02, gl, 0, 0, 0.105);
      } else if (k === 'light_garden') {
        cyl(g, 0.03, 0.03, 0.5, mat('bollard', '#2b3036', { metalness: 0.4 }, 'METALLO'), 0, 0.25, 0, 14);
        const gl = mat('bolglow', '#fff3d4', { emissive: '#ffcf80', emissiveIntensity: 0.15 }, 'LUCE');
        out.glow.push(gl);
        cyl(g, 0.034, 0.034, 0.06, gl, 0, 0.42, 0, 14);
      } else if (k === 'emergency') {
        box(g, 0.2, 0.08, 0.04, white, 0, 0, 0.02);
        box(g, 0.012, 0.012, 0.004, mat('emled', '#2bd96b', { emissive: '#1fa752', emissiveIntensity: 0.9 }), 0.07, 0.025, 0.042);
      } else {
        box(g, 0.08, 0.08, 0.012, plate, 0, 0, 0.006);
      }
      if (k === 'light_garden') {
        at(g, p.x, 0, p.y, G('lights'));
      } else {
        if (wall) face(g, nx, nz);
        at(g, px + (wall ? nx * 0.002 : 0), baseH, pz + (wall ? nz * 0.002 : 0), lampLike ? G('lights') : G('electric'));
      }
    }

    // luci vere: le più distanti fra loro (al massimo MAX_REAL_LIGHTS per scena) illuminano davvero
    const step = Math.max(1, Math.ceil(lightsSeen.length / Math.max(1, MAX_REAL_LIGHTS - out.realLights.length)));
    lightsSeen.forEach((l, i) => {
      if (i % step || out.realLights.length >= MAX_REAL_LIGHTS) return;
      const pl = new THREE.PointLight('#ffd9a0', 0, 7, 1.6);
      pl.position.set(l.x, l.y, l.z);
      G('lights').add(pl);
      out.realLights.push(pl);
    });

    // collegamenti: comando → luce e quadro → cassette, come tubi sottili sotto il soffitto
    for (const link of ep.links || []) {
      const col = link.kind === 'feed' ? '#b42318' : '#d97706';
      const lm = mat(`cable${link.kind}`, col, {}, 'IMPIANTO');
      for (let i = 0; i + 1 < link.points.length; i++) {
        const [ax, az] = link.points[i];
        const [bx, bz] = link.points[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.02) continue;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 6), lm);
        c.position.set((ax + bx) / 2, y + WALL_H - 0.1, (az + bz) / 2);
        c.rotation.z = Math.PI / 2;
        c.rotation.y = -Math.atan2(bz - az, bx - ax);
        c.userData.layer = 'IMP_CAVI';
        G('cables').add(c);
      }
    }
  }
  return out;
}

/* Luci accese: corpi illuminanti emissivi e luci puntuali vere; spente, tutto torna come prima. */
export function setLights(overlay, on) {
  for (const m of overlay.glow) m.emissiveIntensity = on ? 1.8 : 0.15;
  for (const l of overlay.realLights) l.intensity = on ? 9 : 0;
}

export const OVERLAY_KINDS = KINDS;
