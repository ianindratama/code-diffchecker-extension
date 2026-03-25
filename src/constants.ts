/** Minimum required Git version (major.minor). */
export const MIN_GIT_VERSION = { major: 2, minor: 28 };

/** Config filename inside the workspace .vscode directory. */
export const CONFIG_FILENAME = '.vscode/course-project.json';

/** Default timeout for long-running Git operations (clone, fetch) in ms. */
export const GIT_CLONE_TIMEOUT_MS = 120_000; // 2 minutes

/** Default timeout for quick Git commands (status, rev-parse) in ms. */
export const GIT_QUICK_TIMEOUT_MS = 30_000; // 30 seconds

/** Default timeout for git fetch during update check in ms. */
export const GIT_FETCH_TIMEOUT_MS = 15_000; // 15 seconds

/**
 * Layer 1: Hardcoded ignore patterns.
 * These are always ignored regardless of user config.
 */
export const HARDCODED_IGNORE_PATTERNS: string[] = [
  '.git',
  '.git/**',
  '.DS_Store',
  '.vscode/course-project.json',
];

/**
 * Number of bytes to read from a file to detect if it's binary.
 * We check the first 8KB for null bytes.
 */
export const BINARY_CHECK_BYTES = 8192;

/** Cache subdirectory name inside globalStorageUri. */
export const CACHE_DIR_NAME = 'cache';

/** Git download URL for error messages. */
export const GIT_DOWNLOAD_URL = 'https://git-scm.com/downloads';
