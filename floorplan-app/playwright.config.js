import { defineConfig } from '@playwright/test';

/*
 * Test dell'interfaccia: un browser vero apre l'app e fa le cose di un utente.
 *   npm run test:ui                      (la prima volta: npx playwright install chromium)
 * Serve il motore Python: parte da solo (PLANIFY_PY = interprete con le dipendenze di requirements.txt).
 */
const touch = { hasTouch: true, isMobile: false };

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'ipad-orizzontale', use: { viewport: { width: 1024, height: 768 }, ...touch } },
    { name: 'iphone-orizzontale', use: { viewport: { width: 844, height: 390 }, ...touch } },
  ],
  webServer: [
    {
      command: 'npm run build && npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173', reuseExistingServer: !process.env.CI, timeout: 120_000,
    },
    {
      command: `${process.env.PLANIFY_PY || 'python3'} -m uvicorn main:app --port 8000`,
      cwd: '..', url: 'http://localhost:8000/health', reuseExistingServer: !process.env.CI, timeout: 60_000,
    },
  ],
});
