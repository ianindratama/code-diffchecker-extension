import * as vscode from 'vscode';
import { resolveGitBinary as coreResolveGitBinary } from '@dicodingacademy/code-diffchecker-core';

/**
 * Resolves the Git binary, preferring VS Code's `git.path` setting when set,
 * then falling back to `git` on PATH (handled by core).
 *
 * This is the only vscode↔core git glue: it reads the editor setting and hands
 * it to the editor-agnostic core resolver. Call sites stay `await resolveGitBinary()`.
 */
export async function resolveGitBinary(): Promise<string> {
  const configuredPath = vscode.workspace.getConfiguration('git').get<string>('path');
  return coreResolveGitBinary(configuredPath);
}
