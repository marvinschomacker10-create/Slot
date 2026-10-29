# Gilded Orbit - play-money video slot prototype

An original 5-reel, 3-row, 20-payline video slot with free spins, built as a locally
runnable prototype together with an exact mathematical analysis engine, a Monte Carlo
simulator, and automated tests.

> **Play money only.** Credits have no monetary value. There are no deposits,
> withdrawals, payments or wagering accounts. The game is **not certified, not approved
> by any regulator, and not suitable for real-money use**. See
> [docs/REGULATORY_READINESS.md](docs/REGULATORY_READINESS.md).

<img src="docs/images/screenshot-desktop.png" alt="Gilded Orbit on desktop: five reels with a winning payline highlighted" width="640"> <img src="docs/images/screenshot-mobile.png" alt="Gilded Orbit on a phone" width="180">

## Quick start

Requirements: Node.js 20.19+ (tested with Node 22) and npm. No paid services, API keys
or environment variables are needed.

```bash
npm ci                     # install exact dependency versions
npm run dev                # start the game at http://localhost:5173
```

| Task                                                                           | Command                                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Start the local game                                                           | `npm run dev`                                                      |
| Run all automated tests (typecheck, unit/integration/math, browser end-to-end) | `npm run test:all`                                                 |
| Unit, integration and math tests only                                          | `npm test`                                                         |
| Browser end-to-end tests only                                                  | `npm run test:e2e` (first time: `npx playwright install chromium`) |
| Validate the configuration                                                     | `npm run validate-config`                                          |
| Exact mathematical analysis                                                    | `npm run analyze`                                                  |
| Configurable simulation                                                        | `npm run simulate -- --spins 2000000 --seed 7 --workers 4`         |
| Simulation presets (100k / 1M / 10M paid spins)                                | `npm run simulate:100k`, `simulate:1m`, `simulate:10m`             |
| Conditional rare-event simulation                                              | `npm run simulate:feature`                                         |
| Export the mathematical report                                                 | `npm run report`                                                   |
| Everything mathematical, in order                                              | `npm run math:all`                                                 |
| Production build / preview                                                     | `npm run build`, `npm run preview`                                 |

Simulation options: `--spins N` (paid spins; each is simulated with all free spins it
triggers), `--seed TEXT` (reproducible) or `--crypto` (cryptographic RNG),
`--workers N` (default: CPU cores, max 8), `--chunk-size N`, `--line-bet N`,
`--out PATH`, `--config PATH`. Seeded results are identical for any worker count.

Development-only URL parameters: `?seed=TEXT` (reproducible outcomes), `?turbo=1`,
`?motion=reduced`. A production build ignores `seed` and always uses the cryptographic
RNG.

## Results (shipped configuration)

Configuration hash `8df5b9f9...` - full numbers in
[docs/RTP_REPORT.md](docs/RTP_REPORT.md).

| Metric                 | Exact (full enumeration) | Simulated (31.1M paid spins pooled) |
| ---------------------- | ------------------------ | ----------------------------------- |
| Total RTP              | **96.0022%**             | 96.0032% (95% CI 95.834% - 96.172%) |
| Base game / free spins | 70.1744% / 25.8278%      | see report                          |
| Hit frequency          | 51.681%                  | 51.67% - 51.70% per run             |
| Free-spins trigger     | 1 in 168.8               | 1 in 156 - 170 per run              |
| SD per unit stake      | 4.824 (medium)           | 4.72 - 4.83 per run                 |

The RTP is per unit of base-game stake and includes all free spins and retriggers. The
exact value comes from enumerating all 102,400,000 base-game and 85,656,636 free-spin
reel-stop combinations; simulations are independent confirmations, not the source of
the figure.

## What is in the box

```
config/            game.config.json (every gameplay parameter), reel-design.json
src/config/        types, validation (path-specific errors), compilation, SHA-256 hash
src/rng/           RNG abstraction: Web Crypto CSPRNG, seeded xoshiro128**, rejection sampling
src/game/          engine: reels, paylines, payouts (Wild/Scatter), free spins, rounds,
                   win cap, session state, exactly-once settlement ledger
src/math/          exact-analysis (marginal method, full enumeration, FFT distribution,
                   sensitivity), simulation (accumulator, runner, reports, Web Worker),
                   statistics (intervals), reports (Markdown, specification)
src/render/        Phaser reel scene, layout/tape math, React-Phaser bridge
src/app, src/components, src/styles   React UI
scripts/           analyze, simulate, simulate-feature, export-report, validate-config,
                   design-reels (+ worker pool)
tests/             unit, integration, math, e2e (Playwright)
docs/              design, mathematics, configuration, RTP report, specification,
                   security, regulatory readiness, test results
reports/           generated analysis/simulation JSON and CSV (committed)
```

Architecture in one paragraph: the **configuration** is validated and compiled into
numeric tables; the **engine** turns RNG output into reel stops (the only place
randomness enters), evaluates the window with pure functions, and drives rounds through
one `playNextSpin()` used by both the interactive **session** and the **simulator**. The
session settles every spin through an idempotent **ledger** before the **renderer** is
asked to animate the already-settled result. The **math** module re-implements the rules
independently for exact analysis, and the tests require all implementations to agree.

## Documentation

- [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) - concept, rules, presentation, accessibility
- [docs/SPECIFICATION.md](docs/SPECIFICATION.md) - symbols, paytable, paylines, reel strips (generated)
- [docs/MATHEMATICS.md](docs/MATHEMATICS.md) - definitions, evaluation rules, exact and simulation methods
- [docs/RTP_REPORT.md](docs/RTP_REPORT.md) - theoretical vs simulated results (generated)
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md) - every parameter, validation, safe change workflow
- [docs/SECURITY.md](docs/SECURITY.md) - RNG, integrity measures, prototype limitations
- [docs/REGULATORY_READINESS.md](docs/REGULATORY_READINESS.md) - roadmap to certification and platform integration
- [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) - observed test results

## Known limitations

- Client-side prototype: outcomes are generated in the browser, which the player
  controls. Real-money use requires server-side outcome generation and settlement.
- The RNG has not been independently tested or certified.
- The 5,000x round cap is enforced but practically unreachable with the shipped strips;
  probabilities below about 1e-13 are not resolved by the analysis and are reported as
  "below floor".
- Simulation confidence intervals use the normal approximation; with heavy-tailed
  returns they are approximate for short runs.
- No sound, no autoplay of paid spins, no persistence between page loads (history and
  balance reset on reload), no responsible-gambling tooling beyond play-money
  disclaimers.
- The volatility class uses a documented project heuristic, not an industry standard.
- Fast spin, quick stop and win celebrations may be restricted in some regulated markets.

## License

Original code and artwork for evaluation purposes. No license is granted for
commercial gambling use.
