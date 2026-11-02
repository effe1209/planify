/*
 * Esportazione per Blender «tutto compreso»: un unico ZIP con
 *   • <nome>.glb          la casa con tetto, soffitti, sole, luci (puntuali), sensori dell'allarme e le inquadrature come camere;
 *   • <nome>_blender.py   lo script che prepara la scena per Cycles: cielo, sole all'ora scelta, lampade accese o spente, vetro vero,
 *                         materiale dei vetri, mappa tonale, riduzione del rumore, scheda grafica, camere e risoluzione;
 *   • LEGGIMI.txt         come usarli.
 * Il GLB è quello di lib/glb.js (unità in metri, PBR, texture dello stile); Blender converte da solo l'asse Y in Z.
 */
import { cameraViews, sunFor, timeById } from './renderStudio';
import { zipStore } from './zip';

const slug = (v) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'planimetria';
const py = (s) => JSON.stringify(String(s));   // una stringa JSON è una stringa Python valida

/* Lo script Python (Blender 3.6 e successivi). Solo testo: si prova senza Blender. */
export function blenderScript({ glbName, time, north = 0, views, size = [1920, 1080], samples = 256, hdriName = '' }) {
  const t = timeById(time);
  const az = (t.az + north) % 360;
  const camName = (v) => `CAM_${slug(v.label).toUpperCase()}`;
  const piante = views.filter((v) => v.ortho);   // la pianta 3D dall'alto: senza tetto e ortografica, come nel pannello Render
  const orto = piante.map((v) => `    ${py(camName(v))}: ${(v.ortho.height * (size[0] / size[1])).toFixed(3)},`).join('\n');
  const cams = views.map((v) => `    ${py(`CAM_${slug(v.label).toUpperCase()}`)},`).join('\n');
  return `# Planify: scena pronta per Cycles (Blender 3.6 o successivo).
#
# Come si usa:
#   1. Metti questo file e ${glbName} nella stessa cartella.
#   2. Blender → scheda «Scripting» → «Apri» → scegli questo file → «Esegui script» (▶).
#   3. Cambia camera con la scheda «Scene» o con Ctrl+Numpad0; premi F12 per il render.
# Per renderizzare tutte le inquadrature: metti RENDER_TUTTE = True (le immagini escono accanto al file),
# oppure fai doppio clic su RENDER.command (Mac) / RENDER.bat (Windows): fa tutto da solo.

import bpy, math, os, sys
from mathutils import Vector

GLB = ${py(glbName)}
ORA = ${py(t.id)}            # ${t.label}
AZIMUT = ${az}               # gradi dal nord del foglio, senso orario
ALTEZZA_SOLE = ${t.el}       # gradi sull'orizzonte
COLORE_SOLE = ${py(t.color)}
FORZA_SOLE = ${(t.sun * 1.6).toFixed(2)}   # W/m² del sole in Cycles
COLORE_CIELO = ${py(t.sky)}
FORZA_CIELO = ${(t.env * 4).toFixed(2)}
LAMPADE_ACCESE = ${t.lamps ? 'True' : 'False'}   # accese al tramonto e di sera
POTENZA_LAMPADA_W = 60
RISOLUZIONE = (${size[0]}, ${size[1]})
CAMPIONI = ${samples}
RENDER_TUTTE = 'tutte' in sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else False
HDRI = ${py(hdriName)}       # cielo vero (se il file è accanto allo script)
CAMERE = [
${cams}
]
ORTOGRAFICHE = {   # camere dall'alto: nome → larghezza visibile in metri; si rendono senza il tetto
${orto}
}

def cartelle():
    out = []
    try:
        out.append(os.path.dirname(os.path.abspath(__file__)))
    except NameError:
        pass
    out += [bpy.path.abspath('//'), os.getcwd(), os.path.expanduser('~/Downloads')]
    return [c for c in out if c]

base = next((c for c in cartelle() if os.path.exists(os.path.join(c, GLB))), None)
if base is None:
    raise SystemExit('Non trovo ' + GLB + ': mettilo nella stessa cartella dello script.')

# scena pulita e importazione
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(base, GLB))
scene = bpy.context.scene

# sole: la direzione dal punto di vista della scena (Blender ha Z in alto, il nord del foglio è +Y)
az = math.radians(AZIMUT)
el = math.radians(ALTEZZA_SOLE)
verso_sole = Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
for o in list(bpy.data.objects):
    if o.type == 'LIGHT' and o.data.type == 'SUN':
        bpy.data.objects.remove(o, do_unlink=True)
sole_dati = bpy.data.lights.new('SOLE', 'SUN')
sole_dati.energy = FORZA_SOLE
sole_dati.angle = math.radians(0.6)   # ombre morbide come il sole vero
sole_dati.color = [int(COLORE_SOLE[i:i + 2], 16) / 255 for i in (1, 3, 5)]
sole = bpy.data.objects.new('SOLE', sole_dati)
sole.rotation_euler = verso_sole.to_track_quat('Z', 'Y').to_euler()
scene.collection.objects.link(sole)

# cielo: colore e forza dell'ora (il sole è la luce a parte, per le ombre)
world = bpy.data.worlds.new('Cielo')
world.use_nodes = True
fondo = world.node_tree.nodes['Background']
fondo.inputs['Color'].default_value = [int(COLORE_CIELO[i:i + 2], 16) / 255 for i in (1, 3, 5)] + [1]
fondo.inputs['Strength'].default_value = FORZA_CIELO
if HDRI and os.path.exists(os.path.join(base, HDRI)):
    env = world.node_tree.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(os.path.join(base, HDRI))
    world.node_tree.links.new(env.outputs['Color'], fondo.inputs['Color'])
    fondo.inputs['Strength'].default_value = FORZA_CIELO * 1.5
scene.world = world

# lampade: i punti luce del GLB, accesi o spenti secondo l'ora
for o in bpy.data.objects:
    if o.type == 'LIGHT' and o.data.type == 'POINT':
        o.data.energy = POTENZA_LAMPADA_W * 4 if LAMPADE_ACCESE else 0
        o.data.color = (1.0, 0.85, 0.63)
        o.data.shadow_soft_size = 0.08
        o.hide_render = not LAMPADE_ACCESE

# vetri: vetro vero (rifrazione), non un riquadro semitrasparente
vetro = bpy.data.materials.new('Vetro')
vetro.use_nodes = True
nodi = vetro.node_tree.nodes
nodi.clear()
usc = nodi.new('ShaderNodeOutputMaterial')
gl = nodi.new('ShaderNodeBsdfGlass')
gl.inputs['IOR'].default_value = 1.45
gl.inputs['Roughness'].default_value = 0.0
vetro.node_tree.links.new(gl.outputs['BSDF'], usc.inputs['Surface'])
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name.upper().startswith('VETRI'):
        o.data.materials.clear()
        o.data.materials.append(vetro)
        o.visible_shadow = False   # il sole passa dalle finestre

# Cycles: scheda grafica se c'è, riduzione del rumore, mappa tonale
scene.render.engine = 'CYCLES'
scene.cycles.samples = CAMPIONI
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 8
scene.cycles.transparent_max_bounces = 12
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for tipo in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'):
        try:
            prefs.compute_device_type = tipo
            prefs.get_devices()
            if any(d.type != 'CPU' for d in prefs.devices):
                for d in prefs.devices:
                    d.use = True
                scene.cycles.device = 'GPU'
                break
        except Exception:
            continue
except Exception:
    pass
for vista in ('AgX', 'Filmic', 'Standard'):
    try:
        scene.view_settings.view_transform = vista
        break
    except TypeError:
        continue
scene.render.resolution_x, scene.render.resolution_y = RISOLUZIONE
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'

# camere: quelle del progetto (la prima è quella attiva)
camere = [o for o in bpy.data.objects if o.type == 'CAMERA']
camere.sort(key=lambda c: (CAMERE.index(c.name) if c.name in CAMERE else 999, c.name))
if camere:
    scene.camera = camere[0]

def tetto():
    radici = [o for o in bpy.data.objects if o.name.upper().startswith(('TETTO', 'SOFFITT'))]
    tutti = set(radici)
    for o in bpy.data.objects:
        p = o.parent
        while p is not None:
            if p in tutti:
                tutti.add(o)
                break
            p = p.parent
    return tutti

ROOF = tetto()

def prepara(c):
    # dall'alto tetto e soffitti coprirebbero tutta la casa: si tolgono e la camera diventa ortografica (nessuna prospettiva)
    dall_alto = c.name in ORTOGRAFICHE
    for o in ROOF:
        o.hide_render = dall_alto
        o.hide_viewport = dall_alto
    if dall_alto:
        c.data.type = 'ORTHO'
        c.data.ortho_scale = ORTOGRAFICHE[c.name]
        c.data.sensor_fit = 'HORIZONTAL'
        c.data.clip_end = max(c.data.clip_end, 1000)

if scene.camera:
    prepara(scene.camera)

if RENDER_TUTTE:
    for c in camere:
        scene.camera = c
        prepara(c)
        scene.render.filepath = os.path.join(base, c.name + '.png')
        bpy.ops.render.render(write_still=True)
else:
    print('Planify: scena pronta. Camera attiva:', scene.camera.name if scene.camera else '-', '· premi F12 per il render.')
`;
}

