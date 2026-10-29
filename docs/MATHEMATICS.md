# Mathematics

This document defines the game's mathematical rules precisely and explains how
every reported number is computed. Concrete values for the current configuration
are in [RTP_REPORT.md](RTP_REPORT.md) (generated) and the exact parameters are in
[SPECIFICATION.md](SPECIFICATION.md) (generated).

> Status: play-money prototype. Nothing here is a certification or regulatory
> approval. See [REGULATORY_READINESS.md](REGULATORY_READINESS.md).

## 1. Definitions

| Term                      | Definition                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Line bet                  | Integer credits staked per payline (`bet.lineBetOptions`).                                                                                                                                 |
| Total bet / stake         | Line bet x number of paylines (20). Debited once per **round**.                                                                                                                            |
| Round                     | One paid base-game spin plus every free spin it triggers, including retriggers.                                                                                                            |
| Units                     | Internally every win is an integer number of **line-bet units**. A scatter pay of k x total bet is k x 20 units.                                                                           |
| RTP                       | E[total payout of a round] / stake of that round. Free spins carry no stake and are **not** in the denominator. The same definition is used everywhere (engine, analysis, simulation, UI). |
| Base-game RTP             | E[min(B, cap)] / stake, where B is the paid spin's own win (line + scatter).                                                                                                               |
| Free-spins contribution   | Total RTP - base-game RTP (the value the feature adds, after the cap).                                                                                                                     |
| Displayed win             | Credits added to the balance. It **does not include the stake**; net result = win - stake.                                                                                                 |
| Hit                       | A round with payout > 0.                                                                                                                                                                   |
| Net-positive round        | Payout > stake.                                                                                                                                                                            |
| No-win / net-losing round | Payout = 0 / payout < stake.                                                                                                                                                               |
| Win cap                   | `limits.maxWinMultiplier` x total bet per round (5,000x here). When reached the round ends; remaining free spins are forfeited because they could not pay anything.                        |

## 2. From random numbers to symbols

1. The RNG (`src/rng`) emits uniform 32-bit integers.
2. `uniformInt(n)` maps them to `0..n-1` by **rejection sampling**: values in the top
   partial block `[2^32 - (2^32 mod n), 2^32)` are discarded and the draw repeated, so
   every residue has exactly `floor(2^32 / n)` pre-images (no modulo bias).
3. Each reel draws a **virtual stop** `v` in `[0, W)` where `W` is the sum of the strip's
   stop weights (all weights are 1 in the shipped configuration, so `W` = strip length).
   The **physical stop** is the smallest `i` with `w_0 + ... + w_i > v`, i.e. physical
   stop `i` owns exactly `w_i` virtual positions and has probability `w_i / W`.
4. For physical stop `s` the visible window is `strip[s], strip[s+1], strip[s+2]`
   (indices mod strip length) in the top, middle and bottom rows.
5. Evaluation (section 3) receives only the window; it never sees the RNG.

Reels stop independently, so the probability of a stop combination is the product
of the per-reel stop probabilities. With unit weights every one of the
40^5 = 102,400,000 base-game combinations is equally likely.

## 3. Evaluation rules (formal)

Notation: reels `i = 1..5`, payline `l` with row `r_l(i)`, symbol on the line
`x_i = window[i][r_l(i)]`, paytable `P_S(k)` (line-bet multiples; a count above the
largest listed key uses the largest listed key, a count below the smallest is 0),
Wild `W`, mode multipliers `m_W` (Wild) and `m` (all wins).

For each payline:

1. **Wild-only reading.** `k_W` = number of leading Wilds. Value `a = P_W(k_W) * m_W` (0 if `k_W = 0`).
2. **Substituted reading.** Let `S` be the first non-Wild symbol. If `S` is a regular symbol,
   `k_S` = length of the run from reel 1 in which every symbol is `S` or `W`, and
   `h` = whether that run contains a Wild. Value `b = P_S(k_S) * (h ? m_W : 1)`.
   If `S` is the Scatter (or all five symbols are Wild) there is no substituted reading.
3. The line pays `max(a, b) * m` line-bet units. On a tie the substituted reading is
   reported. Only one combination per line is ever paid.
4. Wild never substitutes for Scatter and Scatter interrupts every run.

Scatter: `C` = number of Scatters anywhere in the window. Pay = `P_sc(C) * 20 * m`
units (paid in free spins only if `scatterPaysInFeature`). The scatter count also
selects the free-spins award `A(C)` (trigger table in the base game, retrigger table
during free spins).

Spin total = sum of all line pays + scatter pay. Round total = min(sum of all its
spin totals, cap). Everything is integer arithmetic; credits = units x line bet.

