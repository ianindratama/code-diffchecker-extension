import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig } from '@dicodingacademy/code-diffchecker-core';

/**
 * Tests the config-loading path used by every CLI command, focusing on the
 * resolution order between the new `.diffchecker.json` and the legacy
 * `.vscode/course-project.json`.
 */

interface ConfigFiles {
  root?: object;     // .diffchecker.json at workspace root
  legacy?: object;   // .vscode/course-project.json
}

function createWorkspace(files: ConfigFiles): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diffchecker-cli-test-'));

  if (files.root !== undefined) {
    fs.writeFileSync(
      path.join(tmpDir, '.diffchecker.json'),
      JSON.stringify(files.root),
      'utf-8'
    );
  }

  if (files.legacy !== undefined) {
    const vscodeDir = path.join(tmpDir, '.vscode');
    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(vscodeDir, 'course-project.json'),
      JSON.stringify(files.legacy),
      'utf-8'
    );
  }

  return tmpDir;
}

const ROOT_CONFIG = {
  repoUrl: 'https://github.com/owner/repo.git',
  branch: 'main',
  targetFolder: 'root-folder',
};

const LEGACY_CONFIG = {
  repoUrl: 'https://github.com/owner/legacy.git',
  branch: 'solution',
  targetFolder: 'legacy-folder',
};

async function testFindsRootConfig(): Promise<void> {
  const tmpDir = createWorkspace({ root: ROOT_CONFIG });
  try {
    const config = await loadConfig(tmpDir);
    assert.strictEqual(config.targetFolder, 'root-folder');
    assert.strictEqual(config.repoUrl, 'https://github.com/owner/repo.git');
    console.log('  ✅ Finds .diffchecker.json at project root');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function testFallsBackToLegacy(): Promise<void> {
  const tmpDir = createWorkspace({ legacy: LEGACY_CONFIG });
  try {
    const config = await loadConfig(tmpDir);
    assert.strictEqual(config.targetFolder, 'legacy-folder');
    assert.strictEqual(config.branch, 'solution');
    console.log('  ✅ Falls back to .vscode/course-project.json when .diffchecker.json missing');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function testRootTakesPriority(): Promise<void> {
  const tmpDir = createWorkspace({ root: ROOT_CONFIG, legacy: LEGACY_CONFIG });
  try {
    const config = await loadConfig(tmpDir);
    assert.strictEqual(
      config.targetFolder,
      'root-folder',
      '.diffchecker.json must win when both config files exist'
    );
    assert.strictEqual(config.branch, 'main');
    console.log('  ✅ .diffchecker.json takes priority when both config files exist');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function runAll(): Promise<void> {
  console.log('\n📋 CLI Config Loading Tests\n');

  await testFindsRootConfig();
  await testFallsBackToLegacy();
  await testRootTakesPriority();

  console.log('\n✅ All config loading tests passed!\n');
}

runAll().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
