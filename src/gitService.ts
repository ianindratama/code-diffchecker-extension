import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execGit } from './processManager';
import { MIN_GIT_VERSION, GIT_CLONE_TIMEOUT_MS, GIT_QUICK_TIMEOUT_MS, GIT_FETCH_TIMEOUT_MS, GIT_DOWNLOAD_URL } from './constants';

/** Cached git binary path for the session. */
let cachedGitBinary: string | undefined;

/**
 * Resolves the Git binary path.
 * Priority: VS Code git.path setting → 'git' on PATH.
 */
export async function resolveGitBinary(): Promise<string> {
  if (cachedGitBinary) {
    return cachedGitBinary;
  }

  // Try VS Code's configured git path first
  const configuredPath = vscode.workspace.getConfiguration('git').get<string>('path');
  if (configuredPath && configuredPath.trim() !== '') {
    try {
      const result = await execGit(configuredPath, ['--version'], process.cwd(), { timeoutMs: 5000 });
      if (result.exitCode === 0) {
        cachedGitBinary = configuredPath;
        return configuredPath;
      }
    } catch {
      // Fall through to PATH lookup
    }
  }

  // Try 'git' on PATH
  try {
    const result = await execGit('git', ['--version'], process.cwd(), { timeoutMs: 5000 });
    if (result.exitCode === 0) {
      cachedGitBinary = 'git';
      return 'git';
    }
  } catch {
    // Not found
  }

  throw new Error(
    'Git is not installed or not found in your PATH.\n' +
    `Please install Git from ${GIT_DOWNLOAD_URL} and restart VS Code.`
  );
}

/**
 * Validates that the installed Git version meets the minimum requirement.
 *
 * @param versionString The output of `git --version`, e.g. "git version 2.39.1.windows.1"
 * @returns true if version is >= MIN_GIT_VERSION
 */
export function validateGitVersion(versionString: string): boolean {
  const match = versionString.match(/(\d+)\.(\d+)/);
  if (!match) {
    return false;
  }

  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);

  if (major > MIN_GIT_VERSION.major) {
    return true;
  }
  if (major === MIN_GIT_VERSION.major && minor >= MIN_GIT_VERSION.minor) {
    return true;
  }
  return false;
}

/**
 * Checks the installed Git version and shows an error if it's too old.
 * @returns The version string if valid.
 * @throws Error if version is too old or cannot be determined.
 */
export async function checkGitVersion(gitBinary: string): Promise<string> {
  const result = await execGit(gitBinary, ['--version'], process.cwd(), { timeoutMs: 5000 });

  if (result.exitCode !== 0) {
    throw new Error('Could not determine Git version.');
  }

  const versionString = result.stdout.trim();

  if (!validateGitVersion(versionString)) {
    throw new Error(
      `Git ${MIN_GIT_VERSION.major}.${MIN_GIT_VERSION.minor}+ is required for sparse-checkout support.\n` +
      `Your version: ${versionString}\n` +
      `Please update Git: ${GIT_DOWNLOAD_URL}`
    );
  }

  return versionString;
}

/**
 * Clones a repository using Git sparse-checkout (only the target folder).
 *
 * If any step fails, the cache directory is cleaned up.
 */
