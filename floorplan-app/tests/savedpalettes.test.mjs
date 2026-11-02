import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { loadPalettes, savePalette, deletePalette } = await import('../src/lib/savedPalettes.js');

const colors = { walls: '#f1ece1', facade: '#d9cfb9', floor: '#cdb48c', wood: '#d8c4a2', fabric: '#a8b59a' };

test('salva, rilegge, aggiorna per nome ed elimina', () => {
  assert.deepEqual(loadPalettes(), []);
  let l = savePalette('La mia', colors);
  assert.equal(l.length, 1);
  assert.deepEqual(loadPalettes()[0].colors, colors);
  l = savePalette('la mia', { ...colors, walls: '#ffffff' });
  assert.equal(l.length, 1);
  assert.equal(loadPalettes()[0].colors.walls, '#ffffff');
  l = savePalette('Altra', colors);
  assert.equal(l.length, 2);
  l = deletePalette(l[1].id, l);
  assert.equal(loadPalettes().length, 1);
});

test('ignora nomi vuoti, colori non validi e dati rovinati', () => {
  mem.clear();
  assert.equal(savePalette('  ', colors).length, 0);
  assert.equal(savePalette('x', { walls: 'rosso' }).length, 0);
  mem.set('planify.palettes', '{rotto');
  assert.deepEqual(loadPalettes(), []);
});
