> **HISTORICAL** — A feature recap of the *pre-monorepo* VS Code-only extension. The features
> described still exist (now powered by the shared `core` package), but the structure is outdated.
> For current docs see [README.md](../../README.md) and [CLAUDE.md](../../CLAUDE.md).

# Code Diff-Checker Extension: Feature Recap

This extension allows students to compare their local project against a final solution hosted on GitHub using a native VS Code UI. It enforces manual reading and copying of differences (no "Apply Changes" button), which is a pedagogical requirement for effective learning.

Here is a recap of all the functionality currently implemented:

## 1. Core Functionality
- **Automated Solution Fetching**: When a student opens a project with a `.vscode/course-project.json` file, the extension auto-activates. It reads the GitHub URL, branch, and target folder from the config.
- **Git Sparse-Checkout**: To save bandwidth and time, it uses sparse-checkout to download *only the specific folder* needed for the current project, ignoring the rest of the monorepo.
- **Local Caching & Isolation**: Solutions are stored in VS Code's `globalStorageUri` inside MD5-hashed directories. This ensures multiple projects or workspaces don't overwrite each other's caches.
- **Background Updates**: The extension silently checks for updates to the solution branch in the background. If a newer version is available, it shows a toast notification prompting the student to update.

## 2. Dual Comparison Modes
- **Full Project Diff ("Fetch Solution")**: Compares the entire local student project against the downloaded solution tree. The results are grouped by category (Added, Modified, Deleted) and displayed in the sidebar TreeView.
- **Single File Diff ("Compare Current File")**: Allows the student to compare just the file they are actively editing. It directly splits the editor to show the local file vs. the solution file using VS Code's native `vscode.diff`. If the solution hasn't been fetched yet, it auto-fetches it first.

## 3. User Interface Integration
- **Sidebar TreeView**: A custom panel (`codeDiffCheckerTree`) that visually lists all differing files with themed icons. Clicking a file opens the native diff editor.
- **Status Bar Menu Button**: A persistent `$(beaker) Diff-Checker` button on the right side of the bottom status bar. Clicking it opens a QuickPick menu for easy access to "Fetch Solution" or "Compare Current File". (Only visible if the course config file exists).
- **Editor Context & Title Menus**: Students can right-click anywhere inside an open file editor, or click the Diff icon in the top-right editor tab bar, to instantly run "Compare Current File".

## 4. Real-Time File Watching
- **Live TreeView Updates**: Active monitoring via `vscode.workspace.onDidSaveTextDocument` and `FileSystemWatcher`.
- If a student saves, creates, or deletes a file locally, the extension automatically recalculates the diff and updates the TreeView within 300ms.
- **Performance Optimized**: The 300ms debounce ensures that rapid changes (e.g., auto-formatting saves) are batched together, preventing UI lag or high CPU usage.

## 5. Smart Edge-Case Handling
- **Cross-Platform Line Endings**: The diff engine is "text-aware." It normalizes Windows (`CRLF`) and Unix (`LF`) line endings to `\n` before comparing text files. This prevents identical code from being flagged as "modified" just because of the student's operating system.
- **Binary File Detection**: It automatically scans the first 8KB of files for null bytes. Binary files (like images, `.exe`, `.dll`) are flagged and prevented from opening in the text diff editor, which stops VS Code from crashing or rendering binary garbage.
- **Graceful Git Process Management**: 
  - Git processes are spawned with explicit timeouts.
  - On Windows, it uses `taskkill /pid /T /F` to ensure child processes (like `git-remote-https`) don't become orphaned zombies.
  - On Mac/Linux, it spawns Git in a detached process group and kills it via `-pid`.
  - Failed network pulls automatically wipe the broken cache and attempt a fresh, clean clone.
- **Interactive Prompts**: It clearly informs the student if they try to single-file-compare an "extra" file (one that doesn't exist in the solution), or if their local file perfectly matches the solution ("matches the solution! ✅").
- **Config Validation Layer**: The `course-project.json` is strictly validated. Errors (like missing fields, malformed JSON, or invalid URLs) are safely caught and shown to the student as human-readable toast warnings rather than silent console crashes.

## 6. Project Architecture & Tooling
- **Test Coverage**: 27 passing unit tests across Config Loading, Git Service, and Diff Engine logic.
- **Modern Build**: Uses `esbuild` for ultra-fast TypeScript bundling into a single `extension.js` file for production.
- **Strict Linting**: TypeScript compilation runs with `strict: true` and zero errors.

---
*Status: Ready for manual E2E testing and Marketplace packaging.*
