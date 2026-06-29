import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig } from '../src/config';

/**
 * Unit tests for config.ts — config validation logic.
 * These test the pure parsing and validation, no VS Code API needed.
 */

// Helper: create a temp workspace with a config file
function createTempWorkspace(configContent?: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diffchecker-test-'));
  const vscodeDir = path.join(tmpDir, '.vscode');
  fs.mkdirSync(vscodeDir, { recursive: true });

  if (configContent !== undefined) {
    fs.writeFileSync(path.join(vscodeDir, 'course-project.json'), configContent, 'utf-8');
  }

  return tmpDir;
}

// Helper: clean up temp workspace
function cleanupTempWorkspace(tmpDir: string): void {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

async function testValidConfig(): Promise<void> {
  const tmpDir = createTempWorkspace(JSON.stringify({
    repoUrl: 'https://github.com/dicodingacademy/test-repo.git',
    branch: 'main',
    targetFolder: 'project-name',
    ignorePaths: ['build/', '*.iml'],
  }));

  try {
    const config = await loadConfig(tmpDir);
    assert.strictEqual(config.repoUrl, 'https://github.com/dicodingacademy/test-repo.git');
    assert.strictEqual(config.branch, 'main');
    assert.strictEqual(config.targetFolder, 'project-name');
    assert.deepStrictEqual(config.ignorePaths, ['build/', '*.iml']);
    console.log('  ✅ Valid config parses correctly');
  } finally {
    cleanupTempWorkspace(tmpDir);
  }
}

async function testMissingRepoUrl(): Promise<void> {
  const tmpDir = createTempWorkspace(JSON.stringify({
    branch: 'main',
    targetFolder: 'project-name',
  }));

  try {
    await loadConfig(tmpDir);
    assert.fail('Should have thrown');
  } catch (err: unknown) {
    assert.ok(err instanceof Error);
    assert.ok(err.message.includes('repoUrl'), `Expected error about repoUrl, got: ${err.message}`);
    console.log('  ✅ Missing repoUrl throws descriptive error');
  } finally {
    cleanupTempWorkspace(tmpDir);
  }
}

async function testMissingBranch(): Promise<void> {
  const tmpDir = createTempWorkspace(JSON.stringify({
    repoUrl: 'https://github.com/owner/repo.git',
    targetFolder: 'project-name',
  }));

  try {
    await loadConfig(tmpDir);
    assert.fail('Should have thrown');
  } catch (err: unknown) {
    assert.ok(err instanceof Error);
    assert.ok(err.message.includes('branch'), `Expected error about branch, got: ${err.message}`);
    console.log('  ✅ Missing branch throws descriptive error');
  } finally {
    cleanupTempWorkspace(tmpDir);
  }
}

async function testMissingTargetFolder(): Promise<void> {
  const tmpDir = createTempWorkspace(JSON.stringify({
    repoUrl: 'https://github.com/owner/repo.git',
    branch: 'main',
  }));

  try {
    await loadConfig(tmpDir);
    assert.fail('Should have thrown');
  } catch (err: unknown) {
    assert.ok(err instanceof Error);
    assert.ok(err.message.includes('targetFolder'), `Expected error about targetFolder, got: ${err.message}`);
    console.log('  ✅ Missing targetFolder throws descriptive error');
  } finally {
    cleanupTempWorkspace(tmpDir);
  }
}

async function testInvalidRepoUrl(): Promise<void> {
  const tmpDir = createTempWorkspace(JSON.stringify({
    repoUrl: 'not-a-url',
    branch: 'main',
    targetFolder: 'project-name',
  }));

  try {
    await loadConfig(tmpDir);
    assert.fail('Should have thrown');
  } catch (err: unknown) {
    assert.ok(err instanceof Error);
    assert.ok(err.message.includes('Invalid'), `Expected error about invalid URL, got: ${err.message}`);
    console.log('  ✅ Invalid repoUrl (not HTTPS) throws error');
  } finally {
    cleanupTempWorkspace(tmpDir);
  }
}

async function testMalformedJson(): Promise<void> {
  const tmpDir = createTempWorkspace('{ this is not valid json }');

  try {
    await loadConfig(tmpDir);
    assert.fail('Should have thrown');
  } catch (err: unknown) {
    assert.ok(err instanceof Error);
    assert.ok(err.message.includes('Invalid JSON'), `Expected error about invalid JSON, got: ${err.message}`);
    console.log('  ✅ Malformed JSON throws "Invalid JSON" error');
  } finally {
    cleanupTempWorkspace(tmpDir);
  }
}

async function testMissingIgnorePathsDefaults(): Promise<void> {
  const tmpDir = createTempWorkspace(JSON.stringify({
    repoUrl: 'https://github.com/owner/repo.git',
    branch: 'main',
    targetFolder: 'project-name',
    // No ignorePaths
  }));

  try {
    const config = await loadConfig(tmpDir);
    assert.deepStrictEqual(config.ignorePaths, []);
    console.log('  ✅ Missing ignorePaths defaults to []');
  } finally {
    cleanupTempWorkspace(tmpDir);
  }
}

async function testMissingConfigFile(): Promise<void> {
  const tmpDir = createTempWorkspace(); // No config file

  try {
    await loadConfig(tmpDir);
    assert.fail('Should have thrown');
  } catch (err: unknown) {
    assert.ok(err instanceof Error);
    assert.ok(err.message.includes('not found'), `Expected error about missing file, got: ${err.message}`);
    console.log('  ✅ Missing config file throws descriptive error');
  } finally {
    cleanupTempWorkspace(tmpDir);
  }
}

async function testConfigIsArray(): Promise<void> {
  const tmpDir = createTempWorkspace('["not", "an", "object"]');

  try {
    await loadConfig(tmpDir);
    assert.fail('Should have thrown');
  } catch (err: unknown) {
    assert.ok(err instanceof Error);
    assert.ok(err.message.includes('object'), `Expected error about object type, got: ${err.message}`);
    console.log('  ✅ Config that is a JSON array (not object) throws error');
  } finally {
    cleanupTempWorkspace(tmpDir);
  }
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function runAll(): Promise<void> {
  console.log('\n📋 Config Validation Tests\n');

  await testValidConfig();
  await testMissingRepoUrl();
  await testMissingBranch();
  await testMissingTargetFolder();
  await testInvalidRepoUrl();
  await testMalformedJson();
  await testMissingIgnorePathsDefaults();
  await testMissingConfigFile();
  await testConfigIsArray();

  console.log('\n✅ All config validation tests passed!\n');
}

runAll().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
