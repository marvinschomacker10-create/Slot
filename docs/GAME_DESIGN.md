# Game design: Pixel-Pauker

An original five-reel, three-row, 20-line video slot set in a classroom, drawn entirely
in pixel art, with a German user interface. **Play-money prototype** - credits have no
monetary value and cannot be bought or cashed out.

Exact parameters (paytable, paylines, reel strips) are generated into
[SPECIFICATION.md](SPECIFICATION.md); the mathematics and its verification are in
[MATHEMATICS.md](MATHEMATICS.md) and [RTP_REPORT.md](RTP_REPORT.md).

## Concept

A school day as a slot machine. The page is a green chalkboard, the header and the
control dock are wooden ledges, the reel cells are squared exercise-book paper
("Karopapier"), and wins are marked in red pen the way a teacher marks an answer. Low
symbols are classroom supplies, high symbols are things on the teacher's desk, the
premium symbol is the teacher, the **Direktorin** (head teacher) is the Wild, and the
**Schulglocke** (school bell) is the Scatter that rings in the free spins, themed as
"Hitzefrei" (the day off German schools give when it is too hot). Big wins are
announced as school grades ("Gut gemacht!", "Sehr gut!", "Eins mit Sternchen!").

All artwork is original pixel art generated from code on a 32 x 32 grid
(`src/assets/pixel/`): every sprite is a small program of rectangles, lines, ellipses
and ASCII patterns, exported as SVG with `shape-rendering="crispEdges"` so it stays
pixel-sharp at any size. The renderer samples the sprites with nearest-neighbour
filtering, and the interface uses the pixel font "Press Start 2P" (SIL Open Font
License, bundled via @fontsource). Symbols are mapped by configuration id in
`src/render/theme.ts`, so artwork can be replaced without touching game logic.

## Symbols

| Tier    | Symbols (id)                                                                     | Role                                                                         |
| ------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Low     | Lineal (`RULER`), Bleistift (`PENCIL`), Radiergummi (`ERASER`), Kreide (`CHALK`) | Frequent small wins                                                          |
| High    | Schulbuch (`BOOK`), Apfel (`APPLE`), Globus (`GLOBE`)                            | Medium wins                                                                  |
| Premium | Lehrer (`TEACHER`)                                                               | Top regular symbol (1,000x line bet for five)                                |
| Special | Direktorin (`WILD`)                                                              | Substitutes for all regular symbols; five Wilds pay 2,000x line bet          |
| Special | Schulglocke (`SCATTER`)                                                          | Pays anywhere (2x / 10x / 100x total bet for 3 / 4 / 5); 3+ start free spins |

The theme change (version 2.0.0) only renamed symbol ids; paytable, paylines and reel
strips are unchanged, so the mathematics below is identical to the previous version.

## Rules

- 5 reels x 3 rows, 20 fixed paylines (all always played). Total bet = 20 x line bet;
  line bets 1, 2, 5, 10, 25, 50 credits.
- Line wins pay left to right from reel 1. Only the highest win per payline is paid;
  wins on different paylines add up.
- The Wild substitutes for every regular symbol but not for the Scatter. If a run of
  Wilds alone pays more than the substituted combination, the Wild combination is paid.
- Scatter wins are independent of paylines and add to line wins.
- 3 or more Scatters on a paid spin award **10 free spins**, played at the triggering
  bet without any stake.
- **Free spins:** a richer reel set with more Wilds and high symbols; every win is
  multiplied by 2 and line wins that include a Wild are multiplied by a further 2
  (once per line, not per Wild). 3+ Scatters during free spins award 10 more spins, up
  to 50 free spins per feature.
- The total win of one round (paid spin plus its free spins) is capped at 5,000x the
  total bet; the round ends when the cap is reached.
- Displayed wins are credits added to the balance and never include the stake.

## Play-money wallet and allowance ("Taschengeld")

- A new wallet starts with 10,000 play-money credits.
- **Allowance:** every 10 minutes the player can collect 1,000 credits with the
  "abholen" button (or the G key). The first allowance is available one interval after
  the wallet was created, each later one an interval after the previous collection.
  Uncollected allowances do **not** accumulate - after a long break there is still only
  one to collect. Amount and interval are configuration values (`session.allowance`).
- The allowance is a play-money top-up, not a game result: it is booked in the ledger
  as a `grant`, shown separately in the statistics ("Taschengeld abgeholt") and never
  counted as a win or in any RTP figure.
- There is no reset button in the production build; when the balance is too low for
  the bet, the game shows the countdown to the next allowance (and suggests a lower bet
  if one is affordable). A wallet reset exists only in the development diagnostics.
