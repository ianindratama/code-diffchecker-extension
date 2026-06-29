import * as path from 'path';
import ora from 'ora';
import {
  checkForUpdates,
  checkGitVersion,
  cloneSparse,
  computeDiff,
  isCacheValid,
  loadConfig,
  nukeCache,
  pullUpdate,
  resolveGitBinary,
} from '@dicodingacademy/code-diffchecker-core';
import { ensureCliCacheRoot, getCliCacheDir } from '../cachePaths';
import { renderDiffResults } from './diff';
import { FetchedSolution, GlobalOptions } from '../types';

export async function executeFetchCommand(options: GlobalOptions): Promise<number> {
  const fetched = await fetchSolution(options);
  const solutionRoot = path.join(fetched.cacheDir, fetched.config.targetFolder);
  const results = await computeDiff(process.cwd(), solutionRoot, fetched.config.ignorePaths);

  renderDiffResults(results, options);
  return results.length > 0 ? 1 : 0;
}

export async function fetchSolution(options: GlobalOptions): Promise<FetchedSolution> {
  const workspaceRoot = process.cwd();
  const config = await loadConfig(workspaceRoot);
  const gitBinary = await resolveGitBinary();
  await checkGitVersion(gitBinary);
  await ensureCliCacheRoot();

  const cacheDir = getCliCacheDir(config);

  if (isCacheValid(cacheDir, config.targetFolder)) {
    const spinner = startSpinner('Checking for solution updates...', options);
    const hasUpdates = await checkForUpdates(gitBinary, cacheDir, config.branch);

    if (!hasUpdates) {
      spinner?.succeed('Solution cache is up to date.');
      return { config, cacheDir };
    }

    if (spinner) {
      spinner.text = 'Updating solution...';
    }
    try {
      await pullUpdate(gitBinary, cacheDir, config.branch);
      spinner?.succeed('Solution cache updated.');
      return { config, cacheDir };
    } catch {
      if (spinner) {
        spinner.text = 'Refreshing solution cache...';
      }
      await nukeCache(cacheDir);
      await cloneSparse(gitBinary, config.repoUrl, config.branch, config.targetFolder, cacheDir);
      spinner?.succeed('Solution cache refreshed.');
      return { config, cacheDir };
    }
  }

  await nukeCache(cacheDir);
  const spinner = startSpinner('Downloading solution...', options);
  try {
    await cloneSparse(gitBinary, config.repoUrl, config.branch, config.targetFolder, cacheDir);
    spinner?.succeed('Solution downloaded.');
    return { config, cacheDir };
  } catch (err) {
    spinner?.fail('Failed to download solution.');
    throw err;
  }
}

function startSpinner(text: string, options: GlobalOptions): ora.Ora | undefined {
  if (options.json) {
    return undefined;
  }

  return ora({
    text,
    stream: process.stderr,
  }).start();
}
