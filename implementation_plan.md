# Code Diff-Checker VS Code Extension — Implementation Plan

Build a VS Code extension that compares a student's local project against a GitHub-hosted solution, with a TreeView showing file-by-file diffs.

## User Review Required

> [!IMPORTANT]
> **No existing codebase** — this is a greenfield project. All files are `[NEW]`.

> [!WARNING]
> The extension **requires Git >= 2.28** installed on the student's machine. Students with older Git versions will see an actionable error message prompting them to upgrade.

---

## Proposed Changes

### Project Scaffolding

#### [NEW] [package.json](file:///d:/tmp/code-diffchecker-extension/package.json)

Extension manifest. Key decisions:
- **Activation**: `workspaceContains:.vscode/course-project.json` — only activates when config exists
- **Commands**: `codeDiffChecker.fetchSolution`, `codeDiffChecker.refreshDiff`, `codeDiffChecker.clearCache`
- **TreeView**: contributes `views` in the Explorer sidebar under a `codeDiffChecker` view container
- **Dependencies**: `minimatch` (glob matching)
- **Dev dependencies**: `typescript`, `@types/vscode`, `@types/node`, `esbuild` (bundler), `@vscode/test-cli`, `@vscode/test-electron`, `@types/mocha`, `mocha`

#### [NEW] [tsconfig.json](file:///d:/tmp/code-diffchecker-extension/tsconfig.json)

Standard TypeScript config targeting ES2020, module NodeNext, strict mode, `outDir: ./out`.

#### [NEW] [.vscodeignore](file:///d:/tmp/code-diffchecker-extension/.vscodeignore)

Exclude `src/`, `node_modules/`, test files, and `.vscode/` from the packaged `.vsix`.

#### [NEW] [.eslintrc.json](file:///d:/tmp/code-diffchecker-extension/.eslintrc.json)

TypeScript ESLint config with recommended rules.

#### [NEW] [esbuild.js](file:///d:/tmp/code-diffchecker-extension/esbuild.js)

Build script to bundle the extension into a single `out/extension.js` file (external: `vscode`).

---

### Config Loader

#### [NEW] [src/config.ts](file:///d:/tmp/code-diffchecker-extension/src/config.ts)

Parses and validates `.vscode/course-project.json` from the workspace root.

- **`loadConfig(workspaceRoot: string): Promise<CourseProjectConfig>`**
  - Reads file, parses JSON with `try/catch` (shows "Invalid JSON" error with file path)
  - Validates required fields: `repoUrl`, `branch`, `targetFolder`
  - Validates `repoUrl` is a valid Git HTTPS URL (basic regex: `^https://github\.com/.+\.git$`)
  - `ignorePaths` is optional, defaults to `[]`
  - Returns typed `CourseProjectConfig` interface

```typescript
interface CourseProjectConfig {
  repoUrl: string;
  branch: string;
  targetFolder: string;
  ignorePaths: string[];
}
```

---

### Process Manager

#### [NEW] [src/processManager.ts](file:///d:/tmp/code-diffchecker-extension/src/processManager.ts)

Cross-platform `child_process` wrapper that handles Windows vs POSIX correctly.

- **`execGit(args: string[], cwd: string, options?: ExecOptions): Promise<ExecResult>`**
  - Spawns `git` with `child_process.spawn` (NOT `exec`, to avoid shell injection and buffer limits)
  - Uses the Git binary path from `gitService` (resolved from VS Code settings or PATH)
  - Collects `stdout` and `stderr` as strings
  - Enforces a configurable **timeout** (default: 120s for clone, 30s for status commands)
  - On timeout, kills the process **cross-platform**:
    - POSIX: `process.kill(pid, 'SIGTERM')`
    - Windows: `child_process.exec('taskkill /pid ' + pid + ' /T /F')`
  - Returns `{ stdout, stderr, exitCode }`
  - All paths passed as args are normalized to forward slashes

---

### Git Service

#### [NEW] [src/gitService.ts](file:///d:/tmp/code-diffchecker-extension/src/gitService.ts)

High-level Git operations built on top of the process manager.

- **`resolveGitBinary(): Promise<string>`**
  - Priority: `vscode.workspace.getConfiguration('git').get('path')` → `git` in PATH
  - Validates by running `git --version`
  - Caches the result for the session

- **`validateGitVersion(versionString: string): boolean`**
  - Parses version string (e.g. `git version 2.39.1.windows.1`)
  - Returns `false` if major < 2 or (major === 2 && minor < 28)
  - Shows actionable error: *"Git 2.28+ is required. You have X.Y. [Download Git](https://git-scm.com/downloads)"*

