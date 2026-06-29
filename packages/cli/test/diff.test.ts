import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DiffResult } from '@dicodingacademy/code-diffchecker-core';
import { executeDiffCommand } from '../src/commands/diff';
import { getCliCacheDir } from '../src/cachePaths';

/**
 * Tests the `diff` command end-to-end against a temp workspace + a hand-built
 * cache: --json output shape, exit codes, and add/modified/deleted classification.
 */

const CONFIG = {
  repoUrl: 'https://github.com/owner/repo.git',
  branch: 'main',
  targetFolder: 'project',
  ignorePaths: [] as string[],
};

function createFile(dir: string, relativePath: string, content: string): void {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
}

async function captureStdout(
  fn: () => Promise<number>
): Promise<{ output: string; exitCode: number }> {
  const original = process.stdout.write.bind(process.stdout);
  const chunks: string[] = [];
  (process.stdout as NodeJS.WriteStream).write = ((chunk: unknown): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  }) as typeof process.stdout.write;

  try {
    const exitCode = await fn();
    return { output: chunks.join(''), exitCode };
  } finally {
    process.stdout.write = original;
  }
}

/**
 * Builds a workspace + cache, lets `populate` create local/solution files, then
 * runs `diffchecker diff --json` from inside the workspace and returns the parsed
 * result plus the exit code. Restores cwd/env and cleans up afterwards.
 */
async function runDiff(
  populate: (paths: { workspace: string; solutionRoot: string }) => void
): Promise<{ results: DiffResult[]; exitCode: number }> {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'diffchecker-cli-test-'));
  const workspace = path.join(base, 'workspace');
  const cacheHome = path.join(base, 'cache');
  fs.mkdirSync(workspace, { recursive: true });

  const prevXdg = process.env.XDG_CACHE_HOME;
  const prevCwd = process.cwd();
  process.env.XDG_CACHE_HOME = cacheHome;

  try {
    createFile(workspace, '.diffchecker.json', JSON.stringify(CONFIG));
    const solutionRoot = path.join(getCliCacheDir(CONFIG), CONFIG.targetFolder);
    fs.mkdirSync(solutionRoot, { recursive: true });

    populate({ workspace, solutionRoot });

    process.chdir(workspace);
    const { output, exitCode } = await captureStdout(() =>
      executeDiffCommand(undefined, { json: true, color: false })
    );

    return { results: JSON.parse(output) as DiffResult[], exitCode };
  } finally {
    process.chdir(prevCwd);
    if (prevXdg === undefined) {
      delete process.env.XDG_CACHE_HOME;
    } else {
      process.env.XDG_CACHE_HOME = prevXdg;
    }
    fs.rmSync(base, { recursive: true, force: true });
  }
}

async function testJsonOutputIsValid(): Promise<void> {
  const { results } = await runDiff(({ workspace, solutionRoot }) => {
    createFile(solutionRoot, 'a.txt', 'solution\n');
    createFile(workspace, 'a.txt', 'local\n');
  });

  assert.ok(Array.isArray(results), '--json output parses to an array');
  assert.strictEqual(results.length, 1);
  const [entry] = results;
  assert.strictEqual(typeof entry.relativePath, 'string');
  assert.ok(['added', 'modified', 'deleted'].includes(entry.status));
  assert.strictEqual(typeof entry.isBinary, 'boolean');
  console.log('  ✅ --json flag outputs valid JSON with expected shape');
}

async function testExitZeroWhenNoDifferences(): Promise<void> {
  const { results, exitCode } = await runDiff(({ workspace, solutionRoot }) => {
    createFile(solutionRoot, 'same.txt', 'identical\n');
    createFile(workspace, 'same.txt', 'identical\n');
  });

  assert.deepStrictEqual(results, [], 'no differences → empty array');
  assert.strictEqual(exitCode, 0, 'exit code 0 when no differences found');
  console.log('  ✅ Exit code 0 when no differences found');
}

async function testExitOneWhenDifferences(): Promise<void> {
  const { exitCode } = await runDiff(({ workspace, solutionRoot }) => {
    createFile(solutionRoot, 'a.txt', 'one\n');
    createFile(workspace, 'a.txt', 'two\n');
  });

  assert.strictEqual(exitCode, 1, 'exit code 1 when differences found');
  console.log('  ✅ Exit code 1 when differences found');
}

async function testCategorizesAddedModifiedDeleted(): Promise<void> {
  const { results, exitCode } = await runDiff(({ workspace, solutionRoot }) => {
    // added: in solution only
    createFile(solutionRoot, 'added.txt', 'new file\n');
    // modified: in both, content differs
    createFile(solutionRoot, 'mod.txt', 'solution version\n');
    createFile(workspace, 'mod.txt', 'local version\n');
    // deleted: in local only
    createFile(workspace, 'deleted.txt', 'extra file\n');
  });

  assert.strictEqual(exitCode, 1);
  const byStatus = (status: string) =>
    results.filter((r) => r.status === status).map((r) => r.relativePath);

  assert.deepStrictEqual(byStatus('added'), ['added.txt']);
  assert.deepStrictEqual(byStatus('modified'), ['mod.txt']);
  assert.deepStrictEqual(byStatus('deleted'), ['deleted.txt']);
  console.log('  ✅ Diff output correctly categorizes added/modified/deleted files');
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function runAll(): Promise<void> {
  console.log('\n📋 CLI diff Command Tests\n');

  await testJsonOutputIsValid();
  await testExitZeroWhenNoDifferences();
  await testExitOneWhenDifferences();
  await testCategorizesAddedModifiedDeleted();

  console.log('\n✅ All diff command tests passed!\n');
}

runAll().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
