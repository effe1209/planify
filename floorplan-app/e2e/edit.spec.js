import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

async function open(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('planify.backend', 'http://localhost:8000');
    localStorage.setItem('planify.consent', JSON.stringify({ version: 1, history: false, analytics: false, date: new Date().toISOString() }));
  });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Mostra il pannello dei comandi' });
  if (await toggle.count()) await toggle.click();
  return errors;
}

const roomTexts = (page) => page.locator('.pf-sheet svg text').allTextContents();

test('si sposta un muro interno trascinandolo, e si annulla', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'il trascinamento si prova sul desktop');
  const errors = await open(page);
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.locator('.pf-editbtn').click();
  const walls = page.locator('.pf-sheet svg rect[style*="col-resize"]');
  await expect(walls.first()).toBeVisible();
  const before = await roomTexts(page);
  // un muro dopo l'altro finché uno si sposta (alcuni sono già al limite della misura minima)
  let changed = false;
  for (const w of await walls.all()) {
    const box = await w.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 24, y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    if (JSON.stringify(await roomTexts(page)) !== JSON.stringify(before)) { changed = true; break; }
  }
  expect(changed).toBe(true);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => JSON.stringify(await roomTexts(page))).toBe(JSON.stringify(before));
  expect(errors).toEqual([]);
});

test('una finestra si seleziona e si elimina', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  await open(page);
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.locator('.pf-editbtn').click();
  const windows = page.locator('.pf-sheet svg g[style*="grab"]');
  const n = await windows.count();
  expect(n).toBeGreaterThan(2);
  await windows.nth(n - 1).click();
  await expect(page.locator('.pf-editcard')).toBeVisible();
  await page.getByRole('button', { name: 'Elimina', exact: true }).click();
  await expect(windows).toHaveCount(n - 1);
});

test('un DXF importato si arreda dopo, con lo stile scelto', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  test.setTimeout(150_000);
  const errors = await open(page);
  await page.locator('input[type="file"]').first().setInputFiles(path.join(here, '../../tests/fixtures/appartamento_cm.dxf'));
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: /Arreda tutto/ })).toBeVisible({ timeout: 30_000 });
  const bare = (await page.locator('.pf-sheet svg g[filter] > *').count());
  await page.getByRole('radiogroup', { name: 'Stile', exact: true }).getByRole('radio', { name: 'Nordico' }).click();
  await page.getByRole('button', { name: /Arreda tutto/ }).click();
  await expect(page.getByRole('button', { name: /Riarreda tutto/ })).toBeVisible({ timeout: 60_000 });
  expect(await page.locator('.pf-sheet svg g[filter] > *').count()).toBeGreaterThan(bare);
  expect(errors).toEqual([]);
});

test('il modello 3D si esporta in GLB con materiali, arredi e luci', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  test.setTimeout(90_000);
  await open(page);
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '3D', exact: true }).click();
  page.on('console', (m) => { if (process.env.DBG) console.log('CONSOLE', m.text()); });
  setTimeout(async () => { if (process.env.DBG) console.log('BODY', ((await page.locator('body').innerText().catch(() => '')).match(/Esportazione[^\n]*/) || [''])[0]); }, 25000);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 240_000 }),
    page.locator('button', { hasText: 'GLB Blender' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-blender\.zip$/);   // un solo ZIP: modello, script per Cycles e istruzioni
  const file = await download.path();
  const { readFileSync } = await import('node:fs');
  const { unzipStore } = await import('../src/lib/zip.js');
  const files = unzipStore(new Uint8Array(readFileSync(file)));
  const names = Object.keys(files);
  expect(names.some((n) => n.endsWith('.glb'))).toBe(true);
  expect(names.some((n) => n.endsWith('_blender.py'))).toBe(true);
  expect(names).toContain('LEGGIMI.txt');
  expect(names).toContain('RENDER.command');
  expect(names).toContain('RENDER.bat');
  expect(names).toContain('cielo.hdr');
  if (process.env.DBG) { const { statSync, copyFileSync } = await import('node:fs'); console.log('ZIPSIZE', statSync(file).size); copyFileSync(file, '/tmp/planify-blender.zip'); }
  const py = new TextDecoder().decode(files[names.find((n) => n.endsWith('_blender.py'))]);
  expect(py).toContain("scene.render.engine = 'CYCLES'");
  expect(py).toContain('CAM_TRE-QUARTI');
  const buf = Buffer.from(files[names.find((n) => n.endsWith('.glb'))]);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  expect(gltf.meshes.length).toBeGreaterThan(50);
  expect(gltf.materials.length).toBeGreaterThan(5);
  if (process.env.DBG) console.log('NAMES', [...new Set(gltf.nodes.map((n) => (n.name || '').replace(/_\d+$/, '')))].join(','));
  expect(gltf.nodes.some((n) => /^(ARREDO_|LETTO|DIVANO|TAVOLO)/.test(n.name || ''))).toBe(true);
  expect(gltf.nodes.some((n) => n.name === 'SOLE')).toBe(true);
  expect(gltf.extensions?.KHR_lights_punctual?.lights.length).toBeGreaterThan(1);
  expect(gltf.images?.length || 0).toBeGreaterThan(0);   // texture dello stile incorporate
  expect(gltf.cameras?.length).toBeGreaterThanOrEqual(4);   // le inquadrature del render come camere
  expect(gltf.nodes.some((n) => /^TETTO/.test(n.name || ''))).toBe(true);   // tetto
  expect(gltf.nodes.some((n) => /^SOFFITTI/.test(n.name || ''))).toBe(true);   // soffitti
  expect(gltf.nodes.some((n) => /^IMP_|PLAFONIERA|LAMPADARIO/.test(n.name || ''))).toBe(true);   // corpi illuminanti
});