- The wallet - balance, bet, allowance timer and an unfinished free-spins round - is
  saved in the browser (`localStorage`) after every settled change. After a reload the
  game continues where it stopped, including the remaining free spins of an interrupted
  feature (they are owed to the player: the stake was already settled). Saved data is
  validated field by field; anything inconsistent is ignored. The game history and the
  session statistics are per tab and are not saved.
- Tabs of the same browser share the wallet: the newest save wins and is adopted by an
  idle tab. A restored or adopted free-spins round waits for the player's first press
  instead of auto-playing.
- A clock that is turned back cannot lock the wallet for more than one interval: a
  timestamp from the future is reset to the load time.

All of these are configuration values (see [CONFIGURATION.md](CONFIGURATION.md)).

## Mathematical profile (exact values for the shipped configuration)

| Metric                                  | Value                                                       |
| --------------------------------------- | ----------------------------------------------------------- |
| Total RTP (per unit of base-game stake) | 96.0022% (target 96.00%)                                    |
| Base game / free-spins contribution     | 70.17% / 25.83%                                             |
| Hit frequency (round pays anything)     | 51.68%                                                      |
| Net-positive rounds                     | 16.74%                                                      |
| Free spins                              | 1 in 168.8 paid spins; 10.43 spins and 43.6x bet on average |
| Standard deviation per unit stake       | 4.82 (medium on the documented heuristic scale)             |
| Largest single base / free spin         | 153.75x / 615x total bet                                    |

The design aims for a frequent-hit, medium-volatility game: about 31% of rounds return
something below the stake, so the base game feels active, while the feature carries a
quarter of the return. The 5,000x cap is configured and enforced but is practically
unreachable with these strips (its probability is below the analysis's numerical floor);
the [RTP report](RTP_REPORT.md) documents this explicitly rather than implying a
5,000x prize is realistic.

## Presentation

- **Settle first, animate second.** Pressing DREHEN debits the stake and resolves the
  whole spin in the engine; the reels then animate towards the settled stops. Balance
  shows the stake immediately and the win only after the reels land; free-spin counters
  and feature totals likewise follow what has been revealed, never the settled future.
- **Reels:** a wooden picture frame around a chalkboard with paper cells; constant-speed
  spin, left-to-right landing with a short bounce; _anticipation_ (longer spin and a
  blinking red-pen box) on the remaining reels when two Schulglocken have already
  landed. Pressing DREHEN again (or Space) stops the reels quickly.
- **Wins:** winning symbols pulse inside red-pen squares, other symbols dim, each
  winning payline is drawn as a felt-tip line with a dark outline and its number at both
  ends (identity never relies on colour alone), and the message bar cycles through every
  win ("Linie 6: 4 × Radiergummi zahlt 25"). Wins of 15x / 50x / 200x the bet show
  grade banners ("Gut gemacht!", "Sehr gut!", "Eins mit Sternchen!") with a burst of
  pixel confetti; the counted-up number always ends exactly on the settled amount.
- **Free spins ("Hitzefrei"):** a banner announces the award, the board behind the
  reels turns warm with a pulsing sun-yellow chalk line, the button turns yellow and
  reads FREI, a counter shows spins played and the feature total, and a closing banner
  shows the feature win.
- **Ambience:** slowly rising chalk dust in front of the board (off with reduced
  motion).
- **Fast spin** shortens animation only. **Reduced motion** (on automatically when the
  operating system requests it) removes reel motion, particles and pulsing. Both still
  run the full evaluation.
- **Layout:** desktop keeps everything in one viewport with the reels taking the free
  space; on phones the controls stack under the reels. The Phaser canvas renders at
  device-pixel resolution.

## Information screens

- **Paytable and rules** - generated from the configuration at the current bet, with
  all 20 payline diagrams and the theoretical RTP (only if the bundled analysis matches
  the configuration hash).
- **Help** - how to play, the allowance rules, keyboard shortcuts, and the play-money
  disclaimer with a pointer to gambling-support services.
- **History** - the last 200 rounds with each spin's stops, window and wins.
- **Statistics** - this session; the exact theoretical model (RTP split, hit rate,
  volatility, a chart of where the RTP comes from by payout size with an accessible table);
  and an in-browser simulation (100k or 1M rounds in a Web Worker) compared with the
  exact values.
- **Developer diagnostics** (development builds only) - configuration hash and warnings,
  RNG mode, renderer, displayed-vs-settled check, ledger integrity check, last spin
  record, active configuration.

## Accessibility

Keyboard play (Space/Enter spin, +/- or arrows for the bet, T fast spin, G collect the
allowance, P/H/S panels, Esc closes dialogs), visible focus, labelled controls, dialogs with focus trapping and
focus restore, a polite live region announcing each result, a screen-reader table of
the visible symbols, and reduced-motion support.

## Out of scope for the prototype

Sound, autoplay of paid spins, gamble/double-up features, jackpots, bonus buys, buying
play money, real money, player accounts, and any backend.
