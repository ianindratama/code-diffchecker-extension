#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { Command } from 'commander';
import { executeCacheClearCommand, executeCacheInfoCommand } from './commands/cache';
import { executeDiffCommand } from './commands/diff';
import { executeFetchCommand } from './commands/fetch';
import { executeInitCommand } from './commands/init';
import { executeWatchCommand } from './commands/watch';
import { getErrorMessage, getExitCode } from './errors';
import { GlobalOptions } from './types';

const program = new Command();

program
  .name('diffchecker')
  .description('Compare your project against a GitHub-hosted solution.')
  .version(readPackageVersion())
  .option('--json', 'print machine-readable JSON output')
  .option('--no-color', 'disable colored terminal output')
  .hook('preAction', () => {
    const options = getGlobalOptions();
    if (!options.color) {
      chalk.level = 0;
    }
  });

program
  .command('fetch')
  .description('Clone/update solution from GitHub')
  .action(async () => {
    process.exitCode = await executeFetchCommand(getGlobalOptions());
  });

program
  .command('diff')
  .description('Show all file differences or a single file diff')
  .argument('[file]', 'file path to compare')
  .action(async (file: string | undefined) => {
    process.exitCode = await executeDiffCommand(file, getGlobalOptions());
  });

program
  .command('watch')
  .description('Watch mode (re-run diff on file changes)')
  .action(async () => {
    process.exitCode = await executeWatchCommand(getGlobalOptions());
  });

const cacheCommand = program
  .command('cache')
  .description('Manage cached solutions');

cacheCommand
  .command('clear')
  .description('Clear cached solution')
  .action(async () => {
    process.exitCode = await executeCacheClearCommand(getGlobalOptions());
  });

cacheCommand
  .command('info')
  .description('Show cache path and status')
  .action(async () => {
    process.exitCode = await executeCacheInfoCommand(getGlobalOptions());
  });

program
  .command('init')
  .description('Interactively create .diffchecker.json')
  .action(async () => {
    process.exitCode = await executeInitCommand(getGlobalOptions());
  });

program.exitOverride();

program.parseAsync(process.argv).catch((err: unknown) => {
  const commanderError = err as { code?: string; exitCode?: number; message?: string };
  if (
    commanderError.code === 'commander.helpDisplayed' ||
    commanderError.code === 'commander.version'
  ) {
    process.exitCode = commanderError.exitCode ?? 0;
    return;
  }

  const options = getGlobalOptions();
  const message = getErrorMessage(err);

  if (options.json) {
    process.stderr.write(`${JSON.stringify({ error: message })}\n`);
  } else {
    process.stderr.write(`${chalk.red(`Error: ${message}`)}\n`);
  }

  process.exitCode = getExitCode(err);
});

function getGlobalOptions(): GlobalOptions {
  const options = program.opts<{ json?: boolean; color?: boolean }>();
  return {
    json: options.json === true,
    color: options.color !== false,
  };
}

function readPackageVersion(): string {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { version?: string };
    return packageJson.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