test('il pulsante Modifica resta attivo e fisso in cima alla barra, si divide e si unisce un locale', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  const errors = await open(page);
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  const btn = page.locator('.pf-editbtn');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  // fisso in cima: anche scorrendo la barra il pulsante resta visibile
  await page.locator('.pf-inspector').evaluate((e) => { e.scrollTop = e.scrollHeight; });
  await expect(btn).toBeInViewport();
  await page.locator('.pf-inspector').evaluate((e) => { e.scrollTop = 0; });
  // dividere: il locale più grande in due
  const names = async () => (await page.locator('.pf-sheet svg text').allTextContents()).filter((t) => /m²$/.test(t)).length;
  const before = await names();
  await page.locator('.pf-segtools button', { hasText: 'Muro' }).click();
  const rects = page.locator('.pf-sheet svg rect[style*="crosshair"]');
  await expect(rects.first()).toBeVisible();
  let big = null;
  for (const r of await rects.all()) { const b = await r.boundingBox(); if (!big || b.width * b.height > big.width * big.height) big = b; }
  await page.mouse.move(big.x + big.width / 2, big.y + big.height / 2);
  await page.mouse.click(big.x + big.width / 2, big.y + big.height / 2);
  await expect.poll(names).toBe(before + 1);
  await expect(btn).toHaveAttribute('aria-pressed', 'true');   // resta attivo dopo l'operazione
  // unire: clic sul nuovo muro e «Unisci i locali»
  await page.keyboard.press('Control+z');
  await expect.poll(names).toBe(before);
  expect(errors).toEqual([]);
});

test('il vano scala si seleziona e si regolano tipo e verso su tutti i piani', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  test.setTimeout(90_000);
  const errors = await open(page);
  await page.getByRole('checkbox', { name: /Casa su più piani/ }).check();
  await page.getByRole('button', { name: /Genera/ }).first().click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 40_000 });
  await page.locator('.pf-editbtn').click();
  const stair = page.locator('.pf-sheet svg rect[style*="move"]');
  await expect(stair).toBeVisible({ timeout: 20_000 });
  const b = await stair.boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.getByText('Si sale da')).toBeVisible();
  await expect(page.getByText(/uguale su \d+ piani/)).toBeVisible();
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-francescofiaschi-Documents-planify-AI--claude-worktrees-youthful-euclid-796dbf/5f95163c-2450-4564-8f6e-e13bf6a006f3/scratchpad/stair-ui.png' });
  // una combinazione consentita si applica; si annulla con Ctrl+Z
  const radios = page.getByRole('radiogroup', { name: 'Tipo di scala' }).getByRole('radio');
  const on = await radios.evaluateAll((els) => els.findIndex((e) => e.getAttribute('aria-checked') === 'true'));
  const other = await radios.evaluateAll((els, cur) => els.findIndex((e, i) => i !== cur && !e.disabled), on);
  if (other >= 0) {
    await radios.nth(other).click();
    await expect(radios.nth(other)).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Control+z');
    await expect(radios.nth(on)).toHaveAttribute('aria-checked', 'true');
  }
  expect(errors).toEqual([]);
});

