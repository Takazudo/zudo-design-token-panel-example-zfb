"use client";

/**
 * PanelMount — the `"use client"` island that bootstraps the design-token
 * panel adapter inside the zfb hydration pipeline.
 *
 * zfb renders pages as server components by default. This file marks the
 * boundary between server-rendered HTML and the Preact island that runs in
 * the browser. `components/app-shell.tsx` wraps this component in
 * `<Island when="visible" ssrFallback={null}>`, so zfb emits a
 * `data-zfb-island-skip-ssr` placeholder at the end of `<body>` and the
 * hydration runtime renders this component into it via an
 * `IntersectionObserver` (threshold 0) once the placeholder intersects the
 * viewport — never at SSR time, and never before first paint.
 *
 * Panel adapter bootstrap
 * -----------------------
 *   1. `configurePanel(panelConfig)` — supplies the host's config object to
 *      the panel package's singleton BEFORE any other panel API runs. Called
 *      once per storagePrefix, gated by the `bound` flag on
 *      `window.__zudoDesignTokenPanelAdapter`.
 *   2. Console API on `window[cfg.consoleNamespace]` — exposes
 *      `showDesignPanel` / `hideDesignPanel` / `toggleDesignPanel`.
 *   3. Eager-load gate — dynamically import the panel module when any
 *      persisted signal says the panel was in use.
 *   4. `reapplyPersistedOverrides()` — called immediately after
 *      `configurePanel` so persisted overrides land as soon as the module
 *      resolves.
 *
 * What the eager-load gate does — and does NOT — buy in THIS host
 * ---------------------------------------------------------------
 * The vite-react and Next hosts run their equivalent gate from the entry
 * script, so a hit there restores the user's tweaks before the first paint
 * and the gate is an FOUT defence. That reasoning does NOT transfer here.
 * Under `when="visible"` this whole file is deferred until after paint by
 * construction, so a returning user with saved tweaks always sees one frame
 * of stylesheet defaults. The gate cannot close that window, and no amount
 * of widening it would.
 *
 * What it decides here is whether the panel chunk is fetched *at all*. A
 * visitor with no panel signals never downloads it; a user who had the panel
 * open, armed a closed-shell feature, or saved overrides gets it restored on
 * hydration without having to call a `window.<ns>.*` helper from the console.
 * That is why the gate still has to be exhaustive: a missed signal is not a
 * cosmetic flash here, it is a feature that silently never comes back.
 *
 * Eager-load signals come from the package, never from this file
 * -------------------------------------------------------------
 * The gate reads `@takazudo/zdtp/constants` — a zero-import sub-entry
 * carrying only the signal registry (~1 KB), so importing it statically does
 * not drag the panel bundle into this island's chunk, which is the entire
 * point of the dynamic import in `loadPanelModule`.
 *
 * This file used to hard-code the two key formatters instead:
 *
 *   `${storagePrefix}:visible`   and   `${storagePrefix}-state-v2`
 *
 * The `-state-v2` half was a latent bug. The package migrates an older state
 * envelope forward (v1/v2 -> v3 -> v4) and then DELETES the superseded key,
 * so the moment a user's persisted overrides were migrated past v2 the probe
 * read `null` and the panel silently stopped being restored — for exactly the
 * users who had tweaks saved. `READABLE_STATE_KEY_SUFFIXES` is the package's
 * single registry of the versions its loader can still read, so probing it
 * cannot go stale again.
 *
 * `EAGER_LOAD_GATE_KEY_SUFFIXES` covers the flag signals the same way, and is
 * wider than the `:visible` flag this file used to check alone. `:visible`
 * alone is demonstrably insufficient: opening the panel writes
 * `:autoload="auto"` and closing never clears it, while `:visible` goes to
 * `'0'` — so a visible-only gate leaves autoload unrestored.
 *
 * Returns `null` — the panel adapter appends its own DOM root outside the
 * Preact tree; this component owns no DOM of its own.
 */

import { useEffect } from 'preact/hooks';
import type { PanelConfig } from '@takazudo/zdtp/astro';
import {
  EAGER_LOAD_GATE_KEY_SUFFIXES,
  READABLE_STATE_KEY_SUFFIXES,
} from '@takazudo/zdtp/constants';
import { panelConfig } from '../config/panel-config';

// Mirrors the panel module's main entry shape we lazy-import below.
type DesignTokenPanelModule = typeof import('@takazudo/zdtp');

interface DesignTokenPanelAdapterState {
  /** Per-`storagePrefix` bind flag — re-runs are no-ops. */
  bound: boolean;
  /** Memoised module promise so steady-state toggle/show/hide share one load. */
  modulePromise: Promise<DesignTokenPanelModule> | null;
}

interface ConsoleApiSurface {
  showDesignPanel?: () => Promise<void>;
  hideDesignPanel?: () => Promise<void>;
  toggleDesignPanel?: () => Promise<void>;
  [extra: string]: unknown;
}

type AdapterStateMap = Record<string, DesignTokenPanelAdapterState>;

interface AdapterWindow extends Window {
  __zudoDesignTokenPanelAdapter?: AdapterStateMap;
  [namespace: string]: unknown;
}

function getAdapterStateMap(win: AdapterWindow): AdapterStateMap {
  if (!win.__zudoDesignTokenPanelAdapter) {
    win.__zudoDesignTokenPanelAdapter = {};
  }
  return win.__zudoDesignTokenPanelAdapter;
}

