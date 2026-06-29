import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output, stderr as errorOutput } from 'process';
import { CliError } from '../errors';
import { GlobalOptions } from '../types';

export interface InitConfig {
  repoUrl: string;
  branch: string;
  targetFolder: string;
  ignorePaths: string[];
}

export interface InitAnswers {
  repoUrl: string;
  branch: string;
  targetFolder: string;
  ignorePaths: string;
}

export async function executeInitCommand(options: GlobalOptions): Promise<number> {
  if (!input.isTTY) {
    throw new CliError('`diffchecker init` requires an interactive terminal.');
  }

  const configPath = path.join(process.cwd(), '.diffchecker.json');
  const rl = readline.createInterface({
    input,
    output: options.json ? errorOutput : output,
  });

  try {
    if (fs.existsSync(configPath)) {
      const overwrite = await rl.question('.diffchecker.json already exists. Overwrite? (y/N): ');
      if (!/^y(es)?$/i.test(overwrite.trim())) {
        throw new CliError('Init cancelled.');
      }
    }

    const config = await promptForConfig(rl);
    await writeInitConfig(configPath, config);

    if (options.json) {
      process.stdout.write(`${JSON.stringify({ configPath, config }, null, 2)}\n`);
    } else {
      process.stdout.write(`Created ${path.relative(process.cwd(), configPath)}\n`);
    }

    return 0;
  } finally {
    rl.close();
  }
}

async function promptForConfig(rl: readline.Interface): Promise<InitConfig> {
  const repoUrl = await rl.question('Repository URL: ');
  const branch = await rl.question('Branch (main): ');
  const targetFolder = await rl.question('Target folder: ');
  const ignorePaths = await rl.question('Ignore paths (comma-separated, optional): ');

  return buildInitConfig({ repoUrl, branch, targetFolder, ignorePaths });
}

/**
 * Validates and normalizes raw init answers into a config object.
 * Pure (no I/O) so it can be unit-tested without an interactive terminal.
 */
export function buildInitConfig(answers: InitAnswers): InitConfig {
  const repoUrl = answers.repoUrl.trim();
  if (!/^https:\/\/.+\/.+/.test(repoUrl)) {
    throw new CliError(
      'Invalid repository URL. Expected an HTTPS URL, e.g. "https://github.com/owner/repo.git".'
    );
  }

  const branchInput = answers.branch.trim();
  const branch = branchInput.length > 0 ? branchInput : 'main';

  const targetFolder = answers.targetFolder.trim();
  if (targetFolder.length === 0) {
    throw new CliError('Target folder is required.');
  }

  const ignoreInput = answers.ignorePaths.trim();
  const ignorePaths = ignoreInput.length === 0
    ? []
    : ignoreInput.split(',').map((item) => item.trim()).filter((item) => item.length > 0);

  return {
    repoUrl,
    branch,
    targetFolder,
    ignorePaths,
  };
}

/**
 * Writes a config object to disk as pretty-printed JSON with a trailing newline.
 */
export async function writeInitConfig(configPath: string, config: InitConfig): Promise<void> {
  await fs.promises.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
}
