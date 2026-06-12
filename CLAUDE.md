# CLAUDE.md — AI Coding Assistant Context

> This file provides context for AI coding assistants (Claude, Gemini, Copilot, etc.) working on this project.
> Read this before making any changes.

---

## Project Overview

**Code Diff-Checker** is a VS Code extension built for [Dicoding Academy](https://www.dicoding.com/) — an EdTech platform where students learn by building real projects. The extension lets students compare their local work-in-progress project against a final solution hosted on GitHub, using a native TreeView UI with file-by-file diffs.

**How it works:**
1. A starter project contains `.vscode/course-project.json` pointing to a GitHub monorepo + specific folder
2. The extension auto-activates, performs a Git sparse-checkout of only the target folder
3. It computes a diff between the student's local files and the fetched solution
4. Results appear in a sidebar TreeView — clicking a file opens VS Code's native diff editor

**Pedagogical constraint:** There is intentionally **no "Apply Changes" button**. Students must manually read the diff and copy code — this encourages deeper learning. Do not add one.

---

## Upcoming Pivot

We are converting this project from a VS Code-only extension into a **monorepo** with three packages:

```
packages/
├── core/       # Editor-agnostic shared library (config, git, cache, diff engine)
├── cli/        # CLI tool that works with any editor
└── vscode/     # The existing VS Code extension, refactored to use core
```

### Core (`packages/core/`)
Editor-agnostic shared library. Must have **zero** `vscode` imports. Exposes:
- Config loading (supports both `.diffchecker.json` and `.vscode/course-project.json`)
- Git operations (clone, fetch, pull, version check)
- Cache management (MD5-hashed directories)
- Diff engine (tree walk, classification, binary detection)

### CLI (`packages/cli/`)
Standalone CLI tool that works with any editor. Planned commands:

| Command | Description |
|---|---|
| `diffchecker fetch` | Clone/update the solution |
| `diffchecker diff` | Full project diff (terminal output) |
| `diffchecker diff <file>` | Single file diff |
| `diffchecker watch` | Watch mode — re-diff on file changes |
| `diffchecker cache clear` | Delete cached solution |
| `diffchecker cache info` | Show cache location and status |
| `diffchecker init` | Generate a `.diffchecker.json` config file interactively |

### VS Code Extension (`packages/vscode/`)
The existing extension, refactored to import from `@dicodingacademy/code-diffchecker-core` instead of local modules.

### New Config Format
New config file: `.diffchecker.json` at project root (backward compatible with `.vscode/course-project.json`).

### Distribution
```bash
npm install -g @dicodingacademy/code-diffchecker
```

---

## Architecture

### Current Module Map

```
src/
├── extension.ts          # Entry point — registers commands, orchestrates modules
├── types.ts              # Shared TypeScript interfaces (CourseProjectConfig, DiffResult, ExecResult, DiffTreeNode)
├── constants.ts          # Timeouts, ignore patterns, min Git version (2.28), binary check threshold
├── config.ts             # Parses & validates .vscode/course-project.json
├── processManager.ts     # Cross-platform child_process wrapper with timeout
├── gitService.ts         # Git operations (clone, fetch, pull, version check)
├── cacheManager.ts       # Cache lifecycle (MD5-hashed directories in globalStorageUri)
├── diffEngine.ts         # Walks both trees, classifies added/modified/deleted, detects binaries
├── treeViewProvider.ts   # Sidebar TreeView UI with themed icons
└── test/
    ├── config.test.ts       # 9 tests — config validation
    ├── gitService.test.ts   # 9 tests — Git version validation
    ├── diffEngine.test.ts   # 9 tests — diff classification, binary detection
    └── __mocks__/vscode.js  # Minimal vscode API mock
```

### Module Relationships

```
┌──────────────┐     ┌────────────────┐     ┌────────────────┐
│  config.ts   │────▶│  gitService.ts │────▶│ cacheManager.ts│
│  (load JSON) │     │ (sparse clone) │     │  (MD5 cache)   │
└──────────────┘     └──────┬─────────┘     └────────────────┘
                            │
                            ▼
                   ┌────────────────┐     ┌──────────────────┐
                   │ diffEngine.ts  │────▶│treeViewProvider.ts│
                   │ (walk & diff)  │     │   (sidebar UI)    │
                   └────────────────┘     └──────────────────┘

processManager.ts ← used by gitService.ts (cross-platform spawn with timeout)
constants.ts      ← used by all modules
types.ts          ← used by all modules
extension.ts      ← orchestrator, wires everything together
```

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
  localUri?: vscode.Uri;
  solutionUri?: vscode.Uri;
}
```

---

## Commands

```bash
# Build (single build via esbuild)
npm run compile

