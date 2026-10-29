# Game specification: Gilded Orbit 1.0.0

Generated from `config/game.config.json` by `npm run report` on 2026-10-29T09:27:13.983Z. Configuration hash (SHA-256 of canonical JSON): `8df5b9f95243fb82ac8cb27ba0ef7324fd64bc5e1213ae0a959cae5bb24f194f`. The configuration file is authoritative; this document is a readable rendering of it.

## Grid, bets and limits

| Parameter | Value |
|---|---|
| Reels x rows | 5 x 3 |
| Paylines | 20, fixed (all always active) |
| Line bet options (credits) | 1, 2, 5, 10, 25, 50 |
| Total bet options (credits) | 20, 40, 100, 200, 500, 1000 |
| Default line bet | 1 |
| Starting play-money balance | 100000 |
| Round win cap | 5000 x total bet |
| RTP design target | 96.00% (a target, not a guarantee; see RTP_REPORT.md) |

## Symbols and line pays

Line pays are multiples of the line bet for a left-to-right combination of exactly that length starting on reel 1 (a longer combination than listed pays the largest listed length).

| Id | Name | Kind | Tier | 3 of a kind | 4 of a kind | 5 of a kind |
|---|---|---|---|---|---|---|
| `JADE` | Jade Facet | regular | low | 5 | 15 | 50 |
| `SAPPHIRE` | Sapphire Drop | regular | low | 5 | 20 | 75 |
| `RUBY` | Ruby Prism | regular | low | 10 | 25 | 100 |
| `AMETHYST` | Amethyst Spire | regular | low | 10 | 30 | 125 |
| `COMET` | Comet | regular | high | 15 | 50 | 200 |
| `MOON` | Crescent Moon | regular | high | 20 | 75 | 300 |
| `PLANET` | Ringed Planet | regular | high | 25 | 100 | 400 |
| `SUN` | Sun Crown | regular | premium | 50 | 200 | 1000 |
| `WILD` | Nova Wild | wild | special | 50 | 250 | 2000 |
| `SCATTER` | Orbit Scatter | scatter | special | see scatter | see scatter | see scatter |

- **Nova Wild** (`WILD`) substitutes for every regular symbol, never for Orbit Scatter. Its own row above is the Wild-only combination.
- **Orbit Scatter** (`SCATTER`) pays by count anywhere in the window, as a multiple of the total bet, and selects the free-spins award.

| Scatters visible | Scatter pay (x total bet) | Free spins (base game) | Free spins (retrigger) |
|---|---|---|---|
| 3 | 2 | 10 | 10 |
| 4 | 10 | 10 | 10 |
| 5 or more | 100 | 10 | 10 |

## Modes and multipliers

| Mode | Reel set | Wild multiplier (once per line win containing a Wild) | Win multiplier (all wins) | Scatter pays |
|---|---|---|---|---|
| base | base | 1 | 1 | yes |
| free | free | 2 | 2 | yes |

Retriggers: enabled; maximum free spins per feature: 50 (awards that would exceed it are truncated).

## Paylines

Row indices are 0 = top, 1 = middle, 2 = bottom, listed for reels 1 to 5.

