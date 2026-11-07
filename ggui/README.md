# ggui/ — ptbook generative-UI blueprints

Five registered-style blueprint cards (`plan-A`, `sleep-B`, `set-B`, `video-A`, `diet-A`) plus the local preview theme, a design registry, and the pool artifact `guuey deploy` pushes.

```
ggui.json                      # blueprints.include glob + local-preview theme pointer (render theme in prod is platform data)
themes/ptbook.theme.json       # DTCG theme, same palette as design-system/theme.guuey.json (light). `ggui theme validate` passes.
blueprints/<id>/ggui.ui.json   # per-UI manifest: id, name, contract (propsSpec + actionSpec), matchPatterns
blueprints/<id>/component.tsx  # single-file React card: imports only react, @ggui-ai/design, @ggui-ai/wire
blueprints/<id>/fixtures.json  # sample props (dataMode "sample") for check.mjs and local previews; never production data
blueprints/manifest.json       # pool artifact (PortableBlueprint v2 records) read by `guuey deploy`'s ggui asset leg
blueprints/codes/<sha256>.tsx  # pool code bodies = component.tsx verbatim (generated; do not edit by hand)
registry.json                  # logical id -> uiId, paths, variance, intent, local keys; status stays "planned" until a deploy registration response is recorded
scripts/build-pool.mjs         # regenerates blueprints/manifest.json + codes/ and writes contractHash/variantKey/codeRef into registry.json
scripts/check.mjs              # discovery, contract parse, variant enum, esbuild compile, tsc, theme, fixtures, pool round-trip (exit 1 on failure)
```

## Commands (run from `ggui/`)

```bash
node scripts/build-pool.mjs            # after editing any component.tsx or ggui.ui.json
node scripts/check.mjs                 # 73 checks; must print "73/73 checks passed"
../node_modules/.bin/ggui dev --no-serve --no-open   # CLI discovery: expects "uis: 5 discovered"
../node_modules/.bin/ggui theme validate themes/ptbook.theme.json
```

## Why one file per card

`guuey deploy` compiles each pool code body alone in a temp directory (see `compileProjectBlueprints` in `@guuey/cli`), so a card cannot import sibling files. Shared pieces (source row, loading shell, metric styles) are therefore repeated per card. `ggui dev` / `ggui serve` compile the same `component.tsx`, so local and deployed code are byte-identical.

## Contract conventions

- `propsSpec.properties.variant.schema.enum` holds exactly one logical id, so different variants never share a contract hash.
- Every card takes `dataMode` (`live | imported | sample | estimated`), `status` (`ready | loading | empty | error`), `statusText`, `title` (one-sentence conclusion), `sourceLabel`; the card never fabricates numbers (null renders as "기록 없음", no target hides the gauge denominator).
- Actions carry no `nextStep`; the agent maps them to domain tools from the system prompt:
  - `plan-A`: `apply_plan`, `keep_plan` `{candidateId, expectedRevision, date}` (apply is `oneShot` + `confirm`)
  - `sleep-B`: `propose_plan` `{sleepDate, intensity: keep|lower|rest}`
  - `set-B`: `log_next_set` `{planRowId|null, exercise, kg, reps, rpe|null}`
  - `video-A`: `open_clip` `{clipId, sourceUrl, startSec, endSec}` (the card also opens the link itself)
  - `diet-A`: `log_meal` `{estimateId, label, kcal, macros}` (`oneShot`), `correct_meal` `{target: estimate|meal, id}`
- Completion is never shown from a click; cards show a pending line and wait for `ggui_amend` with refreshed props (`confirmation.state`, `progress`, `totals`).

## Runtime selection

`ggui_handshake({ intent: registry.entries[id].intent, blueprintDraft: { contract: <ggui.ui.json#contract>, variance: registry.entries[id].variance } })`, then `ggui_render({ handshakeId, props })` with props shaped like `fixtures.json`. Record the returned `blueprintId` in `registry.json` and flip `status` to `registered` only after the deploy or registration response confirms it.

## Styling

Only `--ggui-*` theme tokens and `@ggui-ai/design` primitive props are used (no literal colours or pixel sizes). Sizes the design system fixes in px are derived from spacing tokens (`56px = spacing-10 + spacing-4`, `64px = spacing-12 + spacing-4`, `44px = spacing-8 + spacing-3`).