test('la rotella fa zoom sul cursore e il tasto destro sposta la pianta', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  await open(page);
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  const sheet = page.locator('.pf-sheet');
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1200);   // la comparsa della pianta finisce
  const canvas = await page.locator('.pf-canvas').boundingBox();
  const size = async () => (await sheet.boundingBox()).width;
  const w0 = await size();
  // rotella verso l'alto con il cursore in un angolo della pianta: ingrandisce e il punto sotto il cursore resta fermo
  const box0 = await sheet.boundingBox();
  const px = box0.x + box0.width * 0.2;
  const py = box0.y + box0.height * 0.3;
  await page.mouse.move(px, py);
  await page.mouse.wheel(0, -100);
  await expect.poll(size).toBeGreaterThan(w0 * 1.05);
  const box1 = await sheet.boundingBox();
  const k = box1.width / box0.width;
  expect(Math.abs(box1.x + (px - box0.x) * k - px)).toBeLessThan(6);
  expect(Math.abs(box1.y + (py - box0.y) * k - py)).toBeLessThan(6);
  // rotella verso il basso: rimpicciolisce
  await page.mouse.wheel(0, 100);
  await page.mouse.wheel(0, 100);
  await expect.poll(size).toBeLessThan(box1.width);
  // tasto destro trascinato: sposta
  const before = await sheet.boundingBox();
  await page.mouse.move(canvas.x + 60, canvas.y + 60);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(canvas.x + 140, canvas.y + 100, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  const after = await sheet.boundingBox();
  expect(Math.abs(after.x - before.x - 80)).toBeLessThan(4);
  expect(Math.abs(after.y - before.y - 40)).toBeLessThan(4);
});

test('anche i muri esterni si spostano e cambiano la misura della casa', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  const errors = await open(page);
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.locator('.pf-editbtn').click();
  const dims = async () => (await page.locator('.pf-sheet svg text').allTextContents()).filter((t) => /^\d{3,4}$/.test(t)).join('|');   // quote in cm
  const before = await dims();
  const walls = page.locator('.pf-sheet svg rect[style*="col-resize"]');
  await expect(walls.first()).toBeVisible();
  // i muri esterni a destra: dalla fascia verde più a destra verso sinistra, finché uno cambia la misura della casa
  const boxes = [];
  for (const w of await walls.all()) boxes.push(await w.boundingBox());
  boxes.sort((p, q) => q.x - p.x);
  let changed = false;
  for (const bx of boxes.slice(0, 3)) {
    const x = bx.x + bx.width / 2;
    const y = bx.y + bx.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    if ((await dims()) !== before) { changed = true; break; }
  }
  expect(changed).toBe(true);
  await page.keyboard.press('Control+z');
  await expect.poll(dims).toBe(before);
  expect(errors).toEqual([]);
});

test('gli strumenti di modifica stanno in cima, piccoli e senza sovrapporsi', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  await open(page);
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.locator('.pf-editbtn').click();
  const bar = await page.locator('.pf-editbar').boundingBox();
  const buttons = await page.locator('.pf-segtools button').all();
  expect(buttons.length).toBe(3);
  const boxes = [];
  for (const b of buttons) boxes.push(await b.boundingBox());
  for (const b of boxes) {
    expect(b.height).toBeLessThanOrEqual(32);
    expect(b.y).toBeGreaterThanOrEqual(bar.y);
    expect(b.y + b.height).toBeLessThanOrEqual(bar.y + bar.height + 1);
  }
  for (let i = 0; i + 1 < boxes.length; i++) expect(boxes[i].x + boxes[i].width).toBeLessThanOrEqual(boxes[i + 1].x + 0.5);
});

test('un PDF scansionato si ricalca con la bacchetta magica: un clic nel locale e c\'è la stanza', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  test.setTimeout(90_000);
  const errors = await open(page);
  await page.locator('input[type="file"]').first().setInputFiles(path.join(here, '../tests/fixtures/pianta_raster.pdf'));
  const svg = page.locator('.pf-sketch-svg');
  await expect(svg).toBeVisible({ timeout: 40_000 });
  await expect(page.getByRole('radio', { name: 'Bacchetta' })).toHaveAttribute('aria-checked', 'true');
  const box = await svg.boundingBox();
  // il foglio parte da (0, 0) a 40 px al metro: il soggiorno va da 3,1 a 10 m in x e da 4,1 a 9 m in y
  await page.mouse.click(box.x + 6 * 40, box.y + 6 * 40);
  const areas = page.locator('.pf-sketch-area');
  await expect(areas).toHaveCount(1, { timeout: 15_000 });
  const m2 = parseFloat((await areas.first().textContent()).replace(',', '.'));
  expect(m2).toBeGreaterThan(31);
  expect(m2).toBeLessThan(37);
  // il locale a destra, lungo e con due varchi, è un'altra stanza che si appoggia alla prima
  await page.mouse.click(box.x + 11 * 40, box.y + 6 * 40);
  await expect(areas).toHaveCount(2, { timeout: 15_000 });
  await page.getByRole('button', { name: /Genera planimetria arredata/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 40_000 });
  expect(errors).toEqual([]);
});

