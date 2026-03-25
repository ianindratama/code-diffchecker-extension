import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CourseProjectConfig } from './types';
import { CONFIG_FILENAME } from './constants';

/**
 * Loads and validates the course-project.json config from the workspace.
 *
 * @param workspaceRoot Absolute path to the workspace root.
 * @returns Parsed and validated config.
 * @throws Error with a descriptive message if config is missing, malformed, or invalid.
 */
export async function loadConfig(workspaceRoot: string): Promise<CourseProjectConfig> {
  const configPath = path.join(workspaceRoot, CONFIG_FILENAME);

  // Check file exists
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Configuration file not found: ${CONFIG_FILENAME}\n` +
      'Make sure your project contains a .vscode/course-project.json file.'
    );
  }

  // Read file
  let rawContent: string;
  try {
    rawContent = await fs.promises.readFile(configPath, 'utf-8');
  } catch (err) {
    throw new Error(
      `Could not read configuration file: ${CONFIG_FILENAME}\n` +
      `Error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error(
      `Invalid JSON in ${CONFIG_FILENAME}.\n` +
      'Please check for syntax errors (missing commas, quotes, etc.).'
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `${CONFIG_FILENAME} must contain a JSON object, not ${Array.isArray(parsed) ? 'an array' : typeof parsed}.`
    );
  }

  const config = parsed as Record<string, unknown>;

  // Validate required fields
  if (typeof config.repoUrl !== 'string' || config.repoUrl.trim() === '') {
    throw new Error(
      `Missing or invalid "repoUrl" in ${CONFIG_FILENAME}.\n` +
      'Expected a GitHub HTTPS URL, e.g. "https://github.com/owner/repo.git"'
    );
  }

  if (typeof config.branch !== 'string' || config.branch.trim() === '') {
    throw new Error(
      `Missing or invalid "branch" in ${CONFIG_FILENAME}.\n` +
      'Expected a branch name, e.g. "main"'
    );
  }

  if (typeof config.targetFolder !== 'string' || config.targetFolder.trim() === '') {
    throw new Error(
      `Missing or invalid "targetFolder" in ${CONFIG_FILENAME}.\n` +
      'Expected a folder name inside the repository, e.g. "wisatabandung"'
    );
  }

  // Validate repoUrl format
  const repoUrl = config.repoUrl.trim();
  if (!/^https:\/\/.+\/.+/.test(repoUrl)) {
    throw new Error(
      `Invalid "repoUrl" in ${CONFIG_FILENAME}.\n` +
      `Got: "${repoUrl}"\n` +
      'Expected an HTTPS Git URL, e.g. "https://github.com/owner/repo.git"'
    );
  }

  // Parse ignorePaths (optional)
  let ignorePaths: string[] = [];
  if (config.ignorePaths !== undefined) {
    if (!Array.isArray(config.ignorePaths)) {
      throw new Error(
        `Invalid "ignorePaths" in ${CONFIG_FILENAME}.\n` +
        'Expected an array of glob patterns, e.g. ["build/", "*.iml"]'
      );
    }
    ignorePaths = (config.ignorePaths as unknown[]).filter(
      (item): item is string => typeof item === 'string'
    );
  }

  return {
    repoUrl,
    branch: config.branch.trim(),
    targetFolder: config.targetFolder.trim(),
    ignorePaths,
  };
}

/**
 * Checks if the workspace contains a course-project.json config file.
 */
export function hasConfigFile(workspaceRoot: string): boolean {
  const configPath = path.join(workspaceRoot, CONFIG_FILENAME);
  return fs.existsSync(configPath);
}
