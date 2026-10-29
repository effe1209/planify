// DXF 3D di tutta la casa: node --import ./tests/loader.mjs tests/dxf3d.test.mjs <progetto.json> [uscita.dxf]
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildHouse, FLOOR_H } from '../src/lib/scene3d.js';
import { sceneToDxf } from '../src/lib/dxf3d.js';
import { THEMES } from '../src/lib/themes.js';

const project = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const house = buildHouse(THREE, project, () => THEMES.modern);
const { text, faces, layers } = sceneToDxf(THREE, house);
assert.ok(faces > 100, `facce: ${faces}`);
assert.ok(layers.includes('PT_MURI') && layers.includes('P1_MURI') && layers.includes('P1_SOLAI'), layers.join(','));
// quote: il primo piano sta a FLOOR_H sopra il piano terra
const zs = [...text.matchAll(/\n3[0-3]\n([-\d.]+)/g)].map((m) => +m[1]);
assert.ok(Math.max(...zs) >= FLOOR_H + 2.6, `quota massima ${Math.max(...zs)}`);
if (process.argv[3]) writeFileSync(process.argv[3], text);
console.log(`ok: ${faces} facce, ${layers.length} layer (${layers.join(', ')}), quota massima ${Math.max(...zs)} m`);