# Watch mode (auto-rebuild on changes)
npm run watch

# Lint (ESLint with TypeScript rules)
npm run lint

# Run all 27 unit tests
node run-tests.js

# Debug: Press F5 in VS Code to launch Extension Development Host

# Package for distribution
npx @vscode/vsce package
```

---

## Code Conventions

- **TypeScript strict mode** — `strict: true` in tsconfig.json, zero errors tolerated
- **esbuild** for bundling — single output `out/extension.js`, `vscode` is external
- **Mocha** for unit tests — 27 tests across 3 modules, run via `node run-tests.js`
- **minimatch** for glob matching — used in diff engine for ignore patterns
- **No `vscode` import in core modules** (after the monorepo pivot) — only `treeViewProvider.ts` and `extension.ts` should use the VS Code API
- **Student-facing error messages** — config validation errors are human-readable toast warnings, not stack traces
- **CommonJS module format** — target ES2020, module NodeNext

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| **Git ≥ 2.28 required** | `--filter=blob:none` has bugs in versions 2.25–2.27 |
| **`taskkill /pid /T /F` on Windows** | `process.kill()` sends POSIX signals that crash the VS Code Extension Host on Windows |
| **POSIX: detached process group, kill via `-pid`** | Ensures child processes like `git-remote-https` don't become orphaned zombies |
| **Cache uses MD5 hash of config** | Hash of `repoUrl + branch + targetFolder` ensures per-project isolation in `globalStorageUri` |
| **Binary detection via null-byte scan** | First 8KB checked — prevents VS Code from rendering binary garbage in diff editor |
| **Only `.vscode/course-project.json` is ignored** | The rest of `.vscode/` (like `launch.json`) can and should be diffed |
| **Failed pulls auto-nuke cache and re-clone** | Guarantees a clean state on next attempt rather than leaving corrupt cache |
| **Sparse-checkout with `--filter=blob:none`** | Downloads only the specific folder, saving bandwidth for large monorepos |
| **300ms debounced file watching** | Batches rapid changes (e.g., auto-format saves) to prevent UI lag |
| **Git binary resolved from VS Code settings first** | Reads `git.path` config before falling back to PATH |
| **Cache stored in `context.globalStorageUri`** | Per-extension, per-machine storage managed by VS Code |

---

## Testing

| Module | Tests | Coverage |
|---|---|---|
| `config.test.ts` | 9 | Valid config, missing fields, invalid URL, malformed JSON, missing file |
| `gitService.test.ts` | 9 | Version validation (2.28+ required, Windows format, edge cases) |
| `diffEngine.test.ts` | 9 | Add/modify/delete classification, ignore layers, binary detection, CRLF normalization |

All tests use a minimal `vscode.js` mock at `src/test/__mocks__/vscode.js` to run outside the Extension Host.

---

## Prerequisites

- **VS Code** ≥ 1.85.0
- **Git** ≥ 2.28
- **Node.js** ≥ 18 (development only)

---

## Current Status

- ✅ All 7 core modules complete
- ✅ 27 unit tests passing
- ✅ TypeScript compiles with zero errors
- ✅ esbuild bundles successfully
- ⏳ Manual E2E testing not yet done
- ⏳ Monorepo pivot not yet started
