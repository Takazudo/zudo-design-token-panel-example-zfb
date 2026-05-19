#!/usr/bin/env node
/**
 * setup-upstream.mjs — bootstrap both sibling repos and the consumer.
 *
 * Reads both pins from framework-pins.json (single source of truth for CI
 * and local setup). For each sibling:
 *   - Missing   → git clone + checkout pinned SHA
 *   - Present, clean  → fetch + checkout pinned SHA
 *   - Present, dirty  → exit 1 (see /dev-wip-package-upstream-wt-dev)
 *
 * After siblings are ready:
 *   - zfb sibling: pnpm install --frozen-lockfile (required by cargo build.rs
 *     and example bundling — see CI workflow comment for full rationale)
 *   - panel sibling: pnpm install --frozen-lockfile + pnpm -F build
 *   - zfb CLI: cargo install --path ../zfb/crates/zfb --root .zfb-bin
 *     (project-local; does NOT touch ~/.cargo/bin/zfb)
 *   - consumer: pnpm install (no --frozen-lockfile — fresh-machine setup)
 *   - consumer: pnpm build (verification)
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const siblingRoot = resolve(repoRoot, '..');

// ── Read pins ──────────────────────────────────────────────────────────────────

const pinsPath = resolve(repoRoot, 'framework-pins.json');
const pins = JSON.parse(readFileSync(pinsPath, 'utf8'));

const panelPin = pins['zudo-design-token-panel'];
const zfbPin = pins['zfb'];

if (!panelPin?.repo || !panelPin?.sha) {
  console.error('ERROR: framework-pins.json missing zudo-design-token-panel entry');
  process.exit(1);
}
if (!zfbPin?.repo || !zfbPin?.sha) {
  console.error('ERROR: framework-pins.json missing zfb entry');
  process.exit(1);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

/**
 * Ensure a sibling repo is present at the given SHA.
 * @param {string} name  - Directory name under siblingRoot (e.g. 'zudo-design-token-panel')
 * @param {string} repo  - Git remote URL
 * @param {string} sha   - Full commit SHA to check out
 */
function ensureSibling(name, repo, sha) {
  const siblingPath = resolve(siblingRoot, name);
  console.log(`\n── ${name} (${sha.slice(0, 7)}) ──`);

  if (!existsSync(siblingPath)) {
    console.log(`  Sibling not found — cloning ${repo}`);
    run(`git clone ${repo} ${siblingPath}`);
    run(`git -C ${siblingPath} checkout ${sha}`);
    return;
  }

  // Check for uncommitted changes (tracked or untracked staged files).
  const status = execSync(`git -C ${siblingPath} status --porcelain`, {
    encoding: 'utf8',
  }).trim();

  if (status !== '') {
    console.error(
      `\nERROR: ${siblingPath} has uncommitted changes:\n${status}\n` +
        `\nIf you are iterating on this package locally, use the\n` +
        `/dev-wip-package-upstream-wt-dev workflow instead of setup-upstream.\n` +
        `If you want to reset to the pinned SHA, run:\n` +
        `  git -C ${siblingPath} stash && node scripts/setup-upstream.mjs`,
    );
    process.exit(1);
  }

  console.log(`  Sibling present and clean — fetching + checking out ${sha.slice(0, 7)}`);
  run(`git -C ${siblingPath} fetch`);
  run(`git -C ${siblingPath} checkout ${sha}`);
}

// ── Set up siblings ────────────────────────────────────────────────────────────

ensureSibling('zudo-design-token-panel', panelPin.repo, panelPin.sha);
ensureSibling('zfb', zfbPin.repo, zfbPin.sha);

// ── Install zfb workspace deps ─────────────────────────────────────────────────
// Required for TWO independent reasons (no cache-hit guard):
//   1. cargo build.rs: zfb's build.rs reads framework packages from
//      ../zfb/node_modules/.pnpm and panics if they're missing.
//   2. Example bundling: zfb build bundles zfb-runtime source files via
//      esbuild, which needs to resolve zfb-runtime's runtime deps (e.g. hono).

console.log('\n── zfb workspace deps ──');
const zfbPath = resolve(siblingRoot, 'zfb');
run('pnpm install --frozen-lockfile', { cwd: zfbPath });

// ── Install + build panel sibling ──────────────────────────────────────────────

console.log('\n── panel sibling: install + build ──');
const panelPath = resolve(siblingRoot, 'zudo-design-token-panel');
run('pnpm install --frozen-lockfile', { cwd: panelPath });
run('pnpm -F @takazudo/zudo-design-token-panel build', { cwd: panelPath });

// ── Install zfb CLI (project-local) ────────────────────────────────────────────
// Install into .zfb-bin/ — does NOT overwrite ~/.cargo/bin/zfb.
// The user may be iterating zfb upstream simultaneously at a different SHA.

console.log('\n── zfb CLI (project-local .zfb-bin/) ──');
const zfbBinRoot = resolve(repoRoot, '.zfb-bin');
run(`cargo install --path ${zfbPath}/crates/zfb --root ${zfbBinRoot}`);

const zfbBin = resolve(zfbBinRoot, 'bin', 'zfb');
console.log(`  zfb binary installed at: ${zfbBin}`);
console.log(`  To use it: export PATH="${zfbBinRoot}/bin:$PATH"`);

// ── Consumer: install + verify build ──────────────────────────────────────────

console.log('\n── consumer: install ──');
// Use PATH that includes the project-local zfb binary for the build step.
const augmentedEnv = {
  ...process.env,
  PATH: `${zfbBinRoot}/bin:${process.env.PATH}`,
};

run('pnpm install', { cwd: repoRoot });

console.log('\n── consumer: build (verification) ──');
run('pnpm build', { cwd: repoRoot, env: augmentedEnv });

console.log('\n✓ setup-upstream complete. Run `pnpm dev` to start the dev server.\n');
console.log(`  Note: the project-local zfb binary is at ${zfbBin}`);
console.log(`  Add to your shell: export PATH="${zfbBinRoot}/bin:$PATH"\n`);
