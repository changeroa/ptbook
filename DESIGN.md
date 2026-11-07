# ptbook design contract

The supplied ptbook design system is the visual source of truth. Reuse the
Guuey agentic-app rail, canvas, composer, identity, and mobile QR; do not build a
second app shell or chat UI.

## Tokens

`theme.json` carries the supplied light/dark palette, Korean system-font stack,
44/28/20/16/14 type scale, 4px rhythm, 20px inset, and 120ms motion. The accent is
the supplied green, not the scaffold's purple. GGUI components carry the same
tokens inside their bundles. Read-only numbers use ink rather than accent.

## Composition

The product has two destinations: today's workout and the mobile handoff.
The chat rail owns conversation; generated cards own the main canvas. On a
phone, preserve the platform's responsive shell and one readable column.

## Primitives and states

Reuse the supplied card shell, metric, gauge/ring, timeline, chip, primary
action, and skeleton contracts. Every card distinguishes ready, empty, error,
and pending confirmation. One filled primary action per card; touch controls
at least 44px, visible focus, Korean keep-all wrapping, no fabricated values.

## Data and actions

Plan drafts show before/after and apply/keep. Card actions never claim a save:
the agent computes, saves the per-user home ledger, reads it back, and amends
the existing card. Sleep labels imported versus illustrative sample.
Nutrition labels text estimates and exposes macro/calorie differences.
Reference links retain their original creator and timestamp.

## Scope and evidence

Five representative variants ship first: plan-A, sleep-B, set-B, video-A,
diet-A. The remaining eight candidates are not registered. The official
Portal is the deployed entry point; the product shell is separately verified
and must not be presented as hosted until its own URL is deployed.
Visual QA covers desktop/mobile and light/dark cards, confirmation actions,
long Korean labels, empty values, and scroll reachability.
