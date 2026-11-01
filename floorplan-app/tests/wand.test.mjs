/* Bacchetta magica (lib/wand.js): locali trovati su una pianta disegnata a pixel, con porte aperte, scritte e muri spessi. */
import assert from 'node:assert/strict';
import { wandRoom } from '../src/lib/wand.js';

const MPP = 0.025;   // 2,5 cm a pixel
const W = 700;
const H = 500;
const px = (m) => Math.round(m / MPP);

function plan({ doors = true, wall = 0.2, text = true } = {}) {
  const g = new Uint8Array(W * H).fill(255);
  const rect = (x0, y0, x1, y1, v = 0) => { for (let y = px(y0); y < px(y1); y++) for (let x = px(x0); x < px(x1); x++) g[y * W + x] = v; };
  const t = wall;
  // contorno 12 × 8 m a partire da (1, 1); muro verticale a x = 7 e orizzontale a y = 5 tra x 1..7
  rect(1, 1, 13, 1 + t); rect(1, 9 - t, 13, 9); rect(1, 1, 1 + t, 9); rect(13 - t, 1, 13, 9);
  rect(7 - t / 2, 1, 7 + t / 2, 9);
  rect(1, 5 - t / 2, 7, 5 + t / 2);
  if (doors) {   // varchi di 0,9 m
    rect(7 - t / 2, 3, 7 + t / 2, 3.9, 255);
    rect(3, 5 - t / 2, 3.9, 5 + t / 2, 255);
    rect(7 - t / 2, 7, 7 + t / 2, 7.9, 255);
  }
  if (text) rect(3.5, 2.5, 4.3, 2.58);   // una quota dentro il soggiorno
  return g;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// locale in alto a sinistra: 1,0..7 × 1,0..5 a metà muro (6 × 4 m), con due porte aperte e una scritta
{
  const g = plan();
  const r = wandRoom(g, W, H, px(2), px(2), MPP);
  assert.ok(!r.error, r.error);
  assert.ok(r.rect && !r.poly, 'è un rettangolo');
  const [x0, y0, x1, y1] = [r.rect.x0 * MPP, r.rect.y0 * MPP, r.rect.x1 * MPP, r.rect.y1 * MPP];
  assert.ok(near(x0, 1.1, 0.06) && near(x1, 7, 0.06) && near(y0, 1.1, 0.06) && near(y1, 5, 0.06), `rettangolo ${[x0, y0, x1, y1].map((v) => v.toFixed(2))}`);
}
// locale a destra: grande, con due varchi sul lato sinistro
{
  const r = wandRoom(plan(), W, H, px(10), px(5), MPP);
  assert.ok(!r.error, r.error);
  const [x0, x1] = [r.rect.x0 * MPP, r.rect.x1 * MPP];
  assert.ok(near(x0, 7, 0.06) && near(x1, 12.9, 0.06), `x ${x0} ${x1}`);
}
// muri spessi 30 cm: il bordo va comunque a metà muro
{
  const r = wandRoom(plan({ wall: 0.3 }), W, H, px(2), px(2), MPP);
  assert.ok(!r.error, r.error);
  assert.ok(near(r.rect.x1 * MPP, 7, 0.06) && near(r.rect.y1 * MPP, 5, 0.06));
}
// clic su un muro o fuori
assert.ok(wandRoom(plan(), W, H, px(7), px(2), MPP).error);
assert.ok(wandRoom(plan(), W, H, W + 5, 10, MPP).error);
// una pianta aperta (senza il muro esterno): il riempimento perde e lo dice
{
  const g = new Uint8Array(W * H).fill(255);
  for (let y = px(1); y < px(1.2); y++) for (let x = px(1); x < px(5); x++) g[y * W + x] = 0;
  assert.ok(wandRoom(g, W, H, px(3), px(3), MPP).error);
}
// locale a L: il contorno ortogonale ha sei angoli
{
  const g = new Uint8Array(W * H).fill(255);
  const rect = (x0, y0, x1, y1) => { for (let y = px(y0); y < px(y1); y++) for (let x = px(x0); x < px(x1); x++) g[y * W + x] = 0; };
  // L: 1..9 × 1..7 meno l'angolo in basso a destra 5..9 × 4..7
  rect(1, 1, 9.2, 1.2); rect(1, 6.8, 5.2, 7); rect(1, 1, 1.2, 7); rect(9, 1, 9.2, 4.2); rect(5, 4, 9.2, 4.2); rect(5, 4, 5.2, 7);
  const r = wandRoom(g, W, H, px(3), px(3), MPP);
  assert.ok(!r.error, r.error);
  assert.ok(r.poly && r.poly.length === 6, `angoli ${r.poly?.length}`);
}
console.log('wand ok');
