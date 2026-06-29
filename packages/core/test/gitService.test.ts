import * as assert from 'assert';
import { validateGitVersion } from '../src/gitService';

/**
 * Unit tests for gitService.ts — Git version validation.
 * These test the pure version parsing logic, no Git binary needed.
 */

function testValidVersion_2_39(): void {
  assert.strictEqual(validateGitVersion('git version 2.39.1'), true);
  console.log('  ✅ git version 2.39.1 → valid');
}

function testValidVersion_2_28(): void {
  assert.strictEqual(validateGitVersion('git version 2.28.0'), true);
  console.log('  ✅ git version 2.28.0 → valid (minimum required)');
}

function testInvalidVersion_2_25(): void {
  assert.strictEqual(validateGitVersion('git version 2.25.1'), false);
  console.log('  ✅ git version 2.25.1 → invalid (below minimum)');
}

function testInvalidVersion_2_25_windows(): void {
  assert.strictEqual(validateGitVersion('git version 2.25.1.windows.1'), false);
  console.log('  ✅ git version 2.25.1.windows.1 → invalid (Windows format, below minimum)');
}

function testValidVersion_windows_format(): void {
  assert.strictEqual(validateGitVersion('git version 2.39.1.windows.1'), true);
  console.log('  ✅ git version 2.39.1.windows.1 → valid (Windows format)');
}

function testUnparseableString(): void {
  assert.strictEqual(validateGitVersion('not a version string'), false);
  console.log('  ✅ Unparseable string → invalid');
}

function testEmptyString(): void {
  assert.strictEqual(validateGitVersion(''), false);
  console.log('  ✅ Empty string → invalid');
}

function testMajorVersion3(): void {
  assert.strictEqual(validateGitVersion('git version 3.0.0'), true);
  console.log('  ✅ git version 3.0.0 → valid (future major version)');
}

function testOldVersion_1_x(): void {
  assert.strictEqual(validateGitVersion('git version 1.9.5'), false);
  console.log('  ✅ git version 1.9.5 → invalid (very old)');
}

// ─── Runner ───────────────────────────────────────────────────────────────────

function runAll(): void {
  console.log('\n📋 Git Version Validation Tests\n');

  testValidVersion_2_39();
  testValidVersion_2_28();
  testInvalidVersion_2_25();
  testInvalidVersion_2_25_windows();
  testValidVersion_windows_format();
  testUnparseableString();
  testEmptyString();
  testMajorVersion3();
  testOldVersion_1_x();

  console.log('\n✅ All git version validation tests passed!\n');
}

runAll();
