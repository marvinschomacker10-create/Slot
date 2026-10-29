# Regulatory readiness and certification roadmap

**Current status: play-money prototype.** Pixel-Pauker has not been certified, tested by
an independent laboratory, or approved by any regulator, and it is not suitable for
real-money gambling in its current form. It contains no deposits, withdrawals, payment
processing, wagering accounts or production backend, and none should be added to this
prototype.

This document lists the work that would be required before any real-money deployment.
Requirements differ substantially between jurisdictions; everything below must be
confirmed with legal counsel and the chosen test laboratory for the target market.

## 1. Jurisdiction and legal basis

- Select target jurisdictions and confirm that online slots are permitted there.
- Identify the applicable law, licensing regime (operator and supplier/B2B licences),
  and the technical standards the regulator recognises. Examples that are commonly
  referenced in the industry include GLI-11/GLI-19-style standards and regulator
  technical standards such as the UK Gambling Commission's Remote Technical Standards
  or the Malta Gaming Authority's requirements; which ones apply is a legal question.
- Determine game-design restrictions per market, for example minimum game-cycle speed,
  bans on turbo/quick-stop or autoplay, limits on feature buy, maximum stake, and rules
  on how wins smaller than the stake may be presented ("losses disguised as wins").

Prototype features that are likely to need per-market configuration or removal:

| Feature                  | Prototype                                          | Typical concern                                                                              |
| ------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Fast spin and quick stop | available                                          | Some markets require a minimum game-cycle duration and forbid speeding up or stopping reels. |
| Automatic free spins     | on by default                                      | Autoplay of paid spins is not implemented; free-spin autoplay rules may still need review.   |
| Win celebrations         | banner from 15x bet; line-win messages for any win | Celebrating a return below the stake may be prohibited in some markets.                      |
| Display of RTP           | exact value shown in the paytable                  | Usually required, with the regulator's wording.                                              |

## 2. Game rules and mathematics review

- Freeze a versioned **game rules document** and **paytable** (see SPECIFICATION.md).
- Independent review of the mathematical model: the exact analysis method, the
  enumeration counts, the cap rule, rounding, and the RTP definition
  ("per unit of base-game stake, including all free spins").
- Lab verification typically includes the laboratory's own RTP calculation and
  simulation, minimum/maximum RTP per configuration, game-cycle definition, maximum
  win, and behaviour on disconnection or interruption mid-feature.
- Every RTP variant offered must be analysed and certified separately.

## 3. RNG and outcome generation

- Replace the client-side RNG with a **server-side RNG** (CSPRNG, typically with a
  hardware entropy source), documented seeding and reseeding, continuous health tests,
  and protection against state disclosure.
- Have the RNG and its scaling (mapping to reel stops) tested by an accredited
  laboratory (statistical test batteries, source review, integration review).
- Keep the deterministic, seeded generator for tests only, enforced by build
  configuration rather than convention.

## 4. Server-side game engine and settlement

- Move `src/game` (engine, ledger, free-spins state) to a server-side Remote Game
  Server; the client becomes a renderer of signed results.
- Transactional settlement against the operator wallet: idempotent debit/credit with
  retry-safe keys, exactly-once semantics, and reconciliation.
- Persist in-progress rounds so that a feature resumes after a disconnect exactly where
  it stopped; define the behaviour of an unfinished round (most standards require it to
  be completed and paid). The prototype already resumes an unfinished free-spins round
  from browser storage, but that storage is under the player's control and is not a
  substitute for server-side persistence.
- The timed play-money allowance ("Taschengeld") is a play-money mechanic only. Any
  real-money product must remove it; free credits, bonuses or promotions in a regulated
  market are subject to their own rules (bonus terms, wagering requirements, advertising
  restrictions) and must be designed with legal counsel.
- Game-cycle definition, maximum-win enforcement and session limits on the server.

## 5. Security, logging and change control

- Tamper-evident, append-only round logs: round id, player/session reference, stake,
  stops, window, wins, balance before/after, configuration hash, software version, RNG
  reference. Retention per jurisdiction.
- Versioned, signed game configurations; the configuration hash is recorded per round.
- Reproducible builds with recorded artefact hashes (labs certify specific binaries);
  a change-control process that triggers re-certification when certified components
  change. The existing configuration-hash regression test is a starting point.
- Access control (least privilege, MFA, audited administrative actions), secrets
  management, vulnerability management, penetration testing, incident response.

## 6. Responsible gambling

Typical requirements (market-specific) that the prototype does **not** implement:

- Age verification before play, including play-money modes in some markets.
- Deposit, loss, wager and session-time limits; reality checks showing elapsed time and
  net position; cool-off and self-exclusion, including national self-exclusion schemes.
- Clear display of net position, stake and game rules; no misleading presentation.
- Links to support organisations; staff processes for identifying harm.

## 7. Identity, payments and data protection

- KYC/identity verification and anti-money-laundering controls (operator side).
- Payment processing through licensed providers (never in the game client).
- Data protection (for example GDPR): lawful basis, minimisation, retention, access
  rights, security of personal data, data-processing agreements with suppliers.

## 8. Platform integration and operations

- Integration with the operator platform (wallet, session/authentication, bonusing,
  jackpots if any, reporting) through a documented and tested API.
- Monitoring: live RTP tracking against theoretical values with statistically sound
  alert thresholds (see the confidence-interval methodology in MATHEMATICS.md), error
  rates, latency, unfinished rounds, and RNG health.
- Regulatory reporting, audit support, and procedures for game disablement.

## 9. Suggested sequence

1. Legal scoping and selection of jurisdictions and test laboratory.
2. Freeze game rules, paytable and math; produce the laboratory's math submission
   package (this repository's exact analysis is a starting point, not a certificate).
3. Build the server-side engine, RNG and settlement; keep the current test suites and
   add server, persistence and recovery tests.
4. Implement responsible-gambling and market-specific presentation rules.
5. Security hardening and independent penetration test.
6. Laboratory testing and certification of the specific build; regulator approval.
7. Controlled launch with live monitoring and change control.

Until all applicable steps are completed and independently verified, the game must not
be described as certified, approved, compliant, or ready for regulated deployment.
