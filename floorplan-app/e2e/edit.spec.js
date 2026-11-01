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
  const box = await walls.first().boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => JSON.stringify(await roomTexts(page))).not.toBe(JSON.stringify(before));
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
  await expect(page.getByText(/selezionata/)).toBeVisible();
  await page.getByRole('button', { name: 'Elimina', exact: true }).click();
  await expect(windows).toHaveCount(n - 1);
});

test('un DXF importato si arreda dopo, con lo stile scelto', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'si prova sul desktop');
  test.setTimeout(120_000);
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
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.locator('button', { hasText: 'GLB Blender' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.glb$/);
  const file = await download.path();
  const { readFileSync } = await import('node:fs');
  const buf = readFileSync(file);
  expect(buf.toString('ascii', 0, 4)).toBe('glTF');
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  expect(gltf.meshes.length).toBeGreaterThan(50);
  expect(gltf.materials.length).toBeGreaterThan(5);
  if (process.env.DBG) console.log('NAMES', [...new Set(gltf.nodes.map((n) => (n.name || '').replace(/_\d+$/, '')))].join(','));
  expect(gltf.nodes.some((n) => /^(ARREDO_|LETTO|DIVANO|TAVOLO)/.test(n.name || ''))).toBe(true);
  expect(gltf.nodes.some((n) => n.name === 'SOLE')).toBe(true);
  expect(gltf.extensions?.KHR_lights_punctual?.lights.length).toBeGreaterThan(1);
  expect(gltf.images?.length || 0).toBeGreaterThan(0);   // texture dello stile incorporate
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
  await page.getByRole('button', { name: /Dividi locale/ }).click();
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
  await expect(page.getByText('Da dove si sale')).toBeVisible();
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
