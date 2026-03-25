# Code Diff-Checker — VS Code Extension

![VS Code](https://img.shields.io/badge/VS%20Code-%3E%3D1.85.0-blue?logo=visual-studio-code)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)
![License](https://img.shields.io/badge/license-MIT-green)
![Tests](https://img.shields.io/badge/tests-27%20passing-brightgreen)

> A VS Code extension that lets students compare their local project against a final solution hosted on GitHub, using a native TreeView UI with file-by-file diffs.

**Built for [Dicoding Academy](https://www.dicoding.com/)** — an EdTech platform where students learn by building real projects.

---

## ✨ Features

### 🔄 Automated Solution Fetching
The extension auto-activates when a project contains a `.vscode/course-project.json` config file. It reads the GitHub URL, branch, and target folder to fetch only the relevant solution files.

### 📁 Git Sparse-Checkout
Uses sparse-checkout to download **only the specific folder** needed for the current project — saving bandwidth and time by ignoring the rest of the monorepo.

### 🌳 Sidebar TreeView
A custom panel that visually lists all differing files, grouped by category (**Added**, **Modified**, **Deleted**) with themed icons. Clicking a file opens VS Code's native side-by-side diff editor.

### 📝 Dual Comparison Modes
- **Full Project Diff** — Compare the entire local project against the solution tree
- **Single File Diff** — Compare just the currently open file via right-click context menu or the editor title bar icon

### 🔴 Real-Time File Watching
When the student saves, creates, or deletes a file, the TreeView automatically updates within 300ms (debounced for performance).

### 🔔 Background Update Notifications
Silently checks for solution updates in the background. If a newer version is available, a toast notification prompts the student to update.

### 🛡️ Smart Edge-Case Handling
- **Cross-platform line endings** — Normalizes CRLF/LF before comparison
- **Binary file detection** — Scans first 8KB for null bytes; binary files are flagged and prevented from opening in the text diff editor
- **Graceful Git process management** — Cross-platform process cleanup (Windows `taskkill` / POSIX signals) with timeouts
- **Failed pulls auto-recover** — Nukes broken cache and re-clones from scratch

> **Pedagogical design**: There is intentionally **no "Apply Changes" button**. Students must manually read the diff and copy code — this encourages deeper learning.

---

## 📋 Prerequisites

- **VS Code** ≥ 1.85.0
- **Git** ≥ 2.28 (required for `--filter=blob:none` sparse-checkout)
- **Node.js** ≥ 18 (for development only)

---

## 🚀 Getting Started

### For Students (Using the Extension)

1. **Install** the extension from the VS Code Marketplace *(or install the `.vsix` file manually)*
2. Open a project that contains a `.vscode/course-project.json` file
3. The extension activates automatically — look for the **Code Diff-Checker** panel in the sidebar
4. Run **"Fetch Solution"** from the Command Palette (`Ctrl+Shift+P` → `Code Diff-Checker: Fetch Solution`) or click the download icon in the TreeView header
5. Click on any file in the TreeView to see the diff

### Configuration File

Create a `.vscode/course-project.json` file in your project root:

```json
{
  "repoUrl": "https://github.com/dicodingacademy/a159-flutter-pemula-labs.git",
  "branch": "main",
  "targetFolder": "navigation_project",
  "ignorePaths": ["build/", "*.iml"]
}
```

| Field | Required | Description |
|---|---|---|
| `repoUrl` | ✅ | GitHub HTTPS clone URL |
| `branch` | ✅ | Branch containing the solution |
| `targetFolder` | ✅ | Folder path within the repo to compare against |
| `ignorePaths` | ❌ | Glob patterns for files to exclude from comparison (defaults to `[]`) |

---

## 🎮 Available Commands

| Command | Description | Access |
|---|---|---|
| **Fetch Solution** | Clone/update the solution and compute diff | Command Palette, TreeView header, Status Bar |
| **Compare Current File** | Diff the active editor file against the solution | Right-click context menu, Editor title bar |
| **Refresh Diff** | Re-compute diff from existing cache (no network) | TreeView header |
| **Clear Cache** | Delete the cached solution and reset the TreeView | TreeView header menu |

---

## 🏗️ Architecture

```
src/
├── extension.ts          # Entry point — registers commands, orchestrates modules
├── types.ts              # Shared TypeScript interfaces
├── constants.ts          # Timeouts, ignore patterns, min Git version
├── config.ts             # Parses & validates .vscode/course-project.json
├── processManager.ts     # Cross-platform child_process wrapper with timeout
├── gitService.ts         # Git operations (clone, fetch, pull, version check)
├── cacheManager.ts       # Cache lifecycle (MD5-hashed directories)
├── diffEngine.ts         # Walks both trees, classifies added/modified/deleted
├── treeViewProvider.ts   # Sidebar TreeView UI with themed icons
└── test/
    ├── config.test.ts       # 9 tests — config validation
    ├── gitService.test.ts   # 9 tests — Git version validation
    ├── diffEngine.test.ts   # 9 tests — diff classification, binary detection
    └── __mocks__/vscode.js  # Minimal vscode API mock
```

### Module Flow

```
┌──────────────┐     ┌──────────────┐     ┌────────────────┐
│  config.ts   │────▶│ gitService.ts│────▶│ cacheManager.ts│
│  (load JSON) │     │ (sparse clone)│     │  (MD5 cache)   │
└──────────────┘     └──────┬───────┘     └────────────────┘
                            │
                            ▼
                   ┌────────────────┐     ┌──────────────────┐
                   │ diffEngine.ts  │────▶│treeViewProvider.ts│
                   │ (walk & diff)  │     │   (sidebar UI)    │
                   └────────────────┘     └──────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|---|---|
| Git ≥ 2.28 required | `--filter=blob:none` has bugs in 2.25–2.27 |
| `taskkill /pid /T /F` on Windows | `process.kill()` sends POSIX signals that crash the Extension Host |
| Cache uses MD5 hash of config | Ensures per-project isolation in `globalStorageUri` |
| Only `.vscode/course-project.json` is ignored | The rest of `.vscode/` (like `launch.json`) can be diffed |
| Binary detection via null-byte scan | First 8KB checked — prevents VS Code from rendering binary garbage |
| Failed pulls auto-nuke cache | Guarantees a clean state on next attempt |

---

## 🛠️ Development

### Setup

```bash
git clone https://github.com/ianindratama/code-diffchecker-extension.git
cd code-diffchecker
npm install
```

### Build & Run

```bash
# Compile (single build via esbuild)
npm run compile

# Watch mode (auto-rebuild on changes)
npm run watch

# Run unit tests
node run-tests.js

# Lint
npm run lint
```

### Debug

1. Open this project in VS Code
2. Press **F5** to launch the Extension Development Host
3. In the new window, open a project with a `.vscode/course-project.json` file
4. Test the extension commands and TreeView

### Package for Distribution

```bash
npx @vscode/vsce package
```

This generates a `.vsix` file that can be installed manually or published to the VS Code Marketplace.

---

## ✅ Tests

27 unit tests across three modules — all passing.

| Module | Tests | What's Covered |
|---|---|---|
| **Config Loader** | 9 | Valid config, missing fields, invalid URL, malformed JSON |
| **Git Service** | 9 | Version validation (2.28+ required, Windows format, edge cases) |
| **Diff Engine** | 9 | Add/modify/delete classification, ignore layers, binary detection, CRLF normalization |

```bash
# Run all tests
node run-tests.js
```

---

## 📂 Project Structure

```
code-diffchecker-extension/
├── .vscode/
│   ├── launch.json          # F5 debug config
│   └── tasks.json           # Watch build task
├── src/                     # TypeScript source
│   ├── test/                # Unit tests + mocks
│   └── *.ts                 # Core modules (see Architecture)
├── out/                     # Compiled output (gitignored)
├── package.json             # Extension manifest
├── tsconfig.json            # TypeScript config (strict mode)
├── esbuild.js               # Build script
├── run-tests.js             # Test runner
├── .eslintrc.json           # Linting rules
└── .vscodeignore            # Packaging exclusions
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add some feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

Please ensure:
- All existing tests pass (`node run-tests.js`)
- TypeScript compiles with zero errors (`npm run compile`)
- Code follows the existing ESLint rules (`npm run lint`)

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

Built for [Dicoding Academy](https://www.dicoding.com/) to help students learn by comparing their work against reference solutions in a guided, educational workflow.
