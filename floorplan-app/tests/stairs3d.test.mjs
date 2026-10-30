/* Gradini 3D (lib/stairs3d.js): alzate uguali, ultima quota = piano di sopra, tutto dentro il vano. */
import assert from 'node:assert/strict';
import { stairSteps } from '../src/lib/stairs3d.js';

const H = 3.0;
const inside = (st, b) => b.x0 >= st.x - 1e-6 && b.x1 <= st.x + st.w + 1e-6 && b.z0 >= st.y - 1e-6 && b.z1 <= st.y + st.h + 1e-6;
const tops = (steps) => [...new Set(steps.map((s) => Math.round(s.top * 1e4) / 1e4))].sort((a, b) => a - b);

for (const entry of ['N', 'S', 'E', 'W']) {
  for (const hand of entry === 'N' || entry === 'S' ? ['E', 'W'] : ['N', 'S']) {
    for (const [type, w, h] of [['u', 2.3, 3.4], ['l', 3.2, 3.4], ['straight', 2.2, 4.6]]) {
      const ns = entry === 'N' || entry === 'S';
      const st = { engine: true, type, entry, hand, x: 4, y: 2, w: ns ? w : h, h: ns ? h : w };
      const steps = stairSteps(st, H);
      assert.ok(steps.length >= 12, `${type} ${entry}${hand}: ${steps.length} gradini`);
      assert.ok(steps.every((b) => inside(st, b)), `${type} ${entry}${hand}: gradini fuori dal vano`);
      const t = tops(steps);
      // alzate regolari e ultimo gradino a meno di un'alzata dal piano di sopra
      const rise = t[0];
      assert.ok(rise > 0.15 && rise < 0.2, `${type} alzata ${rise}`);
      t.forEach((v, i) => assert.ok(Math.abs(v - rise * (i + 1)) < 1e-3, `${type} quote irregolari`));
      assert.ok(H - t[t.length - 1] < rise * 1.01 + 1e-6, `${type}: l'ultimo gradino non arriva al piano di sopra`);
    }
  }
}

// scala del progetto, rampa unica verso est
const st = { type: 'straight', up: 'E', x: 0, y: 0, w: 4.6, h: 1 };
const steps = stairSteps(st, H);
assert.equal(steps.length, 17);
assert.ok(steps.every((b) => inside(st, b)));
console.log('stairs3d ok');
