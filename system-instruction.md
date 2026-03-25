# System Instruction: VS Code Extension Architecture Review

## Role
You are an Expert Software Architect and Developer Tooling Specialist. Please review the following architecture for a VS Code Extension designed for an EdTech company (Dicoding). Provide brutal, honest, and pragmatic feedback focused on edge cases, maintainability, and user experience (DX/UX).

## Project Context
- **Target Audience**: Remote students learning programming (Flutter, Android, Web, etc.).
- **Goal**: Create a VS Code Extension that allows students to easily compare their local work-in-progress project against a final solution project hosted inside a GitHub monorepo.
- **Pedagogical Rule**: No "Apply Changes" or auto-merge buttons. Students must manually read the diff and copy-paste code to encourage learning.

## Finalized Architecture & Decisions

### 1. Source of Truth (Configuration)
- **Decision**: The extension does NOT store any repository URLs. The source of truth lives entirely inside the student's local starter project.
- **Mechanism**: A `.vscode/course-project.json` file is included in the starter code cloned by the student.
- **Config Structure**:
  {
    "repoUrl": "https://github.com/dicodingacademy/a159-flutter-pemula-labs.git",
    "branch": "main",
    "targetFolder": "wisatabandung",
    "ignorePaths": ["build/", ".dart_tool/", ".idea/", "*.iml"]
  }

### 2. Fetch & Cache Engine (Git Sparse-Checkout)
- **Decision**: Bypass the GitHub API and ZIP downloads entirely. Use Git via Node's `child_process`.
- **Mechanism**: 
  - Execute `git clone --filter=blob:none --no-checkout --depth 1 --sparse <repoUrl> <cache_dir>`.
  - Execute `git sparse-checkout add <targetFolder>`.
  - Execute `git checkout`.
- **Why**: Handles massive monorepos perfectly, uses a single robust network connection, handles binary files safely, and completely bypasses GitHub's 60/hr API rate limits.

### 3. Update / Cache Invalidation Strategy
- **Decision**: Silent background version checking using Git.
- **Mechanism**: On extension activation (if the config file exists), run `git fetch` and `git status` in the background. If the local cache is behind the remote, show a VS Code Toast notification: "A newer version of the solution is available. [Update Now]".

### 4. Diff & Ignore Logic
- **Decision**: Layered Ignore Architecture.
- **Mechanism**: 
  - Layer 1 (Hardcoded in Extension): Always ignore `.git/`, `.DS_Store`, `.vscode/` to prevent core extension breaks.
  - Layer 2 (Config-driven): Append `ignorePaths` from the student's config file (e.g., `node_modules/`, `build/`).
  - Merge both arrays and process using the `minimatch` library before generating the diff tree.

### 5. UI / UX
- **Decision**: Native VS Code feel.
- **Mechanism**: 
  - Render a hierarchical TreeView in the sidebar (matching VS Code's native file explorer), NOT a flat list.
  - Clicking a file opens VS Code's native side-by-side diff editor.
  - Binary files (images, compiled assets) are flagged in the TreeView but are unclickable to prevent editor crashes/freezes.

## Known Constraints & Mitigations
1. **Public Repos Only**: All solution repositories are 100% public. No GitHub authentication handling is required.
2. **Git Prerequisite**: Git CLI is a hard requirement.
3. **Git Versioning**: `git sparse-checkout` requires Git >= 2.25. The extension will run `git --version` on startup and show an actionable error message if the student's version is too old.
4. **Windows Pathing**: All paths passed to Git CLI and Node's `child_process` must be strictly normalized from backslashes to forward slashes to prevent cross-platform execution errors.

## Review Request
Please analyze this architecture and identify:
1. **Hidden Technical Risks**: Are there any fatal flaws in using Git `child_process` this way on diverse student machines (Windows, Mac, Linux)?
2. **Edge Cases**: What happens if the network drops mid-clone? What happens if the repo is rebased?
3. **Scalability**: Will this safely handle hundreds of students pulling from the same public monorepos simultaneously?
4. **Missing Features**: Are there any critical safeguards missing from this design?