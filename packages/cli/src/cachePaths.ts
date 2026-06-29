import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CourseProjectConfig } from '@dicodingacademy/code-diffchecker-core';
import { CacheLocation } from './types';

export function getCliCacheRoot(): string {
  const configuredRoot = process.env.XDG_CACHE_HOME?.trim();
  const baseRoot = configuredRoot && configuredRoot.length > 0
    ? configuredRoot
    : path.join(os.homedir(), '.cache');

  return path.join(baseRoot, 'diffchecker');
}

export function getCliCacheDir(config: CourseProjectConfig): string {
  const key = `${config.repoUrl}|${config.branch}|${config.targetFolder}`;
  const hash = crypto.createHash('md5').update(key).digest('hex').substring(0, 12);
  return path.join(getCliCacheRoot(), hash);
}

export function getCacheLocation(config: CourseProjectConfig): CacheLocation {
  return {
    cacheRoot: getCliCacheRoot(),
    cacheDir: getCliCacheDir(config),
  };
}

export async function ensureCliCacheRoot(): Promise<void> {
  await fs.promises.mkdir(getCliCacheRoot(), { recursive: true });
}

export async function clearCliCacheRoot(): Promise<void> {
  await fs.promises.rm(getCliCacheRoot(), { recursive: true, force: true });
}
