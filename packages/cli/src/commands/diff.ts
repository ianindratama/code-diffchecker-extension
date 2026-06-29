import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { createTwoFilesPatch } from 'diff';
import {
  computeDiff,
  DiffResult,
  DiffStatus,
  isCacheValid,
  isFileBinary,
  loadConfig,
} from '@dicodingacademy/code-diffchecker-core';
import { getCliCacheDir } from '../cachePaths';
import { CliError } from '../errors';
import { GlobalOptions } from '../types';

const STATUS_LABELS: Record<DiffStatus, string> = {
  added: 'Added',
  modified: 'Modified',
  deleted: 'Deleted',
};

const STATUS_MARKERS: Record<DiffStatus, string> = {
  added: '+',
  modified: '~',
  deleted: '-',
};

export async function executeDiffCommand(
  file: string | undefined,
  options: GlobalOptions
): Promise<number> {
  if (file) {
    return showSingleFileDiff(file, options);
  }

  const results = await loadCachedDiff();
  renderDiffResults(results, options);
  return results.length > 0 ? 1 : 0;
}

export async function loadCachedDiff(): Promise<DiffResult[]> {
  const workspaceRoot = process.cwd();
  const config = await loadConfig(workspaceRoot);
  const cacheDir = getCliCacheDir(config);

  if (!isCacheValid(cacheDir, config.targetFolder)) {
    throw new CliError('No solution cached yet. Run `diffchecker fetch` first.');
  }

  const solutionRoot = path.join(cacheDir, config.targetFolder);
  return computeDiff(workspaceRoot, solutionRoot, config.ignorePaths);
}

export function renderDiffResults(results: DiffResult[], options: GlobalOptions): void {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return;
  }

  const total = results.length;
  const differenceLabel = total === 1 ? 'difference' : 'differences';
  process.stdout.write(`${chalk.bold(`📁 Solution Diff (${total} ${differenceLabel})`)}\n\n`);

  if (total === 0) {
    process.stdout.write(`${chalk.green('No differences found.')}\n`);
    return;
  }

  renderGroup(results, 'added', chalk.green);
  renderGroup(results, 'modified', chalk.yellow);
  renderGroup(results, 'deleted', chalk.red);
}

function renderGroup(
  results: DiffResult[],
  status: DiffStatus,
  colorize: (text: string) => string
): void {
  const group = results.filter((result) => result.status === status);
  if (group.length === 0) {
    return;
  }

  process.stdout.write(`${STATUS_LABELS[status]} (${group.length})\n`);
  for (const result of group) {
    const marker = colorize(STATUS_MARKERS[status]);
    const binaryNote = result.isBinary ? chalk.yellow(' (binary file)') : '';
    process.stdout.write(`  ${marker} ${result.relativePath}${binaryNote}\n`);
  }
  process.stdout.write('\n');
}

async function showSingleFileDiff(file: string, options: GlobalOptions): Promise<number> {
  const workspaceRoot = process.cwd();
  const config = await loadConfig(workspaceRoot);
  const cacheDir = getCliCacheDir(config);

  if (!isCacheValid(cacheDir, config.targetFolder)) {
    throw new CliError('No solution cached yet. Run `diffchecker fetch` first.');
  }

  const relativePath = resolveRelativeFilePath(workspaceRoot, file);
  const localPath = path.join(workspaceRoot, relativePath);
  const solutionPath = path.join(cacheDir, config.targetFolder, relativePath);
  const localExists = fs.existsSync(localPath);
  const solutionExists = fs.existsSync(solutionPath);

  if (!localExists && !solutionExists) {
    throw new CliError(`"${relativePath}" was not found in your project or the cached solution.`);
  }

  const isBinary = await isAnyExistingFileBinary(localPath, localExists, solutionPath, solutionExists);
  const status = getSingleFileStatus(localExists, solutionExists);
  const result = buildSingleFileResult(relativePath, status, isBinary, localPath, solutionPath);

  if (isBinary) {
    if (options.json) {
      process.stdout.write(`${JSON.stringify([result], null, 2)}\n`);
    } else {
      process.stdout.write(`${chalk.yellow(`Binary file differs: ${relativePath}`)}\n`);
    }
    return 1;
  }

  const localContent = localExists ? await readNormalizedText(localPath) : '';
  const solutionContent = solutionExists ? await readNormalizedText(solutionPath) : '';

  if (localContent === solutionContent) {
    if (options.json) {
      process.stdout.write('[]\n');
    } else {
      process.stdout.write(`${chalk.green(`"${relativePath}" matches the solution.`)}\n`);
    }
    return 0;
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify([result], null, 2)}\n`);
  } else {
    const patch = createTwoFilesPatch(
      `local/${relativePath}`,
      `solution/${relativePath}`,
      localContent,
      solutionContent,
      '',
      '',
      { context: 3 }
    );
    process.stdout.write(colorizePatch(patch));
  }

  return 1;
}

function resolveRelativeFilePath(workspaceRoot: string, file: string): string {
  const absolutePath = path.isAbsolute(file)
    ? path.resolve(file)
    : path.resolve(workspaceRoot, file);
  const relativePath = path.relative(workspaceRoot, absolutePath);

  if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new CliError('The file path must be inside the current project.');
  }

  return relativePath.replace(/\\/g, '/');
}

async function isAnyExistingFileBinary(
  localPath: string,
  localExists: boolean,
  solutionPath: string,
  solutionExists: boolean
): Promise<boolean> {
  const checks: Promise<boolean>[] = [];
  if (localExists) {
    checks.push(isFileBinary(localPath));
  }
  if (solutionExists) {
    checks.push(isFileBinary(solutionPath));
  }

  const results = await Promise.all(checks);
  return results.some(Boolean);
}

function getSingleFileStatus(localExists: boolean, solutionExists: boolean): DiffStatus {
  if (solutionExists && !localExists) {
    return 'added';
  }
  if (localExists && !solutionExists) {
    return 'deleted';
  }
  return 'modified';
}

function buildSingleFileResult(
  relativePath: string,
  status: DiffStatus,
  isBinary: boolean,
  localPath: string,
  solutionPath: string
): DiffResult {
  return {
    relativePath,
    status,
    isBinary,
    ...(status !== 'added' ? { localPath } : {}),
    ...(status !== 'deleted' ? { solutionPath } : {}),
  };
}

async function readNormalizedText(filePath: string): Promise<string> {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  return content.replace(/\r\n/g, '\n');
}

function colorizePatch(patch: string): string {
  const lines = patch.split('\n');
  const colored = lines.map((line) => {
    if (line.startsWith('+++') || line.startsWith('---')) {
      return chalk.bold(line);
    }
    if (line.startsWith('+')) {
      return chalk.green(line);
    }
    if (line.startsWith('-')) {
      return chalk.red(line);
    }
    if (line.startsWith('@@')) {
      return chalk.cyan(line);
    }
    return line;
  });

  return `${colored.join('\n')}\n`;
}
