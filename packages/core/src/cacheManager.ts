import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CACHE_DIR_NAME } from './constants';
import { CourseProjectConfig } from './types';

/**
 * Returns the cache directory path for a given config.
 * Each unique combination of repoUrl + branch + targetFolder gets its own cache directory.
 */
export function getCacheDir(
  globalStoragePath: string,
  config: CourseProjectConfig
): string {
  const key = `${config.repoUrl}|${config.branch}|${config.targetFolder}`;
  const hash = crypto.createHash('md5').update(key).digest('hex').substring(0, 12);
  return path.join(globalStoragePath, CACHE_DIR_NAME, hash);
}

/**
 * Checks if the cache directory is valid (exists and has the target folder with files).
 * When targetFolder is empty (flat repo), validates the cache root directly.
 */
export function isCacheValid(cacheDir: string, targetFolder: string): boolean {
  try {
    const targetPath = targetFolder === '' ? cacheDir : path.join(cacheDir, targetFolder);

    if (!fs.existsSync(targetPath)) {
      return false;
    }

    // Check it's not empty
    const contents = fs.readdirSync(targetPath);
    return contents.length > 0;
  } catch {
    return false;
  }
}

/**
 * Deletes the cache directory for a specific config.
 */
export async function nukeCache(cacheDir: string): Promise<void> {
  try {
    await fs.promises.rm(cacheDir, { recursive: true, force: true });
  } catch {
    // Ignore errors — directory may not exist
  }
}

/**
 * Deletes all cache directories.
 */
export async function clearAllCaches(globalStoragePath: string): Promise<void> {
  const cacheRoot = path.join(globalStoragePath, CACHE_DIR_NAME);
  try {
    await fs.promises.rm(cacheRoot, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
}

/**
 * Ensures the global storage directory structure exists.
 */
export async function ensureStorageDir(globalStoragePath: string): Promise<void> {
  const cacheRoot = path.join(globalStoragePath, CACHE_DIR_NAME);
  await fs.promises.mkdir(cacheRoot, { recursive: true });
}
