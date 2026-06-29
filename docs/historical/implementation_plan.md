> **HISTORICAL (executed plan)** — This is the plan for the monorepo pivot, which is now
> **complete** (Phase 1 + Phase 2 shipped). It is kept as a record of intent; the final
> implementation deviated in places (e.g. `core` and the CLI compile with `tsc` to `dist/`/`out/`
> rather than being bundled from source as sketched here). The current source of truth is
> [README.md](../../README.md), [CLAUDE.md](../../CLAUDE.md), and [CHANGELOG.md](../../CHANGELOG.md).

# Code Diff-Checker — Monorepo Pivot Implementation Plan

## Context

Code Diff-Checker is currently a single-package VS Code extension (complete: 7 modules, 27 passing unit tests, esbuild bundle). We are converting it **in-place** into an **npm-workspaces monorepo** with three packages so the diffing logic can power both the VS Code extension and a new standalone CLI that works in any editor.

- `packages/core/` — editor-agnostic library (config, git, cache, diff engine). **Zero `vscode` imports.**
- `packages/cli/` — new CLI (`diffchecker`), published as `@dicodingacademy/code-diffchecker`.
- `packages/vscode/` — the existing extension, refactored to import from core.

**Why now:** The core modules are already ~90% editor-agnostic — `vscode` coupling is isolated to exactly three spots. Extracting them unlocks a CLI with near-zero duplication while preserving the proven extension behavior.

### Locked decisions (confirmed with user)
- **Phased rollout.** Phase 1 = monorepo + core + extension refactor (behavior-preserving, 27 tests stay green). Phase 2 = build out the CLI. Independently shippable.
- **Core is internal/bundled-only.** `private: true`, never published to npm; esbuild bundles it into both the CLI's single file and the extension's VSIX. Only the CLI (npm) and extension (Marketplace) ship.
- **All-CommonJS, pinned deps.** Keep CJS + ES2020 everywhere. CLI uses chalk@4, ora@5 (last CJS majors), commander@11, chokidar@3, diff (jsdiff).
- Config supports **both** `.diffchecker.json` (root, priority) and `.vscode/course-project.json` (legacy fallback).
- CLI cache at `~/.cache/diffchecker/` (XDG: honor `$XDG_CACHE_HOME`). Exit codes: `0` success/no-diffs, `1` diffs found, `2` error.

---

## Target structure

```
code-diffchecker-extension/            # repo root = npm workspace root
├── package.json                       # [MODIFY] private root: workspaces + orchestration scripts
├── package-lock.json                  # single lockfile for the workspace
├── tsconfig.base.json                 # [NEW] shared compilerOptions
├── .eslintrc.json                     # [MODIFY] ignorePatterns: **/out, **/dist
├── .gitignore                         # [MODIFY] **/out/, **/dist/
├── README.md / CLAUDE.md / AGENTS.md  # stay at root
├── implementation_plan.md             # [MODIFY] this document
└── packages/
    ├── core/
    │   ├── package.json               # [NEW] @dicodingacademy/code-diffchecker-core, private
    │   ├── tsconfig.json              # [NEW] extends base, noEmit
    │   ├── src/                        # [MOVE] from repo src/ (vscode removed)
    │   │   ├── index.ts                # [NEW] public API barrel
    │   │   ├── types.ts  constants.ts  config.ts  cacheManager.ts
    │   │   ├── processManager.ts  gitService.ts  diffEngine.ts
    │   └── test/                       # [MOVE] 3 test files + new run-tests.js (no vscode alias)
    ├── vscode/
    │   ├── package.json               # [NEW] name code-diffchecker, publisher dicodingacademy
    │   ├── tsconfig.json  esbuild.js  .vscodeignore   # [NEW]/[MOVE]
    │   ├── src/
    │   │   ├── extension.ts  treeViewProvider.ts       # [MOVE+MODIFY]
    │   │   └── gitBinary.ts            # [NEW] vscode→core git resolver glue
    │   └── test/__mocks__/vscode.js    # [MOVE] kept for future vscode-layer tests
    └── cli/                            # [NEW] Phase 2
        ├── package.json  tsconfig.json  esbuild.js
        └── src/  (cli.ts, context.ts, reporter.ts, orchestrate.ts, diff-render.ts, commands/*)
```

---

# Phase 1 — Monorepo + Core extraction + VS Code refactor

Goal: identical extension behavior, all 27 tests green, the extension importing from `@dicodingacademy/code-diffchecker-core`. No CLI yet.

