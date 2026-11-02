/* Colori principali della casa (lib/palette.js): derivazione dei colori e applicazione a kit, tema e scena 3D. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cleanPalette, kitWithPalette, styleColors, themeFor, themeWithPalette } from '../src/lib/palette.js';
import { STYLE_KITS, styleKit } from '../src/lib/style3d.js';
import { THEMES } from '../src/lib/themes.js';
import { buildScene } from '../src/lib/scene3d.js';

// pulizia: solo colori esadecimali validi, niente palette vuota
assert.equal(cleanPalette(null), null);
assert.equal(cleanPalette({ walls: 'rosso', floor: '#12' }), null);
assert.deepEqual(cleanPalette({ walls: '#AABBCC', foo: '#000000' }), { walls: '#aabbcc' });

// senza palette nulla cambia
assert.equal(themeWithPalette(THEMES.modern, null), THEMES.modern);
assert.equal(kitWithPalette(STYLE_KITS.modern, {}), STYLE_KITS.modern);
assert.equal(styleKit('modern'), STYLE_KITS.modern);

// i colori di partenza sono quelli dello stile
const sc = styleColors('classic');
assert.equal(sc.walls, STYLE_KITS.classic.wallIn.color);
assert.equal(sc.wood, THEMES.classic.wood);

// i tessuti ricolorano tutto ciò che è di stoffa; il legno i mobili; il pavimento il disegno in pianta
const th = themeWithPalette(THEMES.modern, { fabric: '#336699', wood: '#aa7744', floor: '#c0a070' });
assert.equal(th.fabric, '#336699');
assert.notEqual(th.duvet, THEMES.modern.duvet);
assert.notEqual(th.rug, THEMES.modern.rug);
assert.notEqual(th.accent, THEMES.modern.accent);
assert.equal(th.wood, '#aa7744');
assert.notEqual(th.woodLine, THEMES.modern.woodLine);
assert.notEqual(th.floorInk, THEMES.modern.floorInk);
assert.deepEqual(th.palette, { fabric: '#336699', wood: '#aa7744', floor: '#c0a070' });
assert.equal(THEMES.modern.fabric, '#dfe5ee');   // il tema originale non si tocca

// kit: pareti, facciata e parquet; i mattoni tengono la malta
const kit = kitWithPalette(STYLE_KITS.industrial, { walls: '#ffeedd', facade: '#223344', floor: '#887766' });
assert.equal(kit.wallIn.color, '#ffeedd');
assert.equal(kit.facade.color, '#223344');
assert.equal(kit.facade.tone, STYLE_KITS.industrial.facade.tone);
assert.equal(kit.floor.a, '#887766');
assert.equal(kit.floor.kind, STYLE_KITS.industrial.floor.kind);
assert.equal(kitWithPalette(STYLE_KITS.modern, { facade: '#223344' }).facade.tone === STYLE_KITS.modern.facade.tone, false);   // intonaco: tinta scura derivata

// themeFor legge la palette del progetto
assert.equal(themeFor({ palette: { fabric: '#336699' } }, { meta: { style: 'nordic' } }).fabric, '#336699');
assert.equal(themeFor({}, { meta: { style: 'nordic' } }), THEMES.nordic);

// scena 3D: le pareti interne e la facciata cambiano colore
const t4 = 0.2;
const plan = {
  scale: 50, wallThickness: t4 * 50, dimensions: { width: 6, length: 4 },
  rooms: [{ id: 1, kind: 'living', name: 'Soggiorno', x: 0, y: 0, w: 6, h: 4 }],
  walls: [{ x: -t4 / 2, y: -t4 / 2, w: 6 + t4, h: t4 }, { x: -t4 / 2, y: 4 - t4 / 2, w: 6 + t4, h: t4 }, { x: -t4 / 2, y: -t4 / 2, w: t4, h: 4 + t4 }, { x: 6 - t4 / 2, y: -t4 / 2, w: t4, h: 4 + t4 }],
  doors: [], windows: [], furniture: [],
};
const colors = (theme) => { const s = new Set(); buildScene(THREE, plan, theme).traverse((o) => { if (o.isMesh && o.userData.layer === 'MURI' && Array.isArray(o.material)) o.material.forEach((m) => s.add(m.color.getHexString())); }); return s; };
const base = colors(THEMES.modern);
const paint = colors(themeWithPalette(THEMES.modern, { walls: '#ff0000', facade: '#00ff00' }));
assert.ok(paint.has('ff0000') && paint.has('00ff00'), [...paint].join());
assert.ok(!base.has('ff0000'));
console.log('palette ok');
