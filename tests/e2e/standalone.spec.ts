import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const FILE = resolve('index.html');

/**
 * The repository root holds the single-file production build (npm run build:standalone).
 * It must work when opened straight from the file system, without any server.
 */
test('the standalone index.html runs from the file system', async ({ page }) => {
  test.skip(!existsSync(FILE), 'index.html has not been built (npm run build:standalone)');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url().slice(0, 100)}`));
  await page.goto(pathToFileURL(FILE).href);
  await expect(page).toHaveTitle('Pixel-Pauker');
  await expect(page.locator('canvas')).toBeVisible();
  // Production build: no development hook, cryptographic RNG.
  expect(await page.evaluate(() => '__PIXEL_PAUKER__' in window)).toBe(false);

  await page.getByTestId('spin-button').click();
  await expect(page.getByTestId('spin-button')).toHaveAccessibleName(/^(Drehen|Freispiel spielen)$/, {
    timeout: 20_000,
  });
  const shown = Number((await page.getByTestId('balance').textContent())!.replace(/\./g, ''));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pixel-pauker:wallet') ?? 'null'));
  expect(saved.balance).toBe(shown);

  await page.getByTestId('open-stats').click();
  const dialog = page.getByRole('dialog', { name: 'Statistik' });
  await dialog.getByRole('tab', { name: 'Theoretisches Modell' }).click();
  await expect(dialog.getByText(/^96,\d{3} %$/)).toBeVisible();
  await dialog.getByRole('tab', { name: 'Simulation' }).click();
  await dialog.getByTestId('run-simulation').click();
  await expect(dialog.getByTestId('simulation-result')).toContainText('100.000', { timeout: 60_000 });
  expect(errors).toEqual([]);
});