## 1.1 Workspace scaffold

**[MODIFY] [package.json](package.json)** → private workspace root:
```json
{
  "name": "code-diffchecker-monorepo",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["packages/core", "packages/cli", "packages/vscode"],
  "scripts": {
    "build": "npm run build:core && npm run build:vscode && npm run build:cli",
    "build:core": "npm run build --workspace=@dicodingacademy/code-diffchecker-core",
    "build:vscode": "npm run build --workspace=code-diffchecker",
    "build:cli": "npm run build --workspace=@dicodingacademy/code-diffchecker",
    "watch": "npm run watch --workspace=code-diffchecker",
    "lint": "eslint packages/*/src --ext ts",
    "test": "npm run test --workspace=@dicodingacademy/code-diffchecker-core",
    "test:all": "npm run test --workspaces --if-present"
  },
  "devDependencies": { "esbuild": "^0.20.0", "typescript": "^5.3.0", "eslint": "^8.56.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0", "@typescript-eslint/parser": "^7.0.0",
    "@types/node": "^20.11.0" }
}
```
- Build order is explicit (`&&`) because `npm run --workspaces` is **not** topologically ordered.
- Shared dev tooling hoists to root. `@types/vscode`, `@vscode/test-*` move into the vscode package.

**[NEW] tsconfig.base.json** — current `compilerOptions` minus `outDir`/`rootDir` (`module: commonjs`, `target: ES2020`, `strict`, `declaration`, `esModuleInterop`, `resolveJsonModule`, `sourceMap`). Each package extends it and sets its own `outDir`/`rootDir`/`include`.

**[MODIFY]** [.eslintrc.json](.eslintrc.json) `ignorePatterns` → `["**/out", "**/dist", "**/node_modules", "**/esbuild.js", "**/run-tests.js"]`. **[MODIFY]** [.gitignore](.gitignore): `out/`→`**/out/`, add `**/dist/`. Run `npm install` to materialize workspace symlinks.

## 1.2 Extract `packages/core/` (remove all `vscode`)

`git mv` the 6 portable modules + types into `packages/core/src/`. The only `vscode` couplings are three precise spots; everything else is pure Node `fs`/`path`/`crypto`/`child_process`.

| File | Change |
|---|---|
| **types.ts** | `localUri?: vscode.Uri`→`localPath?: string`, `solutionUri?`→`solutionPath?`. Remove `vscode` import. |
| **diffEngine.ts** | Replace the 4 `vscode.Uri.file(x)` (lines 49/58/73/74) with the plain string `x` (the `localAbsolute`/`solutionAbsolute` already computed). Remove `vscode` import. |
| **gitService.ts** | `resolveGitBinary()` → `resolveGitBinary(configuredGitPath?: string)`: try the passed path first, then `git` on PATH. Remove `vscode` import + the `vscode.workspace.getConfiguration('git')` read (line 20). Neutralize "restart VS Code" wording in the error. |
| **config.ts** | Remove dead `vscode` import. Probe both config filenames (see below). |
| **cacheManager.ts** | Remove dead `vscode` import. No logic change — already takes `globalStoragePath: string`. |
| **constants.ts** | `CONFIG_FILENAME` → `CONFIG_FILENAMES = ['.diffchecker.json', '.vscode/course-project.json']`. Add `.diffchecker.json` to `HARDCODED_IGNORE_PATTERNS`. |
| **processManager.ts** | Move as-is (zero coupling). |

**config.ts dual-format probe** — add a helper and use it in `loadConfig`/`hasConfigFile`:
```ts
function findConfigPath(workspaceRoot: string): string | undefined {
  for (const name of CONFIG_FILENAMES) {
    const p = path.join(workspaceRoot, name);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}
```
In `loadConfig`, derive `const configName = path.relative(workspaceRoot, configPath)` and use it in all error strings so messages name the file that actually matched.

**[NEW] packages/core/src/index.ts** — public API barrel re-exporting: types (`CourseProjectConfig, ExecResult, ExecOptions, DiffStatus, DiffResult, DiffTreeNode`); `loadConfig, hasConfigFile`; `resolveGitBinary, validateGitVersion, checkGitVersion, cloneSparse, checkForUpdates, pullUpdate, resetGitBinaryCache`; `getCacheDir, isCacheValid, nukeCache, clearAllCaches, ensureStorageDir`; `computeDiff, isFileBinary`; `execGit`; and the constants (`CONFIG_FILENAMES, HARDCODED_IGNORE_PATTERNS, MIN_GIT_VERSION, GIT_DOWNLOAD_URL`, timeouts, `BINARY_CHECK_BYTES, CACHE_DIR_NAME`).

