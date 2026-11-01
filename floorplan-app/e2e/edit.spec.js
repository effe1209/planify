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
  await page.getByRole('button', { name: /Modifica muri e aperture/ }).click();
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
  await page.getByRole('button', { name: /Modifica muri e aperture/ }).click();
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
