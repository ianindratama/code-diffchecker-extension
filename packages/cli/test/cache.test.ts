import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { executeCacheInfoCommand } from '../src/commands/cache';

/**
 * Tests `cache info` — that it reports the XDG-compliant cache root
 * (`$XDG_CACHE_HOME/diffchecker`, defaulting to `~/.cache/diffchecker`).
 */

interface CacheInfoOutput {
  cacheRoot: string;
  cacheRootExists: boolean;
  currentProject?: { cacheDir: string; valid: boolean; targetFolder: string };
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
 * Runs `cache info --json` from a config-less temp dir (so `currentProject` is
 * undefined) with XDG_CACHE_HOME set to `xdg`, or unset when `xdg` is null.
 */
async function runCacheInfo(
  xdg: string | null
): Promise<{ parsed: CacheInfoOutput; exitCode: number }> {
  const cwdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diffchecker-cli-test-'));
  const prevXdg = process.env.XDG_CACHE_HOME;
  const prevCwd = process.cwd();

  if (xdg === null) {
    delete process.env.XDG_CACHE_HOME;
  } else {
    process.env.XDG_CACHE_HOME = xdg;
  }

  try {
    process.chdir(cwdDir);
    const { output, exitCode } = await captureStdout(() =>
      executeCacheInfoCommand({ json: true, color: false })
    );
    return { parsed: JSON.parse(output) as CacheInfoOutput, exitCode };
  } finally {
    process.chdir(prevCwd);
    if (prevXdg === undefined) {
      delete process.env.XDG_CACHE_HOME;
    } else {
      process.env.XDG_CACHE_HOME = prevXdg;
    }
    fs.rmSync(cwdDir, { recursive: true, force: true });
  }
}

async function testRespectsXdgCacheHome(): Promise<void> {
  const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'diffchecker-xdg-'));
  try {
    const { parsed, exitCode } = await runCacheInfo(xdg);
    assert.strictEqual(parsed.cacheRoot, path.join(xdg, 'diffchecker'));
    assert.strictEqual(parsed.currentProject, undefined, 'no config → no currentProject');
    assert.strictEqual(exitCode, 0);
    console.log('  ✅ cache info uses $XDG_CACHE_HOME/diffchecker');
  } finally {
    fs.rmSync(xdg, { recursive: true, force: true });
  }
}

async function testDefaultsToHomeCache(): Promise<void> {
  const { parsed, exitCode } = await runCacheInfo(null);
  assert.strictEqual(
    parsed.cacheRoot,
    path.join(os.homedir(), '.cache', 'diffchecker'),
    'defaults to ~/.cache/diffchecker when XDG_CACHE_HOME is unset'
  );
  assert.strictEqual(exitCode, 0);
  console.log('  ✅ cache info defaults to ~/.cache/diffchecker');
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function runAll(): Promise<void> {
  console.log('\n📋 CLI cache Command Tests\n');

  await testRespectsXdgCacheHome();
  await testDefaultsToHomeCache();

  console.log('\n✅ All cache command tests passed!\n');
}

runAll().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