/* Lanciatori: trovano Blender, fanno il render di tutte le camere (script con «-- tutte»). */
export function launcherMac(base) {
  return `#!/bin/bash
# Planify: render automatico con Blender (Mac). Doppio clic; la prima volta clic destro → Apri.
cd "$(dirname "$0")"
BL=""
for c in "/Applications/Blender.app/Contents/MacOS/Blender" "$HOME/Applications/Blender.app/Contents/MacOS/Blender" "$(command -v blender)"; do
  if [ -n "$c" ] && [ -x "$c" ]; then BL="$c"; break; fi
done
if [ -z "$BL" ]; then
  echo "Blender non trovato. Installalo (gratis) da https://www.blender.org/download/ e rilancia questo file."
  open "https://www.blender.org/download/"
  read -n 1 -s -r -p "Premi un tasto per chiudere"
  exit 1
fi
echo "Uso: $BL"
mkdir -p render
"$BL" -b --python "${base}_blender.py" -- tutte
if ls CAM_*.png >/dev/null 2>&1; then mv CAM_*.png render/; fi
echo "Fatto: le immagini sono nella cartella «render»."
open render
read -n 1 -s -r -p "Premi un tasto per chiudere"
`;
}
export function launcherWin(base) {
  return `@echo off\r
rem Planify: render automatico con Blender (Windows). Doppio clic.\r
cd /d "%~dp0"\r
set BL=\r
for /d %%D in ("%ProgramFiles%\\Blender Foundation\\Blender *") do if exist "%%D\\blender.exe" set BL=%%D\\blender.exe\r
if "%BL%"=="" where blender >nul 2>nul && set BL=blender\r
if "%BL%"=="" (\r
  echo Blender non trovato. Installalo gratis da https://www.blender.org/download/ e rilancia questo file.\r
  start https://www.blender.org/download/\r
  pause\r
  exit /b 1\r
)\r
mkdir render 2>nul\r
"%BL%" -b --python "${base}_blender.py" -- tutte\r
move /y CAM_*.png render\\ >nul 2>nul\r
echo Fatto: le immagini sono nella cartella render.\r
explorer render\r
pause\r
`;
}