| Line | Rows | Shape |
|---|---|---|
| 1 | [1, 1, 1, 1, 1] | <code>. . . . .<br>X X X X X<br>. . . . .</code> |
| 2 | [0, 0, 0, 0, 0] | <code>X X X X X<br>. . . . .<br>. . . . .</code> |
| 3 | [2, 2, 2, 2, 2] | <code>. . . . .<br>. . . . .<br>X X X X X</code> |
| 4 | [0, 1, 2, 1, 0] | <code>X . . . X<br>. X . X .<br>. . X . .</code> |
| 5 | [2, 1, 0, 1, 2] | <code>. . X . .<br>. X . X .<br>X . . . X</code> |
| 6 | [0, 0, 1, 2, 2] | <code>X X . . .<br>. . X . .<br>. . . X X</code> |
| 7 | [2, 2, 1, 0, 0] | <code>. . . X X<br>. . X . .<br>X X . . .</code> |
| 8 | [1, 0, 0, 0, 1] | <code>. X X X .<br>X . . . X<br>. . . . .</code> |
| 9 | [1, 2, 2, 2, 1] | <code>. . . . .<br>X . . . X<br>. X X X .</code> |
| 10 | [0, 1, 1, 1, 0] | <code>X . . . X<br>. X X X .<br>. . . . .</code> |
| 11 | [2, 1, 1, 1, 2] | <code>. . . . .<br>. X X X .<br>X . . . X</code> |
| 12 | [1, 0, 1, 2, 1] | <code>. X . . .<br>X . X . X<br>. . . X .</code> |
| 13 | [1, 2, 1, 0, 1] | <code>. . . X .<br>X . X . X<br>. X . . .</code> |
| 14 | [0, 1, 0, 1, 0] | <code>X . X . X<br>. X . X .<br>. . . . .</code> |
| 15 | [2, 1, 2, 1, 2] | <code>. . . . .<br>. X . X .<br>X . X . X</code> |
| 16 | [1, 1, 0, 1, 1] | <code>. . X . .<br>X X . X X<br>. . . . .</code> |
| 17 | [1, 1, 2, 1, 1] | <code>. . . . .<br>X X . X X<br>. . X . .</code> |
| 18 | [0, 2, 0, 2, 0] | <code>X . X . X<br>. . . . .<br>. X . X .</code> |
| 19 | [2, 0, 2, 0, 2] | <code>. X . X .<br>. . . . .<br>X . X . X</code> |
| 20 | [0, 2, 2, 2, 0] | <code>X . . . X<br>. . . . .<br>. X X X .</code> |

## Reel strips

Each strip is a cyclic list of physical stops. A spin draws one stop per reel uniformly at random (all weights are 1 unless listed). For stop s, the window shows stops s, s+1, s+2 (mod strip length) in the top, middle and bottom rows.

### Reel set `base`

| Symbol | Reel 1 | Reel 2 | Reel 3 | Reel 4 | Reel 5 |
|---|---|---|---|---|---|
| `JADE` | 8 | 6 | 6 | 6 | 7 |
| `SAPPHIRE` | 7 | 6 | 6 | 6 | 8 |
| `RUBY` | 6 | 6 | 6 | 6 | 6 |
| `AMETHYST` | 6 | 5 | 6 | 6 | 4 |
| `COMET` | 3 | 5 | 4 | 5 | 4 |
| `MOON` | 3 | 4 | 4 | 4 | 3 |
| `PLANET` | 3 | 3 | 3 | 3 | 3 |
| `SUN` | 2 | 1 | 1 | 1 | 2 |
| `WILD` | 1 | 3 | 2 | 2 | 2 |
| `SCATTER` | 1 | 1 | 2 | 1 | 1 |
| **Stops** | **40** | **40** | **40** | **40** | **40** |

Reel 1:

```
 0 WILD         1 PLANET       2 SAPPHIRE     3 JADE         4 RUBY
 5 SUN          6 SAPPHIRE     7 AMETHYST     8 SAPPHIRE     9 JADE
10 RUBY        11 COMET       12 JADE        13 COMET       14 SAPPHIRE
15 SUN         16 SAPPHIRE    17 AMETHYST    18 JADE        19 RUBY
20 AMETHYST    21 MOON        22 JADE        23 AMETHYST    24 SCATTER
25 JADE        26 AMETHYST    27 RUBY        28 PLANET      29 JADE
30 RUBY        31 COMET       32 AMETHYST    33 MOON        34 SAPPHIRE
35 RUBY        36 JADE        37 SAPPHIRE    38 MOON        39 PLANET
```

Reel 2:

```
 0 RUBY         1 COMET        2 PLANET       3 SAPPHIRE     4 AMETHYST
 5 SAPPHIRE     6 MOON         7 WILD         8 COMET        9 JADE
10 SUN         11 RUBY        12 PLANET      13 WILD        14 AMETHYST
15 RUBY        16 COMET       17 SCATTER     18 RUBY        19 JADE
20 RUBY        21 WILD        22 MOON        23 SAPPHIRE    24 JADE
25 COMET       26 SAPPHIRE    27 MOON        28 JADE        29 COMET
30 PLANET      31 SAPPHIRE    32 JADE        33 AMETHYST    34 RUBY
35 SAPPHIRE    36 AMETHYST    37 MOON        38 JADE        39 AMETHYST
```

Reel 3:

```
 0 JADE         1 PLANET       2 SAPPHIRE     3 WILD         4 MOON
 5 AMETHYST     6 SUN          7 MOON         8 RUBY         9 COMET
10 SCATTER     11 SAPPHIRE    12 AMETHYST    13 JADE        14 AMETHYST
15 JADE        16 SCATTER     17 RUBY        18 JADE        19 SAPPHIRE
20 AMETHYST    21 SAPPHIRE    22 PLANET      23 RUBY        24 SAPPHIRE
25 JADE        26 AMETHYST    27 COMET       28 PLANET      29 JADE
30 AMETHYST    31 COMET       32 MOON        33 RUBY        34 MOON
35 COMET       36 RUBY        37 SAPPHIRE    38 WILD        39 RUBY
```

Reel 4:

```
 0 SAPPHIRE     1 AMETHYST     2 SAPPHIRE     3 JADE         4 RUBY
 5 SCATTER      6 JADE         7 SAPPHIRE     8 AMETHYST     9 COMET
10 WILD        11 COMET       12 AMETHYST    13 PLANET      14 SUN
15 COMET       16 MOON        17 AMETHYST    18 MOON        19 PLANET
20 RUBY        21 COMET       22 JADE        23 AMETHYST    24 SAPPHIRE
25 RUBY        26 MOON        27 SAPPHIRE    28 RUBY        29 SAPPHIRE
30 JADE        31 RUBY        32 MOON        33 RUBY        34 PLANET
35 JADE        36 AMETHYST    37 COMET       38 JADE        39 WILD
```

Reel 5:

```
 0 COMET        1 PLANET       2 MOON         3 COMET        4 SAPPHIRE
 5 MOON         6 SAPPHIRE     7 PLANET       8 SUN          9 RUBY
10 JADE        11 WILD        12 SAPPHIRE    13 JADE        14 RUBY
15 AMETHYST    16 RUBY        17 AMETHYST    18 SAPPHIRE    19 JADE
20 SAPPHIRE    21 JADE        22 RUBY        23 AMETHYST    24 SUN
25 RUBY        26 JADE        27 PLANET      28 JADE        29 COMET
30 SAPPHIRE    31 COMET       32 JADE        33 WILD        34 AMETHYST
35 SAPPHIRE    36 MOON        37 SAPPHIRE    38 RUBY        39 SCATTER
```

### Reel set `free`

| Symbol | Reel 1 | Reel 2 | Reel 3 | Reel 4 | Reel 5 |
|---|---|---|---|---|---|
| `JADE` | 5 | 5 | 5 | 5 | 5 |
| `SAPPHIRE` | 5 | 5 | 5 | 5 | 5 |
| `RUBY` | 5 | 5 | 5 | 5 | 5 |
| `AMETHYST` | 5 | 5 | 5 | 5 | 5 |
| `COMET` | 5 | 5 | 5 | 5 | 5 |
| `MOON` | 4 | 4 | 4 | 4 | 4 |
| `PLANET` | 4 | 4 | 4 | 4 | 4 |
| `SUN` | 2 | 2 | 2 | 2 | 2 |
| `WILD` | 2 | 3 | 3 | 3 | 2 |
| `SCATTER` | 1 | 1 | 1 | 1 | 1 |
| **Stops** | **38** | **39** | **39** | **39** | **38** |