**[NEW] packages/core/package.json** — the key to bundling core's TS source directly (no separate build to consume):
```json
{
  "name": "@dicodingacademy/code-diffchecker-core",
  "version": "0.1.0", "private": true,
  "main": "./src/index.ts", "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "build": "tsc -p . --noEmit", "test": "node test/run-tests.js", "lint": "eslint src --ext ts" },
  "dependencies": { "minimatch": "^10.0.0" }
}
```
- `main`/`exports`→`src/index.ts`: esbuild (and `tsc` for IntelliSense) follow the workspace symlink and bundle/typecheck core's **source** directly. This matches the repo's existing "esbuild bundles TS" pattern — no new compile step, no build-order coupling, single `--watch` covers core edits.
- `build` is `tsc --noEmit` (type-check only) since core is bundled, not shipped as JS. `minimatch` is core's own dep and gets bundled transitively into both consumers.

**[NEW] packages/core/tsconfig.json** — `extends ../../tsconfig.base.json`, `outDir: dist`, `rootDir: src`, `include: [src/**/*]`.

## 1.3 Refactor `packages/vscode/`

`git mv` `extension.ts` + `treeViewProvider.ts` into `packages/vscode/src/`.

**[MODIFY] extension.ts** — replace the 5 relative core imports (lines 4-9) + the `./types` import with one package import from `@dicodingacademy/code-diffchecker-core`, and import `resolveGitBinary` from the new local `./gitBinary` (so the 3 call sites stay `await resolveGitBinary()` unchanged). All orchestration logic is otherwise untouched (it already calls these as free functions). Optionally fix the latent bug where `compile` never passed `--production` (see Risks).

**[NEW] packages/vscode/src/gitBinary.ts** — the only vscode↔core git glue:
```ts
import * as vscode from 'vscode';
import { resolveGitBinary as coreResolveGitBinary } from '@dicodingacademy/code-diffchecker-core';
export async function resolveGitBinary(): Promise<string> {
  const configuredPath = vscode.workspace.getConfiguration('git').get<string>('path');
  return coreResolveGitBinary(configuredPath);
}
```

**[MODIFY] treeViewProvider.ts** — import types from the core package; in `createDiffCommand` convert the new string fields to URIs at the use site:
```ts
const leftUri  = diff.localPath    ? vscode.Uri.file(diff.localPath)    : vscode.Uri.parse('untitled:empty');
const rightUri = diff.solutionPath ? vscode.Uri.file(diff.solutionPath) : vscode.Uri.parse('untitled:empty');
```
This is the **only** behavioral consumer of the renamed fields (`compareCurrentFileCommand` builds its own URIs and is unaffected).

**[NEW] packages/vscode/package.json** — keep marketplace identity (`name: code-diffchecker`, `publisher: dicodingacademy`, `main: ./out/extension.js`) and the **entire** `contributes` block verbatim. Changes:
- `activationEvents`: add `"workspaceContains:.diffchecker.json"` alongside the legacy one.
- `dependencies`: replace `minimatch` with `"@dicodingacademy/code-diffchecker-core": "*"` (npm symlinks it; minimatch now arrives via core, bundled by esbuild).
- Move `@types/vscode`, `@vscode/test-cli`, `@vscode/test-electron` into this package's devDeps.

**[NEW] packages/vscode/esbuild.js** — byte-identical to current [esbuild.js](esbuild.js) (entry `src/extension.ts`, `external: ['vscode']`, `outfile: out/extension.js`); esbuild resolves the core symlink and bundles core + minimatch. **[NEW] packages/vscode/tsconfig.json** (`noEmit: true` — esbuild builds). **[MOVE] .vscodeignore** into the package, add `test/**`.

## 1.4 Test migration

The 3 test files exercise only core modules and **never import `vscode`** themselves. After core is vscode-free, the esbuild `vscode` alias is dead. Verified: **no test assertion reads `localUri`/`solutionUri`** (they assert `length`/`status`/`relativePath`/`isBinary`), so the rename needs **zero** test edits. `config.test.ts` writes `.vscode/course-project.json` and still passes via the legacy fallback branch.

