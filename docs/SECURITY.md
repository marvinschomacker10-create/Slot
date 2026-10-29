# Security notes

Gilded Orbit is a **play-money prototype that runs entirely in the browser**. Credits
have no monetary value. This document describes what the prototype does to keep
outcomes honest and consistent, and - just as important - what it cannot do. It is not
a security certification.

## Threat model of the prototype

| Concern                                          | Prototype behaviour                                                                                                                                                                                                                         | Adequate for real money?                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Predictable or biased random numbers             | Web Crypto `getRandomValues` (a CSPRNG in current browsers and Node.js), mapped with rejection sampling (no modulo bias).                                                                                                                   | No: a client-side RNG is outside the operator's control and has not been independently tested. |
| Player influencing the outcome through the UI    | The UI can only call `GameSession.spin()`. It cannot pass stops, windows or wins; the RNG is private to the session.                                                                                                                        | No: the player controls the browser and can modify any client code.                            |
| Animation changing the result                    | The round is resolved and settled before any animation starts. The renderer only receives the settled stops and window; a mismatch between displayed and settled symbols is logged and counted (never "corrected" into a different result). | Same architecture is required server-side.                                                     |
| Double crediting / double settlement             | `Ledger` settles each `(stake, roundId)` and `(win, spinId)` exactly once and throws on repeats; balances are integer credits restricted to the safe-integer range; `verifyIntegrity()` recomputes the balance from the ledger.             | Needs persistent, transactional, idempotent server-side settlement.                            |
| Mutation of settled records by presentation code | Spin and round records are deep-frozen.                                                                                                                                                                                                     | n/a client-side.                                                                               |
| Silent configuration changes                     | Every report and the UI carry the SHA-256 of the canonical configuration JSON; tests fail when the configuration and the committed analysis disagree.                                                                                       | Needs signed, versioned configurations under change control.                                   |
| Development shortcuts leaking into builds        | Seeded RNG (`?seed=`), the developer panel and the test hook (`window.__GILDED_ORBIT__`) exist only when `import.meta.env.DEV` is true. Verified against the production build: `?seed=` is ignored, no hook, no dev panel.                  | Needs build attestation / reproducible builds.                                                 |

## Random number generation

- **Production play (prototype):** `CryptoRandomSource` buffers 256 values from
  `crypto.getRandomValues`. If the Web Crypto API is unavailable the game refuses to
  start rather than falling back to `Math.random()`.
- **Development and tests only:** `SeededRandomSource` (xoshiro128** 1.1, seeded via a
  128-bit string hash) is deterministic and **not cryptographically secure\*\*. It is used
  for automated tests, reproducible bug reports in development builds, and reproducible
  Monte Carlo simulations. Simulation chunks use derived sub-streams
  (`seed/stream-j`); with a 2^128 - 1 period, overlap between streams is negligible for
  the run sizes used here, but no formal stream-independence proof is claimed.
- **Mapping:** see [MATHEMATICS.md](MATHEMATICS.md#2-from-random-numbers-to-symbols).
  RNG output is converted to reel stops in one place (`src/game/reels`), and payout
  evaluation is a pure function of the stops.

Known limitations of the prototype RNG:

1. It runs on the player's device; its output can be observed and the code replaced.
2. There is no independent statistical certification (e.g. by an accredited test lab).
3. There is no RNG health monitoring, reseeding policy or tamper-evident output log.
4. Browser implementations of `getRandomValues` differ; they are trusted, not verified.

## Supply chain

- Dependencies are pinned to exact versions with a lockfile (`package-lock.json`);
  `npm ci` installs exactly those versions.
- At the time of writing `npm audit` reports 0 known vulnerabilities. Vitest was pinned
  to a release that fixes published advisories in earlier 3.x/4.x versions.
- `.npmrc` sets `legacy-peer-deps=true` to work around an npm 10 crash while resolving
  Vitest's optional peer dependencies; all required peers are declared explicitly.
- No runtime network services, analytics, wallets or payment providers are used.

## Recommendations before any real-money use

- Generate outcomes **server-side** with a certified RNG (ideally hardware-seeded,
  health-tested, with documented reseeding), and settle in a transactional ledger with
  idempotency keys.
- Treat the client as a display terminal: it receives signed results and renders them.
- Sign and version game configurations; record the configuration hash with every round.
- Keep tamper-evident, append-only logs of every round (stops, window, wins, balances,
  configuration hash, RNG stream position) for dispute resolution and audits.
- Harden deployment: authentication, authorisation, secrets management, rate limiting,
  dependency and container scanning, penetration testing.

See [REGULATORY_READINESS.md](REGULATORY_READINESS.md) for the full roadmap.
