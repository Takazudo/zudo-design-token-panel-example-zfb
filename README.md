# zudo-design-token-panel-example-zfb

Demonstrates `@takazudo/zdtp` inside a [zfb (zudo-front-builder)](https://github.com/Takazudo/zudo-front-builder) project. The panel is mounted as a Preact island via zfb's `<Island>` component, and the dev-time apply pipeline is wired through a small zfb plugin's `devMiddleware` hook.

## Sibling layout

This repo expects two sibling directories alongside it under the same parent:

```
$HOME/repos/zdtp-ex/
  zudo-design-token-panel/   ← @takazudo/zdtp source (pinned SHA)
  zfb/                       ← zudo-front-builder source (pinned SHA)
  zudo-design-token-panel-example-zfb/   ← this repo
```

The `file:../zudo-design-token-panel/packages/zudo-design-token-panel` and `file:../zfb/packages/zfb` dependencies in `package.json` resolve via this sibling layout. A plain `pnpm install` on a fresh checkout **will fail** if the siblings are not present. Use `pnpm setup:upstream` (see below) to bootstrap everything automatically.

## Bootstrap (first-time setup)

```sh
pnpm setup:upstream
```

This script (`scripts/setup-upstream.mjs`) reads `framework-pins.json` and:

1. Clones or checks out the `zudo-design-token-panel` sibling at the pinned SHA, installs its deps, and builds the panel package.
2. Clones or checks out the `zfb` sibling at the pinned SHA and installs its deps (required by both cargo build and example bundling).
3. Installs the `zfb` CLI binary to `.zfb-bin/` (project-local, does not touch your global `~/.cargo/bin/zfb`).
4. Runs `pnpm install` in this consumer.
5. Runs `pnpm build` once to verify the setup.

If a sibling is present but has uncommitted local changes, the script exits with an error pointing at the `dev-wip-package-upstream-wt-dev` workflow.

## Development

```sh
pnpm dev
```

This starts two processes in parallel via `concurrently`:

- `zfb dev` — the zfb dev server at `http://localhost:44327`
- `zdtp-server` — the bin sidecar at port `24685`

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

## Typecheck

```sh
pnpm typecheck
```

---

## Island choice

zfb's `<Island>` component marks a `"use client"` subtree for browser-side hydration. `pages/index.tsx` wraps `<PanelMount>` in `<Island when="visible" ssrFallback={null}>`:

```tsx
<Island when="visible" ssrFallback={null}>
  <PanelMount />
</Island>
```

`PanelMount` (`components/panel-mount.tsx`) returns `null` — it only runs a `useEffect` to bootstrap the panel adapter.

**Why `ssrFallback={null}` (the zfb `client:only` equivalent)?**

zfb's default `<Island>` SSR-renders the child and then hydrates it on the client. `PanelMount` uses `useEffect` from `preact/hooks`, which during SSR would fail with a Preact internal hooks error (`__H` undefined) because zfb's SSR renderer and the project's `preact` package are different instances — the Preact hooks options are only wired up in the SSR renderer's instance. Passing `ssrFallback` (even `null`) switches the island to skip-SSR mode, preventing the hooks from running during the server-side render pass. The component is then mounted client-side by the hydration runtime.

The `when="visible"` strategy defers hydration until the element is in the viewport. Because `<PanelMount>` sits at the end of `<body>`, the IntersectionObserver fires shortly after first paint — effectively an idle-ish load strategy that does not block the critical-path chunk.

---

## Dev-middleware plugin pattern

Unlike the other three examples (astro, vite-react, next) — which proxy `/api/dev/apply` through Vite's built-in `server.proxy` mechanism — zfb exposes the `devMiddleware` plugin hook instead.

The plugin at `plugins/dev-apply-proxy.mjs` registers a handler via `ctx.register(path, handler)` and forwards the POST body to the bin sidecar at `http://127.0.0.1:24685/apply`:

```js
// plugins/dev-apply-proxy.mjs
ctx.register(APPLY_ROUTE, async (req) => {
  const upstream = await fetch("http://127.0.0.1:24685/apply", {
    method: "POST",
    body: req.body,
  });
  // ...
});
```

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
