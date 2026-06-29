# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Pending
- Publish the VS Code extension to the Marketplace and the CLI to npm (both currently `private`).
- End-to-end manual verification of the Extension Development Host and the CLI on a real fixture.

## [0.1.0]

First versioned release. This release reshapes the project from a single-package VS Code extension
into an **npm-workspaces monorepo** that powers two front-ends — the VS Code extension and a new
standalone CLI — over one shared, editor-agnostic core.

### Added
- **`@dicodingacademy/code-diffchecker-core`** (`packages/core`) — an editor-agnostic library with
  **zero `vscode` imports**, exposing config loading, Git operations (sparse-checkout, version
  check, update check, pull), cache management, and the diff engine. Private/bundled-only.
- **`@dicodingacademy/code-diffchecker`** (`packages/cli`) — a new `diffchecker` command-line tool
  (built on commander) that works in any editor, with commands `init`, `fetch`, `diff`,
  `diff <file>`, `watch`, `cache info`, and `cache clear`; global `--json` / `--no-color` flags;
  and exit codes (`0` no differences, `1` differences found, `2` error). CLI cache lives under
  `$XDG_CACHE_HOME/diffchecker` (fallback `~/.cache/diffchecker`).
- **`.diffchecker.json`** as the primary config file at the project root, alongside continued
  support for the legacy `.vscode/course-project.json` (the former takes precedence).
- `packages/vscode/src/gitBinary.ts` — the single VS Code↔core bridge that reads the editor's
  `git.path` setting and passes it to core's `resolveGitBinary()`.
- Root workspace tooling: `tsconfig.base.json` (shared compiler options) and orchestration scripts
  (`build`, `build:core`/`build:vscode`/`build:cli`, `watch`, `lint`, `test`, `test:all`).
- `CHANGELOG.md` and a `docs/historical/` archive of the original build documents.

### Changed
- **Monorepo layout** — all source moved under `packages/{core,cli,vscode}`; the repo root is now a
  private npm-workspaces root. Build order is `core → vscode → cli`.
- The VS Code extension (`packages/vscode`, `code-diffchecker`) now imports everything from
  `@dicodingacademy/code-diffchecker-core` instead of local modules; esbuild bundles core into
  `out/extension.js` (with `vscode` external).
- `DiffResult` now carries plain string paths (`localPath` / `solutionPath`) instead of
  `vscode.Uri`; the extension constructs URIs at the diff call site, keeping core editor-agnostic.
- The extension activates on `.diffchecker.json` in addition to `.vscode/course-project.json`.
- Documentation rewritten for the dual CLI + extension setup (`README.md`, `CLAUDE.md`, `AGENTS.md`).

### Removed
- Root-level single-package layout (`src/`, root `run-tests.js`, root `tsconfig.json`) — superseded
  by the per-package structure.
