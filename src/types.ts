import * as vscode from 'vscode';

// ─── Configuration ────────────────────────────────────────────────────────────

export interface CourseProjectConfig {
  repoUrl: string;
  branch: string;
  targetFolder: string;
  ignorePaths: string[];
}

// ─── Git Execution ────────────────────────────────────────────────────────────

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface ExecOptions {
  /** Timeout in milliseconds. Default: 120_000 (2 minutes). */
  timeoutMs?: number;
}

// ─── Diff Results ─────────────────────────────────────────────────────────────

export type DiffStatus = 'added' | 'modified' | 'deleted';

export interface DiffResult {
  /** Relative path from the project root (forward-slash separated). */
  relativePath: string;
  status: DiffStatus;
  isBinary: boolean;
  localUri?: vscode.Uri;
  solutionUri?: vscode.Uri;
}

// ─── TreeView ─────────────────────────────────────────────────────────────────

export interface DiffTreeNode {
  /** Display label (file or folder name). */
  label: string;
  /** Full relative path from root. */
  relativePath: string;
  /** True if this node represents a directory. */
  isDirectory: boolean;
  /** Diff info — only present for file nodes. */
  diff?: DiffResult;
  /** Children — only present for directory nodes. */
  children?: DiffTreeNode[];
}