These rules are implemented three times, independently:
`src/game/payouts` (the engine), `src/math/exact-analysis/enumerate.ts` (incremental
depth-first evaluator), and `tests/helpers.ts` (brute-force reference that tries every
candidate symbol). The tests require all three to agree.

## 4. Exact analysis

### 4.1 Marginal method (fast, exact means)

Because the reels are independent, the symbols on one payline are independent and
`x_i` has the marginal distribution of strip `i` at row `r_l(i)`. Hence

    E[pay_l] = sum over symbol tuples (prod_i p_i(x_i)) * pay(x_1..x_5)

and `E[line win] = sum_l E[pay_l]` by linearity of expectation (correlation between
lines does not affect the mean). The tuple sum is pruned: once a prefix can no longer
extend any combination, the remaining reels cannot change the pay. Line pays are
computed with the engine's own `evaluateLine`.

The scatter count is a sum of independent per-reel counts, so its distribution is the
convolution of the per-reel distributions. This gives `E[scatter pay]` and the
trigger/retrigger award distributions exactly.

**Feature length.** Free spins form a Markov chain over (spins played `p`, spins
awarded `a`); each free spin independently yields a retrigger award with the free-mode
award distribution, truncated at `maxTotalSpins`. A dynamic programme over `(p, a)`
gives the exact distribution of the number of free spins. With unlimited retriggers
this is a branching process: `E[T] = a0 / (1 - E[A])`, finite only if the mean award
per free spin `E[A] < 1`; configurations with `E[A] >= 1` are rejected at compile time
(the expected payout would be infinite).

**Feature value.** The number of free spins `T` is a stopping time of the i.i.d.
free-spin sequence, so Wald's identity gives `E[feature win] = E[T] * E[free-spin win]`
(uncapped).

### 4.2 Full enumeration (exact distributions)

Every stop combination of both reel sets is enumerated (102,400,000 base and
85,656,636 free). The enumerator walks the reels depth first, keeps an incremental
state per payline (leading Wilds, target symbol, run length, Wild flag), settles a
payline as soon as neither reading can grow, and records the exact weighted joint
distribution of (spin win in units, scatter count). It runs in a few seconds. Its mean
must equal the marginal method to floating-point precision (checked in every analysis
run and in the tests).

### 4.3 Round distribution with the win cap

Let `B` be the paid spin's win and `F` the feature win. The round pays
`R = min(B + F, cap)`. All wins are non-negative, so for any `y >= 0`

    min(x + y, cap) = min(min(x, cap) + y, cap)

which means probability mass at or above the cap can be **lumped onto the cap cell**
after every convolution without changing the result. The analysis therefore works on
an integer grid `0..cap` (100,000 units):

1. Per-spin pmfs are split by the award they produce (trigger award in the base game,
   retrigger award during free spins), preserving the correlation between a spin's win
   and its scatter count.
2. The feature DP propagates the accumulated-win distribution through every state
   `(p, a)` with FFT convolutions (radix-2, size 262,144), lumping at the cap.
3. `R`'s pmf = P(no trigger, B = u) + sum over awards of (P(trigger, B) convolved with F).
4. Cap-aware feature statistics: a free spin is only played while the round is below
   the cap. From state `(p, a)` with feature-win distribution `x`, the probability that
   the next spin is played is `sum_i x[i] * P(B <= cap - 1 - i | trigger)`. Summing over
   states gives the exact expected spins played and retrigger probabilities.

For an uncapped configuration the grid is sized to the largest reachable payout when
that is finite (then it is still exact); otherwise mass beyond an analysis horizon is
reported and the mean becomes a lower bound.

**Numerical precision.** FFT round-off appears as tiny negative cells. The analysis
reports the total probability-mass error and a _numerical floor_
(`max(1e-13, 10 x total negative mass)`); probabilities below it are reported as "below
floor", never as a number. Tests compare the FFT result with an independent direct
(non-FFT) dynamic programme to 1e-12 on a configuration where the cap binds often.

### 4.4 Derived metrics

From the exact round pmf `q(u)`: mean, variance and standard deviation of `R / stake`;
skewness and excess kurtosis; quantiles; tail probabilities `P(R >= t x bet)`;
probability and RTP contribution of payout bands; hit frequency `1 - q(0)`;
P(net positive) = `P(R > stake)`.

Consecutive losing rounds: rounds are independent, so the number of no-win rounds
before the next win is geometric and `P(at least n in a row) = q(0)^n` (likewise with
`P(R < stake)` for net-losing rounds). The SD of a session's average return over `n`
rounds is `sd / sqrt(n)` (central limit theorem; optimistic for short sessions because
of the heavy right tail).

## 5. Simulation

