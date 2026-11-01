/* Marchio del cartiglio e scala della tavola A4. */
import assert from 'node:assert/strict';
import { DEFAULT_BRANDING, getBranding } from '../src/lib/branding.js';
import { drawingArea, fitScale, roomLegend } from '../src/lib/techSheet.js';

// marchio: di serie Planify; il progetto sostituisce solo i campi validi
assert.equal(getBranding({}).name, 'Planify');
assert.equal(getBranding(null).logo, DEFAULT_BRANDING.logo);
const b = getBranding({ branding: { name: 'Studio Rossi', logo: 'data:image/png;base64,AAAA', client: '  ', extra: 'x', ref: 'P-12' } });
assert.deepEqual([b.name, b.logo, b.client, b.ref, b.extra], ['Studio Rossi', 'data:image/png;base64,AAAA', '', 'P-12', undefined]);

// scala: 10 × 8 m con i margini del disegno (50 px/m, 78 px per lato) entra a 1:100
const a = drawingArea();
let f = fitScale(10 * 50 + 156, 8 * 50 + 156, 50, a);
assert.equal(f.n, 100);
assert.ok(f.w <= a.w && f.h <= a.h && Math.abs(f.mmPerPx - 0.2) < 1e-9);
// una casa di 30 × 20 m non entra a 1:100: passa a 1:200
f = fitScale(30 * 50 + 156, 20 * 50 + 156, 50, a);
assert.equal(f.n, 200);
assert.ok(f.w <= a.w && f.h <= a.h);
// enorme: scala non unificata, ma sempre dentro il riquadro
f = fitScale(300 * 50, 200 * 50, 50, a);
assert.ok(!f.fits && f.w <= a.w + 1e-6 && f.h <= a.h + 1e-6);

// legenda: locali numerati con le superfici, senza giardino e scala
const leg = roomLegend({ rooms: [{ kind: 'living', name: 'Soggiorno', w: 5, h: 4 }, { kind: 'stairs', w: 1, h: 3 }, { kind: 'garden', w: 9, h: 9 }, { kind: 'bath', name: 'Bagno', w: 2, h: 2.5, area: 4.9 }] });
assert.deepEqual(leg.rooms, [{ n: 1, name: 'Soggiorno', area: 20 }, { n: 2, name: 'Bagno', area: 4.9 }]);
assert.equal(leg.total, 24.9);
console.log('techsheet ok');
