/* ZIP senza compressione (lib/zip.js): si rilegge e ha le intestazioni giuste. */
import assert from 'node:assert/strict';
import { zipStore, unzipStore } from '../src/lib/zip.js';

const z = zipStore([{ name: 'casa.glb', data: new Uint8Array([103, 108, 84, 70, 2, 0, 0, 0]) }, { name: 'LEGGIMI.txt', data: 'Planify – àèì' }]);
assert.deepEqual([...z.slice(0, 4)], [0x50, 0x4b, 3, 4]);
const back = unzipStore(z);
assert.deepEqual(Object.keys(back), ['casa.glb', 'LEGGIMI.txt']);
assert.equal(new TextDecoder().decode(back['casa.glb'].slice(0, 4)), 'glTF');
assert.equal(new TextDecoder().decode(back['LEGGIMI.txt']), 'Planify – àèì');
// directory centrale e fine: due voci
const v = new DataView(z.buffer);
assert.equal(v.getUint32(z.length - 22, true), 0x06054b50);
assert.equal(v.getUint16(z.length - 22 + 10, true), 2);
// CRC-32 noto di «123456789» = CBF43926
const one = zipStore([{ name: 'a', data: '123456789' }]);
assert.equal(new DataView(one.buffer).getUint32(14, true).toString(16), 'cbf43926');
console.log('zip ok');
