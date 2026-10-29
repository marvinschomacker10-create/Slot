# Test results

Observed on 2026-10-29 in a Linux container (4 CPU cores, Node.js 22.22.0, Chromium
from Playwright 1.63.0), configuration hash `4c02cc0a6642...` (Pixel-Pauker 2.0.0),
with `npm run format:check && npm run build && npm run test:all` (Prettier check,
production and standalone build, TypeScript build check, Vitest, Playwright). Reproduce with the
same command; end-to-end tests need `npx playwright install chromium` once.

## Summary

| Stage                                                             | Result                                |
| ----------------------------------------------------------------- | ------------------------------------- |
| `tsc -b` (strict TypeScript, app and Node projects)               | no errors                             |
| Vitest: 16 files, 201 tests                                       | 201 passed (13.2 s)                   |
| Playwright: 12 scenarios x 2 projects (desktop 1366x860, Pixel 7) | 24 passed (3.6 min)                   |
| `npm run build` (production bundle and standalone `index.html`)   | succeeded (1,594 KiB, self-contained) |
| `npm audit`                                                       | 0 vulnerabilities                     |

## Vitest suites

| File                                               | Tests | What it covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/config.test.ts`                        | 23    | Required 5x3/20-line/10-symbol design; every validation rule with its error path; unknown keys; scatter spacing warning; "N or more" and gap semantics of count tables; rejection of unlimited retriggers with mean award >= 1; SHA-256 vs `node:crypto`; key-order independence of the hash                                                                                                                                                                                                                                      |
| `tests/unit/rng.test.ts`                           | 15    | xoshiro128\*\* known-answer values; determinism; state round trip; rejection sampling at the exact bias boundary; exact uniformity (property); chi-square on 400k draws; Web Crypto buffering and failure; RNG-to-stop mapping for unweighted and weighted (virtual) reels                                                                                                                                                                                                                                                        |
| `tests/unit/paylines.test.ts`                      | 22    | All 20 paylines valid and distinct; for **each** payline a five-of-a-kind placed on it pays exactly once with correct positions, and every other payline wins only where it shares >= 3 leading cells                                                                                                                                                                                                                                                                                                                             |
| `tests/unit/payouts.test.ts`                       | 48    | Every symbol x 3/4/5 at every line bet; Wild substitution in every position; Wild-only vs substituted choice and tie rule; Wild never substitutes Scatter; Scatter breaks lines; Wild multiplier applied once per line; 0-5 scatters anywhere with pays and awards; free-mode scatter rules; multiple simultaneous line wins; invalid inputs                                                                                                                                                                                      |
| `tests/unit/property.test.ts`                      | 4     | 3,000 random windows (plus Wild-heavy windows) in both modes: engine = independent brute-force reference; again under alternative multipliers/pays; determinism and exact linear scaling with the bet; winning positions lie on the payline                                                                                                                                                                                                                                                                                       |
| `tests/unit/engine.test.ts`                        | 14    | Free-spin state machine; truncation at the spin limit; disabled retriggers; determinism of stops -> outcome; one RNG draw per reel; window wrap-around; free-spin entry, exactly 10 spins at the triggering bet, exit; retrigger; win cap on the base spin (feature forfeited) and during free spins (round ends); every credit accounted once over 2,000 rounds                                                                                                                                                                  |
| `tests/unit/session.test.ts`                       | 10    | Ledger exactly-once settlement and refusal of double settlement; integer/negative/overdraw checks; stake and win accounting; insufficient balance leaves state untouched; free spins never debit; bet locked during free spins; 3,000-spin integrity check; frozen records; snapshots/subscriptions; bounded history                                                                                                                                                                                                              |
| `tests/unit/statistics.test.ts`                    | 9     | Welford/Chan merge vs two-pass; normal and t quantiles; Wilson intervals; batch means; sample-size formula; FFT convolution vs direct; cap lumping identity                                                                                                                                                                                                                                                                                                                                                                       |
| `tests/unit/allowance.test.ts`                     | 11    | Allowance timing (exactly one interval, no accumulation, clock turned back, disabled); countdown format; collecting books a `grant`, never a win, and refuses a second claim in the same period; configuration validation; wallet save/restore; an unfinished free-spins round resumes after a reload without a second stake and ends with the same balance as uninterrupted play; malformed, tampered or foreign-configuration saves are rejected; malformed spin details dropped; a future timestamp restarts the timer on load |
| `tests/unit/presentation.test.ts`                  | 7     | Reel landing always shows exactly the settled window from any scroll position and strip, without changing cells already visible (2,000 property cases); easing; reel timing and anticipation; layout fits any canvas; win texts carry the engine's amounts                                                                                                                                                                                                                                                                        |
| `tests/integration/session-and-simulation.test.ts` | 10    | A seeded GameSession reproduces `playRound()` exactly (1,500 rounds); simulation reproducibility; chunk-order and worker-count independence; worker threads = single thread; no stake on free spins; report JSON/CSV/Markdown generation and rare-event flags                                                                                                                                                                                                                                                                     |
| `tests/integration/cli.test.ts`                    | 5     | `validate-config` success and path-specific failures; `simulate` JSON/CSV/comparison output and identical results for 1 vs 2 workers; argument errors; `export-report`                                                                                                                                                                                                                                                                                                                                                            |
| `tests/math/enumeration.test.ts`                   | 14    | Fast enumerator reproduces the engine's histogram **exactly** over every stop combination of three toy variants (including weighted reels and alternative multipliers); enumeration mean = marginal mean on the real 102.4M/85.7M-combination reel sets                                                                                                                                                                                                                                                                           |
| `tests/math/distribution.test.ts`                  | 4     | FFT feature/round distribution = independent direct DP (max difference < 1e-12) where the cap binds; capped vs uncapped means; branching-process identity for unlimited retriggers; spin-count distribution                                                                                                                                                                                                                                                                                                                       |
| `tests/math/simulation-vs-theory.test.ts`          | 2     | 300k seeded rounds (real configuration) and 200k (toy with reachable cap) through the engine: RTP, hit frequency, net-positive rate, trigger rate, cap probability, spins played and feature win all within 4 standard errors of the exact values                                                                                                                                                                                                                                                                                 |
| `tests/math/regression.test.ts`                    | 3     | Committed `reports/analysis.json` matches the configuration hash; recomputed RTP equals the committed value; computed RTP within 0.05 points of the 96% target                                                                                                                                                                                                                                                                                                                                                                    |

## Playwright scenarios (each on desktop and mobile)

1. Loads with the configured play-money balance and no console or page errors.
2. After every spin the **displayed reel symbols equal the engine's settled window**, and
   the displayed balance and win equal the engine's values; zero mismatches recorded.
3. Keyboard: Space spins, +/- change the bet, P opens the paytable (20 payline diagrams),
   Esc closes it.
4. Free spins (seed `fs-32`): banner, feature bar, bet locked; 10 free spins; stake taken
   once; final balance = start - 20 + 940 exactly.
5. Reduced motion: no animation, same evaluation and settlement.
6. Statistics: exact model shows 96.00x% RTP; an in-browser 100,000-round Web Worker
   simulation completes and shows the comparison table.
7. History lists settled rounds with their stops.
8. No horizontal scrolling (also at 360 CSS px); the spin button is in the viewport.
9. Allowance (browser clock fixed with `page.clock.setFixedTime`): countdown shown,
   button appears after exactly one interval, collecting adds 1,000 credits once, is
   counted as a grant and not as a win, and after four intervals only one more
   allowance is available (also collectable with the G key).
10. Balance, bet and allowance timer survive a page reload.
11. A free-spins round interrupted after 2 of 10 spins resumes after a reload: same
    balance, feature bar "Freispiel 2 von 10", FREI button, no automatic start; the
    remaining spins are played without any stake.
12. The standalone `index.html` opened via `file://`: production build (no dev hook),
    one spin, the saved wallet equals the displayed balance, exact model shows 96.00x %,
    and the inlined simulation worker completes 100,000 rounds; no errors or failed
    requests.

