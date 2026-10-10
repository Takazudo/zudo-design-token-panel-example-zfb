# zfb Integration Probe Report

**Probe date:** 2026-05-09
**zfb commit verified against:** `aa8e9ac`

This report documents the four zfb gaps surfaced during the planning probe for sub-issue #33 (epic #29: Examples Deploy + zfb Demo). All four were fixed upstream before the zfb demo implementation (sub-issue #35) began.

---

## Upstream fixes — resolved zfb issues

All four issues have been closed and re-verified against zfb commit `3f58127` (original probe); zfb example re-verified against `aa8e9ac` as part of epic #108 (see Bug history below):

| zfb # | Bug | Fix commit | Status |
|---|---|---|---|
| [#228](https://github.com/Takazudo/zudo-front-builder/issues/228) | `<a href="/foo">` not prefixed by `base` | `d6fc3fe` | ✅ verified |
| [#229](https://github.com/Takazudo/zudo-front-builder/issues/229) | Dev server served at root with `base`-prefixed asset URLs that 404 | `b1049ef` | ✅ verified |
| [#230](https://github.com/Takazudo/zudo-front-builder/issues/230) | `devMiddleware` rejected POST/PUT/DELETE | `f72d2ae` | ✅ verified |
| [#231](https://github.com/Takazudo/zudo-front-builder/issues/231) | `dist/.zfb-build/` build intermediates shipped in deploy | `e876681` | ✅ verified |

### Issue links

- https://github.com/Takazudo/zudo-front-builder/issues/228
- https://github.com/Takazudo/zudo-front-builder/issues/229
- https://github.com/Takazudo/zudo-front-builder/issues/230
- https://github.com/Takazudo/zudo-front-builder/issues/231

---

## Bug history — zdtp internal fixes (epic #108, PR #113)

Two bugs affecting the deployed Cloudflare Pages examples were diagnosed and fixed in [epic #108](https://github.com/Takazudo/zudo-design-token-panel/issues/108).

**Bug 1 — Astro example rendered an empty panel body.** The Astro consumer's Vite build deduplicates chunks in a way that placed `panel-config.ts` into two separate module instances: one in the host-adapter chunk and one in the panel's main chunk. The host adapter wrote `configuredConfig` to its instance; the panel read from the other instance (still `null`), so `getPanelConfig()` returned `DEFAULT_PANEL_CONFIG` with `tabs: []`. Fix (#109): the configuration singleton is now stored on `globalThis[Symbol.for('@takazudo/zdtp:singleton')]` so any number of module instances share the same state slot regardless of bundler chunk layout.

**Bug 2 — zfb first `toggleDesignPanel()` call was a no-op** when the browser's localStorage contained legacy keys from the default storage prefix (e.g. `zudo-design-token-panel:visible=1`). At module-init time, `reapplyFromStorage()` ran with the default prefix before `configurePanel(zfbConfig)` was called. This mounted a default-prefix Preact panel, which then removed the zfb-prefix open key as a side effect, so the zfb panel's mount-effect read `null` and never called `setOpen(true)`. Fix (#111): a post-configure hook system defers `reapplyPersistedOverrides()` and `reapplyFromStorage()` until `configurePanel()` has supplied the host's storage prefix. Existing consumers need no code changes.

Both fixes are transparent to host consumers.

---

## Integration nuance — apply endpoint and `devMiddleware` base-mounting (zfb #229)

### Historical context (pre-2026-05-19 move) — base-prefixed path required

The panel's `applyEndpoint` in the zfb demo **must be the full base-prefixed URL**:

```
/pj/zudo-design-token-panel/examples/zfb/api/dev/apply
```

Do **not** use the bare relative path (`api/dev/apply`) that the other three examples (astro, vite-react, next) use. After fix #229, zfb's dev server mounts `devMiddleware` paths under `base`, so the apply endpoint is only reachable at the fully-prefixed path.

This is a configuration requirement for this project, not a bug in zfb.

### Post-move (2026-05-19) — bare path now works because `base: '/'`

After the demo was moved to its own standalone repo (`Takazudo/zudo-design-token-panel-example-zfb`), `base` was changed from `/pj/zudo-design-token-panel/examples/zfb/` to `/`. The zfb #229 base-mounting behaviour still applies — `devMiddleware` handlers are mounted under `base` — but with `base: '/'`, the bare path `/api/dev/apply` IS the fully-prefixed path. The `applyEndpoint` and `APPLY_ROUTE` in `plugins/dev-apply-proxy.mjs` are therefore set to `/api/dev/apply`, matching the other three examples. The zfb #229 reference remains relevant: the mechanism is unchanged; only the base value changed.

---

## Process for new zfb issues

If a new zfb gap is discovered during the zfb demo implementation (#35 or later):

1. **File a minimal repro issue** on the zfb repo (https://github.com/Takazudo/zudo-front-builder/issues) with steps to reproduce, expected vs. actual behavior, and the zfb commit SHA being tested.
2. **Add a row** to the upstream-fix table in this report (and in `__inbox/zfb-probe-report.md`) with the issue number and a ⏳ status.
3. **Wait for the upstream fix** (or implement a workaround in the zdtp demo with a comment referencing the open issue) before completing the sub-issue.
4. **Update the row** to ✅ verified once the fix commit is confirmed and the issue is closed.


## 2026-10-05: zfb 3 migration checkpoint

Baseline main `5425d3a` with zfb/runtime 2.15.1: frozen pnpm 10.33.2 install,
`pnpm typecheck`, six-page `pnpm build`, and all 12 existing browser tests pass.
Matching 1280px/390px screenshots and computed styles were captured with
system Chromium 151.0.7922.173 on Linux x86_64, Node 24.19.0. Playwright's pinned
browser download was blocked by the environment; the same system browser is
required for comparisons. Baseline audit reports 3 high, 5 moderate, 3 low
advisories in the existing dependency tree.

Migration typecheck passes on exact zfb/runtime 3.2.0. The full build was
CPU-active without output for 99 seconds before diagnostic cancellation; this
is not a passing build. A minimal public-API Island with a lazy zdtp import
reproduces the pre-bundler stall tracked upstream in #3648. The fix is not yet
published under the registry's latest tag. No build/browser parity or merge is
claimed. Preserve this checkpoint until a released fix enables the full gates.

The follow-up security update pins Wrangler 4.147.0 (compatible major), whose
miniflare graph includes sharp 0.35.4 and undici 7.29.1. The frozen install,
typecheck and audit now pass with no known vulnerabilities. Wrangler dry-run and
all nine local Worker routing assertions pass using retained baseline assets;
these validate the CLI update, not the still-blocked migration build.

The public static MDX collection path was independently built with zfb 3.2.0
and the actual prose source. Its 748 parsed HTML events match the baseline prose
subtree, allowing removal of the obsolete private content-bridge fallback.
Full application visual parity remains pending. No additional upstream defect
was confirmed by these probes.

## 2026-10-06: published zfb 4.0.0 verification

This checkpoint supersedes the blocked 3.2.0 checkpoint above. The exact
published zfb/runtime 4.0.0 tuple and Linux GNU binary build the real six-page
consumer in 3.52 seconds. The isolated lazy-widget scanner reproducer completes
in 3.08 seconds. No upstream source or unreleased package is used.

All 17 browser tests pass against the rebuilt migration preview. Actual public
`createIslandTest` roots verify disposal during a delayed widget import, fresh
remount, overlapping owners, and repeated mount/dispose without leaked widget
DOM. A real UI override survives reload with the panel closed. The dev proxy
POST reaches the sidecar, rewrites the token file, and the probe restores that
file byte-for-byte. Wrangler dry-run and nine local Worker route, redirect,
asset, and 404 assertions pass using the actual migration output.

The same Chromium 151.0.7922.173 captures all six routes at 1280×900 and 390×900
against baseline `5425d3a`. Text, titles and sampled computed styles match for
all 12 captures; ten images are pixel-identical. The widgets route has a narrow
text rasterization difference: adjacent text-node merging moves inline code by
1/64px, with unchanged content, font, wrapping and layout. Independent review
accepted this quantified difference; no CSS compensation or widened screenshot
tolerance was applied.

The authored reset retains the baseline's Tailwind preflight behavior and full
MIT notice. Empty client-only panel, modal and tabs markers now activate on
load, preserving immediate interactions without requiring a scroll. The widget
package itself still loads lazily. New tooling advisories are resolved through
scoped sharp 0.35.5 and shell-quote 1.11.0 overrides; audit remains enforced.

Local evidence is retained outside the repository at
`/workspace/zfb-migration-evidence/plain/v4/`, including build, browser,
lifecycle, screenshot, persistence, proxy and Worker logs. Final-head CI and
merge status are recorded on PR #19 and tracker #18.

Final frozen install, typecheck, audit (no known vulnerabilities), guarded build
and 17-test suite pass. All five zfb platform packages are present in the lockfile.
The complete route manifest and all 748 prose HTML events match baseline.
A fresh dev server hydrates all six routes and passes panel/modal/tabs checks
without page or asset errors. A stale dev server timed out after a concurrent
production rebuild; restarting it resolved the failure. An explicit widget API
test double also verifies that restoration errors leave the production adapter's
public actions and teardown usable. This tests the adapter's error boundary,
not simulated widget internals. Independent source review approved the final
changes, including the reset attribution and full platform lockfile.

## 2026-10-10: published zfb 4.3.0 verification

Base: `2a9b6c7f3a48f404482f34c1ab868425aee4604e`. Root SDK/runtime now pin
exactly `4.3.0`, including the runtime's exact SDK peer. Release source:
`689dfbfcfe4154aaccffe74d14bb5aadfef3ec6a`
([v4.3.0](https://github.com/Takazudo/zudo-front-builder/releases/tag/v4.3.0)).
The npm registry still reports `latest=4.3.0` for all eleven family packages.
All eleven downloaded tarballs match registry SHA-512 integrity; all five native
carrier archives contain their binaries, and the four md-wasm bytes match the
exported shipped-artifacts manifest's SHA-256 values. Only the Linux x64 GNU
binary was executed. No unpublished build or upstream implementation was used.

Published package-surface diffs from 4.0.0 retain the SDK exports and add exact
`@takazudo/zfb-slugify@4.3.0`; runtime's SDK peer advances in lockstep. Release
notes through 4.3.0 cover scanner/watch fixes and deferred-island hydration.
No application/config migration was needed. Default esbuild and `wind: false`
remain; zdtp 0.5.1 and all unrelated dependency resolutions/overrides are unchanged.
This repository has no separate zudo-doc workspace or compatible 2.x path.

Verification on Linux x86_64, Node 24.19.0, **pnpm 10.33.2** (via `corepack pnpm`),
Playwright 1.60.0 / downloaded Chromium 148.0.7778.96:

- `corepack pnpm install --frozen-lockfile`: pass.
- `corepack pnpm typecheck`: pass, collection check and TypeScript.
- `corepack pnpm audit --audit-level high`: no known vulnerabilities.
- `corepack pnpm test:e2e --reporter=list`, with `CI`/`BASE_URL` unset and the
  personal heavy guard: **17 passed**, including its normal `pnpm run build`
  and production preview/sidecar startup. Token controls, highlights, persistence,
  modal inert/focus behavior, keyboard tabs, forms, and file-write restoration pass.
- Six prerendered routes, output paths, and full page titles match the 4.0.0
  baseline. All six generated pages contain the panel entry point.
- A guarded standalone Chromium probe against `node scripts/launch.mjs dev`
  verifies hydration and panel open/close on all six routes, modal and keyboard
  tabs, a real radius-control edit, and `POST /api/dev/apply` through the dev
  proxy to the sidecar. The CSS write is observed and restored byte-for-byte;
  no page exceptions or local HTTP asset errors occur.

The initial suite exposed a pre-existing test race: reloading immediately after
Close can beat zdtp 0.5.1's Preact effect that persists visibility. Original
4.3.0 run: 16/17 pass; focused original test: 2/3 pass. An isolated, frozen
4.0.0 baseline initially passed 3/3, then failed 6/10 repetitions with the same
reopened-panel assertion. The spec now **also asserts** the panel is hidden and
its shared visibility key is `0` before reload; the original restored-radius and
closed-panel assertions remain. No sleep, retry, skipped assertion, or timeout
increase was added. The corrected full suite passes 17/17, and the corrected
persistence test passes 10/10 focused repetitions (`--grep "closed panel"
--repeat-each=10`).

Existing issue #16 continues to own the decision about browser CI coverage;
this upgrade does not silently add a fleet-wide policy. Issue #15's old 2.x
hono workaround is left intact. Upstream #3879 was inspected; no new ZFB defect
was established by these checks. Native macOS (including watcher/IME behavior),
Linux ARM64, Windows execution, WebKit and Firefox remain untested here.

The preview job explicitly excludes branch `chore/zfb-4.3.0-20261010` so this
validation-only PR cannot upload a preview, even if it is marked ready later.
Build CI remains enabled; production deployment triggers remain unchanged.
No merge, release, publication, or deployment is part of this task.

Local diagnostic logs, registry integrity inventory, WASM manifest, screenshot,
and dev probe script are retained at `/tmp/zfb-430-evidence/`. Final-head CI
status is recorded in the draft PR, not inferred from these local checks.
