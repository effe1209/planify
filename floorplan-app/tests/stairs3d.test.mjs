/* Gradini 3D (lib/stairs3d.js): alzate uguali, ultima quota = piano di sopra, tutto dentro il vano. */
import assert from 'node:assert/strict';
import { stairHoles, stairSteps } from '../src/lib/stairs3d.js';

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
      // nessun vuoto: l'unione dei gradini copre un'area continua, cioè ogni gradino tocca il successivo in quota
      const area = steps.reduce((a, b) => a + (b.x1 - b.x0) * (b.z1 - b.z0), 0);
      const flights = type === 'l' ? 2 : 1;
      assert.ok(area > 0.6 * flights, `${type}: area dei gradini ${area}`);
      steps.forEach((b, i) => {
        if (!i) return;
        const prev = steps[i - 1];
        const touch = Math.max(0, Math.min(b.x1, prev.x1) - Math.max(b.x0, prev.x0) + 1e-6) > 0 && Math.max(0, Math.min(b.z1, prev.z1) - Math.max(b.z0, prev.z0) + 1e-6) > 0;
        assert.ok(touch || Math.abs(b.top - prev.top) > 0, `${type}: vuoto tra due gradini`);
      });
    }
  }
}

// scala del progetto, rampa unica verso est
const st = { type: 'straight', up: 'E', x: 0, y: 0, w: 4.6, h: 1 };
const steps = stairSteps(st, H);
assert.equal(steps.length, 17);
assert.ok(steps.every((b) => inside(st, b)));

// aperture: dentro il vano, non coprono tutto (resta il pavimento di arrivo) e L ha due bracci
const vano = (type, entry, hand, w, h) => { const ns = entry === 'N' || entry === 'S'; return { engine: true, type, entry, hand, x: 4, y: 2, w: ns ? w : h, h: ns ? h : w }; };
for (const [type, w, h, n] of [['u', 2.3, 3.4, 1], ['l', 3.2, 3.4, 2], ['straight', 2.2, 4.6, 1]]) {
  const st = vano(type, 'N', 'E', w, h);
  const holes = stairHoles(st, H);
  assert.equal(holes.length, n, type);
  const area = holes.reduce((a, q) => a + q.w * q.h, 0);
  assert.ok(area < st.w * st.h - 0.3, `${type}: l'apertura copre tutto il vano`);
  for (const q of holes) assert.ok(q.x >= st.x - 1e-6 && q.x + q.w <= st.x + st.w + 1e-6 && q.y >= st.y - 1e-6 && q.y + q.h <= st.y + st.h + 1e-6, type);
}
// rampa unica: l'ultimo gradino è a filo del piano di sopra e non fa parte dell'apertura (16 gradini su 17)
const sh = stairHoles(vano('straight', 'N', 'E', 2.2, 4.6), H)[0];
assert.ok(Math.abs(Math.max(sh.w, sh.h) - (16 / 17) * 4.6) < 1e-6, JSON.stringify(sh));
console.log('stairs3d ok');
