# zudo-design-token-panel-example-zfb

Demonstrates `@takazudo/zdtp` inside a [zfb (zudo-front-builder)](https://github.com/Takazudo/zudo-front-builder) project. The panel is mounted as a zudo-react island via zfb's `<Island>` component, and the dev-time apply pipeline is wired through a small zfb plugin's `devMiddleware` hook.

Deployed to Cloudflare Workers Static Assets at
`https://zdtp-zfb.zudolab.dev/`.

## Install

```sh
pnpm install
```

Every dependency — `@takazudo/zdtp`, `@takazudo/zfb`, `@takazudo/zfb-runtime` —
comes from the npm registry. There is no sibling checkout to clone and no
bootstrap script to run.

`.npmrc` carries `public-hoist-pattern[]=hono`; leave it in place. zfb 2.x
bundles over a shadow tree whose module resolution starts at the project root,
and without that line `zfb dev` silently serves an empty page. The comment in
`.npmrc` has the full rationale.

## Ports

Three ports, all resolved in exactly one place — `scripts/ports.mjs`. Override
any of them with the matching env var:

| Port    | Default | Env var        | Bound by                                                    |
| ------- | ------- | -------------- | ----------------------------------------------------------- |
| dev     | 44327   | `ZFB_PORT`     | `zfb dev` — the example site during `pnpm dev`               |
| sidecar | 24685   | `ZDTP_PORT`    | `zdtp-server` — receives `/apply` POSTs, rewrites `styles/global.css` |
| preview | 4173    | `PREVIEW_PORT` | `zfb preview` — the built site, and Playwright's `baseURL`   |

The resolver rejects anything that is not a plain integer in 1–65535, and
rejects a sidecar port that collides with either server port. `pnpm dev`,
`pnpm preview` and Playwright's webServer all start through
`scripts/launch.mjs`, so a bad value fails immediately with a named error
instead of binding one port while telling another process about a different one.

The sidecar is started with **both** server origins in its `--allow-origin`
list (the flag is repeatable), so an `/apply` POST is accepted whether it came
from the dev server or from preview.

### Running concurrent worktrees on different ports

`pnpm dev` does **not** kill whatever is already listening on these ports — a
machine-wide `lsof … | xargs kill -9` used to sit at the head of this script and
would happily destroy a sibling worktree's dev server or a Playwright run in
progress. Give each worktree its own ports instead:

```sh
ZFB_PORT=44328 ZDTP_PORT=24686 PREVIEW_PORT=4174 pnpm dev
```

Point Playwright at the same set when testing that worktree:

```sh
ZFB_PORT=44328 ZDTP_PORT=24686 PREVIEW_PORT=4174 pnpm test:e2e
```

To test against servers you started yourself and want to keep running, pass
`BASE_URL`. That switches Playwright to caller-managed servers and skips its own
webServer entirely — you are then responsible for both the site **and** the
sidecar. Pass the same `BASE_URL` and `ZDTP_PORT` to both commands: the sidecar
derives its allowed origins from `BASE_URL` too, so omitting it there is exactly
the CORS desync this setup exists to prevent.

```sh
# terminal 1
BASE_URL=http://localhost:4174 ZDTP_PORT=24686 pnpm run _dev:tokens-bin
# terminal 2
BASE_URL=http://localhost:4174 ZDTP_PORT=24686 pnpm test:e2e
```

### `EADDRINUSE` / "port already in use"

Nothing clears a stale server for you any more. When a start fails with
`EADDRINUSE`, or `zdtp-server` reports `port … already in use`:

1. Find the owner — `ss -ltnp | grep :44327` (or `lsof -ti:44327`) — and stop
   that process yourself if it is genuinely yours. It may belong to another
   worktree.
2. Or just pick different ports with the env vars above.

Playwright uses `reuseExistingServer: false` on purpose: preview serves a
**built** `dist/`, so silently reusing someone else's server would test a stale
build. Use `BASE_URL` when you deliberately want to reuse one.

## Development

```sh
pnpm dev
```

This starts two processes in parallel via `concurrently`:

- `zfb dev` — the zfb dev server at `http://localhost:44327` (`ZFB_PORT`)
- `zdtp-server` — the bin sidecar at port `24685` (`ZDTP_PORT`)

The panel is accessible from the browser console:

```js
window.zfb.toggleDesignPanel()
```

## Build

```sh
pnpm build
```

Output lands in `dist/`. Asset URLs are rooted at `/` (the configured `base`).

## Preview (after build)

```sh
pnpm preview
```

Serves `dist/` on `4173` (`PREVIEW_PORT`) — the same port Playwright drives.

## e2e tests

```sh
pnpm test:e2e
```

Playwright builds the site, then starts `zfb preview` **and** the `zdtp-server`
sidecar together (`node scripts/launch.mjs test-servers`), because
`apply-roundtrip.spec.ts` POSTs to the sidecar. That spec fails fast with an
explicit message if the sidecar is not reachable.

## Typecheck

```sh
pnpm typecheck
```

---

## Island choice

zfb's `<Island>` component marks a `"use client"` subtree for browser-side hydration. `components/app-shell.tsx` wraps `<PanelMount>` in `<Island when="load" ssrFallback={null}>`:

```tsx
<Island when="load" ssrFallback={null}>
  <PanelMount />
</Island>
```

`PanelMount` (`components/panel-mount.tsx`) returns `null` — it uses `getScope().onActivate` to bootstrap the panel adapter.

**Why `ssrFallback={null}` (the zfb `client:only` equivalent)?**

The host island uses zudo-react. `ssrFallback={null}` keeps the self-mounting zdtp Preact widget client-only; its module is loaded lazily after activation. The adapter tracks live owners and invalidates pending imports on disposal, then destroys the widget through its public instance handle. Preact remains installed only for zdtp 0.5.1's peer runtime.

The `when="load"` strategy activates the adapter after page parsing, so the topbar action works without scrolling to an empty end-of-page marker. The widget module remains lazy until a click or a persisted-state signal requires it. Saved overrides are restored after loading; this does not promise restoration before first paint.

---

## Dev-middleware plugin pattern

Unlike the other three examples (astro, vite-react, next) — which proxy `/api/dev/apply` through Vite's built-in `server.proxy` mechanism — zfb exposes the `devMiddleware` plugin hook instead.

The plugin at `plugins/dev-apply-proxy.mjs` registers a handler via `ctx.register(path, handler)` and forwards the POST body to the bin sidecar on `ZDTP_PORT`:

```js
// plugins/dev-apply-proxy.mjs
import { ZDTP_PORT } from "../scripts/ports.mjs";

ctx.register(APPLY_ROUTE, async (req) => {
  const upstream = await fetch(`http://127.0.0.1:${ZDTP_PORT}/apply`, {
    method: "POST",
    body: req.body,
  });
  // ...
});
```

The plugin imports the shared resolver directly — zfb's plugin host loads
`.mjs` plugins through a normal dynamic ESM import, so a sibling relative
import resolves from the plugin file (verified against published zfb 4.0.0).

The plugin is listed in `zfb.config.ts`:

```ts
plugins: [{ name: "./plugins/dev-apply-proxy.mjs" }]
```

---

## Apply-endpoint and `devMiddleware` base-mounting (zfb #229)

Per zfb issue [#229](https://github.com/Takazudo/zudo-front-builder/issues/229) (fix commit `b1049ef`), zfb's dev server mounts `devMiddleware`-registered paths **under the project `base`**. With `base: '/'` in this repo, the bare path `/api/dev/apply` IS the fully-prefixed path — it resolves correctly to the handler:

```ts
// config/panel-config.ts
applyEndpoint: '/api/dev/apply',
```

```js
// plugins/dev-apply-proxy.mjs
const APPLY_ROUTE = "/api/dev/apply";
ctx.register(APPLY_ROUTE, async (req) => { /* ... */ });
```

This matches the pattern used by the astro, vite-react, and next examples.

For the historical context (when `base` was `/pj/zudo-design-token-panel/examples/zfb/` and a full prefix was required), see [`PROBE-REPORT.md`](./PROBE-REPORT.md).


## zfb 4 migration

The host pins published zfb and zfb-runtime 4.0.0 and uses zudo-react islands.
It keeps authored CSS with `wind: false` and retains zdtp 0.5.1 with its Preact
peer runtime. `styles/reset.css` preserves the reset previously emitted by zfb
2.15.1; its upstream MIT notice is retained. Tabs take a unique `id` per instance
for deterministic ARIA relationships. Modal and tabs islands activate on load.

The easing card remains static, matching its previous SSR-only behavior even
though its label invites a click. Forms retain native submission. Closing the
modal retains baseline focus on the body.

Published 4.0.0 resolves the package-scanning stall recorded in upstream #3648.
The six-page build, browser interactions, actual island disposal/remount,
closed-panel persistence, dev apply proxy, and local Worker routing have been
verified. See [PROBE-REPORT.md](./PROBE-REPORT.md) for evidence and the narrow
renderer text-position difference accepted during parity review.

Scoped pnpm overrides for `miniflare>sharp` and `concurrently>shell-quote`
resolve advisories in the current tooling graph. Reassess these overrides when
the parent packages publish dependency updates; the audit gate remains enabled.
