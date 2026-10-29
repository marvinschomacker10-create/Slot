# Test results

Observed on 2026-10-29 in a Linux container (4 CPU cores, Node.js 22.22.0, Chromium
from Playwright 1.63.0), configuration hash `8df5b9f95243...`, with
`npm run test:all` (TypeScript build check, Vitest, Playwright). Reproduce with the
same command; end-to-end tests need `npx playwright install chromium` once.

## Summary

| Stage                                                            | Result              |
| ---------------------------------------------------------------- | ------------------- |
| `tsc -b` (strict TypeScript, app and Node projects)              | no errors           |
| Vitest: 15 files, 190 tests                                      | 190 passed (10.4 s) |
| Playwright: 8 scenarios x 2 projects (desktop 1366x860, Pixel 7) | 16 passed (2.1 min) |
| `npm run build` (production bundle)                              | succeeded           |
| `npm audit`                                                      | 0 vulnerabilities   |

## Vitest suites

| File                                               | Tests | What it covers                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/config.test.ts`                        | 23    | Required 5x3/20-line/10-symbol design; every validation rule with its error path; unknown keys; scatter spacing warning; "N or more" and gap semantics of count tables; rejection of unlimited retriggers with mean award >= 1; SHA-256 vs `node:crypto`; key-order independence of the hash                                                                     |
| `tests/unit/rng.test.ts`                           | 15    | xoshiro128\*\* known-answer values; determinism; state round trip; rejection sampling at the exact bias boundary; exact uniformity (property); chi-square on 400k draws; Web Crypto buffering and failure; RNG-to-stop mapping for unweighted and weighted (virtual) reels                                                                                       |
| `tests/unit/paylines.test.ts`                      | 22    | All 20 paylines valid and distinct; for **each** payline a five-of-a-kind placed on it pays exactly once with correct positions, and every other payline wins only where it shares >= 3 leading cells                                                                                                                                                            |
| `tests/unit/payouts.test.ts`                       | 48    | Every symbol x 3/4/5 at every line bet; Wild substitution in every position; Wild-only vs substituted choice and tie rule; Wild never substitutes Scatter; Scatter breaks lines; Wild multiplier applied once per line; 0-5 scatters anywhere with pays and awards; free-mode scatter rules; multiple simultaneous line wins; invalid inputs                     |
| `tests/unit/property.test.ts`                      | 4     | 3,000 random windows (plus Wild-heavy windows) in both modes: engine = independent brute-force reference; again under alternative multipliers/pays; determinism and exact linear scaling with the bet; winning positions lie on the payline                                                                                                                      |
| `tests/unit/engine.test.ts`                        | 14    | Free-spin state machine; truncation at the spin limit; disabled retriggers; determinism of stops -> outcome; one RNG draw per reel; window wrap-around; free-spin entry, exactly 10 spins at the triggering bet, exit; retrigger; win cap on the base spin (feature forfeited) and during free spins (round ends); every credit accounted once over 2,000 rounds |
| `tests/unit/session.test.ts`                       | 10    | Ledger exactly-once settlement and refusal of double settlement; integer/negative/overdraw checks; stake and win accounting; insufficient balance leaves state untouched; free spins never debit; bet locked during free spins; 3,000-spin integrity check; frozen records; snapshots/subscriptions; bounded history                                             |
| `tests/unit/statistics.test.ts`                    | 9     | Welford/Chan merge vs two-pass; normal and t quantiles; Wilson intervals; batch means; sample-size formula; FFT convolution vs direct; cap lumping identity                                                                                                                                                                                                      |
| `tests/unit/presentation.test.ts`                  | 7     | Reel landing always shows exactly the settled window from any scroll position and strip, without changing cells already visible (2,000 property cases); easing; reel timing and anticipation; layout fits any canvas; win texts carry the engine's amounts                                                                                                       |
| `tests/integration/session-and-simulation.test.ts` | 10    | A seeded GameSession reproduces `playRound()` exactly (1,500 rounds); simulation reproducibility; chunk-order and worker-count independence; worker threads = single thread; no stake on free spins; report JSON/CSV/Markdown generation and rare-event flags                                                                                                    |
| `tests/integration/cli.test.ts`                    | 5     | `validate-config` success and path-specific failures; `simulate` JSON/CSV/comparison output and identical results for 1 vs 2 workers; argument errors; `export-report`                                                                                                                                                                                           |
| `tests/math/enumeration.test.ts`                   | 14    | Fast enumerator reproduces the engine's histogram **exactly** over every stop combination of three toy variants (including weighted reels and alternative multipliers); enumeration mean = marginal mean on the real 102.4M/85.7M-combination reel sets                                                                                                          |
| `tests/math/distribution.test.ts`                  | 4     | FFT feature/round distribution = independent direct DP (max difference < 1e-12) where the cap binds; capped vs uncapped means; branching-process identity for unlimited retriggers; spin-count distribution                                                                                                                                                      |
| `tests/math/simulation-vs-theory.test.ts`          | 2     | 300k seeded rounds (real configuration) and 200k (toy with reachable cap) through the engine: RTP, hit frequency, net-positive rate, trigger rate, cap probability, spins played and feature win all within 4 standard errors of the exact values                                                                                                                |
| `tests/math/regression.test.ts`                    | 3     | Committed `reports/analysis.json` matches the configuration hash; recomputed RTP equals the committed value; computed RTP within 0.05 points of the 96% target                                                                                                                                                                                                   |

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
8. No horizontal scrolling; the spin button is in the viewport.

## Mathematical runs (see RTP_REPORT.md)

| Run                                                                               | Result                                                                                    |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --- | --------------------------- |
| Exact analysis                                                                    | RTP 96.0022%; marginal vs enumeration difference 7.1e-16; probability-mass error -9.2e-15 |
| 100k / 1M / 10M preset simulations, plus an extra seeded 10M and a crypto-RNG 10M | pooled 31.1M paid spins: RTP 96.0032% (95% CI 95.834% - 96.172%), z = 0.01 vs exact       |
| Conditional simulations (1M features, 1M rounds given a trigger)                  | every compared statistic within                                                           | z   | <= 1.28 of the exact values |

One comparison in the preset 10M run exceeded |z| = 3 (`P(round >= 250x)`, z = -3.44).
The independent evidence above (other runs, the pooled estimate, and the conditional
simulations with 3,111 events at that threshold, z = +1.28) shows it to be a sampling
fluctuation; it is reported in RTP_REPORT.md rather than removed.

## Defects found by the verification process (all fixed)

| Found by                                      | Defect                                                                                                                                | Fix                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Property test (engine vs reference)           | Count tables with a gap (keys 3 and 5, no 4) paid 0 for a 4-run                                                                       | Defined "N or more" for gaps as well as above the top key                          |
| Toy-configuration DP test (did not terminate) | A configuration whose free spins award >= 1 extra spin on average (infinite expected payout) was accepted                             | Compile-time rejection with an explanatory error; convergence guard in the DP      |
| Toy simulation vs exact (z = 948, then 30)    | Expected free spins / retriggers ignored early termination at the win cap; "trigger" was defined differently in simulation and theory | Exact cap-aware expected spins and retrigger probabilities; one trigger definition |
| Exact horizon test                            | An uncapped analysis truncated reachable payouts                                                                                      | Grid sized to the largest reachable payout when finite; flagged otherwise          |
| Visual review                                 | Feature counters showed settled values before the reels landed                                                                        | Feature UI follows the revealed record only                                        |
| Mobile layout check                           | Screen-reader table widened the mobile viewport                                                                                       | Wrapped in a clipped container                                                     |
| Conditional round simulation (z up to 33)     | Test harness replay wrapper reused random values                                                                                      | Prefix copied; replay self-check added                                             |
