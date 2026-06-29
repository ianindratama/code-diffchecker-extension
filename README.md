# Code Diff-Checker

![VS Code](https://img.shields.io/badge/VS%20Code-%3E%3D1.85.0-blue?logo=visual-studio-code)
![Node](https://img.shields.io/badge/Node-%3E%3D18-green?logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)

> Compare your local work-in-progress project against a final solution hosted on GitHub — as a **VS Code extension** (native TreeView, side-by-side diffs) or a **command-line tool** that works in any editor.

**Built for [Dicoding Academy](https://www.dicoding.com/)** — an EdTech platform where students learn by building real projects.

> **Pedagogical design:** There is intentionally **no "Apply Changes" button**. Students read the diff and copy code by hand — this is a deliberate learning constraint, not a missing feature.

---

## How it works

1. A starter project contains a `.diffchecker.json` (or legacy `.vscode/course-project.json`) file pointing to a GitHub repo, branch, and a target folder inside it.
2. The tool performs a Git **sparse-checkout** of only that target folder — no full-repo download, even for large monorepos.
3. It computes a file-by-file **diff** between the student's local files and the fetched solution (added / modified / deleted, with binary detection and CRLF normalization).
4. Results are shown in the **VS Code sidebar TreeView** or printed to the **terminal** by the CLI.

The diff logic is shared: both front-ends are thin layers over one editor-agnostic core library (see [Architecture](#architecture)).

---

## Quick start — VS Code extension

**Prerequisites:** VS Code ≥ 1.85.0 · Git ≥ 2.28

1. Install the **Code Diff-Checker** extension *(from the Marketplace once published, or build a `.vsix` locally — see [Development](#development))*.
2. Open a project that contains a `.diffchecker.json` (or `.vscode/course-project.json`) file. The extension auto-activates.
3. Open the **Code Diff-Checker** panel in the activity bar and run **Fetch Solution** (panel header, Command Palette → `Code Diff-Checker: Fetch Solution`, or the status-bar button).
4. Click any file in the TreeView to open VS Code's native side-by-side diff. Right-click a file in the editor (or use the editor title icon) to **Compare Current File**.

The TreeView re-diffs automatically (300 ms debounce) as you save, create, or delete files.

---

## Quick start — CLI

**Prerequisites:** Node.js ≥ 18 · Git ≥ 2.28

```bash
# Once published to npm:
npm install -g @dicodingacademy/code-diffchecker

# From source (current — the package is not yet published):
git clone https://github.com/ianindratama/code-diffchecker-extension.git
cd code-diffchecker-extension
npm install
npm run build
npm link --workspace=@dicodingacademy/code-diffchecker   # exposes the `diffchecker` command
```

Then, inside a student project:

```bash
diffchecker init     # interactively create a .diffchecker.json
diffchecker fetch    # sparse-checkout the solution and show a diff summary
diffchecker diff     # list all differences
diffchecker diff lib/main.dart   # unified, colorized diff for one file
```

---

## CLI command reference

```
diffchecker <command> [options]
```

| Command | Description |
|---|---|
| `diffchecker init` | Interactively create a `.diffchecker.json` (prompts for repo URL, branch, target folder, ignore paths). |
| `diffchecker fetch` | Clone or update the solution via sparse-checkout, then print a diff summary. |
| `diffchecker diff` | Print all differences grouped by status (added / modified / deleted). Auto-fetches if no cache exists. |
| `diffchecker diff <file>` | Print a unified, colorized diff for a single file (or "matches the solution" / "binary" / "extra file"). |
| `diffchecker watch` | Watch the project and re-diff on every change (300 ms debounce). Exits on Ctrl+C. |
| `diffchecker cache info` | Show the cache root, its size, and the current project's cache status. |
| `diffchecker cache clear` | Delete the cached solution(s). |

**Global options** (apply to every command):

| Option | Effect |
|---|---|
| `--json` | Emit machine-readable JSON (no spinner, no ANSI colors). Useful for scripting. |
| `--no-color` | Disable colored output. |
| `--version`, `--help` | Print version / help (built-in). |

**Exit codes:** `0` = success / no differences · `1` = differences found · `2` = error (bad config, missing Git, etc.). This makes `diffchecker diff` usable as a CI/scripting check.

**Cache location:** `$XDG_CACHE_HOME/diffchecker` (falls back to `~/.cache/diffchecker`), with one MD5-hashed subdirectory per `repoUrl + branch + targetFolder`.

---

## Configuration file

Create a `.diffchecker.json` at your project root (or run `diffchecker init`):

```json
{
  "repoUrl": "https://github.com/dicodingacademy/a159-flutter-pemula-labs.git",
  "branch": "main",
  "targetFolder": "wisatabandung",
  "ignorePaths": ["build/", ".dart_tool/", ".idea/", "*.iml"]
}
```

| Field | Required | Description |
|---|---|---|
| `repoUrl` | ✅ | GitHub **HTTPS** clone URL (must match `https://…/…`). Solution repos are expected to be public. |
| `branch` | ✅ | Branch containing the solution. |
| `targetFolder` | ✅ | Folder path *within the repo* to compare against. |
| `ignorePaths` | ❌ | Array of [minimatch](https://github.com/isaacs/minimatch) glob patterns to exclude (defaults to `[]`). |

**Config discovery & precedence.** Both front-ends look for, in order:

1. `.diffchecker.json` (project root) — preferred.
2. `.vscode/course-project.json` — legacy, still fully supported.

The first file found wins. `.git/`, `.DS_Store`, and the config files themselves are always ignored; the rest of `.vscode/` (e.g. `launch.json`) is diffed normally.

---

## Architecture

This repository is an **npm-workspaces monorepo** with three packages:

```
code-diffchecker-extension/        # workspace root (private)
├── tsconfig.base.json             # shared compiler options (CommonJS, ES2020, strict)
└── packages/
    ├── core/                      # @dicodingacademy/code-diffchecker-core (private)
    │   └── src/                   # config · gitService · cacheManager · diffEngine
    │       │                      # processManager · constants · types · index (barrel)
    │       └── …                  # ZERO vscode imports — pure Node (fs/path/crypto/child_process)
    ├── cli/                       # @dicodingacademy/code-diffchecker  →  `diffchecker` binary
    │   └── src/                   # index (commander tree) · commands/{fetch,diff,watch,cache,init}
    │       │                      # cachePaths (XDG) · errors · types
    └── vscode/                    # code-diffchecker (the VS Code extension)
        └── src/                   # extension · treeViewProvider · gitBinary (vscode→core git glue)
```

**Dependency direction:** both `cli` and `vscode` depend on `core`; nothing depends on `cli` or `vscode`.

```
core  ◀──  cli      (terminal front-end)
  ▲
  └──────  vscode   (extension front-end)
```

**The hard boundary:** `packages/core` must never import `vscode`. The only editor-specific glue in the extension is [packages/vscode/src/gitBinary.ts](packages/vscode/src/gitBinary.ts), which reads VS Code's `git.path` setting and passes it to core's `resolveGitBinary()`. The CLI supplies its own values (cwd, cache root, git path) the same way.

---

## Development

**Prerequisites:** Node.js ≥ 18 · Git ≥ 2.28 · (VS Code ≥ 1.85.0 to run the extension)

```bash
git clone https://github.com/ianindratama/code-diffchecker-extension.git
cd code-diffchecker-extension
npm install            # installs all workspaces and links them together
```

### Build

```bash
npm run build          # builds all packages in order: core → vscode → cli
npm run build:core     # tsc → packages/core/dist
npm run build:vscode   # esbuild → packages/vscode/out/extension.js
npm run build:cli      # tsc → packages/cli/out
npm run watch          # rebuild the extension on change (esbuild watch)
```

### Test & lint

```bash
npm test               # run the core unit tests
npm run test:all       # run tests across every workspace that has them
npm run lint           # ESLint over packages/*/src
```

### Debug the extension

1. Open the repo in VS Code and press **F5** to launch the Extension Development Host.
2. In the new window, open a project containing a `.diffchecker.json` file.
3. Exercise the commands and the TreeView.

### Package the extension

```bash
npm run build:vscode
cd packages/vscode && npx @vscode/vsce package --no-dependencies
```

Core is bundled into `out/extension.js` by esbuild, so the `.vsix` ships without `node_modules`.

---

## Acknowledgments

Built for [Dicoding Academy](https://www.dicoding.com/) to help students learn by comparing their work against reference solutions in a guided, editor-agnostic workflow.
