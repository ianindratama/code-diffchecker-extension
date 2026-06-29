> **HISTORICAL** — This describes the *pre-monorepo* VS Code-only extension and a point-in-time
> handoff (note the Windows `d:\tmp\` paths, which no longer apply). Kept for reference only.
> For current docs see [README.md](../../README.md) and [CLAUDE.md](../../CLAUDE.md).

# Project Handoff: Code Diff-Checker VS Code Extension

## What Is This Project?

A **VS Code Extension** for an EdTech company (Dicoding) that lets students compare their local work-in-progress project against a final solution hosted on GitHub, using a native TreeView UI with file-by-file diffs.

**Key constraint**: No "Apply Changes" button — students must manually read the diff and copy-paste code (pedagogical rule to encourage learning).

---

## Project Location

```
Extension source:       d:\tmp\code-diffchecker-extension\
Dummy test project:     d:\tmp\dummy-student-project\
```

---

## How It Works (User Flow)

1. Student clones a **starter project** that contains [.vscode/course-project.json](file:///d:/tmp/dummy-student-project/.vscode/course-project.json)
2. The config file points to a GitHub monorepo + a specific folder inside it
3. Student opens the project in VS Code → extension auto-activates
4. Student runs **"Fetch Solution"** → extension does a Git sparse-checkout of only the target folder
5. Extension computes a diff between the student's local files and the fetched solution
6. Results appear in a **sidebar TreeView** — clicking a file opens VS Code's native diff editor

---

## File Inventory

### Config & Build Files

| File | What It Does |
|---|---|
| [package.json](file:///d:/tmp/code-diffchecker-extension/package.json) | Extension manifest — commands, TreeView, activation events, dependencies |
| [tsconfig.json](file:///d:/tmp/code-diffchecker-extension/tsconfig.json) | TypeScript config (ES2020, strict, commonjs) |
| [esbuild.js](file:///d:/tmp/code-diffchecker-extension/esbuild.js) | Bundles extension into single [out/extension.js](file:///d:/tmp/code-diffchecker-extension/out/extension.js). Supports `--watch` mode |
| [.eslintrc.json](file:///d:/tmp/code-diffchecker-extension/.eslintrc.json) | TypeScript ESLint rules |
| [.vscodeignore](file:///d:/tmp/code-diffchecker-extension/.vscodeignore) | Excludes src/tests from packaged .vsix |
| [.vscode/launch.json](file:///d:/tmp/code-diffchecker-extension/.vscode/launch.json) | F5 debug config for Extension Development Host |
| [.vscode/tasks.json](file:///d:/tmp/code-diffchecker-extension/.vscode/tasks.json) | Watch build task with esbuild problem matcher |
| [run-tests.js](file:///d:/tmp/code-diffchecker-extension/run-tests.js) | Bundles and runs tests with vscode mock via esbuild |

### Source Modules (`src/`)

| File | Purpose | Key Exports |
|---|---|---|
| [types.ts](file:///d:/tmp/code-diffchecker-extension/src/types.ts) | Shared interfaces | [CourseProjectConfig](file:///d:/tmp/code-diffchecker-extension/src/types.ts#5-11), [DiffResult](file:///d:/tmp/code-diffchecker-extension/src/types.ts#29-37), [ExecResult](file:///d:/tmp/code-diffchecker-extension/src/types.ts#14-19), [DiffTreeNode](file:///d:/tmp/code-diffchecker-extension/src/types.ts#40-52) |
| [constants.ts](file:///d:/tmp/code-diffchecker-extension/src/constants.ts) | Shared constants | Timeouts, ignore patterns, min Git version (2.28), binary check threshold |
| [config.ts](file:///d:/tmp/code-diffchecker-extension/src/config.ts) | Config loader | [loadConfig()](file:///d:/tmp/code-diffchecker-extension/src/config.ts#7-108) — parses + validates [.vscode/course-project.json](file:///d:/tmp/dummy-student-project/.vscode/course-project.json) with descriptive student-facing errors |
| [processManager.ts](file:///d:/tmp/code-diffchecker-extension/src/processManager.ts) | Cross-platform child_process wrapper | [execGit()](file:///d:/tmp/code-diffchecker-extension/src/processManager.ts#6-77) — spawns Git with timeout, uses `taskkill` on Windows (not POSIX signals) |
| [gitService.ts](file:///d:/tmp/code-diffchecker-extension/src/gitService.ts) | Git operations | [resolveGitBinary()](file:///d:/tmp/code-diffchecker-extension/src/gitService.ts#10-49), [validateGitVersion()](file:///d:/tmp/code-diffchecker-extension/src/gitService.ts#50-73), [cloneSparse()](file:///d:/tmp/code-diffchecker-extension/src/gitService.ts#99-197), [checkForUpdates()](file:///d:/tmp/code-diffchecker-extension/src/gitService.ts#198-252), [pullUpdate()](file:///d:/tmp/code-diffchecker-extension/src/gitService.ts#253-285) |
| [cacheManager.ts](file:///d:/tmp/code-diffchecker-extension/src/cacheManager.ts) | Cache lifecycle | [getCacheDir()](file:///d:/tmp/code-diffchecker-extension/src/cacheManager.ts#8-20) (MD5-hashed), [isCacheValid()](file:///d:/tmp/code-diffchecker-extension/src/cacheManager.ts#21-43), [nukeCache()](file:///d:/tmp/code-diffchecker-extension/src/cacheManager.ts#44-54), [clearAllCaches()](file:///d:/tmp/code-diffchecker-extension/src/cacheManager.ts#55-66) |
| [diffEngine.ts](file:///d:/tmp/code-diffchecker-extension/src/diffEngine.ts) | Diff computation | [computeDiff()](file:///d:/tmp/code-diffchecker-extension/src/diffEngine.ts#9-86) — walks both trees, merges ignore layers, classifies added/modified/deleted, detects binaries |
| [treeViewProvider.ts](file:///d:/tmp/code-diffchecker-extension/src/treeViewProvider.ts) | Sidebar UI | [DiffTreeViewProvider](file:///d:/tmp/code-diffchecker-extension/src/treeViewProvider.ts#9-219) — hierarchical TreeView, themed icons, click-to-diff, binary files unclickable |
| [extension.ts](file:///d:/tmp/code-diffchecker-extension/src/extension.ts) | Entry point | [activate()](file:///d:/tmp/code-diffchecker-extension/src/extension.ts#13-58) — registers commands, auto-loads cache, background update check with toast notification |

### Tests (`src/test/`)

| File | Tests | Status |
|---|---|---|
| [config.test.ts](file:///d:/tmp/code-diffchecker-extension/src/test/config.test.ts) | 9 tests — valid config, missing fields, invalid URL, malformed JSON, missing file | ✅ All pass |
| [gitService.test.ts](file:///d:/tmp/code-diffchecker-extension/src/test/gitService.test.ts) | 9 tests — version validation (2.28+ required, Windows format, edge cases) | ✅ All pass |
| [diffEngine.test.ts](file:///d:/tmp/code-diffchecker-extension/src/test/diffEngine.test.ts) | 9 tests — add/modify/delete classification, ignore layers, binary detection | ✅ All pass |
| [__mocks__/vscode.js](file:///d:/tmp/code-diffchecker-extension/src/test/__mocks__/vscode.js) | Minimal vscode API mock for running tests outside Extension Host | — |

### Dummy Test Project

| File | What It Does |
|---|---|
| [.vscode/course-project.json](file:///d:/tmp/dummy-student-project/.vscode/course-project.json) | Points to `dicodingacademy/a159-flutter-pemula-labs` → `navigation_project` |
| [lib/main.dart](file:///d:/tmp/dummy-student-project/lib/main.dart) | Simplified Flutter code that intentionally differs from the solution |
| [pubspec.yaml](file:///d:/tmp/dummy-student-project/pubspec.yaml) | Flutter project metadata |

---

## Architecture Decisions Made

These came from a critical review of the original design document:

1. **Git >= 2.28 required** (not 2.25) — `--filter=blob:none` has bugs in 2.25-2.28
2. **Cache invalidation uses `git rev-parse HEAD` vs `git rev-parse origin/<branch>`** — NOT `git status` (which only compares working tree vs index)
3. **Windows process termination uses `taskkill /pid /T /F`** — NOT `process.kill()` which sends POSIX signals that crash the Extension Host on Windows
4. **Cache integrity check** — after clone, verifies target folder exists and is non-empty; any failure nukes the cache
5. **Git binary resolved from VS Code settings first** — reads `git.path` config before falling back to PATH
6. **Only `.vscode/course-project.json` is ignored** — NOT the entire `.vscode/` directory (so `launch.json` etc. can be diffed)
7. **Cache stored in `context.globalStorageUri`** — MD5-hashed per-config subdirectories for workspace isolation
8. **Binary files detected via null-byte scanning** (first 8KB)
9. **Progress indicators** via `vscode.window.withProgress()` for all network operations
10. **Failed pulls auto-nuke cache** and re-clone from scratch

---

## Original Design Document

The original architecture spec that started the project is at:
[system-instruction.md](file:///d:/tmp/code-diffchecker-extension/system-instruction.md)

---

## Current Status

| Area | Status |
|---|---|
| Project scaffolding | ✅ Complete |
| All 7 core modules | ✅ Complete |
| Unit tests (27 total) | ✅ All passing |
| TypeScript compilation | ✅ Zero errors |
| esbuild bundle | ✅ Builds successfully |
| Manual E2E test | ⏳ Not yet done — dummy project created but not tested in Extension Host |

---

## What Still Needs To Be Done

1. **Manual E2E test** — Press F5 in the extension project, open the dummy project, run "Fetch Solution", verify the TreeView populates with diffs
2. **TreeView hierarchy bug potential** — The `buildTree()` method in `treeViewProvider.ts` has a complex map-to-array conversion that could have edge cases with deeply nested paths — worth verifying visually
3. **Marketplace publishing** — When ready: `npx @vscode/vsce package` then publish
4. **README.md** — Not yet created for the extension
5. **Extension icon** — Not yet designed

---

## Commands to Run

```bash
# Install dependencies
cd d:\tmp\code-diffchecker-extension
npm install

# Compile
npm run compile

# Watch mode
npm run watch

# Run unit tests
node run-tests.js

# Launch Extension Development Host
# Press F5 in VS Code with the extension project open
```
