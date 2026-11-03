/* Tour 3D: percorso del video, telecamere e formato di registrazione (lib/tour.js, le parti pure). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EASE, extensionOf, pickRecorderType, planTour, tourCamera, tourFileName, tourViews } from '../src/lib/tour.js';

const plans = JSON.parse(readFileSync(new URL('./fixtures/plans.json', import.meta.url)));
const base = plans.find((p) => p.doors.length && p.windows.length && p.rooms.length > 4);
const project = { id: 'p', name: 'Casa Prova', floors: [{ id: 'f', name: 'Piano terra', level: 0, plan: { ...base, wallThickness: 10, scale: 50 }, meta: {} }] };

// viste e percorso
const views = tourViews(project);
assert.ok(views.length >= 4 && views.every((v) => v.kind === 'inside'), 'una vista interna per locale');
assert.ok(views.every((v) => Math.abs(v.position[1] - 1.6) < 1e-6), 'occhio a 1,6 m');
const plan = planTour(project);
assert.equal(plan[0].kind, 'outside', 'si parte da fuori');
assert.equal(plan.length, 1 + views.length);
assert.ok(plan.slice(1).every((s) => s.kind === 'room' && s.seconds === 7 && !/^Interno/.test(s.label)));
assert.equal(planTour(project, { secondsPerRoom: 3, secondsOutside: 2 }).map((s) => s.seconds).join(','), ['2', ...views.map(() => '3')].join(','));

// telecamera: dolce agli estremi, continua e dentro il locale
assert.equal(EASE(0), 0);
assert.equal(EASE(1), 1);
assert.ok(EASE(0.5) === 0.5 && EASE(0.1) < 0.1);
const room = plan[1];
const c0 = tourCamera(room, 0);
const c1 = tourCamera(room, 1);
const dir = (c) => Math.atan2(c.target[0] - c.position[0], -(c.target[2] - c.position[2]));
const delta = dir(c1) - dir(c0);
assert.ok(Math.abs(Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) - 0.04 * 2 * Math.PI) < 0.01, 'quasi un giro intero: manca il 4%, l\'ultimo fotogramma non ripete il primo');
assert.ok(Math.abs(c0.position[1] - 1.6) < 1e-6 && Math.abs(c1.position[1] - 1.6) < 1e-6, 'resta a quota d\'occhi');
assert.ok(Math.hypot(c1.position[0] - c0.position[0], c1.position[2] - c0.position[2]) <= 0.41, 'avanza al massimo di 40 cm');
let prev = tourCamera(room, 0);
let maxStep = 0;
for (let i = 1; i <= 100; i++) {
  const c = tourCamera(room, i / 100);
  maxStep = Math.max(maxStep, Math.abs(Math.atan2(Math.sin(dir(c) - dir(prev)), Math.cos(dir(c) - dir(prev)))));
  prev = c;
}
assert.ok(maxStep < 0.12, `rotazione continua (passo massimo ${maxStep.toFixed(3)} rad)`);
const o0 = tourCamera(plan[0], 0);
const o1 = tourCamera(plan[0], 1);
assert.ok(Math.hypot(o1.position[0] - o0.position[0], o1.position[2] - o0.position[2]) > 1, 'da fuori la telecamera gira attorno alla casa');
assert.ok(Math.abs(o0.position[1] - o1.position[1]) < 1e-9, 'e resta alla stessa altezza');
assert.deepEqual(o0.target, plan[0].view.target, 'sempre rivolta al centro della casa');

// formato di registrazione
assert.equal(pickRecorderType((m) => m.startsWith('video/mp4')), 'video/mp4;codecs=avc1.42E01E', 'mp4 se il browser lo sa');
assert.equal(pickRecorderType((m) => m.startsWith('video/webm')), 'video/webm;codecs=vp9');
assert.equal(pickRecorderType(() => false), '');
assert.equal(extensionOf('video/mp4;codecs=avc1'), 'mp4');
assert.equal(extensionOf('video/webm'), 'webm');
assert.equal(tourFileName(project, 'tour', 'mp4'), 'casa-prova-tour.mp4');
assert.equal(planTour({ floors: [] }).length, 0, 'senza locali non c\'è percorso');
console.log(`tour ok (${plan.length} segmenti, ${plan.reduce((s, g) => s + g.seconds, 0)} s)`);
