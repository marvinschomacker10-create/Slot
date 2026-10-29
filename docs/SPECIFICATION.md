# Game specification: Pixel-Pauker 2.0.0

Generated from `config/game.config.json` by `npm run report` on 2026-10-29T15:17:48.272Z. Configuration hash (SHA-256 of canonical JSON): `4c02cc0a66428bfc140cc19b87b5e2621622b0d807327e85fc55ddee832e47b2`. The configuration file is authoritative; this document is a readable rendering of it.

## Grid, bets and limits

| Parameter | Value |
|---|---|
| Reels x rows | 5 x 3 |
| Paylines | 20, fixed (all always active) |
| Line bet options (credits) | 1, 2, 5, 10, 25, 50 |
| Total bet options (credits) | 20, 40, 100, 200, 500, 1000 |
| Default line bet | 1 |
| Starting play-money balance | 10000 |
| Round win cap | 5000 x total bet |
| RTP design target | 96.00% (a target, not a guarantee; see RTP_REPORT.md) |

## Symbols and line pays

Line pays are multiples of the line bet for a left-to-right combination of exactly that length starting on reel 1 (a longer combination than listed pays the largest listed length).

| Id | Name | Kind | Tier | 3 of a kind | 4 of a kind | 5 of a kind |
|---|---|---|---|---|---|---|
| `RULER` | Lineal | regular | low | 5 | 15 | 50 |
| `PENCIL` | Bleistift | regular | low | 5 | 20 | 75 |
| `ERASER` | Radiergummi | regular | low | 10 | 25 | 100 |
| `CHALK` | Kreide | regular | low | 10 | 30 | 125 |
| `BOOK` | Schulbuch | regular | high | 15 | 50 | 200 |
| `APPLE` | Apfel | regular | high | 20 | 75 | 300 |
| `GLOBE` | Globus | regular | high | 25 | 100 | 400 |
| `TEACHER` | Lehrer | regular | premium | 50 | 200 | 1000 |
| `WILD` | Direktorin | wild | special | 50 | 250 | 2000 |
| `SCATTER` | Schulglocke | scatter | special | see scatter | see scatter | see scatter |

- **Direktorin** (`WILD`) substitutes for every regular symbol, never for Schulglocke. Its own row above is the Wild-only combination.
- **Schulglocke** (`SCATTER`) pays by count anywhere in the window, as a multiple of the total bet, and selects the free-spins award.

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
| `RULER` | 8 | 6 | 6 | 6 | 7 |
| `PENCIL` | 7 | 6 | 6 | 6 | 8 |
| `ERASER` | 6 | 6 | 6 | 6 | 6 |
| `CHALK` | 6 | 5 | 6 | 6 | 4 |
| `BOOK` | 3 | 5 | 4 | 5 | 4 |
| `APPLE` | 3 | 4 | 4 | 4 | 3 |
| `GLOBE` | 3 | 3 | 3 | 3 | 3 |
| `TEACHER` | 2 | 1 | 1 | 1 | 2 |
| `WILD` | 1 | 3 | 2 | 2 | 2 |
| `SCATTER` | 1 | 1 | 2 | 1 | 1 |
| **Stops** | **40** | **40** | **40** | **40** | **40** |

Reel 1:

```
 0 WILD         1 GLOBE        2 PENCIL       3 RULER        4 ERASER
 5 TEACHER      6 PENCIL       7 CHALK        8 PENCIL       9 RULER
10 ERASER      11 BOOK        12 RULER       13 BOOK        14 PENCIL
15 TEACHER     16 PENCIL      17 CHALK       18 RULER       19 ERASER
20 CHALK       21 APPLE       22 RULER       23 CHALK       24 SCATTER
25 RULER       26 CHALK       27 ERASER      28 GLOBE       29 RULER
30 ERASER      31 BOOK        32 CHALK       33 APPLE       34 PENCIL
35 ERASER      36 RULER       37 PENCIL      38 APPLE       39 GLOBE
```

Reel 2:

```
 0 ERASER       1 BOOK         2 GLOBE        3 PENCIL       4 CHALK
 5 PENCIL       6 APPLE        7 WILD         8 BOOK         9 RULER
10 TEACHER     11 ERASER      12 GLOBE       13 WILD        14 CHALK
15 ERASER      16 BOOK        17 SCATTER     18 ERASER      19 RULER
20 ERASER      21 WILD        22 APPLE       23 PENCIL      24 RULER
25 BOOK        26 PENCIL      27 APPLE       28 RULER       29 BOOK
30 GLOBE       31 PENCIL      32 RULER       33 CHALK       34 ERASER
35 PENCIL      36 CHALK       37 APPLE       38 RULER       39 CHALK
```

Reel 3:

```
 0 RULER        1 GLOBE        2 PENCIL       3 WILD         4 APPLE
 5 CHALK        6 TEACHER      7 APPLE        8 ERASER       9 BOOK
10 SCATTER     11 PENCIL      12 CHALK       13 RULER       14 CHALK
15 RULER       16 SCATTER     17 ERASER      18 RULER       19 PENCIL
20 CHALK       21 PENCIL      22 GLOBE       23 ERASER      24 PENCIL
25 RULER       26 CHALK       27 BOOK        28 GLOBE       29 RULER
30 CHALK       31 BOOK        32 APPLE       33 ERASER      34 APPLE
35 BOOK        36 ERASER      37 PENCIL      38 WILD        39 ERASER
```

Reel 4:

