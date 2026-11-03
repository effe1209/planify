/* Modelli di tavola (lib/sheetTemplates.js). */
import assert from 'node:assert/strict';
import { DEFAULT_TEMPLATE, cleanTemplate, listTemplates, templateOptions } from '../src/lib/sheetTemplates.js';
import { sheetFormat } from '../src/lib/techSheet.js';

const c = cleanTemplate({ name: ' Esecutivo ', format: 'A9', scale: 77, margin: 99, lines: 'x', font: 'comic', orientation: 'portrait', mono: 1, studio: 'Studio X' });
assert.equal(c.name, 'Esecutivo');
assert.equal(c.format, DEFAULT_TEMPLATE.format);
assert.equal(c.scale, 'auto');
assert.equal(c.margin, 20);
assert.equal(c.lines, 'normal');
assert.equal(c.font, 'helvetica');
assert.equal(c.mono, true);
assert.ok(c.id);
assert.equal(cleanTemplate(c).id, c.id);
const o = templateOptions({ ...c, format: 'A4', scale: 100, lines: 'bold' });
assert.equal(o.portrait, true);
assert.equal(o.lineScale, 1.6);
assert.equal(o.scale, 100);
assert.equal(o.branding.name, 'Studio X');
const F = sheetFormat('A3', { portrait: true, margin: 12 });
assert.deepEqual([F.w, F.h, F.margin], [297, 420, 12]);
assert.deepEqual(listTemplates({ sheetTemplates: [c, { ...c, id: c.id }] }).map((t) => t.id), [c.id, c.id]);
console.log('sheettemplates ok');