test('la scala a vista si sceglie nel modulo e riduce il vano', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  test.setTimeout(90_000);
  const errors = await open(page);
  await page.getByRole('checkbox', { name: /Casa su più piani/ }).check();
  await page.getByRole('radiogroup', { name: 'Posizione della scala' }).getByRole('radio', { name: 'A vista' }).click();
  await page.getByRole('radiogroup', { name: 'Scala', exact: true }).getByRole('radio', { name: 'A U' }).click();
  await page.getByRole('button', { name: /Genera/ }).first().click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 40_000 });
  // la fascia che avanza è diventata un locale: la nota lo dice
  await expect(page.getByText(/ricavato dalla fascia della scala/).first()).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('un muro si traccia trascinando nel locale e resta selezionato per tirarlo', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'il trascinamento si prova sul desktop');
  const errors = await open(page);
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.locator('.pf-editbtn').click();
  const count = async () => (await page.locator('.pf-sheet svg text').allTextContents()).filter((t) => /m²$/.test(t)).length;
  const before = await count();
  await page.locator('.pf-segtools button', { hasText: 'Muro' }).click();
  const rects = page.locator('.pf-sheet svg rect[style*="crosshair"]');
  let big = null;
  for (const r of await rects.all()) { const b = await r.boundingBox(); if (!big || b.width * b.height > big.width * big.height) big = b; }
  const x = big.x + big.width / 2;
  const y = big.y + big.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 40, { steps: 5 });   // gesto verticale: muro verticale
  await page.mouse.up();
  await expect.poll(count).toBe(before + 1);
  // il muro nuovo è selezionato (contorno pieno) e si tira col mouse
  await expect(page.locator('.pf-sheet svg rect[style*="col-resize"][stroke="#58760a"]').first()).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect.poll(count).toBe(before);
  expect(errors).toEqual([]);
});

test('il loft è una tipologia selezionata, resta tale cambiando misura e ha le tre viste', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  const errors = await open(page);
  const loft = page.getByRole('radio', { name: 'Loft' });
  await loft.click();
  await expect(loft).toHaveAttribute('aria-checked', 'true');
  await page.getByLabel('Larghezza').fill('7');
  await page.getByLabel('Lunghezza').fill('5');
  await expect(loft).toHaveAttribute('aria-checked', 'true');   // le misure non cambiano la tipologia
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  const tabs = page.getByRole('radiogroup', { name: 'Livello del loft' });
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole('radio', { name: 'Completa' })).toHaveAttribute('aria-checked', 'true');
  await tabs.getByRole('radio', { name: 'Sopra' }).click();
  await expect(tabs.getByRole('radio', { name: 'Sopra' })).toHaveAttribute('aria-checked', 'true');
  await tabs.getByRole('radio', { name: 'Sotto' }).click();
  await expect(page.locator('.pf-sheet svg text', { hasText: 'Soppalco sopra' }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('la pianta ha le quote esterne in cm su tre livelli', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  const errors = await open(page);
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  const w = Number(await page.getByLabel('Larghezza').inputValue());
  await expect(page.locator('.pf-sheet svg text', { hasText: new RegExp(`^${Math.round(w * 100)}$`) }).first()).toBeVisible();
  await page.locator('.pf-sheet svg').first().screenshot({ path: process.env.SHOT2 || '/tmp/quote-pianta.png' });
  expect(errors).toEqual([]);
});

test('il pannello Render salva un PNG dall\'interno di un locale e porta la telecamera', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  test.setTimeout(120_000);
  const errors = await open(page);
  if (process.env.RLOFT) {
    await page.getByRole('radio', { name: 'Loft' }).click();
    await page.getByLabel('Larghezza').fill('12');
    await page.getByLabel('Lunghezza').fill('8');
  }
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.getByRole('button', { name: /^Render/ }).click();
  const panel = page.getByRole('complementary', { name: 'Render' });
  await expect(panel).toBeVisible();
  const view = panel.getByLabel('Inquadratura del render');
  await page.waitForFunction(() => !!window.__planify3d, null, { timeout: 30_000 });
  const before = await page.evaluate(() => window.__planify3d.camera.position.toArray());
  await view.selectOption({ label: process.env.RVIEW || 'Interno: Soggiorno' });
  const after = await page.evaluate(() => window.__planify3d.camera.position.toArray());
  if (!process.env.RVIEW) expect(Math.abs(after[1] - 1.6)).toBeLessThan(0.01);   // a 1,6 m dal pavimento
  expect(before[1]).toBeGreaterThan(3);
  if (process.env.RTIME) await panel.getByLabel('Ora del giorno').selectOption({ label: process.env.RTIME });
  if (process.env.RBG) await panel.getByLabel('Sfondo del render').selectOption({ label: process.env.RBG });
  if (process.env.RSIZE) await panel.getByLabel('Risoluzione del render').selectOption({ label: process.env.RSIZE });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 90_000 }),
    panel.getByRole('button', { name: /Salva render/ }).click(),
  ]);
  const { readFileSync, copyFileSync } = await import('node:fs');
  const file = await download.path();
  const buf = readFileSync(file);
  expect(buf.toString('ascii', 1, 4)).toBe('PNG');
  if (!process.env.RSIZE) expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([1920, 1080]);
  copyFileSync(file, process.env.RENDEROUT || '/tmp/render-interno.png');
  if (!process.env.RVIEW) expect(download.suggestedFilename()).toMatch(/render-room-.*-hd\.png$/);
  expect(errors).toEqual([]);
});