## Mathematical runs (see RTP_REPORT.md)

| Run                                                                               | Result                                                                                    |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Exact analysis                                                                    | RTP 96.0022%; marginal vs enumeration difference 7.1e-16; probability-mass error -9.2e-15 |
| 100k / 1M / 10M preset simulations, plus an extra seeded 10M and a crypto-RNG 10M | pooled 31.1M paid spins: RTP 96.0370% (95% CI 95.868% - 96.206%), z = 0.40 vs exact       |
| Conditional simulations (1M features, 1M rounds given a trigger)                  | every compared statistic within \|z\| <= 1.28 of the exact values                         |

The seeded runs reproduce version 1.0.0 exactly (only symbol ids changed); the
cryptographic-RNG 10M run is new. Observed deviations, all reported in RTP_REPORT.md
rather than removed:

- Preset 10M run: one comparison beyond |z| = 3 (`P(round >= 250x)`, z = -3.44). The
  pooled estimate and the conditional simulation with 3,111 events at that threshold
  (z = +1.28) show it to be a sampling fluctuation.
- Crypto-RNG 10M run: RTP 95.7071% (95% CI 95.4105% - 96.0037%, z = -1.95; the exact
  value lies just inside the interval). Six of its 18 metrics fall just outside their 95%
  intervals (|z| 2.0 - 2.5). They are two groups of strongly correlated feature metrics
  (more retriggers: retrigger rate, features with a retrigger, spins per trigger; lower
  feature wins: win per trigger, rounds >= 100x), none reaches |z| = 3, and the pooled
  31.1M-spin estimate (z = 0.40) and the conditional simulations agree with the exact
  values. The RNG mapping itself is covered by exact-uniformity and chi-square unit
  tests.

