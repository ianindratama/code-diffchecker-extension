import * as fs from 'fs';
import * as path from 'path';
import { CourseProjectConfig } from './types';
import { CONFIG_FILENAMES } from './constants';

/**
 * Finds the first existing config file at the workspace root, probing
 * CONFIG_FILENAMES in priority order (.diffchecker.json first, then the
 * legacy .vscode/course-project.json).
 *
 * @returns The absolute path to the matched config file, or undefined if none exist.
 */
function findConfigPath(workspaceRoot: string): string | undefined {
  for (const name of CONFIG_FILENAMES) {
    const p = path.join(workspaceRoot, name);
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return undefined;
}

/**
 * Loads and validates the project config from the workspace.
 * Supports both `.diffchecker.json` (priority) and the legacy
 * `.vscode/course-project.json`.
 *
 * @param workspaceRoot Absolute path to the workspace root.
 * @returns Parsed and validated config.
 * @throws Error with a descriptive message if config is missing, malformed, or invalid.
 */
export async function loadConfig(workspaceRoot: string): Promise<CourseProjectConfig> {
  const configPath = findConfigPath(workspaceRoot);

  // Check a config file exists
  if (!configPath) {
    throw new Error(
      `Configuration file not found.\n` +
      `Make sure your project contains a ${CONFIG_FILENAMES[0]} ` +
      `(or ${CONFIG_FILENAMES[1]}) file.`
    );
  }

  // Name of the file that actually matched, for use in error messages.
  const configName = path.relative(workspaceRoot, configPath);

  // Read file
  let rawContent: string;
  try {
    rawContent = await fs.promises.readFile(configPath, 'utf-8');
  } catch (err) {
    throw new Error(
      `Could not read configuration file: ${configName}\n` +
      `Error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error(
      `Invalid JSON in ${configName}.\n` +
      'Please check for syntax errors (missing commas, quotes, etc.).'
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `${configName} must contain a JSON object, not ${Array.isArray(parsed) ? 'an array' : typeof parsed}.`
    );
  }

  const config = parsed as Record<string, unknown>;

  // Validate required fields
  if (typeof config.repoUrl !== 'string' || config.repoUrl.trim() === '') {
    throw new Error(
      `Missing or invalid "repoUrl" in ${configName}.\n` +
      'Expected a GitHub HTTPS URL, e.g. "https://github.com/owner/repo.git"'
    );
  }

  if (typeof config.branch !== 'string' || config.branch.trim() === '') {
    throw new Error(
      `Missing or invalid "branch" in ${configName}.\n` +
      'Expected a branch name, e.g. "main"'
    );
  }

  // targetFolder is optional — empty string or "." means "repo root" (flat repo)
  if (config.targetFolder !== undefined && typeof config.targetFolder !== 'string') {
    throw new Error(
      `Invalid "targetFolder" in ${configName}.\n` +
      'Expected a folder name inside the repository, e.g. "wisatabandung", or "" for flat repos.'
    );
  }

  // Validate repoUrl format
  const repoUrl = config.repoUrl.trim();
  if (!/^https:\/\/.+\/.+/.test(repoUrl)) {
    throw new Error(
      `Invalid "repoUrl" in ${configName}.\n` +
      `Got: "${repoUrl}"\n` +
      'Expected an HTTPS Git URL, e.g. "https://github.com/owner/repo.git"'
    );
  }

  // Parse ignorePaths (optional)
  let ignorePaths: string[] = [];
  if (config.ignorePaths !== undefined) {
    if (!Array.isArray(config.ignorePaths)) {
      throw new Error(
        `Invalid "ignorePaths" in ${configName}.\n` +
        'Expected an array of glob patterns, e.g. ["build/", "*.iml"]'
      );
    }
    ignorePaths = (config.ignorePaths as unknown[]).filter(
      (item): item is string => typeof item === 'string'
    );
  }

  // Normalize targetFolder: undefined, empty, or "." all mean repo root
  let targetFolder = typeof config.targetFolder === 'string' ? config.targetFolder.trim() : '';
  if (targetFolder === '.') {
    targetFolder = '';
  }

  return {
    repoUrl,
    branch: config.branch.trim(),
    targetFolder,
    ignorePaths,
  };
}

/**
 * Checks if the workspace contains a recognized config file
 * (`.diffchecker.json` or the legacy `.vscode/course-project.json`).
 */
export function hasConfigFile(workspaceRoot: string): boolean {
  return findConfigPath(workspaceRoot) !== undefined;
}