Reel 1:

```
 0 MOON         1 JADE         2 SCATTER      3 PLANET       4 MOON
 5 RUBY         6 COMET        7 JADE         8 WILD         9 AMETHYST
10 RUBY        11 SUN         12 SAPPHIRE    13 MOON        14 SUN
15 COMET       16 AMETHYST    17 COMET       18 RUBY        19 SAPPHIRE
20 RUBY        21 COMET       22 RUBY        23 MOON        24 AMETHYST
25 PLANET      26 JADE        27 SAPPHIRE    28 AMETHYST    29 SAPPHIRE
30 PLANET      31 AMETHYST    32 COMET       33 PLANET      34 WILD
35 JADE        36 SAPPHIRE    37 JADE
```

Reel 2:

```
 0 SUN          1 PLANET       2 WILD         3 AMETHYST     4 SCATTER
 5 PLANET       6 WILD         7 RUBY         8 SAPPHIRE     9 MOON
10 AMETHYST    11 SAPPHIRE    12 MOON        13 RUBY        14 SAPPHIRE
15 SUN         16 AMETHYST    17 COMET       18 JADE        19 SAPPHIRE
20 JADE        21 COMET       22 PLANET      23 COMET       24 MOON
25 JADE        26 RUBY        27 WILD        28 AMETHYST    29 JADE
30 MOON        31 COMET       32 RUBY        33 JADE        34 AMETHYST
35 RUBY        36 SAPPHIRE    37 COMET       38 PLANET
```

Reel 3:

```
 0 COMET        1 RUBY         2 WILD         3 AMETHYST     4 SAPPHIRE
 5 COMET        6 SAPPHIRE     7 JADE         8 MOON         9 PLANET
10 MOON        11 PLANET      12 AMETHYST    13 COMET       14 SUN
15 AMETHYST    16 RUBY        17 WILD        18 JADE        19 COMET
20 AMETHYST    21 PLANET      22 MOON        23 SAPPHIRE    24 RUBY
25 SUN         26 JADE        27 RUBY        28 PLANET      29 SAPPHIRE
30 WILD        31 SAPPHIRE    32 AMETHYST    33 COMET       34 MOON
35 JADE        36 SCATTER     37 RUBY        38 JADE
```

Reel 4:

```
 0 WILD         1 SAPPHIRE     2 COMET        3 SAPPHIRE     4 RUBY
 5 SAPPHIRE     6 AMETHYST     7 PLANET       8 COMET        9 PLANET
10 AMETHYST    11 MOON        12 AMETHYST    13 SUN         14 RUBY
15 MOON        16 COMET       17 SCATTER     18 PLANET      19 RUBY
20 JADE        21 AMETHYST    22 JADE        23 MOON        24 SAPPHIRE
25 COMET       26 JADE        27 AMETHYST    28 JADE        29 PLANET
30 COMET       31 WILD        32 RUBY        33 MOON        34 WILD
35 SAPPHIRE    36 SUN         37 RUBY        38 JADE
```

Reel 5:

```
 0 RUBY         1 SCATTER      2 COMET        3 SAPPHIRE     4 PLANET
 5 SUN          6 PLANET       7 AMETHYST     8 RUBY         9 PLANET
10 AMETHYST    11 JADE        12 AMETHYST    13 SAPPHIRE    14 COMET
15 PLANET      16 MOON        17 COMET       18 WILD        19 COMET
20 SAPPHIRE    21 AMETHYST    22 RUBY        23 JADE        24 SAPPHIRE
25 RUBY        26 JADE        27 SAPPHIRE    28 JADE        29 RUBY
30 MOON        31 SUN         32 WILD        33 COMET       34 MOON
35 AMETHYST    36 MOON        37 JADE
```
