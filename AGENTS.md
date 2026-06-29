# AGENTS.md — Agent Context

> Context for coding agents working on this project. Kept in sync with `CLAUDE.md` (the equivalent file for Claude); update both together.

## Project

Code Diff-Checker is a tool for [Dicoding Academy](https://www.dicoding.com/) (EdTech) that lets students compare their local project against a GitHub-hosted solution. It ships as **two front-ends over one shared core**: a VS Code extension (sidebar TreeView, side-by-side diffs) and a standalone `diffchecker` CLI for any editor.

**Critical constraint:** No "Apply Changes" / auto-merge button exists, by design. Students must read diffs and copy code manually — a pedagogical requirement. Do not add auto-apply.

## Monorepo layout

npm-workspaces monorepo (`workspaces: ["packages/*"]`), three packages:

```
packages/
├── core/    # @dicodingacademy/code-diffchecker-core — editor-agnostic library, ZERO vscode imports (private)
├── cli/     # @dicodingacademy/code-diffchecker — the `diffchecker` binary
└── vscode/  # code-diffchecker — the VS Code extension (publisher dicodingacademy)
```

Dependency direction: `cli` and `vscode` both depend on `core`; nothing depends on a front-end. Build order is **core → vscode → cli** (core must compile to `dist/` first).

## Setup & commands

Prerequisites: Node.js ≥ 18, Git ≥ 2.28, VS Code ≥ 1.85.0 (to run the extension).

```bash
npm install            # install + link all workspaces
npm run build          # build all: core → vscode → cli
npm run build:core     # tsc → packages/core/dist
npm run build:vscode   # esbuild → packages/vscode/out/extension.js
npm run build:cli      # tsc → packages/cli/out
npm run watch          # esbuild watch (extension)
npm run lint           # eslint packages/*/src
npm test               # core unit tests
npm run test:all       # tests across all workspaces (--if-present)
```

Always run `npm run test:all` and `npm run lint` after changes; both must be clean before a PR.

## Code style

- TypeScript `strict: true` (via `tsconfig.base.json`); zero compile errors tolerated.
- CommonJS, ES2020 target — set once in `tsconfig.base.json`; each package extends it.
- core & cli build with `tsc`; the extension bundles with **esbuild** (`vscode` external, core inlined).
- `minimatch` for glob matching (core's dep, reused by CLI watch).
- Student-facing errors must be human-readable (VS Code toasts / clean CLI stderr), never raw stack traces. Keep core error wording editor-neutral — both front-ends surface it.
- Preserve existing comments/docstrings unless directly modifying that code.

## Architecture (file inventory)

```
packages/core/src/
├── index.ts          # public API barrel
├── types.ts          # CourseProjectConfig, DiffResult, DiffStatus, ExecResult, ExecOptions, DiffTreeNode
├── constants.ts      # MIN_GIT_VERSION (2.28), CONFIG_FILENAMES, timeouts, HARDCODED_IGNORE_PATTERNS, BINARY_CHECK_BYTES
├── config.ts         # probes & validates .diffchecker.json / .vscode/course-project.json
├── processManager.ts # cross-platform child_process wrapper with timeout (execGit)
├── gitService.ts     # resolveGitBinary(configuredPath?), version check, sparse clone, update check, pull
├── cacheManager.ts   # cache lifecycle (MD5-hashed dirs under a caller-supplied storage path)
└── diffEngine.ts     # tree walk, added/modified/deleted classification, binary detection
packages/core/test/   # config.test.ts, gitService.test.ts, diffEngine.test.ts + run-tests.js

packages/cli/src/
├── index.ts          # entry (shebang), commander tree, global flags, error→exit-code boundary
├── types.ts errors.ts cachePaths.ts   # GlobalOptions etc.; CliError w/ exit code; XDG cache root
└── commands/         # fetch.ts, diff.ts, watch.ts, cache.ts, init.ts
packages/cli/test/    # 4 test files + run-tests.js

packages/vscode/src/
├── extension.ts        # entry — commands, TreeView, file watcher, background update check
├── treeViewProvider.ts # sidebar TreeView UI; converts core's *Path strings to vscode.Uri at the diff call site
└── gitBinary.ts        # the ONLY vscode↔core glue: reads `git.path` setting → core resolveGitBinary()
packages/vscode/test/__mocks__/vscode.js   # minimal vscode mock (future vscode-layer tests)
```

Key interface change from the pre-monorepo version: `DiffResult` now carries plain string paths (`localPath?`, `solutionPath?`), **not** `vscode.Uri` — core is editor-agnostic. The vscode layer builds URIs at the use site.

## CLI commands

`init` · `fetch` · `diff` · `diff <file>` · `watch` · `cache info` · `cache clear`. Global flags: `--json`, `--no-color`. Exit codes: `0` no differences, `1` differences found, `2` error. CLI cache: `$XDG_CACHE_HOME/diffchecker` (fallback `~/.cache/diffchecker`).

## Design decisions (intentional — do not change without approval)

1. **Git ≥ 2.28 required** — `--filter=blob:none` has bugs in 2.25–2.27.
2. **`core` has zero `vscode` imports** — the hard boundary that lets one codebase power both front-ends.
3. **`gitBinary.ts` bridges VS Code `git.path` → core** — keeps core editor-agnostic; CLI injects its own git path.
4. **Windows kill uses `taskkill /pid /T /F`** — `process.kill()` POSIX signals crash the Extension Host on Windows.
5. **POSIX: detached process group, kill via `-pid`** — prevents orphaned `git-remote-https` zombies.
6. **Cache key = MD5 of `repoUrl + branch + targetFolder`** — per-project isolation.
7. **Extension cache in `globalStorageUri`; CLI cache in XDG** — storage native to each platform.
8. **Binary detection scans first 8 KB for null bytes** — prevents rendering binary garbage.
9. **Only the config files are ignored under `.vscode/`** — the rest (e.g. `launch.json`) is diffable.
10. **Failed pulls auto-nuke cache and re-clone** — clean state on retry.
11. **File watcher debounced at 300 ms** — batches rapid saves to prevent UI lag.
12. **`core` is bundled, not published** — `private: true`; esbuild inlines it into the VSIX; the CLI consumes it via the workspace symlink.

## Testing

`core`: `config`, `gitService`, `diffEngine` suites (config validation & dual-format discovery, Git version 2.28+, diff classification, ignore layers, binary detection, CRLF normalization). `cli`: 4 suites (cache paths, command wiring). Run with `npm run test:all`; tests use Node's `assert` via each package's `test/run-tests.js` and run outside the Extension Host.

## Current status

- ✅ Monorepo pivot complete — `core`, `cli`, `vscode` extracted and wired via npm workspaces.
- ✅ `core` editor-agnostic; extension refactored onto it; CLI implemented (all 7 commands).
- ✅ TypeScript compiles; unit tests passing.
- ⏳ Full manual E2E (Extension Development Host + CLI fixture) not yet run end-to-end.
- ⏳ Publishing pending — extension to Marketplace, CLI to npm (both still `private`).
