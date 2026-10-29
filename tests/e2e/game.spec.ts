import { expect, test, type Page } from '@playwright/test';

/** Dev-build test hook exposed by src/app/App.tsx (never present in production builds). */
interface Hook {
  configHash: string;
  snapshot(): {
    balance: number;
    totalBet: number;
    phase: 'idle' | 'free-spins';
    lineBet: number;
    stats: { rounds: number; totalStaked: number; totalWon: number; freeSpins: number; featuresTriggered: number };
    lastSpin: { outcome: { window: string[][] }; credited: number; roundWinAfter: number } | null;
  };
  displayedWindow(): string[][] | null;
  uiPhase(): string;
  rendererReady(): boolean;
  windowMismatches(): number;
}

const hook = (page: Page) => page.evaluate(() => (window as unknown as { __GILDED_ORBIT__: Hook }).__GILDED_ORBIT__ !== undefined);
const snapshot = (page: Page) => page.evaluate(() => (window as unknown as { __GILDED_ORBIT__: Hook }).__GILDED_ORBIT__.snapshot());
const displayed = (page: Page) => page.evaluate(() => (window as unknown as { __GILDED_ORBIT__: Hook }).__GILDED_ORBIT__.displayedWindow());
const credits = (n: number) => n.toLocaleString('en-US');

async function open(page: Page, query: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`/?${query}`);
  await expect.poll(() => hook(page)).toBe(true);
  await page.waitForFunction(() => (window as unknown as { __GILDED_ORBIT__: Hook }).__GILDED_ORBIT__.rendererReady());
  return errors;
}

async function waitIdle(page: Page) {
  await page.waitForFunction(() => {
    const h = (window as unknown as { __GILDED_ORBIT__: Hook }).__GILDED_ORBIT__;
    return h.uiPhase() === 'idle';
  });
}

async function waitRoundComplete(page: Page) {
  await page.waitForFunction(
    () => {
      const h = (window as unknown as { __GILDED_ORBIT__: Hook }).__GILDED_ORBIT__;
      return h.uiPhase() === 'idle' && h.snapshot().phase === 'idle';
    },
    null,
    { timeout: 60_000 },
  );
}

test('loads with the configured play-money balance and no errors', async ({ page }) => {
  const errors = await open(page, 'seed=e2e-load');
  const s = await snapshot(page);
  await expect(page.getByTestId('balance')).toHaveText(credits(s.balance));
  await expect(page.getByTestId('total-bet')).toHaveText(credits(s.totalBet));
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText('Play-money prototype')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the displayed reels, balance and win agree with the engine after every spin', async ({ page }) => {
  const errors = await open(page, 'seed=e2e-agree&turbo=1');
  for (let i = 0; i < 6; i++) {
    const before = await snapshot(page);
    if (before.phase !== 'idle') break;
    await page.getByTestId('spin-button').click();
    await waitIdle(page);
    const after = await snapshot(page);
    const shown = await displayed(page);
    expect(shown).toEqual(after.lastSpin!.outcome.window);
    await expect(page.getByTestId('balance')).toHaveText(credits(after.balance));
    await expect(page.getByTestId('last-win')).toHaveText(credits(after.lastSpin!.roundWinAfter));
    if (after.phase === 'idle') expect(after.balance).toBe(before.balance - before.totalBet + after.lastSpin!.roundWinAfter);
    await waitRoundComplete(page);
  }
  expect(await page.evaluate(() => (window as unknown as { __GILDED_ORBIT__: Hook }).__GILDED_ORBIT__.windowMismatches())).toBe(0);
  expect(errors).toEqual([]);
});

test('keyboard: space spins, +/- change the bet, P opens the paytable and Esc closes it', async ({ page }) => {
  await open(page, 'seed=e2e-keys&turbo=1');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('+');
  await expect(page.getByTestId('total-bet')).toHaveText('40');
  await page.keyboard.press('-');
  await expect(page.getByTestId('total-bet')).toHaveText('20');
  const start = (await snapshot(page)).stats.rounds;
  await page.keyboard.press('Space');
  await waitRoundComplete(page);
  expect((await snapshot(page)).stats.rounds).toBe(start + 1);
  await page.keyboard.press('p');
  const dialog = page.getByRole('dialog', { name: 'Paytable and rules' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Nova Wild', { exact: true })).toBeVisible();
  await expect(dialog.locator('figure.payline')).toHaveCount(20);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('free spins: triggered by scatters, played without stakes, totals credited once', async ({ page }) => {
  // Seed fs-32 triggers the feature on the first paid spin (10 free spins, 940 credits in total).
  await open(page, 'seed=fs-32&turbo=1');
  const start = await snapshot(page);
  await page.getByTestId('spin-button').click();
  await expect(page.getByTestId('banner')).toContainText('10 free spins');
  await expect(page.getByTestId('feature-bar')).toContainText('Free spins played');
  await expect(page.getByRole('button', { name: 'Increase bet' })).toBeDisabled();
  await waitRoundComplete(page);
  const end = await snapshot(page);
  expect(end.stats.featuresTriggered).toBe(1);
  expect(end.stats.freeSpins).toBe(10);
  expect(end.stats.totalStaked).toBe(start.totalBet);
  expect(end.balance).toBe(start.balance - start.totalBet + 940);
  await expect(page.getByTestId('balance')).toHaveText(credits(end.balance));
  await expect(page.getByTestId('last-win')).toHaveText('940');
});

test('reduced motion skips the animation but not the evaluation', async ({ page }) => {
  await open(page, 'seed=e2e-motion&motion=reduced');
  await page.getByTestId('spin-button').click();
  await waitIdle(page);
  const s = await snapshot(page);
  expect(s.stats.totalStaked).toBe(20);
  expect(await displayed(page)).toEqual(s.lastSpin!.outcome.window);
});

test('statistics: exact model and an in-browser simulation that keeps the page responsive', async ({ page }) => {
  await open(page, 'seed=e2e-stats');
  await page.getByTestId('open-stats').click();
  const dialog = page.getByRole('dialog', { name: 'Statistics' });
  await dialog.getByRole('tab', { name: 'Theoretical model' }).click();
  await expect(dialog.getByText('Total RTP')).toBeVisible();
  await expect(dialog.getByText(/^96\.\d{3}%$/)).toBeVisible();
  await dialog.getByRole('tab', { name: 'Simulation' }).click();
  await dialog.getByLabel('Seed (optional)').fill('browser');
  await dialog.getByTestId('run-simulation').click();
  await expect(dialog.getByTestId('simulation-result')).toContainText('100,000', { timeout: 60_000 });
  await expect(dialog.getByRole('rowheader', { name: 'Total RTP' })).toBeVisible();
});

test('history lists settled rounds with their stops', async ({ page }) => {
  await open(page, 'seed=e2e-history&turbo=1');
  for (let i = 0; i < 2; i++) {
    await page.getByTestId('spin-button').click();
    await waitRoundComplete(page);
  }
  await page.getByRole('button', { name: 'History' }).click();
  const dialog = page.getByRole('dialog', { name: 'Game history' });
  await expect(dialog.locator('.history > ul > li')).toHaveCount(2);
  await dialog.locator('summary').first().click();
  await expect(dialog.getByText(/stops \[/).first()).toBeVisible();
});

test('responsive layout has no horizontal scrolling', async ({ page }) => {
  await open(page, 'seed=e2e-layout&turbo=1');
  await page.getByTestId('spin-button').click();
  await waitIdle(page);
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  await expect(page.getByTestId('spin-button')).toBeInViewport();
});
