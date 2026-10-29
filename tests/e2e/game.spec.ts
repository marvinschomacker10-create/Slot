import { expect, test, type Page } from '@playwright/test';

/** Dev-build test hook exposed by src/app/App.tsx (never present in production builds). */
interface Hook {
  configHash: string;
  snapshot(): {
    balance: number;
    totalBet: number;
    phase: 'idle' | 'free-spins';
    lineBet: number;
    feature: { played: number; totalAwarded: number; remaining: number } | null;
    lastAllowanceAt: number;
    stats: {
      rounds: number;
      totalStaked: number;
      totalWon: number;
      freeSpins: number;
      featuresTriggered: number;
      grants: number;
      totalGranted: number;
    };
    lastSpin: { outcome: { window: string[][] }; credited: number; roundWinAfter: number } | null;
  };
  allowance(): { available: boolean; remainingMs: number; amount: number; intervalMs: number };
  displayedWindow(): string[][] | null;
  uiPhase(): string;
  rendererReady(): boolean;
  windowMismatches(): number;
}

type HookWindow = { __PIXEL_PAUKER__: Hook };

const hook = (page: Page) => page.evaluate(() => (window as unknown as HookWindow).__PIXEL_PAUKER__ !== undefined);
const snapshot = (page: Page) => page.evaluate(() => (window as unknown as HookWindow).__PIXEL_PAUKER__.snapshot());
const displayed = (page: Page) =>
  page.evaluate(() => (window as unknown as HookWindow).__PIXEL_PAUKER__.displayedWindow());
const credits = (n: number) => n.toLocaleString('de-DE');

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function ready(page: Page) {
  await expect.poll(() => hook(page)).toBe(true);
  await page.waitForFunction(() => (window as unknown as HookWindow).__PIXEL_PAUKER__.rendererReady());
}

async function open(page: Page, query: string) {
  const errors = collectErrors(page);
  await page.goto(`/?${query}`);
  await ready(page);
  return errors;
}

async function waitIdle(page: Page) {
  await page.waitForFunction(() => (window as unknown as HookWindow).__PIXEL_PAUKER__.uiPhase() === 'idle');
}

async function waitRoundComplete(page: Page) {
  await page.waitForFunction(
    () => {
      const h = (window as unknown as HookWindow).__PIXEL_PAUKER__;
      return h.uiPhase() === 'idle' && h.snapshot().phase === 'idle';
    },
    null,
    { timeout: 60_000 },
  );
}

test('loads with the configured play-money balance and no errors', async ({ page }) => {
  const errors = await open(page, 'seed=e2e-load');
  const s = await snapshot(page);
  await expect(page).toHaveTitle('Pixel-Pauker');
  await expect(page.getByTestId('balance')).toHaveText(credits(s.balance));
  await expect(page.getByTestId('total-bet')).toHaveText(credits(s.totalBet));
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText('Spielgeld-Prototyp')).toBeVisible();
  await expect(page.getByTestId('allowance-timer')).toContainText('nächstes in');
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
    if (after.phase === 'idle')
      expect(after.balance).toBe(before.balance - before.totalBet + after.lastSpin!.roundWinAfter);
    await waitRoundComplete(page);
  }
  expect(await page.evaluate(() => (window as unknown as HookWindow).__PIXEL_PAUKER__.windowMismatches())).toBe(0);
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
  const dialog = page.getByRole('dialog', { name: 'Gewinntabelle und Regeln' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Direktorin', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Lineal', { exact: true })).toBeVisible();
  await expect(dialog.locator('figure.payline')).toHaveCount(20);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('free spins: triggered by scatters, played without stakes, totals credited once', async ({ page }) => {
  // Seed fs-32 triggers the feature on the first paid spin (10 free spins, 940 credits in total).
  await open(page, 'seed=fs-32&turbo=1');
  const start = await snapshot(page);
  await page.getByTestId('spin-button').click();
  await expect(page.getByTestId('banner')).toContainText('10 Freispiele');
  await expect(page.getByTestId('feature-bar')).toContainText('Hitzefrei: Freispiel');
  await expect(page.getByRole('button', { name: 'Einsatz erhöhen' })).toBeDisabled();
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
  const dialog = page.getByRole('dialog', { name: 'Statistik' });
  await dialog.getByRole('tab', { name: 'Theoretisches Modell' }).click();
  await expect(dialog.getByText('RTP gesamt')).toBeVisible();
  await expect(dialog.getByText(/^96,\d{3} %$/)).toBeVisible();
  await dialog.getByRole('tab', { name: 'Simulation' }).click();
  await dialog.getByLabel('Seed (optional)').fill('browser');
  await dialog.getByTestId('run-simulation').click();
  await expect(dialog.getByTestId('simulation-result')).toContainText('100.000', { timeout: 60_000 });
  await expect(dialog.getByRole('rowheader', { name: 'RTP gesamt' })).toBeVisible();
});

