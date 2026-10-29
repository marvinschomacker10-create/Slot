# Game design: Gilded Orbit

An original five-reel, three-row, 20-line video slot with a celestial-jewel theme.
**Play-money prototype** - credits have no monetary value.

Exact parameters (paytable, paylines, reel strips) are generated into
[SPECIFICATION.md](SPECIFICATION.md); the mathematics and its verification are in
[MATHEMATICS.md](MATHEMATICS.md) and [RTP_REPORT.md](RTP_REPORT.md).

## Concept

A night sky of gemstones and celestial bodies set in gold. Four cut gems are the low
symbols, four celestial bodies the high symbols, the **Nova Wild** is a gold star burst
on a violet medallion, and the **Orbit Scatter** is an astrolabe that opens the free
spins. The interface is a dark, restrained casino aesthetic with gold accents and a
violet accent reserved for the free-spins mode.

All artwork is original, hand-written SVG (`src/assets/symbols/`). Each symbol is
mapped by its configuration id in `src/render/theme.ts`, so artwork can be replaced
without touching game logic.

## Symbols

| Tier    | Symbols (id)                                                                                      | Role                                                                         |
| ------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Low     | Jade Facet (`JADE`), Sapphire Drop (`SAPPHIRE`), Ruby Prism (`RUBY`), Amethyst Spire (`AMETHYST`) | Frequent small wins                                                          |
| High    | Comet (`COMET`), Crescent Moon (`MOON`), Ringed Planet (`PLANET`)                                 | Medium wins                                                                  |
| Premium | Sun Crown (`SUN`)                                                                                 | Top regular symbol (1,000x line bet for five)                                |
| Special | Nova Wild (`WILD`)                                                                                | Substitutes for all regular symbols; five Wilds pay 2,000x line bet          |
| Special | Orbit Scatter (`SCATTER`)                                                                         | Pays anywhere (2x / 10x / 100x total bet for 3 / 4 / 5); 3+ start free spins |

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

- **Settle first, animate second.** Pressing SPIN debits the stake and resolves the
  whole spin in the engine; the reels then animate towards the settled stops. Balance
  shows the stake immediately and the win only after the reels land; free-spin counters
  and feature totals likewise follow what has been revealed, never the settled future.
- **Reels:** constant-speed spin, left-to-right landing with a short bounce;
  _anticipation_ (longer spin and a glowing outline) on the remaining reels when two
  Scatters have already landed. Pressing SPIN again (or Space) stops the reels quickly.
- **Wins:** winning symbols pulse inside gold frames, other symbols dim, each winning
  payline is drawn with its number at both ends (identity never relies on colour alone),
  and the message bar cycles through every win ("Line 11: 4 x Sapphire Drop pays 20").
  Wins of 15x / 50x / 200x the bet show Big / Mega / Epic banners with a gold particle
  burst; the counted-up number always ends exactly on the settled amount.
- **Free spins:** a banner announces the award, the frame and SPIN button turn violet,
  a counter shows spins played and the feature total, and a closing banner shows the
  feature win.
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
- **Help** - how to play, keyboard shortcuts, and the play-money disclaimer.
- **History** - the last 200 rounds with each spin's stops, window and wins.
- **Statistics** - this session; the exact theoretical model (RTP split, hit rate,
  volatility, a chart of where the RTP comes from by payout size with an accessible table);
  and an in-browser simulation (100k or 1M rounds in a Web Worker) compared with the
  exact values.
- **Developer diagnostics** (development builds only) - configuration hash and warnings,
  RNG mode, renderer, displayed-vs-settled check, ledger integrity check, last spin
  record, active configuration.

## Accessibility

Keyboard play (Space/Enter spin, +/- or arrows for the bet, T fast spin, P/H/S panels,
Esc closes dialogs), visible focus, labelled controls, dialogs with focus trapping and
focus restore, a polite live region announcing each result, a screen-reader table of
the visible symbols, and reduced-motion support.

## Out of scope for the prototype

Sound, autoplay of paid spins, gamble/double-up features, jackpots, bonus buys, real
money, player accounts, and any backend.
