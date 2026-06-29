# CLAUDE.md — AI Coding Assistant Context

> This file provides context for AI coding assistants (Claude, Gemini, Copilot, etc.) working on this project.
> Read this before making any changes. `AGENTS.md` is the equivalent file for other agents and is kept in sync with this one.

---

## Project Overview

**Code Diff-Checker** is a tool built for [Dicoding Academy](https://www.dicoding.com/) — an EdTech platform where students learn by building real projects. It lets students compare their local work-in-progress project against a final solution hosted on GitHub. It ships as **two front-ends over one shared core**: a VS Code extension (native TreeView, side-by-side diffs) and a standalone CLI (`diffchecker`) that works in any editor.

**How it works:**
1. A starter project contains `.diffchecker.json` (or legacy `.vscode/course-project.json`) pointing to a GitHub repo + branch + specific folder.
2. The tool performs a Git sparse-checkout of only the target folder.
3. It computes a diff between the student's local files and the fetched solution.
4. Results appear in the VS Code sidebar TreeView, or are printed to the terminal by the CLI.

**Pedagogical constraint:** There is intentionally **no "Apply Changes" button**. Students must manually read the diff and copy code — this encourages deeper learning. Do not add one.

---

## Monorepo Structure

This is an **npm-workspaces monorepo** (`workspaces: ["packages/*"]`) with three packages:

```
packages/
├── core/       # @dicodingacademy/code-diffchecker-core — editor-agnostic shared library (private)
├── cli/        # @dicodingacademy/code-diffchecker — the `diffchecker` CLI
└── vscode/     # code-diffchecker — the VS Code extension
```

### `packages/core/` — `@dicodingacademy/code-diffchecker-core`
Editor-agnostic shared library. **Must have zero `vscode` imports** (hard boundary — pure Node `fs`/`path`/`crypto`/`child_process`). `private: true`; compiled to `dist/` by `tsc`. Consumed by both front-ends via the workspace symlink. Exposes:
- **Config** — `loadConfig`, `hasConfigFile` (support both `.diffchecker.json` and `.vscode/course-project.json`)
- **Git** — `resolveGitBinary`, `validateGitVersion`, `checkGitVersion`, `cloneSparse`, `checkForUpdates`, `pullUpdate`, `resetGitBinaryCache`
- **Process** — `execGit` (cross-platform spawn with timeout)
- **Cache** — `getCacheDir`, `isCacheValid`, `nukeCache`, `clearAllCaches`, `ensureStorageDir`
- **Diff** — `computeDiff`, `isFileBinary`
- All shared types and constants.

### `packages/cli/` — `@dicodingacademy/code-diffchecker`
Standalone CLI (binary: `diffchecker`), built with `tsc`, command tree via **commander**. Intended for `npm install -g` distribution (currently `private: true` / unpublished). Commands:

| Command | Description |
|---|---|
| `diffchecker init` | Interactively create a `.diffchecker.json` |
| `diffchecker fetch` | Clone/update the solution, print diff summary |
| `diffchecker diff` | Full project diff (grouped by status) |
| `diffchecker diff <file>` | Single-file unified, colorized diff |
| `diffchecker watch` | Re-diff on file changes (300 ms debounce) |
| `diffchecker cache info` | Show cache root, size, project status |
| `diffchecker cache clear` | Delete cached solution(s) |

Global flags: `--json` (machine-readable, no spinner/ANSI), `--no-color`. Exit codes: `0` no differences, `1` differences found, `2` error. CLI cache lives at `$XDG_CACHE_HOME/diffchecker` (fallback `~/.cache/diffchecker`) — separate from the extension's storage.

### `packages/vscode/` — `code-diffchecker`
The VS Code extension (publisher `dicodingacademy`), bundled by **esbuild** into `out/extension.js` (with `vscode` external, core inlined). Imports everything from `@dicodingacademy/code-diffchecker-core`. Contributes 4 commands (`fetchSolution`, `refreshDiff`, `clearCache`, `compareCurrentFile`) and the `codeDiffCheckerTree` activity-bar view.

---

## Architecture

### Package & module inventory

```
packages/core/src/
├── index.ts          # Public API barrel (re-exports everything below)
├── types.ts          # CourseProjectConfig, DiffResult, DiffStatus, ExecResult, ExecOptions, DiffTreeNode
├── constants.ts      # MIN_GIT_VERSION (2.28), CONFIG_FILENAMES, timeouts, HARDCODED_IGNORE_PATTERNS, BINARY_CHECK_BYTES
├── config.ts         # Probes & validates .diffchecker.json / .vscode/course-project.json
├── processManager.ts # Cross-platform child_process wrapper with timeout (execGit)
├── gitService.ts     # Git ops: resolveGitBinary(configuredPath?), version check, sparse clone, update check, pull
├── cacheManager.ts   # Cache lifecycle (MD5-hashed dirs under a caller-supplied storage path)
└── diffEngine.ts     # Walks both trees, classifies added/modified/deleted, detects binaries
packages/core/test/   # config.test.ts, gitService.test.ts, diffEngine.test.ts + run-tests.js

packages/cli/src/
├── index.ts          # Entry (shebang), commander tree, global flags, error→exit-code boundary
├── types.ts          # GlobalOptions, CacheLocation, FetchedSolution
├── errors.ts         # CliError (carries exit code) + message helpers
├── cachePaths.ts     # XDG-aware CLI cache root resolution
└── commands/         # fetch.ts, diff.ts, watch.ts, cache.ts, init.ts
packages/cli/test/    # 4 test files + run-tests.js

packages/vscode/src/
├── extension.ts      # Entry point — registers commands, TreeView, file watcher, background update check
├── treeViewProvider.ts # Sidebar TreeView UI; converts core's *Path strings to vscode.Uri at the diff call site
└── gitBinary.ts      # The ONLY vscode↔core glue: reads `git.path` setting → core resolveGitBinary()
packages/vscode/test/__mocks__/vscode.js  # Minimal vscode mock (retained for future vscode-layer tests)
```

### Dependency direction

```
core  ◀── cli       (terminal front-end; provides cwd, cache root, git path)
  ▲
  └─────  vscode    (extension; gitBinary.ts provides git path from settings)
```

Both front-ends depend on `core`; nothing depends on a front-end. Build order is **core → vscode → cli** (core must compile to `dist/` first).

### Key Interfaces

```typescript
interface CourseProjectConfig {
  repoUrl: string;       // GitHub HTTPS clone URL
  branch: string;        // Branch containing the solution
  targetFolder: string;  // Folder path within the repo
  ignorePaths: string[]; // Glob patterns to exclude (defaults to [])
}

interface DiffResult {
  relativePath: string;
  status: 'added' | 'modified' | 'deleted';
  isBinary: boolean;
  localPath?: string;     // plain absolute path (NOT vscode.Uri — core is editor-agnostic)
  solutionPath?: string;  // the vscode layer converts these to vscode.Uri at the use site
}
```

---

## Commands

```bash
# From the repo root (npm workspaces):
npm install            # install + link all workspaces
npm run build          # build all: core → vscode → cli
npm run build:core     # tsc → packages/core/dist
npm run build:vscode   # esbuild → packages/vscode/out/extension.js
npm run build:cli      # tsc → packages/cli/out
npm run watch          # esbuild watch (extension)
npm run lint           # eslint packages/*/src
npm test               # core unit tests
npm run test:all       # tests across all workspaces (--if-present)

# Per package (example):
npm run build --workspace=@dicodingacademy/code-diffchecker-core

# Debug the extension: press F5 (launches Extension Development Host)
# Package the extension: cd packages/vscode && npx @vscode/vsce package --no-dependencies
```

---

## Code Conventions

- **TypeScript strict mode** — `strict: true` via `tsconfig.base.json`, zero errors tolerated. Each package extends the base config.
- **CommonJS, ES2020 target** — set once in `tsconfig.base.json`.
- **No `vscode` import in `packages/core`** — the hard architectural boundary. Editor-specific glue lives only in the front-ends (e.g. `packages/vscode/src/gitBinary.ts`).
- **Build tooling** — core & cli compile with `tsc`; the extension bundles with **esbuild** (`vscode` external, core inlined).
- **minimatch** for glob matching — core's dependency, used by the diff engine and reused by CLI watch.
- **Student-facing error messages** — config/validation errors are human-readable (toast warnings in VS Code, clean stderr in the CLI), never raw stack traces. Keep core error wording editor-neutral since both front-ends surface it.
- **Unit tests** run via a per-package `test/run-tests.js` (lightweight esbuild-bundle → Node) using Node's `assert`.

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| **Git ≥ 2.28 required** | `--filter=blob:none` has bugs in versions 2.25–2.27 |
| **`core` has zero `vscode` imports** | Lets the same diff logic power both the extension and the CLI with no duplication |
| **`gitBinary.ts` bridges VS Code `git.path` → core** | Keeps core editor-agnostic; the extension injects the configured git path, the CLI injects its own |
| **`taskkill /pid /T /F` on Windows** | `process.kill()` sends POSIX signals that crash the VS Code Extension Host on Windows |
| **POSIX: detached process group, kill via `-pid`** | Ensures child processes like `git-remote-https` don't become orphaned zombies |
| **Cache keyed by MD5 of config** | Hash of `repoUrl + branch + targetFolder` ensures per-project isolation |
| **Extension cache in `globalStorageUri`; CLI cache in XDG** | Each front-end uses storage native to its platform (`~/.cache/diffchecker` for the CLI) |
| **Binary detection via null-byte scan** | First 8 KB checked — prevents rendering binary garbage in the diff editor |
| **Only config files are ignored under `.vscode/`** | The rest of `.vscode/` (like `launch.json`) can and should be diffed |
| **Failed pulls auto-nuke cache and re-clone** | Guarantees a clean state on next attempt rather than leaving corrupt cache |
| **Sparse-checkout with `--filter=blob:none`** | Downloads only the specific folder, saving bandwidth for large monorepos |
| **300 ms debounced file watching** | Batches rapid changes (e.g. auto-format saves) to prevent UI lag |
| **`core` bundled, not published** | `private: true`; esbuild inlines it into the VSIX, the CLI consumes it via the workspace symlink |

---

## Testing

| Package | Suites | Coverage |
|---|---|---|
| `core` | `config`, `gitService`, `diffEngine` | Config validation & dual-format discovery, Git version validation (2.28+), diff classification, ignore layers, binary detection, CRLF normalization |
| `cli`  | 4 suites | CLI-layer behavior (e.g. cache paths, command wiring) |

Run with `npm run test:all` (or `npm test` for core only). Tests run outside the Extension Host; the `vscode.js` mock at `packages/vscode/test/__mocks__/` is retained for future vscode-layer tests.

---

## Prerequisites

- **VS Code** ≥ 1.85.0 (to run the extension)
- **Git** ≥ 2.28
- **Node.js** ≥ 18

---

## Current Status

- ✅ **Monorepo pivot complete** — three packages (`core`, `cli`, `vscode`) extracted and wired via npm workspaces
- ✅ `core` is editor-agnostic (zero `vscode` imports)
- ✅ VS Code extension refactored onto `@dicodingacademy/code-diffchecker-core`
- ✅ CLI (`diffchecker`) implemented — `init`, `fetch`, `diff`, `diff <file>`, `watch`, `cache info`, `cache clear`
- ✅ TypeScript compiles; unit tests passing
- ⏳ Manual E2E testing (Extension Development Host + CLI on a real fixture) not yet run end-to-end
- ⏳ Publishing pending — extension to the Marketplace, CLI to npm (both still `private`)