- **`cloneSparse(repoUrl, branch, targetFolder, cacheDir): Promise<void>`**
  - Executes the 3-step clone sequence with error handling between each step:
    1. `git clone --filter=blob:none --no-checkout --depth 1 --sparse -b <branch> <repoUrl> <cacheDir>`
    2. `git sparse-checkout set <targetFolder>` (using `set`, not `add`, for a clean state)
    3. `git checkout`
  - After step 3, verifies `<cacheDir>/<targetFolder>` exists and is non-empty
  - If any step fails: nukes `cacheDir` entirely and throws a descriptive error

- **`checkForUpdates(cacheDir, branch): Promise<boolean>`**
  - Runs `git fetch origin <branch>` (with 15s timeout)
  - Compares `git rev-parse HEAD` vs `git rev-parse origin/<branch>`
  - Returns `true` if hashes differ (remote has new commits)

- **`pullUpdate(cacheDir, branch): Promise<void>`**
  - Runs `git pull origin <branch>` followed by re-checkout
  - On failure, nukes cache and re-clones from scratch

---

### Cache Manager

#### [NEW] [src/cacheManager.ts](file:///d:/tmp/code-diffchecker-extension/src/cacheManager.ts)

Manages cache directory lifecycle using `context.globalStorageUri`.

- **`getCacheDir(context, config): string`**
  - Returns `<globalStorageUri>/cache/<hash(repoUrl + branch + targetFolder)>`
  - Hash ensures per-config isolation (avoids clashes when multiple workspaces use same repo)

- **`isCacheValid(cacheDir, targetFolder): boolean`**
  - Checks: directory exists AND `<cacheDir>/<targetFolder>` exists AND is non-empty
  - If directory exists but target folder is missing/empty → invalid (partial clone)

- **`nukeCache(cacheDir): Promise<void>`**
  - Recursively deletes the cache directory via `fs.rm(cacheDir, { recursive: true, force: true })`

- **`clearAllCaches(context): Promise<void>`**
  - Deletes entire `<globalStorageUri>/cache/` — used by the `clearCache` command

---

### Diff Engine

#### [NEW] [src/diffEngine.ts](file:///d:/tmp/code-diffchecker-extension/src/diffEngine.ts)

Walks both directory trees and classifies every file.

- **`computeDiff(localRoot, solutionRoot, ignorePatterns): Promise<DiffResult[]>`**
  - Recursively walks both trees simultaneously
  - Merges hardcoded ignores (Layer 1: `.git/`, `.DS_Store`) with config ignores (Layer 2)
  - Note: `.vscode/course-project.json` is specifically ignored, NOT the entire `.vscode/` dir
  - Filters paths using `minimatch` before comparison
  - For each file, classifies as:
    - `added` — exists in solution, not in local
    - `deleted` — exists in local, not in solution
    - `modified` — exists in both, content differs (via file hash comparison using `crypto.createHash('md5')`)
    - `unchanged` — exists in both, same content (excluded from results)
  - Detects binary files by checking the first 8KB for null bytes
  - Returns flat list of `DiffResult` objects:

```typescript
interface DiffResult {
  relativePath: string;
  status: 'added' | 'modified' | 'deleted';
  isBinary: boolean;
  localUri?: vscode.Uri;
  solutionUri?: vscode.Uri;
}
```

---

### TreeView Provider

#### [NEW] [src/treeViewProvider.ts](file:///d:/tmp/code-diffchecker-extension/src/treeViewProvider.ts)

Implements `vscode.TreeDataProvider<DiffTreeItem>` for the sidebar.

- **Hierarchical structure**: Groups files by directory, creating folder nodes, matching VS Code's explorer pattern
- **`getChildren(element?)`**:
  - Root call: returns top-level folders and files from the diff results
  - Folder call: returns child items of that folder
- **`getTreeItem(element)`**:
  - Sets `iconPath` using ThemeIcons: `$(diff-added)`, `$(diff-modified)`, `$(diff-removed)`, `$(file-binary)`
  - Sets `description` to show status text (e.g., "Modified", "Added")
  - For non-binary files: sets `command` to `vscode.diff` with both URIs and a title like `"filename (Student ↔ Solution)"`
  - For binary files: sets `tooltip` to *"Binary file — cannot show diff"*, no command
- **`refresh(diffResults)`**: Fires `onDidChangeTreeData` event to re-render the tree
- **Empty state**: When no diffs exist, shows welcome message via `viewsWelcome` in `package.json`

---

### Extension Entry Point

#### [NEW] [src/extension.ts](file:///d:/tmp/code-diffchecker-extension/src/extension.ts)

Orchestrates all modules.