test('il loft in 3D ha le viste Completa, Sotto e Sopra e la sezione con piano di taglio', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  test.setTimeout(90_000);
  const errors = await open(page);
  await page.getByRole('radio', { name: 'Loft' }).click();
  await page.getByLabel('Larghezza').fill('12');
  await page.getByLabel('Lunghezza').fill('8');
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.waitForFunction(() => !!window.__planify3d, null, { timeout: 30_000 });
  const state = () => page.evaluate(() => {
    const { model, renderer } = window.__planify3d;
    let mezz = 0, shown = 0;
    model.traverse((o) => { if (o.userData.mezz && o.isMesh) { mezz++; if (o.visible) shown++; } });
    return { mezz, shown, planes: renderer.clippingPlanes.length };
  });
  const tabs = page.getByRole('radiogroup', { name: 'Livello del loft' });
  await expect(tabs).toBeVisible();
  let st = await state();
  expect(st.mezz).toBeGreaterThan(5);
  expect([st.shown, st.planes]).toEqual([st.mezz, 0]);                    // Completa: tutto
  await tabs.getByRole('radio', { name: 'Sotto' }).click();
  st = await state();
  expect([st.shown, st.planes]).toEqual([0, 0]);                          // Sotto: niente soppalco
  await tabs.getByRole('radio', { name: 'Sopra' }).click();
  st = await state();
  expect([st.shown, st.planes]).toEqual([st.mezz, 1]);                    // Sopra: tutto sotto il solaio tagliato via
  await page.waitForTimeout(500);
  await page.locator('.pf-3d canvas').screenshot({ path: process.env.SHOT3 || '/tmp/loft-sopra.png' });
  await tabs.getByRole('radio', { name: 'Completa' }).click();
  await page.getByRole('button', { name: 'Sezione', exact: true }).click();
  await expect(page.getByLabel('Posizione del piano di sezione')).toBeVisible();
  st = await state();
  expect(st.planes).toBe(1);
  await page.getByLabel('Direzione della sezione 3D').selectOption('z');
  await page.waitForTimeout(400);
  await page.locator('.pf-3d canvas').screenshot({ path: process.env.SHOT4 || '/tmp/loft-sezione.png' });
  await page.getByRole('button', { name: 'Sezione', exact: true }).click();
  expect((await state()).planes).toBe(0);
  expect(errors).toEqual([]);
});