export function readme({ name, time, lamps }) {
  return `Planify · ${name}
Ora del giorno: ${timeById(time).label}${lamps ? ' (lampade accese)' : ''}

Contenuto
  ${slug(name)}.glb           la casa: tetto, soffitti, finestre e vetri, arredi, sole, punti luce, sensori dell'allarme, camere
  ${slug(name)}_blender.py    prepara Cycles: cielo, sole, lampade, vetro, mappa tonale, riduzione del rumore, camere
  cielo.hdr                   il cielo dell'ora (Poly Haven, CC0), usato dallo script
  RENDER.command / RENDER.bat render automatico di tutte le inquadrature (Mac / Windows)

Modo veloce (Blender installato)
  Estrai lo ZIP e fai doppio clic su RENDER.command (Mac) o RENDER.bat (Windows): Blender parte da solo, fa il render di ogni
  inquadratura e salva i PNG nella cartella «render». Su Mac, la prima volta: clic destro → Apri (il file non è firmato).
  Blender si scarica gratis da https://www.blender.org/download/

Modo manuale
  1. Estrai questi file nella stessa cartella.
  2. Apri Blender 3.6 o successivo → scheda Scripting → Apri → ${slug(name)}_blender.py → Esegui script.
  3. Scegli la camera (una per ogni inquadratura del pannello Render, anche dentro ogni locale) e premi F12.
  In alternativa: File → Importa → glTF 2.0 e apri solo il .glb (senza lo script le luci e il cielo vanno impostati a mano).

Per cambiare ora del giorno, risoluzione o numero di campioni modifica le prime righe dello script.
`;
}

