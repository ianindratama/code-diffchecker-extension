import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { computeDiff } from '../src/diffEngine';

/**
 * Unit tests for diffEngine.ts — diff computation and ignore logic.
 * These test the pure diffing logic with real temp directories.
 */

// Helper: create temp dirs for local and solution
function createTempDirs(): { localDir: string; solutionDir: string; cleanup: () => void } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'diffchecker-diff-test-'));
  const localDir = path.join(base, 'local');
  const solutionDir = path.join(base, 'solution');
  fs.mkdirSync(localDir, { recursive: true });
  fs.mkdirSync(solutionDir, { recursive: true });

  return {
    localDir,
    solutionDir,
    cleanup: () => fs.rmSync(base, { recursive: true, force: true }),
  };
}

// Helper: create a file with content
function createFile(dir: string, relativePath: string, content: string): void {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
}

// Helper: create a binary file
function createBinaryFile(dir: string, relativePath: string): void {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const buffer = Buffer.alloc(100);
  buffer[0] = 0xFF;
  buffer[1] = 0xD8; // JPEG header
  buffer[50] = 0x00; // Null byte to trigger binary detection
  fs.writeFileSync(fullPath, buffer);
}

async function testIdenticalDirectories(): Promise<void> {
  const { localDir, solutionDir, cleanup } = createTempDirs();

  try {
    createFile(localDir, 'main.dart', 'void main() {}');
    createFile(solutionDir, 'main.dart', 'void main() {}');

    const results = await computeDiff(localDir, solutionDir, []);
    assert.strictEqual(results.length, 0, 'Identical files should produce zero results');
    console.log('  ✅ Identical directories produce zero results');
  } finally {
    cleanup();
  }
}

async function testFileOnlyInSolution(): Promise<void> {
  const { localDir, solutionDir, cleanup } = createTempDirs();

  try {
    createFile(solutionDir, 'new_file.dart', 'class NewWidget {}');

    const results = await computeDiff(localDir, solutionDir, []);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].status, 'added');
    assert.strictEqual(results[0].relativePath, 'new_file.dart');
    console.log('  ✅ File only in solution → classified as "added"');
  } finally {
    cleanup();
  }
}

async function testFileOnlyInLocal(): Promise<void> {
  const { localDir, solutionDir, cleanup } = createTempDirs();

  try {
    createFile(localDir, 'extra_file.dart', 'class OldWidget {}');

    const results = await computeDiff(localDir, solutionDir, []);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].status, 'deleted');
    assert.strictEqual(results[0].relativePath, 'extra_file.dart');
    console.log('  ✅ File only in local → classified as "deleted"');
  } finally {
    cleanup();
  }
}

async function testModifiedFile(): Promise<void> {
  const { localDir, solutionDir, cleanup } = createTempDirs();

  try {
    createFile(localDir, 'main.dart', 'void main() { /* student version */ }');
    createFile(solutionDir, 'main.dart', 'void main() { /* solution version */ }');

    const results = await computeDiff(localDir, solutionDir, []);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].status, 'modified');
    assert.strictEqual(results[0].relativePath, 'main.dart');
    console.log('  ✅ File in both with different content → classified as "modified"');
  } finally {
    cleanup();
  }
}

async function testHardcodedIgnores(): Promise<void> {
  const { localDir, solutionDir, cleanup } = createTempDirs();

  try {
    // These should be ignored by hardcoded Layer 1 patterns
    createFile(localDir, '.git/config', 'git config');
    createFile(solutionDir, '.git/config', 'git config');
    createFile(localDir, '.DS_Store', 'junk');
    createFile(solutionDir, '.DS_Store', 'different junk');

    // This should NOT be ignored
    createFile(localDir, 'main.dart', 'student');
    createFile(solutionDir, 'main.dart', 'solution');

    const results = await computeDiff(localDir, solutionDir, []);
    assert.strictEqual(results.length, 1, 'Only main.dart should appear in results');
    assert.strictEqual(results[0].relativePath, 'main.dart');
    console.log('  ✅ Hardcoded ignores (.git/, .DS_Store) are filtered out');
  } finally {
    cleanup();
  }
}