- **`activate(context)`**:
  1. Try to load config → if missing, register TreeView with welcome message and return
  2. Resolve & validate Git binary + version
  3. Register TreeView provider
  4. Register commands:
     - `codeDiffChecker.fetchSolution`: Full clone/refresh flow with `vscode.window.withProgress()`
     - `codeDiffChecker.refreshDiff`: Re-compute diff from existing cache (no network)
     - `codeDiffChecker.clearCache`: Nuke cache + refresh TreeView
  5. If cache exists and is valid: compute diff immediately, populate TreeView
  6. Background: check for updates → show toast if behind remote

- **`deactivate()`**: No-op (no cleanup needed, cache persists).

---

### Auxiliary Files

#### [NEW] [src/constants.ts](file:///d:/tmp/code-diffchecker-extension/src/constants.ts)

Shared constants: timeout values, hardcoded ignore patterns, min Git version, config filename.

#### [NEW] [src/types.ts](file:///d:/tmp/code-diffchecker-extension/src/types.ts)

Shared TypeScript interfaces (`CourseProjectConfig`, `DiffResult`, `ExecResult`, `DiffTreeItem`).

#### [NEW] [.vscode/launch.json](file:///d:/tmp/code-diffchecker-extension/.vscode/launch.json)

Debug configuration for launching the Extension Development Host.

---

## Verification Plan

### Automated Tests

Tests live in `src/test/` and run via `@vscode/test-cli` + Mocha.

**Run command:**
```bash
npx @vscode/test-cli run
```

#### Test: Config Validation (`src/test/config.test.ts`)
- ✅ Valid config parses correctly
- ✅ Missing `repoUrl` throws descriptive error
- ✅ Missing `branch` throws descriptive error
- ✅ Missing `targetFolder` throws descriptive error
- ✅ Invalid `repoUrl` (not a GitHub HTTPS URL) throws error
- ✅ Malformed JSON throws "Invalid JSON" error
- ✅ Missing `ignorePaths` defaults to `[]`

#### Test: Diff Engine (`src/test/diffEngine.test.ts`)
- ✅ Identical directories produce zero results
- ✅ File only in solution → classified as `added`
- ✅ File only in local → classified as `deleted`
- ✅ File in both with different content → classified as `modified`
- ✅ Hardcoded ignores (`.git/`, `.DS_Store`) are filtered out
- ✅ Config-driven ignores (`build/`, `*.iml`) are filtered out
- ✅ `.vscode/course-project.json` is ignored but `.vscode/launch.json` is NOT ignored
- ✅ Binary file (containing null bytes) is flagged as `isBinary: true`
- ✅ Nested directory structure produces correct hierarchical paths

#### Test: Git Version Validation (`src/test/gitService.test.ts`)
- ✅ `git version 2.39.1` → valid
- ✅ `git version 2.28.0` → valid
- ✅ `git version 2.25.1` → invalid
- ✅ `git version 2.25.1.windows.1` → invalid (Windows format)
- ✅ Unparseable string → invalid

### Manual End-to-End Test

> [!NOTE]
> This requires a real GitHub repo. I recommend we use an existing Dicoding public repo for testing. If none is suitable, I can create a small test fixture repo.

**Steps:**

1. **Prepare test workspace:**
   - Create a directory, e.g., `test-student-project/`
   - Add a `.vscode/course-project.json` pointing to a real Dicoding public repo
   - Add a few files that intentionally differ from the solution

2. **Install the extension locally:**
   ```bash
   cd d:\tmp\code-diffchecker-extension
   npm run compile
   ```
   Then press **F5** in VS Code to launch the Extension Development Host

3. **Open the test workspace** in the Extension Development Host

4. **Verify activation:**
   - The "Code Diff-Checker" TreeView should appear in the Explorer sidebar
   - If Git is not found or version is too old, an error notification should appear

5. **Run "Fetch Solution" command** from the Command Palette (`Ctrl+Shift+P` → "Code Diff-Checker: Fetch Solution")
   - A progress bar should appear during clone
   - After completion, the TreeView should populate with file diffs

6. **Verify TreeView:**
   - Added files show green `+` icon
   - Modified files show orange `~` icon
   - Deleted files show red `-` icon
   - Binary files show a binary icon and are **not clickable**
   - Clicking a text file opens the **side-by-side diff editor**

7. **Test error scenarios:**
   - Delete `.vscode/course-project.json` and reload → extension deactivates gracefully
   - Set `repoUrl` to an invalid URL → clear error message shown
   - Set `targetFolder` to a non-existent path → error after clone
   - Disconnect internet mid-clone → timeout triggers, cache is cleaned up
