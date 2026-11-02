/* Script e LEGGIMI per Blender (lib/blenderExport.js): solo testo, si prova senza Blender. */
import assert from 'node:assert/strict';
import { blenderScript, readme, launcherMac, launcherWin } from '../src/lib/blenderExport.js';

const views = [{ label: 'Tre quarti' }, { label: 'Pianta 3D dall\'alto', ortho: { height: 10 } }, { label: 'Interno: Soggiorno' }];
const day = blenderScript({ glbName: 'casa.glb', time: 'afternoon', north: 0, views });
assert.match(day, /GLB = "casa\.glb"/);
assert.match(day, /LAMPADE_ACCESE = False/);
assert.match(day, /"CAM_TRE-QUARTI"/);
assert.match(day, /ORTOGRAFICHE = \{[^\n]*\n    "CAM_PIANTA-3D-DALL-ALTO": 17\.778,/);   // 10 m × 16:9
assert.match(day, /hide_render = dall_alto/);
assert.ok(day.includes("re.search(r'_K(\\d+)', o.name)"));   // potenza relativa delle luci dal nome
assert.match(day, /'TRAVI'/);
assert.match(day, /"CAM_INTERNO-SOGGIORNO"/);
assert.match(day, /scene\.render\.engine = 'CYCLES'/);
assert.match(day, /RENDER_TUTTE = 'tutte' in sys/);
assert.match(day, /AZIMUT = 215/);                       // pomeriggio, nord 0
const eve = blenderScript({ glbName: 'casa.glb', time: 'evening', north: 90, views, size: [3840, 2160], samples: 512 });
assert.match(eve, /LAMPADE_ACCESE = True/);
assert.match(eve, /RISOLUZIONE = \(3840, 2160\)/);
assert.match(eve, /CAMPIONI = 512/);
assert.match(eve, /AZIMUT = 305/);                       // il nord del progetto ruota il sole
// il file è Python plausibile: niente virgolette spaiate, indentazione a quattro spazi, nomi dichiarati
for (const s of [day, eve]) {
  assert.ok(!/\t/.test(s));
  assert.equal((s.match(/"/g) || []).length % 2, 0);
  assert.ok(s.includes('import bpy, math, os'));
}
assert.match(day, /RENDER_TUTTE = 'tutte' in sys\.argv/);
assert.match(blenderScript({ glbName: 'casa.glb', time: 'noon', views, hdriName: 'cielo.hdr' }), /HDRI = "cielo\.hdr"/);
const mac = launcherMac('casa');
assert.ok(mac.startsWith('#!/bin/bash') && mac.includes('/Applications/Blender.app/Contents/MacOS/Blender') && mac.includes('--python "casa_blender.py" -- tutte'));
const win = launcherWin('casa');
assert.ok(win.includes('\r\n') && win.includes('blender.exe') && win.includes('"casa_blender.py" -- tutte'));
const rd = readme({ name: 'Casa Rossi', time: 'sunset', lamps: true });
assert.ok(rd.includes('casa-rossi.glb') && rd.includes('lampade accese') && rd.includes('Tramonto'));
console.log('blenderexport ok');