- `git mv` `src/test/{config,gitService,diffEngine}.test.ts` → `packages/core/test/`; fix relative imports to `../src/...`.
- **[NEW] packages/core/test/run-tests.js** — the current [run-tests.js](run-tests.js) with the `alias`/`mockPath` removed and paths re-rooted; preserve the lightweight "esbuild-bundle → node" runner.
- **[MOVE]** `src/test/__mocks__/vscode.js` → `packages/vscode/test/__mocks__/vscode.js` (unused by core now; retained for future vscode-layer tests).
- **[DELETE]** root `run-tests.js`; root `npm test` now delegates to core (also fixes that root `test` was `vscode-test`, which never ran the unit tests).

---

# Phase 2 — `packages/cli/` (`@dicodingacademy/code-diffchecker`)

The CLI re-uses core 1:1 and only replaces what VS Code provided: `workspaceRoot`, git path, cache root, progress UI, and a terminal renderer. **commander** for the command tree (subcommands + `cache` sub-subcommands + global flags + auto-help). One new concern the extension never needed: line-level diff rendering.

**File layout** `packages/cli/src/`: `cli.ts` (entry, shebang via esbuild banner, builds commander tree, single error→exit-code boundary), `context.ts` (`CliContext`: resolves workspaceRoot/gitPath/cacheRoot/flags once), `reporter.ts` (sole stdout/stderr writer; honors `--json`/`--no-color`; ora→stderr), `orchestrate.ts` (`fetchOrUpdateSolution` — the clone/update ladder extracted from `fetchSolutionCommand`), `diff-render.ts` (jsdiff unified diff + chalk), `errors.ts` (`CliError` carrying exit code), `commands/{fetch,diff,watch,cache,init}.ts`.

**Shared resolvers:**
- `workspaceRoot` = `--cwd` or `process.cwd()` (replaces `vscode.workspace.workspaceFolders`).
- git path = `--git-path` → `DIFFCHECKER_GIT_PATH` → `undefined`, passed to `resolveGitBinary(arg)`.
- cache root = `(${XDG_CACHE_HOME} || ~/.cache)/diffchecker`, passed as `globalStoragePath` to the unchanged core cache helpers. (Effective path: `…/diffchecker/cache/<hash>/<targetFolder>`.)
- `reporter`: `--json` → no spinner + structured payload printed once; `--no-color` → `chalk.level = 0`.

**Commands** (markers: `+` added/green, `~` modified/yellow, `-` deleted/red):

| Command | Core calls | Output | Exit |
|---|---|---|---|
| `fetch` | `fetchOrUpdateSolution` → `computeDiff` | spinner; summary `Found N difference(s)` + per-status counts | 0 |
| `diff` | auto-fetch if cache missing (else offline; `--update` forces); `computeDiff` | grouped-by-status list w/ colored markers; `(binary)` dimmed | 1 if diffs, 0 if none |
| `diff <file>` | auto-fetch; `isFileBinary` + CRLF-normalized equality; **`diff-render`** | unified colored diff, or "matches"/"binary"/"extra file" message | 1 if differ, 0 if identical |
| `watch` | initial like `diff`; chokidar 300ms debounce → re-`computeDiff` | clears + reprints grouped diff; alive until SIGINT | 0 on SIGINT; 2 if initial setup fails |
| `cache clear` | `clearAllCaches(cacheRoot)` | `-y` to skip confirm; refuse in `--json`/non-TTY without `-y` | 0 / 2 |
| `cache info` | `loadConfig` (best-effort) + `getCacheDir` + `isCacheValid`; fs size walk | cache root, total size, per-config dirs, current-project status | 0 |
| `init` | validates `repoUrl` w/ core's regex | `readline/promises` prompts → writes `.diffchecker.json` (`--force`/flags for non-interactive) | 0 / 2 |

`--version`/`--help` are commander built-ins. All commands set `process.exitCode` (not `process.exit`) so stdout flushes — except `watch` which `process.exit(0)` after `watcher.close()` on SIGINT.

