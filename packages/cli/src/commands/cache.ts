import * as fs from 'fs';
import {
  isCacheValid,
  loadConfig,
} from '@dicodingacademy/code-diffchecker-core';
import {
  clearCliCacheRoot,
  getCliCacheDir,
  getCliCacheRoot,
} from '../cachePaths';
import { GlobalOptions } from '../types';

export async function executeCacheClearCommand(options: GlobalOptions): Promise<number> {
  const cacheRoot = getCliCacheRoot();
  await clearCliCacheRoot();

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ cacheRoot, cleared: true }, null, 2)}\n`);
  } else {
    process.stdout.write(`Cache cleared: ${cacheRoot}\n`);
  }

  return 0;
}

export async function executeCacheInfoCommand(options: GlobalOptions): Promise<number> {
  const cacheRoot = getCliCacheRoot();
  const cacheRootExists = fs.existsSync(cacheRoot);
  let currentProject: {
    cacheDir: string;
    valid: boolean;
    targetFolder: string;
  } | undefined;

  try {
    const config = await loadConfig(process.cwd());
    const cacheDir = getCliCacheDir(config);
    currentProject = {
      cacheDir,
      valid: isCacheValid(cacheDir, config.targetFolder),
      targetFolder: config.targetFolder,
    };
  } catch {
    currentProject = undefined;
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      cacheRoot,
      cacheRootExists,
      currentProject,
    }, null, 2)}\n`);
    return 0;
  }

  process.stdout.write(`Cache root: ${cacheRoot}\n`);
  process.stdout.write(`Cache root status: ${cacheRootExists ? 'exists' : 'missing'}\n`);

  if (currentProject) {
    process.stdout.write(`Current project cache: ${currentProject.cacheDir}\n`);
    process.stdout.write(`Current project status: ${currentProject.valid ? 'valid' : 'missing'}\n`);
  } else {
    process.stdout.write('Current project status: no config found\n');
  }

  return 0;
}
