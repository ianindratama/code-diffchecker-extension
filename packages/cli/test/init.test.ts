import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { buildInitConfig, writeInitConfig } from '../src/commands/init';
import { CliError } from '../src/errors';

/**
 * Unit tests for the `init` command's pure helpers — config schema generation
 * and file writing. The interactive readline flow is not exercised here.
 */

function testBuildConfigSchema(): void {
  const config = buildInitConfig({
    repoUrl: '  https://github.com/owner/repo.git  ',
    branch: '',
    targetFolder: '  project-name  ',
    ignorePaths: 'build/, *.iml , ',
  });

  // Exactly the four schema keys, with correct types and values.
  assert.deepStrictEqual(
    Object.keys(config).sort(),
    ['branch', 'ignorePaths', 'repoUrl', 'targetFolder']
  );
  assert.strictEqual(config.repoUrl, 'https://github.com/owner/repo.git');
  assert.strictEqual(config.branch, 'main', 'blank branch should default to "main"');
  assert.strictEqual(config.targetFolder, 'project-name');
  assert.deepStrictEqual(config.ignorePaths, ['build/', '*.iml']);
  assert.ok(Array.isArray(config.ignorePaths));
  console.log('  ✅ buildInitConfig produces correct schema (defaults, trimming, split)');
}

async function testWriteCreatesValidFile(): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diffchecker-cli-test-'));
  const configPath = path.join(tmpDir, '.diffchecker.json');

  try {
    const config = buildInitConfig({
      repoUrl: 'https://github.com/owner/repo.git',
      branch: 'develop',
      targetFolder: 'starter',
      ignorePaths: '',
    });
    await writeInitConfig(configPath, config);

    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);

    assert.deepStrictEqual(parsed, config, 'written file round-trips to the same config');
    assert.deepStrictEqual(parsed.ignorePaths, [], 'empty ignore input yields []');
    assert.ok(raw.endsWith('\n'), 'file ends with a trailing newline');
    assert.ok(raw.includes('\n  "repoUrl"'), 'JSON is 2-space indented');
    console.log('  ✅ writeInitConfig creates a valid .diffchecker.json on disk');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testInvalidRepoUrlThrows(): void {
  assert.throws(
    () => buildInitConfig({
      repoUrl: 'not-a-url',
      branch: 'main',
      targetFolder: 'project',
      ignorePaths: '',
    }),
    (err: unknown) => err instanceof CliError && /repository URL/i.test(err.message)
  );
  console.log('  ✅ Invalid repoUrl throws CliError');
}

function testMissingTargetFolderThrows(): void {
  assert.throws(
    () => buildInitConfig({
      repoUrl: 'https://github.com/owner/repo.git',
      branch: 'main',
      targetFolder: '   ',
      ignorePaths: '',
    }),
    (err: unknown) => err instanceof CliError && /Target folder is required/.test(err.message)
  );
  console.log('  ✅ Empty targetFolder throws CliError');
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function runAll(): Promise<void> {
  console.log('\n📋 CLI init Command Tests\n');

  testBuildConfigSchema();
  await testWriteCreatesValidFile();
  testInvalidRepoUrlThrows();
  testMissingTargetFolderThrows();

  console.log('\n✅ All init command tests passed!\n');
}

runAll().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
