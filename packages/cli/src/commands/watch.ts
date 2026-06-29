import * as path from 'path';
import chokidar from 'chokidar';
import { computeDiff, isCacheValid, loadConfig } from '@dicodingacademy/code-diffchecker-core';
import { getCliCacheDir, getCliCacheRoot } from '../cachePaths';
import { CliError, getErrorMessage } from '../errors';
import { GlobalOptions } from '../types';
import { renderDiffResults } from './diff';

const DEBOUNCE_MS = 300;

export async function executeWatchCommand(options: GlobalOptions): Promise<number> {
  const workspaceRoot = process.cwd();
  const config = await loadConfig(workspaceRoot);
  const cacheDir = getCliCacheDir(config);

  if (!isCacheValid(cacheDir, config.targetFolder)) {
    throw new CliError('No solution cached yet. Run `diffchecker fetch` first.');
  }

  const solutionRoot = path.join(cacheDir, config.targetFolder);

  async function redraw(): Promise<void> {
    try {
      const results = await computeDiff(workspaceRoot, solutionRoot, config.ignorePaths);

      if (options.json) {
        process.stdout.write(`${JSON.stringify({
          type: 'diff',
          count: results.length,
          differences: results,
        })}\n`);
        return;
      }

      console.clear();
      process.stdout.write('👀 Watching for changes... (Ctrl+C to stop)\n\n');
      renderDiffResults(results, options);
    } catch (err) {
      if (options.json) {
        process.stderr.write(`${JSON.stringify({ error: getErrorMessage(err) })}\n`);
      } else {
        process.stderr.write(`Error: ${getErrorMessage(err)}\n`);
      }
    }
  }

  await redraw();

  let debounceTimer: NodeJS.Timeout | undefined;
  const watcher = chokidar.watch(workspaceRoot, {
    ignored: (candidatePath) => shouldIgnoreWatchPath(workspaceRoot, candidatePath),
    ignoreInitial: true,
    persistent: true,
  });

  const scheduleRedraw = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      redraw();
    }, DEBOUNCE_MS);
  };

  watcher
    .on('add', scheduleRedraw)
    .on('change', scheduleRedraw)
    .on('unlink', scheduleRedraw)
    .on('addDir', scheduleRedraw)
    .on('unlinkDir', scheduleRedraw);

  await new Promise<void>((resolve, reject) => {
    watcher.on('error', reject);
    process.once('SIGINT', () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      watcher.close()
        .then(() => resolve())
        .catch(reject);
    });
  });

  return 0;
}

function shouldIgnoreWatchPath(workspaceRoot: string, candidatePath: string): boolean {
  const relativePath = path.relative(workspaceRoot, candidatePath).replace(/\\/g, '/');
  const cacheRoot = getCliCacheRoot();

  if (candidatePath.startsWith(cacheRoot)) {
    return true;
  }

  return (
    relativePath === '.git' ||
    relativePath.startsWith('.git/') ||
    relativePath === 'node_modules' ||
    relativePath.startsWith('node_modules/') ||
    relativePath === '.diffchecker.json' ||
    relativePath === '.vscode/course-project.json'
  );
}
