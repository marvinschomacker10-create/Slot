# Configuration reference

All gameplay parameters live in **`config/game.config.json`**. The engine, the exact
analysis, the simulator and the UI all read this one file; the rendering code contains
no gameplay values. Types are in `src/config/types.ts`, validation in
`src/config/validate.ts`.

```bash
npm run validate-config                          # validate the bundled file
npm run validate-config -- --config my.json      # validate another file
```

Validation reports every problem with its JSON path, for example
`paytable.line.SUN.4: pays less (40) than the shorter combination "3" (50)`. Invalid
configurations are refused by the game, the analysis and the simulator alike.

## Parameters

| Path                                                       | Type              | Meaning                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta.id`, `meta.name`, `meta.version`, `meta.description` | string            | Identification; shown in the UI and reports.                                                                                                                                                                                                                                |
| `grid.reels`                                               | integer 3-7       | Number of reels (5).                                                                                                                                                                                                                                                        |
| `grid.rows`                                                | integer 1-6       | Visible rows per reel (3).                                                                                                                                                                                                                                                  |
| `symbols[]`                                                | array             | Symbol definitions: `id` (upper-case identifier), `name`, `kind` (`regular`, `wild`, `scatter`), `tier` (`low`, `high`, `premium`, `special`), optional `description`. Exactly one `wild` and one `scatter` are required.                                                   |
| `paytable.line.<SYMBOL>`                                   | count table       | Line pays as multiples of the **line bet** for left-to-right combinations of that length. Every regular symbol must have an entry; the Wild entry is the Wild-only combination; Scatter must not appear. Longer combinations may not pay less than shorter ones.            |
| `paytable.scatter`                                         | count table       | Scatter pays as multiples of the **total bet**, by number visible anywhere.                                                                                                                                                                                                 |
| `paylines[]`                                               | array of arrays   | Each payline lists the row index (0 = top) on each reel, left to right. Exactly `grid.reels` indices, each in range; duplicate paylines are rejected. The number of paylines determines the total bet.                                                                      |
| `reelSets.<name>[]`                                        | array of strips   | One strip per reel. `symbols` is the ordered, cyclic list of physical stops (top to bottom). Optional `weights` (one positive integer per stop, total <= 2^32) turns the strip into a weighted virtual reel. A warning is issued if one reel can show two Scatters at once. |
| `modes.base`, `modes.free`                                 | object            | `reelSet` (name of a reel set), `wildMultiplier` (applied once to a line win that contains a Wild), `winMultiplier` (applied to every win in that mode).                                                                                                                    |
| `freeSpins.triggerAwards`                                  | count table       | Free spins awarded by a paid spin, by scatter count.                                                                                                                                                                                                                        |
| `freeSpins.retrigger.enabled`                              | boolean           | Whether free spins can award more free spins.                                                                                                                                                                                                                               |
| `freeSpins.retrigger.awards`                               | count table       | Additional spins per scatter count during free spins.                                                                                                                                                                                                                       |
| `freeSpins.retrigger.maxTotalSpins`                        | integer or `null` | Maximum free spins per feature (initial + retriggers); larger awards are truncated. `null` = unlimited, accepted only when the mean retrigger award per free spin is below 1 (otherwise the expected payout would be infinite).                                             |
| `freeSpins.scatterPaysInFeature`                           | boolean           | Whether scatters also pay during free spins.                                                                                                                                                                                                                                |
| `bet.lineBetOptions`                                       | integers          | Allowed line bets in credits, strictly increasing.                                                                                                                                                                                                                          |
| `bet.defaultLineBetIndex`                                  | integer           | Index of the initial line bet.                                                                                                                                                                                                                                              |
| `limits.maxWinMultiplier`                                  | integer or `null` | Round win cap as a multiple of the total bet; `null` disables it.                                                                                                                                                                                                           |
| `session.startingBalance`                                  | integer           | Play-money credits at the start of a session (and after "reset balance").                                                                                                                                                                                                   |
| `math.targetRtp`                                           | number            | Design target used by the reports and the acceptance test. It never influences outcomes.                                                                                                                                                                                    |

**Count tables** map a count (as a string key such as `"3"`) to a non-negative
integer. A count below the smallest key is worth 0; any count that is not listed (a gap
between keys or a count above the largest key) uses the value of the largest listed
count below it. Keys must be integers between 1 and the maximum possible count.

## Changing the configuration safely

1. Edit `config/game.config.json` (or regenerate strips, see below).
2. `npm run validate-config` - fix every error; review warnings.
3. `npm run analyze` - exact RTP, distribution and sensitivity for the new values.
4. `npm run simulate:1m` (or larger) and `npm run simulate:feature` - independent Monte Carlo confirmation.
5. `npm run report` - regenerates `docs/RTP_REPORT.md` and `docs/SPECIFICATION.md`.
6. `npm run test:all`.

Step 6 fails until steps 3 and 5 have been done: `tests/math/regression.test.ts`
compares the SHA-256 of the configuration with the hash stored in
`reports/analysis.json`, so a configuration change cannot pass the test suite with
stale mathematics. If the computed RTP misses the target by more than 0.05 points, the
acceptance test fails as well; the "candidate parameter changes" table in the RTP report
lists concrete single-parameter edits and their exact effect.

## Designing reel strips

`config/reel-design.json` holds per-reel symbol counts. `scripts/design-reels.ts`
arranges them into ordered strips with a seeded, constrained shuffle (no identical
neighbours, at most one Scatter per visible window, Wilds at least two stops apart) and
prints the exact RTP of the result:

```bash
npx tsx scripts/design-reels.ts           # preview
npx tsx scripts/design-reels.ts --write   # write the strips into config/game.config.json
```

Symbol counts fix the RTP; the arrangement only changes how wins cluster (hit
frequency, variance).

## Presentation settings (not gameplay)

Per-viewer UI preferences (fast spin, reduced motion, automatic free spins) are stored in
`localStorage` and never affect outcomes. Development builds additionally accept URL
parameters: `?seed=<text>` (seeded RNG for reproduction), `?turbo=1`, `?motion=reduced`.
Production builds ignore `seed` and always use the cryptographic RNG.

Symbol artwork is mapped by symbol id in `src/render/theme.ts`; replacing an SVG in
`src/assets/symbols/` changes the look without touching any game logic. A symbol without
artwork is drawn as a labelled placeholder.