## Defects found by the verification process (all fixed)

| Found by                                      | Defect                                                                                                                                | Fix                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Property test (engine vs reference)           | Count tables with a gap (keys 3 and 5, no 4) paid 0 for a 4-run                                                                       | Defined "N or more" for gaps as well as above the top key                           |
| Toy-configuration DP test (did not terminate) | A configuration whose free spins award >= 1 extra spin on average (infinite expected payout) was accepted                             | Compile-time rejection with an explanatory error; convergence guard in the DP       |
| Toy simulation vs exact (z = 948, then 30)    | Expected free spins / retriggers ignored early termination at the win cap; "trigger" was defined differently in simulation and theory | Exact cap-aware expected spins and retrigger probabilities; one trigger definition  |
| Exact horizon test                            | An uncapped analysis truncated reachable payouts                                                                                      | Grid sized to the largest reachable payout when finite; flagged otherwise           |
| Visual review                                 | Feature counters showed settled values before the reels landed                                                                        | Feature UI follows the revealed record only                                         |
| Mobile layout check                           | Screen-reader table widened the mobile viewport                                                                                       | Wrapped in a clipped container                                                      |
| Conditional round simulation (z up to 33)     | Test harness replay wrapper reused random values                                                                                      | Prefix copied; replay self-check added                                              |
| Standalone build opened via `file://`         | The inlined simulation worker failed: Chromium refuses module workers from `blob:` URLs on `file://` pages                            | Inline worker built as a classic (IIFE) worker; covered by the standalone e2e test  |
| Standalone build self-containment check       | The favicon was emitted as a separate file referenced by the single-file build                                                        | Build script inlines it as a data URI and fails on any remaining external reference |
| Screenshot review at 390 px                   | The control dock was wider than narrow phones (sideways scrolling); the e2e check only covered 412 px                                 | Compact dock on small screens; layout test extended to 360 px                       |
| Visual review                                 | Hovering the yellow FREI button turned it red (hover rule outranked the feature colour)                                               | Feature-specific hover rule                                                         |
| Code review of the allowance timer            | A saved timestamp in the future (clock turned back) kept the countdown at a full interval until the clock caught up                   | Restored timestamps are clamped to the load time; unit test added                   |