test('i render in tempo reale non sono mai neri né bruciati (loft industriale, sera, sfondo trasparente)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  test.setTimeout(240_000);
  const { readPng, lumaStats } = await import('./png.js');
  const { readFileSync } = await import('node:fs');
  const errors = await open(page);
  await page.getByRole('radio', { name: 'Loft' }).click();
  await page.getByLabel('Larghezza').fill('12');
  await page.getByLabel('Lunghezza').fill('8');
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.getByRole('button', { name: /^Render/ }).click();
  const panel = page.getByRole('complementary', { name: 'Render' });
  await panel.getByLabel('Risoluzione del render').selectOption({ label: 'Anteprima 960 × 540' });
  const cases = [['Interno: Soggiorno', 'Mattina', 'Bianco'], ['Interno: soppalco', 'Sera', 'Trasparente (PNG)'], ["Pianta 3D dall'alto", 'Sera', 'Trasparente (PNG)'], ['Tre quarti', 'Tramonto', 'Cielo (come l\'ora)'], ['Tre quarti', 'Mezzogiorno', 'Bianco']];
  for (const [view, time, bg] of cases) {
    await panel.getByLabel('Inquadratura del render').selectOption({ label: view });
    await panel.getByLabel('Ora del giorno').selectOption({ label: time });
    await panel.getByLabel('Sfondo del render').selectOption({ label: bg });
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 240_000 }),
      panel.getByRole('button', { name: /Salva render/ }).click(),
    ]);
    const st = lumaStats(readPng(readFileSync(await download.path())));
    console.log('LUMA', view, time, bg, JSON.stringify({ median: +st.median.toFixed(2), dark: +st.dark.toFixed(2), n: st.n }));
    expect(st.n, `${view} ${time}: niente da misurare`).toBeGreaterThan(2000);
    expect(st.median, `${view} ${time} ${bg}: troppo scuro`).toBeGreaterThan(['Sera', 'Tramonto'].includes(time) ? 0.12 : 0.25);   // la sera è più scura, mai nera
    expect(st.median, `${view} ${time} ${bg}: bruciato`).toBeLessThan(0.85);
    expect(st.dark, `${view} ${time}: troppo nero`).toBeLessThan(0.35);
  }
  expect(errors).toEqual([]);
});

test('il render in qualità alta usa il path tracing e salva il PNG', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  test.setTimeout(480_000);
  const errors = await open(page);
  if (process.env.RLOFT) {
    await page.getByRole('radio', { name: 'Loft' }).click();
    await page.getByLabel('Larghezza').fill('12');
    await page.getByLabel('Lunghezza').fill('8');
  }
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.getByRole('button', { name: /^Render/ }).click();
  const panel = page.getByRole('complementary', { name: 'Render' });
  await panel.getByLabel('Inquadratura del render').selectOption({ label: process.env.RVIEW || 'Interno: Soggiorno' });
  await panel.getByLabel('Risoluzione del render').selectOption({ label: 'Anteprima 960 × 540' });
  if (process.env.RTIME) await panel.getByLabel('Ora del giorno').selectOption({ label: process.env.RTIME });
  if (process.env.RBG) await panel.getByLabel('Sfondo del render').selectOption({ label: process.env.RBG });
  await panel.getByLabel('Qualità del render').selectOption({ label: 'Alta, path tracing (minuti)' });
  await panel.getByLabel('Campioni del path tracing').selectOption({ label: process.env.RSAMPLES || 'Anteprima (16 campioni)' });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 440_000 }).catch(async (e) => { throw new Error(`${e.message} | pannello: ${(await panel.innerText()).replace(/\s+/g, ' ')}`); }),
    panel.getByRole('button', { name: /Salva render/ }).click(),
  ]);
  const { readFileSync, copyFileSync } = await import('node:fs');
  const file = await download.path();
  const buf = readFileSync(file);
  expect(buf.toString('ascii', 1, 4)).toBe('PNG');
  expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([960, 540]);
  if (process.env.RBG) console.log('NOTE', (await panel.innerText()).replace(/\s+/g, ' ').slice(-260));
  expect(download.suggestedFilename()).toMatch(/-pt\.png$/);
  copyFileSync(file, process.env.PTOUT || '/tmp/render-pt.png');
  expect(errors).toEqual([]);
});

test('il tetto del render si accende da solo nelle viste da fuori e si spegne nella pianta dall\'alto', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  test.setTimeout(120_000);
  const errors = await open(page);
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await page.getByRole('button', { name: /^Render/ }).click();
  const panel = page.getByRole('complementary', { name: 'Render' });
  const roof = panel.getByLabel('Tetto nel render');
  await expect(roof).toBeChecked();                                        // si apre su «tre quarti», da fuori
  await panel.getByLabel('Inquadratura del render').selectOption({ label: "Pianta 3D dall'alto" });
  await expect(roof).not.toBeChecked();                                    // stile planimetria: senza tetto
  await page.waitForFunction(() => !!window.__planify3d);
  const cam = await page.evaluate(() => { const { camera, controls } = window.__planify3d; return { p: camera.position.toArray(), t: controls.target.toArray(), fov: camera.fov }; });
  expect(cam.p[1]).toBeGreaterThan(20);                                    // da lontano, dritta sopra
  expect(Math.abs(cam.p[0] - cam.t[0])).toBeLessThan(0.01);
  await roof.check();                                                      // la scelta si può cambiare a mano
  await expect(roof).toBeChecked();
  await panel.getByLabel('Inquadratura del render').selectOption({ label: 'Fronte' });
  await expect(roof).toBeChecked();                                        // di nuovo da fuori: acceso da solo
  await panel.getByLabel('Inquadratura del render').selectOption({ label: "Pianta 3D dall'alto" });
  await page.screenshot({ path: process.env.SHOTTOP || '/tmp/pianta3d-viva.png' });
  expect(errors).toEqual([]);
});