async function testConfigDrivenIgnores(): Promise<void> {
  const { localDir, solutionDir, cleanup } = createTempDirs();

  try {
    createFile(localDir, 'build/output.js', 'compiled');
    createFile(solutionDir, 'build/output.js', 'compiled');
    createFile(localDir, 'app.iml', 'iml file');
    createFile(solutionDir, 'app.iml', 'different iml');
    createFile(localDir, 'main.dart', 'student');
    createFile(solutionDir, 'main.dart', 'solution');

    const results = await computeDiff(localDir, solutionDir, ['build/**', '*.iml']);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].relativePath, 'main.dart');
    console.log('  ✅ Config-driven ignores (build/**, *.iml) are filtered out');
  } finally {
    cleanup();
  }
}

async function testCourseProjectJsonIgnored(): Promise<void> {
  const { localDir, solutionDir, cleanup } = createTempDirs();

  try {
    // course-project.json should be specifically ignored
    createFile(localDir, '.vscode/course-project.json', '{ "local": true }');
    createFile(solutionDir, '.vscode/course-project.json', '{ "solution": true }');

    // But launch.json in .vscode should NOT be ignored
    createFile(localDir, '.vscode/launch.json', '{ "version": "local" }');
    createFile(solutionDir, '.vscode/launch.json', '{ "version": "solution" }');

    const results = await computeDiff(localDir, solutionDir, []);

    // Only launch.json should appear (course-project.json is hardcoded ignore)
    const paths = results.map((r) => r.relativePath);
    assert.ok(!paths.includes('.vscode/course-project.json'), 'course-project.json should be ignored');
    assert.ok(paths.includes('.vscode/launch.json'), 'launch.json should NOT be ignored');
    console.log('  ✅ .vscode/course-project.json is ignored but .vscode/launch.json is NOT');
  } finally {
    cleanup();
  }
}

async function testBinaryFileDetection(): Promise<void> {
  const { localDir, solutionDir, cleanup } = createTempDirs();

  try {
    createBinaryFile(solutionDir, 'assets/logo.png');

    const results = await computeDiff(localDir, solutionDir, []);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].isBinary, true);
    console.log('  ✅ Binary file (containing null bytes) is flagged as isBinary: true');
  } finally {
    cleanup();
  }
}

async function testNestedDirectoryStructure(): Promise<void> {
  const { localDir, solutionDir, cleanup } = createTempDirs();

  try {
    createFile(localDir, 'lib/screens/home.dart', 'student home');
    createFile(solutionDir, 'lib/screens/home.dart', 'solution home');
    createFile(solutionDir, 'lib/screens/detail.dart', 'new screen');
    createFile(localDir, 'lib/models/user.dart', 'user model');

    const results = await computeDiff(localDir, solutionDir, []);
    assert.strictEqual(results.length, 3);

    const statuses = new Map(results.map((r) => [r.relativePath, r.status]));
    assert.strictEqual(statuses.get('lib/screens/home.dart'), 'modified');
    assert.strictEqual(statuses.get('lib/screens/detail.dart'), 'added');
    assert.strictEqual(statuses.get('lib/models/user.dart'), 'deleted');
    console.log('  ✅ Nested directory structure produces correct hierarchical paths');
  } finally {
    cleanup();
  }
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function runAll(): Promise<void> {
  console.log('\n📋 Diff Engine Tests\n');

  await testIdenticalDirectories();
  await testFileOnlyInSolution();
  await testFileOnlyInLocal();
  await testModifiedFile();
  await testHardcodedIgnores();
  await testConfigDrivenIgnores();
  await testCourseProjectJsonIgnored();
  await testBinaryFileDetection();
  await testNestedDirectoryStructure();

  console.log('\n✅ All diff engine tests passed!\n');
}

runAll().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