- **Same rules.** The simulator calls the engine's `playRound()`, which uses the same
  `playNextSpin()` as the interactive `GameSession`; a test checks that a seeded
  session and `playRound()` produce identical rounds from the same random stream.
- **Unit of observation.** One complete round is one observation. Free spins inside a
  feature are never treated as independent samples.
- **Reproducibility.** Rounds are processed in chunks of 10,000. Chunk `j` uses the
  sub-stream seeded with `seed + "/stream-j"` (xoshiro128\*\*), so results are bit-identical
  for any number of worker threads. `--crypto` uses the CSPRNG instead (not reproducible).
- **RTP interval.** `mean +/- z * sd / sqrt(n)` over round returns (CLT); a batch-means
  interval over chunk means (t distribution, k - 1 degrees of freedom) is reported as a
  robustness check.
- **Proportions.** Wilson score intervals. With zero events the report gives the
  "rule of three" bound `3 / n`.
- **Rare events.** Any event observed fewer than 100 times is flagged as unreliable,
  with its relative standard error (`1 / sqrt(events)`) and the number of rounds needed
  for +/-10% precision at the exact probability: `n = z^2 (1 - p) / (p * 0.1^2)`.
  Example: `P(R >= 500x) = 6.5e-7` needs about 5.9e8 rounds; a 10-million-round run
  expects ~6.5 such events. This is why tail probabilities come from exact enumeration.
- **Conditional simulation.** `npm run simulate:feature` plays (A) complete features and
  (B) whole rounds conditional on a trigger. (B) obtains triggering spins by exact
  rejection sampling of the base reel stops, then replays the recorded random values
  through the unmodified `playRound()`; the accepted spins therefore have exactly the
  conditional distribution given a trigger. Each simulated round contains a feature, so
  tail events are ~170x more frequent per simulated round.
- **Comparison.** For each metric: exact value, simulated value, 95% interval,
  standard error, `z = (simulated - exact) / SE` and a two-sided p-value. Independent
  runs are also pooled (exact merge of means and variances).

## 6. Validation and acceptance criteria

| Check                                                                          | Where                                     | Criterion                                                               |
| ------------------------------------------------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------- |
| Engine = brute-force reference on random windows (several rule variants)       | `tests/unit/property.test.ts`             | exact equality                                                          |
| Enumerator = engine over every stop combination (3 toy variants incl. weights) | `tests/math/enumeration.test.ts`          | identical histograms                                                    |
| Marginal mean = enumeration mean (real configuration)                          | analysis + tests                          | < 1e-11                                                                 |
| FFT DP = direct DP (toy game, reachable cap)                                   | `tests/math/distribution.test.ts`         | max abs difference < 1e-12                                              |
| Cap-aware mean <= Wald mean; equal without cap                                 | `tests/math/distribution.test.ts`         | exact identity                                                          |
| Simulation vs exact (real and toy configurations)                              | `tests/math/simulation-vs-theory.test.ts` | within 4 standard errors (false-alarm rate 6e-5 per check; seeds fixed) |
| Committed analysis matches configuration                                       | `tests/math/regression.test.ts`           | identical SHA-256                                                       |
| Design acceptance                                                              | `tests/math/regression.test.ts`           | computed RTP within 0.05 points of the 96% target                       |

No test assumes the target RTP: every check computes the value and compares it with
an explicit tolerance.

## 7. Volatility

The report gives the standard deviation of the round return per unit stake, the
coefficient of variation, skewness, kurtosis, payout bands with their RTP shares, the
share of RTP from rounds of at least 10x/50x/100x/500x/1000x, and tail probabilities.
A heuristic class is assigned from the SD (< 3 low, 3-7 medium, 7-15 high, >= 15 very
high). There is no industry-standard scale; the class is a convenience label and must be
read with the distribution tables. A large maximum win alone does not make a game
volatile; its probability matters.

## 8. How the RTP was tuned

RTP depends only on the per-reel symbol counts (for line pays) and per-reel scatter
visibility; the order of symbols on a strip changes hit clustering and variance but not
the mean. The design process was therefore:

1. Choose per-reel counts (`config/reel-design.json`) and evaluate them with the
   marginal method (milliseconds per candidate).
2. Use single-stop substitutions and paytable steps (the sensitivity table in the RTP
   report) to land near the target.
3. Arrange strips with `scripts/design-reels.ts` (seeded, constrained: no adjacent
   duplicates, at most one Scatter per window, Wilds at least two stops apart) and write
   them into `config/game.config.json`.
4. Run the full exact analysis and the simulations; commit the regenerated reports.

Outcomes are never adjusted after random numbers have been drawn, and nothing in the
game adapts to the measured RTP.