test('aprire e chiudere la vista 3D molte volte non esaurisce i contesti WebGL', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  test.setTimeout(240_000);
  const errors = await open(page);
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  const three = page.getByRole('button', { name: '3D', exact: true });
  for (let i = 0; i < 22; i++) {   // il browser concede ~16 contesti: senza liberarli il 17° fallisce
    await three.click();
    await page.waitForFunction(() => !!window.__planify3d, null, { timeout: 20_000 });
    await expect(page.getByText('Vista 3D non disponibile')).toHaveCount(0);
    await three.click();
    await expect(page.locator('.pf-sheet svg')).toBeVisible();
    await page.evaluate(() => { delete window.__planify3d; });
  }
  expect(errors).toEqual([]);
});

test('il PDF del progetto ha la tavola tecnica A4 con cartiglio', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  test.setTimeout(420_000);
  const errors = await open(page);
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /^Esporta/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 380_000 }),
    page.getByRole('menuitem', { name: /PDF progetto/ }).click(),
  ]);
  const { readFileSync, copyFileSync } = await import('node:fs');
  const file = await download.path();
  expect(readFileSync(file).toString('ascii', 0, 5)).toBe('%PDF-');
  copyFileSync(file, process.env.PDFOUT || '/tmp/progetto-test.pdf');
  expect(errors).toEqual([]);
});

test('il DXF esportato ha pianta, quote, prospetti e sezioni sui loro layer', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  const errors = await open(page);
  await page.getByRole('radio', { name: 'Loft' }).click();
  await page.getByLabel('Larghezza').fill('12');
  await page.getByLabel('Lunghezza').fill('8');
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /^Esporta/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.getByRole('menuitem', { name: /DXF \(CAD\)/ }).click(),
  ]);
  const { readFileSync, copyFileSync } = await import('node:fs');
  const file = await download.path();
  const dxf = readFileSync(file, 'utf8');
  copyFileSync(file, process.env.DXFOUT || '/tmp/loft-test.dxf');
  for (const l of ['MURI', 'QUOTE', 'PROSPETTI_MURI', 'PROSPETTI_TETTO', 'SEZIONI_SOLAI', 'SEZIONI_SCALE', 'SEZIONI_PARAPETTI', 'SEZIONI_QUOTE']) {
    expect(dxf, `layer ${l}`).toContain(`\n8\n${l}\n`);
  }
  expect(dxf).toContain('Sezione longitudinale');
  expect(dxf).not.toContain('FUORI NORMA');   // il loft generato è a norma
  expect(errors).toEqual([]);
});

test('il PDF del loft ha prospetti e sezioni con il soppalco', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  test.setTimeout(420_000);
  const errors = await open(page);
  await page.getByRole('radio', { name: 'Loft' }).click();
  await page.getByLabel('Larghezza').fill('12');
  await page.getByLabel('Lunghezza').fill('8');
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /^Esporta/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 380_000 }),
    page.getByRole('menuitem', { name: /PDF progetto/ }).click(),
  ]);
  const { readFileSync, copyFileSync } = await import('node:fs');
  const file = await download.path();
  expect(readFileSync(file).toString('ascii', 0, 5)).toBe('%PDF-');
  copyFileSync(file, process.env.PDFLOFT || '/tmp/progetto-loft.pdf');
  expect(errors).toEqual([]);
});

test('la sezione del loft mostra il soppalco con le altezze in cm', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  const errors = await open(page);
  await page.getByRole('radio', { name: 'Loft' }).click();
  await page.getByLabel('Larghezza').fill('12');
  await page.getByLabel('Lunghezza').fill('8');
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /Prospetti/ }).click();
  await expect(page.locator('.pf-sheets-grid svg text', { hasText: /sotto 240 cm/ }).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.pf-sheets-grid svg text', { hasText: /parapetto 100 cm/ }).first()).toBeVisible();
  await page.locator('svg[aria-label^="Sezione longitudinale"]').screenshot({ path: process.env.SHOT || '/tmp/sezione-loft.png' });
  expect(errors).toEqual([]);
});