function getAdapterState(win: AdapterWindow, key: string): DesignTokenPanelAdapterState {
  const map = getAdapterStateMap(win);
  let state = map[key];
  if (!state) {
    state = { bound: false, modulePromise: null };
    map[key] = state;
  }
  return state;
}

/** Read one key, treating an unavailable store as an absent value. */
function readStorageItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * True when any of the package's fixed eager-load flags holds one of its
 * accepted values. Presence alone never activates a flag — the registry
 * enumerates the values that count, so a stale `'0'` does not force a load.
 */
function hasActiveFlagSignal(cfg: PanelConfig): boolean {
  for (const [suffix, rule] of Object.entries(EAGER_LOAD_GATE_KEY_SUFFIXES)) {
    // `requiredConfig` names a PanelConfig property that must be configured
    // for the flag to mean anything — a stray `-domtweaker-enabled` is inert
    // on this host, which passes no `domTweaker`.
    if (rule.requiredConfig !== null && cfg[rule.requiredConfig] === undefined) {
      continue;
    }
    const value = readStorageItem(cfg.storagePrefix + suffix);
    if (value !== null && (rule.acceptedValues as readonly string[]).includes(value)) {
      return true;
    }
  }
  return false;
}

/**
 * Apply `EAGER_LOAD_GATE_STATE_FAMILY.valueRules` to one raw envelope:
 *
 *   blank (absent or empty string) -> no      JSON null              -> no
 *   empty object / empty array     -> no      any other parsed value -> yes
 *   malformed JSON                 -> yes
 *
 * Malformed JSON fails OPEN deliberately: a parse failure means the panel
 * must still load so it can migrate or reject the payload, rather than
 * stranding the user with corrupt state they can never reach.
 *
 * Presence alone is not enough because `clearPersistedState()` removes keys
 * rather than writing `{}` — an empty envelope is foreign or hand-written
 * data, not a user's saved tweaks.
 */
function isActiveStateEnvelope(raw: string | null): boolean {
  // An empty string is a blank slot, not corrupt data — `JSON.parse('')`
  // throws, but there is nothing here to migrate.
  if (raw === null || raw === '') return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return true;
  }
  if (parsed === null) return false;
  if (Array.isArray(parsed)) return parsed.length > 0;
  if (typeof parsed === 'object') return Object.keys(parsed).length > 0;
  return true;
}

/**
 * True when any state version the CURRENT loader can read holds a non-empty
 * envelope.
 *
 * Each complete key is built from the literal prefix instead of enumerating
 * `localStorage`, which keeps sibling instances (`${otherPrefix}-state-v4`)
 * out and makes host-supplied regex characters inert.
 */
function hasPersistedOverrides(cfg: PanelConfig): boolean {
  for (const suffix of Object.values(READABLE_STATE_KEY_SUFFIXES)) {
    if (isActiveStateEnvelope(readStorageItem(cfg.storagePrefix + suffix))) {
      return true;
    }
  }
  return false;
}

async function loadPanelModule(state: DesignTokenPanelAdapterState) {
  if (state.modulePromise === null) {
    state.modulePromise = import('@takazudo/zdtp').then((mod) => {
      // Configure FIRST — every other panel API reads getPanelConfig() and
      // must observe the host's intended values, not the package sentinel.
      mod.configurePanel(panelConfig);
      try {
        mod.reapplyPersistedOverrides();
      } catch (err) {
        // Defensive: never let a bad persist-state read kill the panel surface.
        console.warn(
          '[design-token-panel] reapplyPersistedOverrides() threw: ' + (err as Error).message,
        );
      }
      return mod;
    });
  }
  return state.modulePromise;
}

function installConsoleApi(
  win: AdapterWindow,
  namespace: string,
  state: DesignTokenPanelAdapterState,
): void {
  const existing = (win[namespace] as ConsoleApiSurface | undefined) ?? {};
  existing.showDesignPanel = async () => {
    const panel = await loadPanelModule(state);
    panel.showDesignTokenPanel();
  };
  existing.hideDesignPanel = async () => {
    const panel = await loadPanelModule(state);
    panel.hideDesignTokenPanel();
  };
  existing.toggleDesignPanel = async () => {
    const panel = await loadPanelModule(state);
    panel.toggleDesignPanel();
  };
  win[namespace] = existing;
}

function mountPanel(): void {
  if (typeof window === 'undefined') return;

  const cfg = panelConfig;
  const win = window as unknown as AdapterWindow;
  const state = getAdapterState(win, cfg.storagePrefix);

  // Install console API every time — `bound` only gates the lazy-load
  // probes, since the console handlers are idempotent.
  installConsoleApi(win, cfg.consoleNamespace, state);

  if (state.bound) return;
  state.bound = true;

  if (hasActiveFlagSignal(cfg) || hasPersistedOverrides(cfg)) {
    // Fire-and-forget by design, but with the rejection handled: nothing
    // awaits this promise, and an unhandled rejection from a failed chunk
    // load fails the whole run in a consumer's test runner.
    void loadPanelModule(state).catch((err: unknown) => {
      console.error('[design-token-panel] Eager panel-module load failed.', err);
    });
  }
}

export default function PanelMount() {
  useEffect(() => {
    mountPanel();
    // No cleanup: the panel adapter installs window-level state that lives
    // for the page lifetime. A teardown on unmount would be wrong.
  }, []);
  return null;
}