test('history lists settled rounds with their stops', async ({ page }) => {
  await open(page, 'seed=e2e-history&turbo=1');
  for (let i = 0; i < 2; i++) {
    await page.getByTestId('spin-button').click();
    await waitRoundComplete(page);
  }
  await page.getByRole('button', { name: 'Verlauf' }).click();
  const dialog = page.getByRole('dialog', { name: 'Spielverlauf' });
  await expect(dialog.locator('.history > ul > li')).toHaveCount(2);
  await dialog.locator('summary').first().click();
  await expect(dialog.getByText(/Stopps \[/).first()).toBeVisible();
});

test('responsive layout has no horizontal scrolling', async ({ page }) => {
  await open(page, 'seed=e2e-layout&turbo=1');
  await page.getByTestId('spin-button').click();
  await waitIdle(page);
  const [scrollWidth, innerWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  await expect(page.getByTestId('spin-button')).toBeInViewport();
  // Narrow phones (360 CSS px) must not scroll sideways either.
  await page.setViewportSize({ width: 360, height: 740 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(0);
  await expect(page.getByTestId('last-win')).toBeInViewport();
});

test.describe('play-money wallet', () => {
  test('the allowance can be collected once per interval and is not counted as a win', async ({ page }) => {
    const t0 = new Date('2026-03-02T10:00:00Z').getTime();
    await page.clock.setFixedTime(t0);
    const errors = await open(page, 'seed=e2e-allowance');
    const rule = await page.evaluate(() => (window as unknown as HookWindow).__PIXEL_PAUKER__.allowance());
    expect(rule.available).toBe(false);
    await expect(page.getByTestId('allowance-timer')).toContainText(
      `nächstes in ${Math.round(rule.intervalMs / 60000)}:00`,
    );
    await expect(page.getByTestId('allowance-collect')).toHaveCount(0);

    // One interval later the button appears; collecting adds the amount once.
    await page.clock.setFixedTime(t0 + rule.intervalMs);
    const collect = page.getByTestId('allowance-collect');
    await expect(collect).toBeVisible();
    const before = await snapshot(page);
    await collect.click();
    await expect(page.getByTestId('balance')).toHaveText(credits(before.balance + rule.amount));
    await expect(page.getByTestId('message')).toContainText('Taschengeld abgeholt');
    const after = await snapshot(page);
    expect(after.stats.grants).toBe(1);
    expect(after.stats.totalGranted).toBe(rule.amount);
    expect(after.stats.totalWon).toBe(0);
    await expect(collect).toHaveCount(0);

    // Waiting several intervals still yields a single top-up (no accumulation).
    await page.clock.setFixedTime(t0 + 4 * rule.intervalMs);
    await expect(collect).toBeVisible();
    await page.keyboard.press('g');
    await expect(page.getByTestId('balance')).toHaveText(credits(before.balance + 2 * rule.amount));
    await expect(collect).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('balance, bet and allowance timer survive a reload', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-03-02T10:00:00Z'));
    await open(page, 'seed=e2e-persist&turbo=1');
    await page.getByRole('button', { name: 'Einsatz erhöhen' }).click();
    await page.getByTestId('spin-button').click();
    await waitRoundComplete(page);
    const before = await snapshot(page);
    await page.reload();
    await ready(page);
    const after = await snapshot(page);
    expect(after.balance).toBe(before.balance);
    expect(after.lineBet).toBe(before.lineBet);
    expect(after.lastAllowanceAt).toBe(before.lastAllowanceAt);
    await expect(page.getByTestId('balance')).toHaveText(credits(before.balance));
    await expect(page.getByTestId('total-bet')).toHaveText(credits(before.totalBet));
    await expect(page.getByTestId('message')).toContainText('Willkommen zurück');
  });

  test('an unfinished free-spins round resumes after a reload without a second stake', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        'pixel-pauker:settings',
        JSON.stringify({ turbo: true, reducedMotion: false, autoFreeSpins: false }),
      ),
    );
    await open(page, 'seed=fs-32');
    await page.getByTestId('spin-button').click();
    await expect(page.getByTestId('banner')).toContainText('10 Freispiele');
    await waitIdle(page);
    await page.getByTestId('banner').click();
    for (let i = 0; i < 2; i++) {
      await page.getByTestId('spin-button').click();
      await waitIdle(page);
    }
    const before = await snapshot(page);
    expect(before.phase).toBe('free-spins');
    expect(before.feature!.played).toBe(2);

    await page.reload();
    await ready(page);
    const resumed = await snapshot(page);
    expect(resumed.phase).toBe('free-spins');
    expect(resumed.balance).toBe(before.balance);
    expect(resumed.feature).toMatchObject({ played: 2, totalAwarded: before.feature!.totalAwarded });
    await expect(page.getByTestId('feature-bar')).toContainText('Hitzefrei: Freispiel 2 von');
    await expect(page.getByTestId('spin-button')).toHaveAccessibleName('Freispiel spielen');
    await expect(page.getByTestId('message')).toContainText('Unfertige Freispiele wiederhergestellt');

    while ((await snapshot(page)).phase === 'free-spins') {
      await page.getByTestId('spin-button').click();
      await waitIdle(page);
    }
    const end = await snapshot(page);
    expect(end.stats.totalStaked).toBe(0);
    // The remaining spins (plus any retrigger) are played; the stake was settled before the reload.
    expect(end.stats.freeSpins).toBeGreaterThanOrEqual(before.feature!.remaining);
    expect(end.balance).toBe(before.balance + end.stats.totalWon);
  });
});