export async function cloneSparse(
  gitBinary: string,
  repoUrl: string,
  branch: string,
  targetFolder: string,
  cacheDir: string
): Promise<void> {
  // Normalize all paths to forward slashes for Git
  const normalizedCacheDir = cacheDir.replace(/\\/g, '/');
  const normalizedRepoUrl = repoUrl.trim();

  try {
    // Step 1: Clone (no checkout, sparse, shallow)
    const cloneResult = await execGit(
      gitBinary,
      [
        'clone',
        '--filter=blob:none',
        '--no-checkout',
        '--depth', '1',
        '--sparse',
        '-b', branch,
        normalizedRepoUrl,
        normalizedCacheDir,
      ],
      path.dirname(normalizedCacheDir),
      { timeoutMs: GIT_CLONE_TIMEOUT_MS }
    );

    if (cloneResult.exitCode !== 0) {
      throw new Error(
        `Git clone failed (exit code ${cloneResult.exitCode}).\n` +
        `${cloneResult.stderr}\n` +
        'Please check the repository URL and branch name in your course-project.json.'
      );
    }

    // Step 2: Set sparse-checkout to target folder
    const sparseResult = await execGit(
      gitBinary,
      ['sparse-checkout', 'set', targetFolder],
      normalizedCacheDir,
      { timeoutMs: GIT_QUICK_TIMEOUT_MS }
    );

    if (sparseResult.exitCode !== 0) {
      throw new Error(
        `Git sparse-checkout failed (exit code ${sparseResult.exitCode}).\n` +
        `${sparseResult.stderr}`
      );
    }

    // Step 3: Checkout to actually fetch the blobs
    const checkoutResult = await execGit(
      gitBinary,
      ['checkout'],
      normalizedCacheDir,
      { timeoutMs: GIT_CLONE_TIMEOUT_MS }
    );

    if (checkoutResult.exitCode !== 0) {
      throw new Error(
        `Git checkout failed (exit code ${checkoutResult.exitCode}).\n` +
        `${checkoutResult.stderr}`
      );
    }

    // Step 4: Verify the target folder actually exists and has files
    const targetPath = path.join(cacheDir, targetFolder);
    if (!fs.existsSync(targetPath)) {
      throw new Error(
        `The folder "${targetFolder}" was not found in the repository.\n` +
        'Please check the "targetFolder" value in your course-project.json.'
      );
    }

    const contents = await fs.promises.readdir(targetPath);
    if (contents.length === 0) {
      throw new Error(
        `The folder "${targetFolder}" in the repository is empty.\n` +
        'Please check the "targetFolder" value in your course-project.json.'
      );
    }
  } catch (err) {
    // Clean up on ANY failure
    try {
      await fs.promises.rm(cacheDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  }
}

/**
 * Checks if the remote has new commits compared to the local cache.
 *
 * @returns true if the remote is ahead of the local cache.
 */
export async function checkForUpdates(
  gitBinary: string,
  cacheDir: string,
  branch: string
): Promise<boolean> {
  const normalizedCacheDir = cacheDir.replace(/\\/g, '/');

  try {
    // Fetch latest from remote
    const fetchResult = await execGit(
      gitBinary,
      ['fetch', 'origin', branch],
      normalizedCacheDir,
      { timeoutMs: GIT_FETCH_TIMEOUT_MS }
    );

    if (fetchResult.exitCode !== 0) {
      // Network might be down — don't throw, just return false
      return false;
    }

    // Compare local HEAD with remote
    const localResult = await execGit(
      gitBinary,
      ['rev-parse', 'HEAD'],
      normalizedCacheDir,
      { timeoutMs: GIT_QUICK_TIMEOUT_MS }
    );

    const remoteResult = await execGit(
      gitBinary,
      ['rev-parse', `origin/${branch}`],
      normalizedCacheDir,
      { timeoutMs: GIT_QUICK_TIMEOUT_MS }
    );

    if (localResult.exitCode !== 0 || remoteResult.exitCode !== 0) {
      return false;
    }

    const localHash = localResult.stdout.trim();
    const remoteHash = remoteResult.stdout.trim();

    return localHash !== remoteHash;
  } catch {
    // Any error during update check is non-fatal
    return false;
  }
}

/**
 * Pulls the latest changes from the remote.
 * If the pull fails, nukes the cache so a fresh clone can be done.
 */
export async function pullUpdate(
  gitBinary: string,
  cacheDir: string,
  branch: string
): Promise<void> {
  const normalizedCacheDir = cacheDir.replace(/\\/g, '/');

  const result = await execGit(
    gitBinary,
    ['pull', 'origin', branch],
    normalizedCacheDir,
    { timeoutMs: GIT_CLONE_TIMEOUT_MS }
  );

  if (result.exitCode !== 0) {
    // Pull failed (could be rebase, force push, etc.)
    // Nuke cache so next fetch will do a clean clone
    try {
      await fs.promises.rm(cacheDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    throw new Error(
      'Could not update the solution cache. The cache has been cleared.\n' +
      'Please run "Fetch Solution" again to download a fresh copy.'
    );
  }
}

/**
 * Reset the cached git binary (useful for testing).
 */
export function resetGitBinaryCache(): void {
  cachedGitBinary = undefined;
}