test('nella vista Sopra si aggiungono arredi al soppalco', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  const errors = await open(page);
  await page.getByRole('radio', { name: 'Loft' }).click();
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('radiogroup', { name: 'Livello del loft' }).getByRole('radio', { name: 'Sopra' }).click();
  const panel = page.locator('.pf-customizer');
  await expect(panel).toContainText('Soppalco');
  const rows = panel.locator('.pf-furn-row');
  const before = await rows.count();
  await panel.locator('.pf-add-furn select').selectOption({ label: 'Comodino' });
  await panel.getByRole('button', { name: /Aggiungi/ }).click();
  await expect(rows).toHaveCount(before + 1);
  expect(errors).toEqual([]);
});

test('il soppalco si allarga dal pannello con l\'avviso oltre 1/3, e si mette un tappeto da solo', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  const errors = await open(page);
  await page.getByRole('radio', { name: 'Loft' }).click();
  await page.getByLabel('Larghezza').fill('12');
  await page.getByLabel('Lunghezza').fill('8');
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('radiogroup', { name: 'Livello del loft' }).getByRole('radio', { name: 'Sopra' }).click();
  const panel = page.locator('.pf-customizer');
  const num = panel.getByLabel('Larghezza del soppalco in metri');
  await expect(panel).toContainText('a norma');
  await num.fill('4.5');
  await expect(panel).toContainText('oltre 1/3');
  await expect(num).toHaveValue('4.5');
  // il muro del bagno e della cucina sotto il soppalco segue il bordo: il bagno di sotto diventa più largo
  await page.getByRole('radiogroup', { name: 'Livello del loft' }).getByRole('radio', { name: 'Sotto' }).click();
  if (process.env.SHOTW) await page.locator('.pf-sheet svg').first().screenshot({ path: process.env.SHOTW });
  await page.getByRole('radiogroup', { name: 'Livello del loft' }).getByRole('radio', { name: 'Sopra' }).click();
  await page.keyboard.press('Control+z');
  await expect(panel).toContainText('a norma');
  // tappeto da solo: nella stanza, senza tavolino
  await page.getByRole('radiogroup', { name: 'Livello del loft' }).getByRole('radio', { name: 'Completa' }).click();
  await page.locator('.pf-sheet svg [class~="pf-hit"]').first().click({ force: true });
  const room = page.locator('.pf-customizer');
  await room.locator('.pf-add-furn select').selectOption({ label: 'Tappeto medio 2 × 2,6' });
  await room.getByRole('button', { name: /Aggiungi/ }).click();
  await expect(room.locator('.pf-furn-row', { hasText: 'Tappeto' })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('un loft con il giardino si vede in 3D insieme: casa intera con il giardino davanti', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  test.setTimeout(150_000);
  const errors = await open(page);
  await page.getByRole('radio', { name: 'Loft' }).click();
  await page.getByLabel('Larghezza').fill('12');
  await page.getByLabel('Lunghezza').fill('8');
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Aggiungi un piano' }).click();
  await page.getByRole('dialog', { name: 'Aggiungi piano' }).locator('select').selectOption({ label: 'Giardino / esterno' });
  await page.getByRole('button', { name: /Genera con i parametri/ }).click();
  await page.getByRole('button', { name: /Genera «Giardino/ }).click();
  await expect(page.getByRole('button', { name: '3D', exact: true })).toBeEnabled({ timeout: 20_000 });
  await page.getByRole('button', { name: '3D', exact: true }).click();
  const whole = page.getByRole('button', { name: 'Tutta la casa' });
  await expect(whole).toBeVisible();   // anche con un solo piano più il giardino
  await expect(whole).toHaveAttribute('aria-pressed', 'true');
  await page.waitForFunction(() => !!window.__planify3d, null, { timeout: 30_000 });
  const names = await page.evaluate(() => { const n = []; window.__planify3d.model.traverse((o) => { if (o.userData?.layer) n.push(o.userData.layer); }); return [...new Set(n)]; });
  expect(names).toContain('MURI');   // la casa
  expect(names.some((n) => /VEGETAZIONE|SIEPI|RECINZIONE|PRATO|PIETRA/.test(n)) || names.length > 3).toBe(true);
  expect(errors).toEqual([]);
});