/* ZIP completo: { zip: Uint8Array, name, lights, meshes } */
export async function blenderPackage(project, { time = 'afternoon', name = project?.name || 'planimetria', size = [1920, 1080], samples = 256 } = {}) {
  const THREE = await import('three');
  const { sceneToGlb } = await import('./glb');
  const { buildRenderScene } = await import('./renderScene');
  const built = buildRenderScene(THREE, project, { time, background: 'white', roof: true });
  if (!built) throw new Error('niente da esportare');
  try { const { upgradeMaterials } = await import('./pbr'); await upgradeMaterials(THREE, built.model, { aniso: 8 }); } catch { /* restano le texture disegnate */ }
  const { scene, bounds } = built;
  const views = cameraViews(project, { aspect: size[0] / size[1] });
  // la radice dell'esportazione: casa, terreno, luci e sensori; sole e hemisphere non servono (li rimette lo script)
  const root = new THREE.Group();
  root.name = 'CASA';
  for (const c of [...scene.children]) {
    if (c.isHemisphereLight || c.isDirectionalLight || c.isLight) continue;
    root.add(c);
  }
  for (const v of views) {
    const cam = new THREE.PerspectiveCamera(v.fov, size[0] / size[1], 0.05, 400);
    cam.name = `CAM_${slug(v.label).toUpperCase()}`;
    cam.position.set(...v.position);
    cam.lookAt(new THREE.Vector3(...v.target));
    cam.updateMatrixWorld(true);
    root.add(cam);
  }
  const sun = sunFor(time, project.north || 0, [bounds.center.x, 0, bounds.center.z], 30);
  const dx = sun.position[0] - bounds.center.x;
  const dz = sun.position[2] - bounds.center.z;
  const norm = Math.hypot(dx, dz) || 1;
  const res = await sceneToGlb(THREE, root, { lightPoints: built.lamps, sun: { dx: dx / norm, dz: dz / norm } });
  const base = slug(name);
  let hdr = null;
  try {
    const { hdriFile } = await import('./hdri');
    const r = await fetch(`/hdri/${hdriFile(time)}.hdr`);
    if (r.ok && (r.headers.get('content-type') || '').indexOf('text/html') < 0) hdr = new Uint8Array(await r.arrayBuffer());
  } catch { /* senza file il cielo resta a tinta unita */ }
  const zip = zipStore([
    { name: `${base}.glb`, data: new Uint8Array(res.buffer) },
    { name: `${base}_blender.py`, data: blenderScript({ glbName: `${base}.glb`, time, north: project.north || 0, views, size, samples, hdriName: hdr ? 'cielo.hdr' : '' }) },
    ...(hdr ? [{ name: 'cielo.hdr', data: hdr }] : []),
    { name: 'RENDER.command', data: launcherMac(base), mode: 0o755 },
    { name: 'RENDER.bat', data: launcherWin(base) },
    { name: 'LEGGIMI.txt', data: readme({ name, time, lamps: built.lampsOn }) },
  ]);
  return { zip, name: base, lights: res.lights, meshes: res.meshes, cameras: views.length };
}
