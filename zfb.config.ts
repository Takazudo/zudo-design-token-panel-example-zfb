import { defineConfig } from "@takazudo/zfb/config";

/**
 * zfb example for @takazudo/zudo-design-token-panel.
 *
 * Deliberately minimal: NO Tailwind, NO collections. The example proves the
 * panel package works inside any zfb consumer that supplies just a
 * `PanelConfig` and mounts the panel adapter as a `"use client"` island.
 *
 * Apply-pipeline (dev only)
 * -------------------------
 * Unlike the astro/vite-react/next examples — which proxy `/api/dev/apply`
 * through Vite's built-in proxy mechanism — zfb exposes the `devMiddleware`
 * plugin hook. The `dev-apply-proxy` plugin registered here intercepts POST
 * requests at the bare path:
 *
 *   /api/dev/apply
 *
 * Per zfb issue #229 (fixed in commit `b1049ef`), `devMiddleware`-registered
 * paths are scoped under the project `base`. With `base: '/'`, the bare path
 * `/api/dev/apply` IS the fully-prefixed path — it resolves correctly to the
 * handler. This is a key difference from the monorepo's hosted version where
 * `base` was `/pj/zudo-design-token-panel/examples/zfb/` and required the
 * full prefix — see README.md and `PROBE-REPORT.md` for the full rationale.
 *
 * The `panelConfig.applyEndpoint` is therefore set to the bare path
 * (see `config/panel-config.ts`), matching the other examples.
 *
 * Deploy `base`
 * -------------
 * `base: '/'` deploys this example at the Cloudflare Pages project root.
 * zfb applies this prefix to every emitted asset URL and to the dev server's
 * served paths, so all links resolve correctly from the repo root.
 */
export default defineConfig({
  framework: "preact",
  base: "/",
  collections: [
    {
      name: "prose",
      path: "content/prose",
    },
  ],
  // Demo: opt into every GFM construct via the shorthand.
  // See ../zfb-tailwind/zfb.config.ts for the per-construct form.
  markdown: { gfm: true },
  plugins: [
    {
      name: "./plugins/dev-apply-proxy.mjs",
    },
  ],
});