**Line-diff (`diff <file>`)** — jsdiff `createTwoFilesPatch` with **our own CRLF→LF normalization** before diffing (keeps it consistent with `computeDiff`'s classification), colorized via chalk. Chosen over `git diff --no-index` precisely because git would surface CRLF-only diffs the engine treats as identical. CLI-only dep.

**watch `ignored`** — reuse `minimatch` (already core's dep) + `config.ignorePaths` + core's `HARDCODED_IGNORE_PATTERNS`, always ignoring `.git`, the cache dir, and both config files (so saving config doesn't loop). `ignoreInitial: true, persistent: true`.

**[NEW] packages/cli/package.json**:
```json
{
  "name": "@dicodingacademy/code-diffchecker", "version": "0.1.0",
  "bin": { "diffchecker": "./dist/cli.js" }, "main": "./dist/cli.js",
  "files": ["dist", "README.md"], "engines": { "node": ">=18" },
  "scripts": { "build": "node esbuild.js --production", "watch": "node esbuild.js --watch", "lint": "eslint src --ext ts" },
  "dependencies": {
    "@dicodingacademy/code-diffchecker-core": "*",
    "chalk": "^4.1.2", "ora": "^5.4.1", "chokidar": "^3.6.0", "commander": "^11.1.0", "diff": "^5.2.0"
  },
  "devDependencies": { "@types/node": "^20.11.0", "@types/diff": "^5.2.0" }
}
```
**[NEW] packages/cli/esbuild.js** — mirrors the extension's but: `entryPoints: ['src/cli.ts']`, `outfile: dist/cli.js`, `banner: { js: '#!/usr/bin/env node' }`, **no `external`** (bundle everything incl. core → self-contained global install), `target: node18`. (`fsevents` auto-externalized on macOS — harmless optional native dep.)

---

## Verification plan

**Phase 1 (must pass before Phase 2):**
1. `npm install` at root → confirm `node_modules/@dicodingacademy/code-diffchecker-core` symlink exists.
2. `npm run build:core` (tsc `--noEmit`) → zero type errors; **grep core/src for `vscode` → must be empty.**
3. `npm test` → all **27** tests green (no vscode mock involved).
4. `npm run build:vscode` → `out/extension.js` produced. `grep -c "minimatch" out/extension.js` > 0 and no leftover `require('vscode'... )` beyond the external. `npm run lint` clean.
5. **VSIX smoke:** `cd packages/vscode && npx @vscode/vsce package --no-dependencies` → unzip and confirm it contains only `out/extension.js` + manifest + README (no `node_modules`, no `packages/core`).
6. **Extension E2E (F5 Extension Development Host):** open a workspace with `.vscode/course-project.json` → Fetch Solution populates the TreeView; clicking a text file opens the native diff; binary files non-clickable; file edits re-diff within ~300ms. Then add a `.diffchecker.json` and confirm it activates and takes priority.

**Phase 2:**
7. `npm run build:cli` → `dist/cli.js` runnable; `node dist/cli.js --version`/`--help` work; `npm link` then `diffchecker` resolves.
8. In a fixture project: `diffchecker init` writes valid `.diffchecker.json`; `diffchecker fetch` clones; `diffchecker diff` exits **1** with grouped output (exit **0** when matching); `diffchecker diff <file>` shows a colored unified diff; `diffchecker watch` re-renders on save and exits cleanly on Ctrl+C; `cache info`/`cache clear` behave. Verify `--json` emits clean parseable JSON with no spinner/ANSI, and `--no-color` strips colors.
9. Exit-code discipline: no-diffs→0, diffs→1, bad config / missing git→2.

---

## Risks & gotchas

- **VSIX + workspace symlink:** use `vsce package --no-dependencies` (safe — core is pre-bundled). Verify the VSIX has no `node_modules`.
- **Do not set `preserveSymlinks`** (esbuild or tsconfig) — it breaks core's `minimatch` resolution through the symlink.
- **Build order is explicit** (core→vscode→cli); `npm run --workspaces` is not topological.
- **`cachedGitBinary` is per-process** — fine for the CLI (fresh process per invocation) and intended for the extension session.
- **Neutralize VS Code wording** in shared core error messages (gitService "restart VS Code", config "`.vscode/course-project.json`") since the CLI now surfaces them.
- **Latent fix:** current `compile` omits `--production` (published extension wasn't minified). Make `vscode:prepublish`/`build` pass `--production`. Flag to user; trivial.
- **`@types/mocha`** is dead weight (tests use `assert`) — drop or ignore.

## Suggested commit sequence
1. Scaffold (root pkg + workspaces + tsconfig.base + dotfiles) → `npm install`.
2. `git mv` core sources + apply vscode-removal diffs + add `index.ts` → `build:core` + grep clean.
3. Move tests + de-aliased `run-tests.js` → `npm test` (27 green).
4. `git mv` extension sources + `gitBinary.ts` + Uri/import diffs + vscode `package.json`/`esbuild.js`/`.vscodeignore` → `build:vscode` + VSIX smoke. **← Phase 1 shippable.**
5. Scaffold + implement `packages/cli` (commands, reporter, orchestrate, diff-render) → `build:cli` + E2E. **← Phase 2 shippable.**
