# AGENTS.md — Codex Agent Context

## Project

Code Diff-Checker is a VS Code extension for Dicoding Academy (EdTech). It lets students compare their local project against a GitHub-hosted solution via a sidebar TreeView with file-by-file diffs.

**Critical constraint:** No "Apply Changes" button exists by design. Students must read diffs and copy code manually. This is a pedagogical requirement — do not add auto-apply functionality.

## Setup

Prerequisites: VS Code ≥ 1.85.0, Git ≥ 2.28, Node.js ≥ 18.

```bash
npm install
```

## Commands

```bash
npm run compile        # Build via esbuild (single bundle → out/extension.js)
npm run watch          # Watch mode (auto-rebuild on changes)
npm run lint           # ESLint with TypeScript rules
node run-tests.js      # Run all 27 unit tests (Mocha + vscode mock)
```

Always run `node run-tests.js` after making changes to verify nothing is broken.
Always run `npm run lint` before committing.

## Code Style

- TypeScript with `strict: true` — zero compile errors tolerated
- esbuild bundles to `out/extension.js`; `vscode` is marked external
- Mocha for tests; `minimatch` for glob matching
- CommonJS modules, ES2020 target
- Student-facing error messages must be human-readable (no raw stack traces)
- Preserve all existing comments and docstrings unless directly modifying that code

## Architecture

```
src/
├── extension.ts          # Entry point — registers commands, orchestrates modules
├── types.ts              # Shared interfaces: CourseProjectConfig, DiffResult, ExecResult, DiffTreeNode
├── constants.ts          # Timeouts, ignore patterns, min Git version (2.28), binary threshold
├── config.ts             # Parses & validates .vscode/course-project.json
├── processManager.ts     # Cross-platform child_process wrapper with timeout + process kill
├── gitService.ts         # Git operations: clone, fetch, pull, version check
├── cacheManager.ts       # Cache lifecycle: MD5-hashed dirs in globalStorageUri
├── diffEngine.ts         # Tree walk, file classification (added/modified/deleted), binary detection
├── treeViewProvider.ts   # Sidebar TreeView UI with themed icons
└── test/
    ├── config.test.ts       # 9 tests
    ├── gitService.test.ts   # 9 tests
    ├── diffEngine.test.ts   # 9 tests
    └── __mocks__/vscode.js  # Minimal vscode API mock
```

Module flow:

```
config.ts → gitService.ts → cacheManager.ts
                  ↓
            diffEngine.ts → treeViewProvider.ts

processManager.ts ← used by gitService.ts
constants.ts, types.ts ← used by all modules
extension.ts ← top-level orchestrator
```

## Design Decisions

These are intentional — do not change without explicit approval:

1. **Git ≥ 2.28 required** — `--filter=blob:none` has bugs in 2.25–2.27.
2. **Windows process kill uses `taskkill /pid /T /F`** — `process.kill()` sends POSIX signals that crash the Extension Host on Windows.
3. **POSIX uses detached process group, kill via `-pid`** — prevents orphaned `git-remote-https` zombies.
4. **Cache key is MD5 of `repoUrl + branch + targetFolder`** — per-project isolation in `globalStorageUri`.
5. **Binary detection scans first 8KB for null bytes** — prevents VS Code from rendering binary garbage.
6. **Only `.vscode/course-project.json` is ignored in diffs** — the rest of `.vscode/` (e.g., `launch.json`) is diffable.
7. **Failed git pulls auto-nuke cache and re-clone** — guarantees clean state on retry.
8. **File watcher debounced at 300ms** — batches rapid saves to prevent UI lag.
9. **Git binary resolved from VS Code `git.path` setting first**, then falls back to PATH.

## Monorepo Pivot (Planned)

The project is being refactored from a VS Code-only extension into a monorepo:

```
packages/
├── core/       # Editor-agnostic shared library (zero vscode imports)
│               # Exports: config, git, cache, diff engine
├── cli/        # CLI tool: fetch, diff, diff <file>, watch, cache clear, cache info, init
└── vscode/     # VS Code extension, imports from @dicodingacademy/code-diffchecker-core
```

Key changes:
- New config file: `.diffchecker.json` at project root (backward compat with `.vscode/course-project.json`)
- Distribution: `npm install -g @dicodingacademy/code-diffchecker`
- **No `vscode` import allowed in `packages/core/`** — this is the hard boundary

## Testing

27 unit tests across 3 modules — all must pass before any PR:

| Module | Tests | Covers |
|---|---|---|
| config.test.ts | 9 | Valid config, missing fields, invalid URL, malformed JSON |
| gitService.test.ts | 9 | Version validation (2.28+, Windows format, edge cases) |
| diffEngine.test.ts | 9 | Add/modify/delete, ignore layers, binary detection, CRLF normalization |

Tests use a vscode mock at `src/test/__mocks__/vscode.js` to run outside the Extension Host.

## Current Status

- ✅ All 7 core modules complete and compiling
- ✅ 27 unit tests passing
- ⏳ Manual E2E testing not yet done
- ⏳ Monorepo pivot not yet started
