import { expect, test } from '@playwright/test';

/* Prepara l'app: motore locale collegato, consenso cookie già dato (per non coprire i pulsanti). */
async function open(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    localStorage.setItem('planify.backend', 'http://localhost:8000');
    localStorage.setItem('planify.consent', JSON.stringify({ version: 1, history: false, analytics: false, date: new Date().toISOString() }));
  });
  await page.goto('/');
  return errors;
}

/* Su iPad e telefono i comandi stanno in un cassetto chiuso: lo apre l'utente dal pulsante in alto. */
async function controls(page) {
  const toggle = page.getByRole('button', { name: 'Mostra il pannello dei comandi' });
  if (await toggle.count()) await toggle.click();
  await expect(page.getByRole('button', { name: /Genera planimetria/ })).toBeVisible();
}

async function generate(page) {
  await controls(page);
  await page.getByRole('button', { name: /Genera planimetria/ }).click();
}

test('si apre senza errori', async ({ page }) => {
  const errors = await open(page);
  await controls(page);
  expect(errors).toEqual([]);
});

test('genera una pianta con valutazione e conformità', async ({ page }) => {
  const errors = await open(page);
  await generate(page);
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  const details = page.getByRole('button', { name: 'Mostra il pannello dei dettagli' });
  if (await details.count()) await details.click();   // su iPad e telefono i dettagli stanno in un cassetto
  await expect(page.getByRole('heading', { name: 'Conformità normativa' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Valutazione del progetto' })).toBeVisible();
  await expect(page.locator('.pf-sheet svg')).toBeVisible();
  expect(errors).toEqual([]);
});

test('la manina sposta la pianta', async ({ page }) => {
  await open(page);
  await generate(page);
  const sheet = page.locator('.pf-sheet');
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  const box = await page.locator('.pf-canvas').boundingBox();
  const before = await sheet.evaluate((e) => e.style.transform);
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 70, { steps: 5 });
  await page.mouse.up();
  expect(await sheet.evaluate((e) => e.style.transform)).not.toBe(before);
});

test('il preset Loft imposta misure e stile', async ({ page }) => {
  await open(page);
  await controls(page);
  await page.getByRole('button', { name: 'Loft', exact: true }).click();
  await expect(page.locator('input[type="number"]').first()).toHaveValue('12');
});

test('la pianta ha spazio sufficiente a questo schermo', async ({ page }) => {
  await open(page);
  await generate(page);
  await expect(page.locator('.pf-sheet')).toBeVisible({ timeout: 20_000 });
  const w = await page.locator('.pf-canvas').evaluate((e) => e.getBoundingClientRect().width);
  const vw = page.viewportSize().width;
  // dopo la generazione i cassetti si chiudono: la pianta prende tutto lo spazio (sul computer restano le colonne)
  expect(w).toBeGreaterThan(vw * (vw <= 1180 ? 0.85 : 0.45));
});

test('importa un DXF trascinandolo', async ({ page }) => {
  await open(page);
  const dxf = [
    '0', 'SECTION', '2', 'ENTITIES',
    ...[[0, 0, 6, 0], [6, 0, 6, 4], [6, 4, 0, 4], [0, 4, 0, 0]].flatMap(([a, b, c, d]) => ['0', 'LINE', '8', 'MURI', '10', a, '20', b, '11', c, '21', d]),
    '0', 'ENDSEC', '0', 'EOF',
  ].join('\n');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'prova.dxf', mimeType: 'application/dxf', buffer: Buffer.from(dxf) });
  await expect(page.locator('.pf-sheet svg, .pf-error')).toBeVisible({ timeout: 20_000 });
});

test('il tetto in 3D si accende e si spegne', async ({ page }) => {
  const errors = await open(page);
  await generate(page);
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '3D', exact: true }).click();
  const roof = page.getByRole('button', { name: 'Tetto', exact: true });
  await expect(roof).toHaveAttribute('aria-pressed', 'false');
  await roof.click();
  await expect(roof).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Tipo di tetto')).toBeVisible();
  await roof.click();
  await expect(roof).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

test('il nord ruota la freccia sul foglio', async ({ page }) => {
  await open(page);
  await generate(page);
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  const details = page.getByRole('button', { name: 'Mostra il pannello dei dettagli' });
  if (await details.count()) await details.click();
  await page.getByLabel('Rotazione del nord').fill('90');
  await expect(page.locator('.pf-sheet svg g[transform="rotate(90)"]')).toHaveCount(1);
});

test('prospetti e sezioni si aprono e mostrano sei disegni', async ({ page }) => {
  const errors = await open(page);
  await generate(page);
  await expect(page.locator('.pf-sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /Prospetti/ }).click();
  await expect(page.locator('.pf-sheets-grid svg')).toHaveCount(6);
  await expect(page.getByRole('img', { name: 'Prospetto sud' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Sezione longitudinale/ })).toBeVisible();
  expect(errors).toEqual([]);
});