```
 0 PENCIL       1 CHALK        2 PENCIL       3 RULER        4 ERASER
 5 SCATTER      6 RULER        7 PENCIL       8 CHALK        9 BOOK
10 WILD        11 BOOK        12 CHALK       13 GLOBE       14 TEACHER
15 BOOK        16 APPLE       17 CHALK       18 APPLE       19 GLOBE
20 ERASER      21 BOOK        22 RULER       23 CHALK       24 PENCIL
25 ERASER      26 APPLE       27 PENCIL      28 ERASER      29 PENCIL
30 RULER       31 ERASER      32 APPLE       33 ERASER      34 GLOBE
35 RULER       36 CHALK       37 BOOK        38 RULER       39 WILD
```

Reel 5:

```
 0 BOOK         1 GLOBE        2 APPLE        3 BOOK         4 PENCIL
 5 APPLE        6 PENCIL       7 GLOBE        8 TEACHER      9 ERASER
10 RULER       11 WILD        12 PENCIL      13 RULER       14 ERASER
15 CHALK       16 ERASER      17 CHALK       18 PENCIL      19 RULER
20 PENCIL      21 RULER       22 ERASER      23 CHALK       24 TEACHER
25 ERASER      26 RULER       27 GLOBE       28 RULER       29 BOOK
30 PENCIL      31 BOOK        32 RULER       33 WILD        34 CHALK
35 PENCIL      36 APPLE       37 PENCIL      38 ERASER      39 SCATTER
```

### Reel set `free`

| Symbol | Reel 1 | Reel 2 | Reel 3 | Reel 4 | Reel 5 |
|---|---|---|---|---|---|
| `RULER` | 5 | 5 | 5 | 5 | 5 |
| `PENCIL` | 5 | 5 | 5 | 5 | 5 |
| `ERASER` | 5 | 5 | 5 | 5 | 5 |
| `CHALK` | 5 | 5 | 5 | 5 | 5 |
| `BOOK` | 5 | 5 | 5 | 5 | 5 |
| `APPLE` | 4 | 4 | 4 | 4 | 4 |
| `GLOBE` | 4 | 4 | 4 | 4 | 4 |
| `TEACHER` | 2 | 2 | 2 | 2 | 2 |
| `WILD` | 2 | 3 | 3 | 3 | 2 |
| `SCATTER` | 1 | 1 | 1 | 1 | 1 |
| **Stops** | **38** | **39** | **39** | **39** | **38** |

Reel 1:

```
 0 APPLE        1 RULER        2 SCATTER      3 GLOBE        4 APPLE
 5 ERASER       6 BOOK         7 RULER        8 WILD         9 CHALK
10 ERASER      11 TEACHER     12 PENCIL      13 APPLE       14 TEACHER
15 BOOK        16 CHALK       17 BOOK        18 ERASER      19 PENCIL
20 ERASER      21 BOOK        22 ERASER      23 APPLE       24 CHALK
25 GLOBE       26 RULER       27 PENCIL      28 CHALK       29 PENCIL
30 GLOBE       31 CHALK       32 BOOK        33 GLOBE       34 WILD
35 RULER       36 PENCIL      37 RULER
```

Reel 2:

```
 0 TEACHER      1 GLOBE        2 WILD         3 CHALK        4 SCATTER
 5 GLOBE        6 WILD         7 ERASER       8 PENCIL       9 APPLE
10 CHALK       11 PENCIL      12 APPLE       13 ERASER      14 PENCIL
15 TEACHER     16 CHALK       17 BOOK        18 RULER       19 PENCIL
20 RULER       21 BOOK        22 GLOBE       23 BOOK        24 APPLE
25 RULER       26 ERASER      27 WILD        28 CHALK       29 RULER
30 APPLE       31 BOOK        32 ERASER      33 RULER       34 CHALK
35 ERASER      36 PENCIL      37 BOOK        38 GLOBE
```

Reel 3:

```
 0 BOOK         1 ERASER       2 WILD         3 CHALK        4 PENCIL
 5 BOOK         6 PENCIL       7 RULER        8 APPLE        9 GLOBE
10 APPLE       11 GLOBE       12 CHALK       13 BOOK        14 TEACHER
15 CHALK       16 ERASER      17 WILD        18 RULER       19 BOOK
20 CHALK       21 GLOBE       22 APPLE       23 PENCIL      24 ERASER
25 TEACHER     26 RULER       27 ERASER      28 GLOBE       29 PENCIL
30 WILD        31 PENCIL      32 CHALK       33 BOOK        34 APPLE
35 RULER       36 SCATTER     37 ERASER      38 RULER
```

Reel 4:

```
 0 WILD         1 PENCIL       2 BOOK         3 PENCIL       4 ERASER
 5 PENCIL       6 CHALK        7 GLOBE        8 BOOK         9 GLOBE
10 CHALK       11 APPLE       12 CHALK       13 TEACHER     14 ERASER
15 APPLE       16 BOOK        17 SCATTER     18 GLOBE       19 ERASER
20 RULER       21 CHALK       22 RULER       23 APPLE       24 PENCIL
25 BOOK        26 RULER       27 CHALK       28 RULER       29 GLOBE
30 BOOK        31 WILD        32 ERASER      33 APPLE       34 WILD
35 PENCIL      36 TEACHER     37 ERASER      38 RULER
```

Reel 5:

```
 0 ERASER       1 SCATTER      2 BOOK         3 PENCIL       4 GLOBE
 5 TEACHER      6 GLOBE        7 CHALK        8 ERASER       9 GLOBE
10 CHALK       11 RULER       12 CHALK       13 PENCIL      14 BOOK
15 GLOBE       16 APPLE       17 BOOK        18 WILD        19 BOOK
20 PENCIL      21 CHALK       22 ERASER      23 RULER       24 PENCIL
25 ERASER      26 RULER       27 PENCIL      28 RULER       29 ERASER
30 APPLE       31 TEACHER     32 WILD        33 BOOK        34 APPLE
35 CHALK       36 APPLE       37 RULER
```
